var _ = require( "lodash" );
var when = require( "when" );
var path = require( "path" );
var flatten = require( "flat" );
var fs = require( "fs-extra" );
var log = require( "./log" );
var rootDirectory = path.join( __dirname, "../" );
var mixins = require( "require-all" )( path.join( __dirname, "/services" ) );

function Service() {
	this.initialize.apply( this, arguments );
}

// Converts a given key name into an environment variable name that will get picked
// up correctly by configya.  ie,  camelCased_name => camel_cased__name
function camelcaseKey( key ) {
	function splitCamels( part ) {
		return part.replace( /([A-Z])/g, " $1" ).split( " " );
	}

	function arrayify( acc, current ) {
		acc.push( current.join( "_" ) );
		return acc;
	}

	// Create a matrix where any sub-arrays are camelcased key names
	var parts = key.split( "_" ).map( splitCamels ).reduce( arrayify, [] );

	// If there are any sub-arrays, then we have camelcased values
	var hasCamels = _.some( parts, function( v ) {
		return /[_]/g.test( v );
	} );

	// Reduce the matrix into delimited values depending on whether there are camels or not
	// ie:  azure_notificationHubs_connectionString = azure__notification_hubs__connection_string
	return parts.reduce( function( acc, current ) {
		var delimeter = acc.length ? ( hasCamels ? "__" : "_" ) : ""; // eslint-disable-line no-nested-ternary
		return acc + delimeter + current;
	}, "" );
}

_.extend( Service.prototype, {
	initialize: function( options ) { // eslint-disable-line max-statements
		this.MCMFolder = options.MCMFolder;
		this.containersFolder = path.join( this.MCMFolder, "./containers" );
		this.api = options.docker;
		this.name = options.name;
		this.config = options.configuration;
		this.omit = this.config.omit;
		this.serviceDef = options.serviceDef;
		this.weight = this.serviceDef.weight;
		this.tag = this.config.tag || this.serviceDef.tag || "latest";
		this.baseImage = this.serviceDef.image;
		this.image = this.serviceDef.image + ":" + this.tag;
		this.runArgs = this.serviceDef.args;
		this.ports = this.serviceDef.ports || [];
		this.proxy = this.serviceDef.proxy;
		this.publicPorts = {};
		this.updateImage = false;
		this.hooks = options.hooks || {};

		var serviceConfig = this.serviceDef.config || {};
		var localConfig = this.config.config;
		var combinedConfig = _.defaultsDeep( {}, localConfig, serviceConfig );

		var serviceEnv = this.serviceDef.env || {};
		var localEnv = this.config.env;
		var combinedEnv = _.defaultsDeep( {}, localEnv, serviceEnv );

		this.runConfig = _.cloneDeep( options.dockerDefaults );

		if ( this.serviceDef.run ) {
			_.merge( this.runConfig, this.serviceDef.run );
		}

		this._setupRunConfig( combinedConfig, combinedEnv, options.configDefaultValues );

		this.hook( "postInit", options );
	},

	hook: function() {
		var args = Array.prototype.slice.call( arguments );
		var name = args[ 0 ];
		var hookArgs = args.slice( 1 );

		if ( _.isFunction( this.hooks[ name ] ) ) {
			this.hooks[ name ].apply( this, hookArgs );
		}
	},

	_setupFilesystem: function() {
		var folders = this.serviceDef.folders || [];
		var files = this.serviceDef.files || [];

		folders.forEach( function( f ) {
			var filePath = path.join( this.containersFolder, f );
			try {
				fs.accessSync( filePath );
			} catch ( e ) {
				fs.mkdirpSync( filePath );
			}
		}.bind( this ) );

		var copiedFiles = files.map( function( f ) {
			var filePath = path.join( this.containersFolder, f.destination );
			var fileLocation = path.join( rootDirectory, f.location );
			if ( f.preserve === false ) {
				fs.copySync( fileLocation, filePath );
			} else {
				try {
					fs.accessSync( filePath );
				} catch ( e ) {
					fs.copySync( fileLocation, filePath );
				}
			}
			return filePath;
		}.bind( this ) );

		this.hook( "postFileSystem", copiedFiles );
	},

	_setupRunConfig: function( combinedConfig, combinedEnv, configDefaultValues ) {
		var localPortConfig = this.config.ports || {};
		_.each( this.ports, function( p, name ) {
			if ( p.env ) {
				combinedConfig[ p.env ] = p.container.toString();
			}

			var key = p.container + "/" + ( p.protocol || "tcp" );

			var publicPort = ( _.get( localPortConfig, name ) || p.host ).toString();

			this.runConfig.HostConfig.PortBindings[ key ] = [ {
				HostPort: publicPort
			} ];

			this.runConfig.ExposedPorts[ key ] = {
				HostPort: publicPort
			};

			this.publicPorts[ name ] = publicPort;
		}.bind( this ) );

		var tmplVars = _.merge( {
			SERVICE_NAME: this.name,
			ENVIRONMENT: "dev"
		}, configDefaultValues );

		_.each( flatten( combinedConfig, { delimiter: "_" } ), function( value, key ) {
			// Pre-pend lk_ if it doesn't already exist on the key
			if ( !/^lk_/i.test( key ) ) {
				key = "lk_" + key;
			}

			// If there are any lowercase letters, make sure that we deal with camelcasing
			if ( /lk_[a-z]/g.test( key ) ) {
				key = camelcaseKey( key );
			}

			key = key.toUpperCase();
			if ( _.isString( value ) ) {
				var tmpl = _.template( value );
				value = tmpl( tmplVars );
			}

			this.runConfig.Env.push( key + "=" + value );
		}.bind( this ) );

		if ( !_.isEmpty( combinedEnv ) ) {
			_.each( combinedEnv, function( value, key ) {
				this.runConfig.Env.push( key + "=" + value );
			}.bind( this ) );
		}

		var bindings = _.get( this.runConfig, "HostConfig.Binds" );

		if ( !_.isEmpty( bindings ) ) {
			this.runConfig.HostConfig.Binds = bindings.map( function( entry ) {
				var split = entry.split( ":" );
				return path.join( this.containersFolder, split[ 0 ] ) + ":" + split[ 1 ];
			}.bind( this ) );
		}
	},

	pull: function() {
		return this.api.pullImage( this.image )
			.catch( function( err ) {
				log.error( err );
				return null;
			} );
	},

	run: function() {
		return this.api.run( this.image, this.name, this.runConfig );
	},

	getImage: function() {
		return this.api.getImage( this.image );
	},

	cleanup: function() {
		var self = this;
		return this.api.getAllContainers( this.baseImage, this.name )
			.then( function( containers ) {
				if ( !containers || !containers.length ) {
					return null;
				}

				var tasks = _.map( containers, function( c ) {
					return self.api.destroyContainer( c, self.name );
				} );

				return when.all( tasks );
			} );
	},

	start: function( updateImage, serviceList ) {
		this.hook( "preStart", updateImage, serviceList );

		var self = this;
		this._setupFilesystem();

		return this.cleanup()
			.then( this.getImage.bind( this ) )
			.then( function( image ) {
				if ( !image || updateImage ) {
					return self.pull()
						.then( self.run.bind( self ) );
				}

				return self.run();
			} );
	},

	stop: function() {
		return this.cleanup();
	}

} );

module.exports = function( options ) {
	if ( mixins[ options.name ] ) {
		options.hooks = mixins[ options.name ];
	}
	return new Service( options );
};

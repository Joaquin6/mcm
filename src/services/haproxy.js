var fs = require( "fs-extra" );
var _ = require( "lodash" );

module.exports = {

	postInit: function( options ) {
		this.proxyConfig = {
			kanbanHost: options.configDefaultValues.KANBAN_HOST
		};
	},

	preStart: function( update, serviceList ) {
		var proxies = serviceList.reduce( function( memo, service ) {
			var rule = service.proxy;
			if ( !rule ) {
				return memo;
			}

			var backendName = "bk_" + service.name;
			var port = service.publicPorts[ rule.port ];
			var backendDefinition = "backend " + backendName + "\n\t";
			backendDefinition += "server " + service.name + " public.host.local:" + port;

			if ( rule.backend ) {
				backendDefinition += "\n\t" + rule.backend.join( "\n\t" );
			}

			memo.backendDefinitions.push( backendDefinition );

			var paths;

			if ( _.isArray( rule.path ) ) {
				paths = {
					path_beg: rule.path // eslint-disable-line
				};
			} else if ( _.isString( rule.path ) ) {
				paths = {
					path_beg: [ rule.path ] // eslint-disable-line
				};
			} else {
				paths = rule.path;
			}

			_.forOwn( paths, function( value, key ) {
				var actualPaths = _.isArray( value ) ? value : [ value ];

				actualPaths.forEach( function( p ) {
					memo.backendPaths.push( "use_backend " + backendName + " if { " + key + " -i " + p + " }" );
				} );
			} );

			if ( rule.acl ) {
				var acl = _.isArray( rule.acl ) ? rule.acl : [ rule.acl ];
				_.forEach( acl, function( a ) {
					memo.backendPaths.push( "use_backend " + backendName + " if " + a );
				} );
			}

			return memo;
		}, {
			backendPaths: [],
			backendDefinitions: []
		} );

		this.proxyEntries = proxies;
	},
	postFileSystem: function( copiedFiles ) {
		var backendPaths = this.proxyEntries.backendPaths.join( "\n\t" );
		var backendDefinitions = this.proxyEntries.backendDefinitions.join( "\n\n" );

		var configFile = copiedFiles[ 0 ];

		var configTmpl = _.template( fs.readFileSync( configFile, "utf-8" ) );
		var config = configTmpl( {
			BACKEND_PATHS: backendPaths,
			BACKEND_DEFINITIONS: backendDefinitions,
			KANBAN_HOST: this.proxyConfig.kanbanHost
		} );

		fs.writeFileSync( configFile, config );
	}
};

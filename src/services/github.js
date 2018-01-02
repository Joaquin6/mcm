var _ = require( "lodash" );
var when = require( "when" );
var log = require( "./log" );
var logUpdate = require( "log-update" );
var NOT_MODIFIED = 304;
var NOT_FOUND = 404;
var MAX_RETRIES = 3;
var RETRY_INTERVAL = 500;

module.exports = function( github, config ) {
	var authConfig = {
		base64: config ? config.auth : undefined
	};

	var api = {

		getGist: function( gist ) {
			return when.promise( function( resolve, reject ) {
				github.listGists( function( err, images ) {
					if ( err ) {
						return reject( err );
					}

					var instance = _.find( gists, function( i ) {
						return _.includes( i.gist );
					} );

					return resolve( instance );
				} );
			} );
		},

		getAllGists: function( baseImage ) {
			return when.promise( function( resolve, reject ) {
				github.listGists( { all: 1 }, function( err, containers ) {
					if ( err ) {
						return reject( err );
					}

					if ( !containers ) {
						return resolve( [] );
					}

					var filtered = _.filter( containers, function( c ) {
						var split = c.Image.split( ":" );
						return split[ 0 ] === baseImage;
					} );

					var instances = _.map( filtered, function( c ) {
						return github.getGist( c.Id );
					} );

					return resolve( instances );
				} );
			} );
		},

		_deleteGist: function( container, name ) {
			var removeFn = api.removeContainer.bind( undefined, container, name );
			return api.stopContainer( container, name )
				.then( removeFn )
				.catch( function( err ) {
					log.info( "[%s] Attempting to kill container", name );
					return api.killContainer( container, name )
						.then( removeFn )
						.catch( function() {
							log.info( "[%s] Error killing container. Removing anyway.", name );
							return removeFn();
						} );
				} );
		},

		deleteGist: function( container, name ) {
			var self = this;
			var tries = 1;

			var destroy = function() {
				return when.promise( function( resolve, reject ) {
					self._destroyContainer( container, name )
						.then( resolve, function( err ) {
							if ( tries >= MAX_RETRIES ) {
								log.error( "[%s] Container removal retry limit reached.", name );
								return reject( err );
							}
							tries++;
							log.info( "[%s] Error removing container. Retrying...", name );
							return setTimeout( function() {
								destroy().then( resolve, reject );
							}, RETRY_INTERVAL );
						} );
				} );
			};

			return destroy();
		},

		saveGist: function( container, name ) {
			log.info( "[%s] Starting container", name );
			return when.promise( function( resolve, reject ) {
				container.start( function( err, data ) {
					if ( err ) {
						if ( err.statusCode === NOT_MODIFIED ) {
							log.info( "[%s] Container already started", name );
							return resolve( container );
						}
						return reject( err );
					}
					return resolve( container );
				} );
			} );
		},

		createGist: function( image, options ) {
			log.info( "[%s] Creating container", image );
			return when.promise( function( resolve, reject ) {
				options.Image = image;
				github.createContainer( options, function( err, container ) {
					if ( err ) {
						return reject( err );
					}
					return resolve( container );
				} );
			} );
		},

		renameGist: function( name, container ) {
			log.info( "[%s] Setting container name", name );
			return when.promise( function( resolve, reject ) {
				container.rename( { name: name }, function( err, instance ) {
					if ( err ) {
						return reject( err );
					}
					return resolve( instance );
				} );
			} );
		},

		run: function( image, name, createOptions ) {
			return this.createContainer( image, createOptions )
				.then( function( container ) {
					return this.startContainer( container, name );
				}.bind( this ) )
				.then( this.renameContainer.bind( this, name ) );
		}

	};

	return api;
};

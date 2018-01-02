var _ = require( "lodash" );
var when = require( "when" );
var log = require( "./log" );
var logUpdate = require( "log-update" );
var NOT_MODIFIED = 304;
var NOT_FOUND = 404;
var MAX_RETRIES = 3;
var RETRY_INTERVAL = 500;

module.exports = function( docker, config ) {
	var authConfig = {
		base64: config ? config.auth : undefined
	};

	var api = {

		pullImage: function( image ) {
			log.info( "[%s] Attempting to pull image", image );
			return when.promise( function( resolve, reject ) {
				docker.pull( image, {
					authconfig: authConfig
				}, function( err, stream ) {
					if ( err ) {
						return reject( err );
					}
					var idMap = {};
					stream.on( "data", function( chunk ) {
						var str = chunk.toString();

						var splitLines = str.split( "\n" );

						splitLines.forEach( function( str ) { // eslint-disable-line
							var trimmed = str.trim();
							if ( !trimmed ) {
								return;
							}

							var data = JSON.parse( trimmed );
							if ( !data.id ) {
								return;
							}

							idMap[ data.id ] = data;
							if ( data.progress === "Pull complete" ||
								data.status === "Already exists" ||
								data.id === "latest" ) {
								delete idMap[ data.id ];
							}
							var lines = _.transform( idMap, function( accumulator, value ) { // eslint-disable-line
								var line = value.status;
								if ( value.progress ) {
									line += ": " + value.progress;
								}
								accumulator.push( line );
								return accumulator;
							}, [] );
							if ( lines.length ) {
								logUpdate( lines.join( "\n" ) );
							}
						} );
					} );
					stream.on( "end", function() {
						logUpdate.done();
						resolve();
					} );

					return stream;
				} );
			} );
		},

		getImage: function( image ) {
			return when.promise( function( resolve, reject ) {
				docker.listImages( function( err, images ) {
					if ( err ) {
						return reject( err );
					}

					var instance = _.find( images, function( i ) {
						return _.includes( i.RepoTags, image );
					} );

					return resolve( instance );
				} );
			} );
		},

		getAllContainers: function( baseImage ) {
			return when.promise( function( resolve, reject ) {
				docker.listContainers( { all: 1 }, function( err, containers ) {
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
						return docker.getContainer( c.Id );
					} );

					return resolve( instances );
				} );
			} );
		},

		stopContainer: function( container, name ) {
			return when.promise( function( resolve, reject ) {
				container.stop( function( err ) {
					if ( err ) {
						if ( err.statusCode === NOT_MODIFIED ) {
							log.info( "[%s] Container already stopped", name );
							return resolve( container );
						} else if ( err.statusCode === NOT_FOUND ) {
							log.info( "[%s] Container not found", name );
							return resolve( container );
						}
						return reject( err );
					}
					return resolve( container );
				} );
			} );
		},

		killContainer: function( container, name ) {
			log.info( "[%s] Killing container", name );
			return when.promise( function( resolve, reject ) {
				container.kill( function( err ) {
					if ( err ) {
						if ( err.statusCode === NOT_FOUND ) {
							log.info( "[%s] Container not found", name );
							return resolve( container );
						}
						return reject( err );
					}
					return resolve( container );
				} );
			} );
		},

		removeContainer: function( container, name ) {
			log.info( "[%s] Removing existing container", name );
			return when.promise( function( resolve, reject ) {
				container.remove( function( err, data ) {
					if ( err ) {
						if ( err.statusCode === NOT_FOUND ) {
							log.info( "[%s] Container not found", name );
							return resolve( container );
						}
						return reject( err );
					}
					return resolve( container );
				} );
			} );
		},

		_destroyContainer: function( container, name ) {
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

		destroyContainer: function( container, name ) {
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

		startContainer: function( container, name ) {
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

		createContainer: function( image, options ) {
			log.info( "[%s] Creating container", image );
			return when.promise( function( resolve, reject ) {
				options.Image = image;
				docker.createContainer( options, function( err, container ) {
					if ( err ) {
						return reject( err );
					}
					return resolve( container );
				} );
			} );
		},

		renameContainer: function( name, container ) {
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

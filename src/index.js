var path = require( "path" );

var _ = require( "lodash" );
var Docker = require( "dockerode" );
var GitHubApi = require( "github" );
var seq = require( "when/sequence" );

var MCMFolder = process.env.MCM_DIRECTORY;

var config = require( path.join( MCMFolder, "./config.json" ) );
var configDefaults = require( "../config/config.defaults.json" );
var dockerDefaults = require( "../config/docker.defaults.json" );

var log = require( "./log" );
var serviceLoader = require( "./loader" );
var serviceFactory = require( "./service" );
var githubApiFactory = require( "./services/github" );
var dockerApiFactory = require( "./services/docker" );
var setup = require( "./setup" )( { MCMFolder: MCMFolder } );

setup.verifyConfigurationFiles();

var docker = new Docker();
var github = new GitHubApi({
  host: 'api.github.com',
  pathPrefix: '/api/v3',
  protocol: 'https',
  port: 9898,
  proxy: '<proxyUrl>',
  ca: 'whatever',
  headers: {
    'accept': 'application/vnd.github.mcm-cli',
    'cookie': 'mcm-cli',
    'user-agent': 'mcm-cli'
  },
  requestMedia: 'application/vnd.github.mcm-cli',
  rejectUnauthorized: false,
  family: 6
});
var services = serviceLoader( {
	log: log,
	main: path.join( __dirname, "../services" ),
	local: path.join( MCMFolder, "./services" )
} );

module.exports = {
	startup: function( options ) {
		if ( !options ) {
			options = {
				configDefaults: configDefaults,
				userConfig: config.config,
				dockerDefaults: dockerDefaults
			};
		}
		return setup.run( options )
			.then( function( setupConfig ) {
				var dockerApi = dockerApiFactory( docker, setupConfig.docker );
				var serviceInstances = _.transform( config.services, function( memo, configuration, name ) {
					if ( !services[ name ] ) {
						log.error( "[%s] No service file found. Please remove entry from MCM configuration.", name );
						return;
					}
					configuration.sql = config.sql;
					var service = serviceFactory( {
						name: name,
						configuration: configuration,
						serviceDef: services[ name ],
						configDefaultValues: setupConfig.configDefaultValues,
						docker: dockerApi,
						dockerDefaults: setupConfig.dockerDefaults,
						MCMFolder: MCMFolder
					} );
					memo.push( service );
				}, [] );
				return {
					setupConfig: setupConfig,
					services: serviceInstances
				};
			} );
	},
	runServices: function( options ) {
		return api.startup()
		.then( function( results ) {
			var weightedServices = _.orderBy( results.services, "weight", "asc" );
			var tasks = weightedServices.reduce( function( memo, service ) {
				if ( options.include && !_.includes( options.include, service.name ) ) {
					return memo;
				}

				if ( service.omit || _.includes( options.omit, service.name ) ) {
					memo.push( function() {
						return service.stop();
					} );
				} else {
					memo.push( function() {
						return service.start( options.update, weightedServices );
					} );
				}
				return memo;
			}, [] );
			return seq( tasks );
		} )
		.catch( function( err ) {
			log.error( err.message );
			log.error( "MCM Exiting..." );
			process.exit( 1 ); // eslint-disable-line
		} );
	},
	stopServices: function( options ) {
		return api.startup()
		.then( function( results ) {
			var weightedServices = _.orderBy( results.services, "weight", "desc" );

			var tasks = weightedServices.reduce( function( memo, service ) {
				var shouldStop = true;
				if ( options.include && !_.includes( options.include, service.name ) ) {
					shouldStop = false;
				}

				if ( shouldStop ) {
					memo.push( function() {
						return service.stop();
					} );
				}

				return memo;
			}, [] );
			return seq( tasks );
		} )
		.catch( function( err ) {
			log.error( err.message );
			log.error( "MCM Exiting..." );
			process.exit( 1 ); // eslint-disable-line
		} );
	},
	installNodePackages: function( options ) {
		if ( !options ) {
			options = {
				configDefaults: configDefaults,
				userConfig: config.config
			};
		}

		return setup.run( options )
			.then( function( setupConfig ) {
				var githubApi = githubApiFactory( github, setupConfig.github );
				return { githubApi: githubApi, setupConfig: setupConfig };
			})
			.then(function( results ) {
				var githubApi = results.githubApi;
				var setupConfig = results.setupConfig;
				var pkgList = githubApi.getGist();
			});


		return setup.installPackages( options )
			.then( function( setupConfig ) {
				var dockerApi = dockerApiFactory( docker, setupConfig.docker );
				var serviceInstances = _.transform( config.services, function( memo, configuration, name ) {
					if ( !services[ name ] ) {
						log.error( "[%s] No service file found. Please remove entry from MCM configuration.", name );
						return;
					}
					configuration.sql = config.sql;
					var service = serviceFactory( {
						name: name,
						configuration: configuration,
						serviceDef: services[ name ],
						configDefaultValues: setupConfig.configDefaultValues,
						docker: dockerApi,
						dockerDefaults: setupConfig.dockerDefaults,
						MCMFolder: MCMFolder
					} );
					memo.push( service );
				}, [] );
				return {
					setupConfig: setupConfig,
					services: serviceInstances
				};
			} )

			.then( function( results ) {
				var weightedServices = _.orderBy( results.services, "weight", "asc" );
				var tasks = weightedServices.reduce( function( memo, service ) {
					if ( options.include && !_.includes( options.include, service.name ) ) {
						return memo;
					}

					if ( service.omit || _.includes( options.omit, service.name ) ) {
						memo.push( function() {
							return service.stop();
						} );
					} else {
						memo.push( function() {
							return service.start( options.update, weightedServices );
						} );
					}
					return memo;
				}, [] );
				return seq( tasks );
			} )
			.catch( function( err ) {
				log.error( err.message );
				log.error( "MCM Exiting..." );
				process.exit( 1 ); // eslint-disable-line
			} );
	}
};

var path = require( "path" );

var MCMFolder = process.env.MCM_DIRECTORY;

var log = require( "./log" );
var setup = require( "./setup" )( {
	MCMFolder: MCMFolder
} );

setup.verifyConfigurationFiles();

var serviceLoader = require( "./loader" );
var _ = require( "lodash" );
var seq = require( "when/sequence" );
var configDefaults = require( "../config/config.defaults.json" );
var dockerDefaults = require( "../config/docker.defaults.json" );
var config = require( path.join( MCMFolder, "./config.json" ) );
var dockerApiFactory = require( "./api" );
var serviceFactory = require( "./service" );

var Docker = require( "dockerode" );
var docker = new Docker();

var SERVICE_PATH = path.join( __dirname, "../services" );
var LOCAL_SERVICE_PATH = path.join( MCMFolder, "./services" );

var services = serviceLoader( {
	log: log,
	main: SERVICE_PATH,
	local: LOCAL_SERVICE_PATH
} );

var api = {

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
	}
};

module.exports = api;

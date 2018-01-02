var dockerSetup = require( "./dockerSetup" );
var _ = require( "lodash" );
var flatten = require( "flat" );
var hostile = require( "hostile" );
var lift = require( "when/node" ).lift;
var getHosts = lift( hostile.get );
var path = require( "path" );
var fs = require( "fs-extra" );
var os = require( "os" );

/**
 * Overwrites obj1's values with obj2's and adds obj2's if non existent in obj1
 * @param obj1
 * @param obj2
 * @returns obj3 a new object based on obj1 and obj2
 */
function merge_options(obj1, obj2){
    var obj3 = {};
    for (var attrname in obj1) { obj3[attrname] = obj1[attrname]; }
    for (var attrname in obj2) { obj3[attrname] = obj2[attrname]; }
    return obj3;
}

module.exports = function( setupOptions ) {
	var MCM_FOLDER = setupOptions.lksFolder;
	var CONFIG_FILE = path.join( MCM_FOLDER, "./config.json" );
	var CONFIG_SAMPLE = path.join( __dirname, "../config.json.sample" );

	var folders = [
		"./",
		"./containers"
	].map( function( f ) {
		return path.join( MCM_FOLDER, f );
	} );

	var files = [
		{
			location: CONFIG_SAMPLE,
			destination: CONFIG_FILE
		}
	];

	var api = {

		run: function( options ) {
			var data = {};
			var promises = [];
			var promise;

			/** If Github Setup */
			if (options.githubSetup) {
				promise = githubSetup.getGithubCreds( MCM_FOLDER )
					.then( function( encoded ) {
						data.github = {
							auth: encoded
						};
						data.configDefaultValues = api.parseConfig( options.configDefaults, options.userConfig );
					} )
					.then( function() {
						return api.setupGithubConfig( options.githubDefaults, data.configDefaultValues );
					} )
					.then( function( dockerConfig ) {
						data.githubDefaults = githubDefaults;
						return data;
					} );

				promises.push(promise);
			}

			promise = dockerSetup.getDockerCreds( MCM_FOLDER )
				.then( function( encoded ) {
					data.docker = {
						auth: encoded
					};
					data.configDefaultValues = api.parseConfig( options.configDefaults, options.userConfig );
				} )
				.then( function() {
					return api.setupDockerConfig( options.dockerDefaults, data.configDefaultValues );
				} )
				.then( function( dockerConfig ) {
					data.dockerDefaults = dockerConfig;
					return data;
				} );

			promises.push(promise);

			return Promise.all(promises)
				.then(function( values ) {
					return data;
				});
		},

		verifyConfigurationFiles: function() {
			folders.forEach( function( f ) {
				try {
					fs.accessSync( f );
				} catch ( e ) {
					fs.mkdirpSync( f );
				}
			} );

			files.forEach( function( f ) {
				try {
					fs.accessSync( f.destination );
				} catch ( e ) {
					fs.copySync( f.location, f.destination );
				}
			} );
		},

		parseConfig: function( _configDefaults, _userConfig ) {
			var configDefaults = _configDefaults || {};
			var userConfig = _userConfig || {};

			var config = _.defaultsDeep( userConfig, configDefaults );

			var flattened = _.transform( flatten( config, { delimiter: "_" } ), function( memo, value, key ) {
				memo[ key.toUpperCase() ] = value;
			}, {} );

			return flattened;
		},

		getHostIp: function( interfaceKey ) {
			var interfaces = os.networkInterfaces();

			var iface = interfaces[ interfaceKey ];
			if ( !iface ) {
				throw new Error( "Network interface not found" );
			}

			var entry = _.find( iface, { family: "IPv4" } );
			if ( !entry ) {
				throw new Error( "Network interface not found" );
			}
			return entry.address;
		},

		setupDockerConfig: function( dockerDefaults, configDefaultValues ) {
			var excludedIps = [ "255.255.255.255", "::1" ];
			var excludedHosts = [ "localhost", "broadcasthost", "docker.host.local", "public.host.local" ];
			return getHosts( false )
				.then( function( results ) {
					var dockerIp = configDefaultValues.NETWORK_DOCKER_IP || "172.17.0.1";
					var netInterface = configDefaultValues.NETWORK_PUBLIC_INTERFACE || "en0";
					var publicIp = configDefaultValues.NETWORK_PUBLIC_IP || configDefaultValues.PROXY_HOST || api.getHostIp( netInterface );
					var defaultHosts = [
						"docker.host.local:" + dockerIp,
						"public.host.local:" + publicIp
					];
					var extraHosts = _.reduce( results, function( memo, entry ) {
						var ip = entry[ 0 ] ? entry[ 0 ].trim() : null;
						if ( !ip || _.includes( excludedIps, ip ) ) {
							return memo;
						}

						if ( ip === "127.0.0.1" ) {
							ip = dockerIp; // Set ip to default docker bridge gateway
						}

						var hosts = entry[ 1 ].split( /\s+/ );
						_.each( hosts, function( h ) {
							if ( !h || _.includes( excludedHosts, h ) ) {
								return;
							}
							memo.push( h + ":" + ip );
						} );

						return memo;
					}, defaultHosts );

					dockerDefaults.HostConfig.ExtraHosts = dockerDefaults.HostConfig.ExtraHosts.concat( extraHosts );

					return dockerDefaults;
				} );
		},

		setupGithubConfig: function( dockerDefaults, configDefaultValues ) {
			var excludedIps = [ "255.255.255.255", "::1" ];
			var excludedHosts = [ "localhost", "broadcasthost", "docker.host.local", "public.host.local" ];
			return getHosts( false )
				.then( function( results ) {
					var dockerIp = configDefaultValues.NETWORK_DOCKER_IP || "172.17.0.1";
					var netInterface = configDefaultValues.NETWORK_PUBLIC_INTERFACE || "en0";
					var publicIp = configDefaultValues.NETWORK_PUBLIC_IP || configDefaultValues.PROXY_HOST || api.getHostIp( netInterface );
					var defaultHosts = [
						"docker.host.local:" + dockerIp,
						"public.host.local:" + publicIp
					];
					var extraHosts = _.reduce( results, function( memo, entry ) {
						var ip = entry[ 0 ] ? entry[ 0 ].trim() : null;
						if ( !ip || _.includes( excludedIps, ip ) ) {
							return memo;
						}

						if ( ip === "127.0.0.1" ) {
							ip = dockerIp; // Set ip to default docker bridge gateway
						}

						var hosts = entry[ 1 ].split( /\s+/ );
						_.each( hosts, function( h ) {
							if ( !h || _.includes( excludedHosts, h ) ) {
								return;
							}
							memo.push( h + ":" + ip );
						} );

						return memo;
					}, defaultHosts );

					dockerDefaults.HostConfig.ExtraHosts = dockerDefaults.HostConfig.ExtraHosts.concat( extraHosts );

					return dockerDefaults;
				} );
		}

	};

	return api;
};

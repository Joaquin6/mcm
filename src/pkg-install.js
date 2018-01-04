var path = require( "path" );

var _ = require( "lodash" );
var GitHubApi = require( "github" );
var seq = require( "when/sequence" );

var MCMFolder = process.env.MCM_DIRECTORY || "";

var config = require( path.resolve( MCMFolder, "./config.json" ) );
var configDefaults = require( "../config/config.defaults.json" );

var log = require( "./log" );
var githubApiFactory = require( "./lib/github" );
var setup = require( "./lib/githubSetup" )( { MCMFolder: MCMFolder } );

setup.verifyConfigurationFiles();

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

module.exports = {
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
				// var pkgList = githubApi.getGist();
			})
			.catch( function( err ) {
				log.error( err.message );
				log.error( "MCM Exiting..." );
				process.exit( 1 ); // eslint-disable-line
			} );
	}
};

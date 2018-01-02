var fs = require( "fs" );
var when = require( "when" );
var path = require( "path" );
var inquirer = require( "inquirer" );

var api = {
	readGithubCreds: function( githubCredsPath ) {
		try {
			fs.statSync( githubCredsPath );
		} catch ( e ) {
			return when.reject( new Error( "Credentials not found" ) );
		}

		var creds = fs.readFileSync( githubCredsPath, "utf-8" );
		return when( creds );
	},

	githubCredsPrompt: function() {
		return when.promise( function( resolve, reject ) {
			inquirer.prompt( [
				{
					name: "username",
					type: "input",
					message: "Github Username"
				},
				{
					name: "email",
					type: "input",
					message: "Github Email"
				},
				{
					name: "password",
					type: "password",
					message: "Github Password"
				}
			], function( answers ) {
				return resolve( answers );
			} );
		} );
	},

	saveGithubCreds: function( githubCredsPath ) {
		return api.githubCredsPrompt()
			.then( function( answers ) {
				answers.serveraddress = "https://api.github.com/api/v3";
				var encoded = new Buffer( JSON.stringify( answers ) ).toString( "base64" );
				fs.writeFileSync( githubCredsPath, encoded );
				return encoded;
			} );
	},

	getGithubCreds: function( mcmFolder ) {
		var githubCredsPath = path.join( mcmFolder, "./.credentials" );
		return api.readGithubCreds( githubCredsPath )
			.catch( function( err ) {
				return api.saveGithubCreds( githubCredsPath );
			} );
	}
};

module.exports = api;

var fs = require( "fs" );
var when = require( "when" );
var path = require( "path" );
var inquirer = require( "inquirer" );

var api = {
	readDockerCreds: function( dockerCredsPath ) {
		try {
			fs.statSync( dockerCredsPath );
		} catch ( e ) {
			return when.reject( new Error( "Credentials not found" ) );
		}

		var creds = fs.readFileSync( dockerCredsPath, "utf-8" );
		return when( creds );
	},

	dockerCredsPrompt: function() {
		return when.promise( function( resolve, reject ) {
			inquirer.prompt( [
				{
					name: "username",
					type: "input",
					message: "Docker Username"
				},
				{
					name: "email",
					type: "input",
					message: "Docker Email"
				},
				{
					name: "password",
					type: "password",
					message: "Docker Password"
				}
			], function( answers ) {
				return resolve( answers );
			} );
		} );
	},

	saveDockerCreds: function( dockerCredsPath ) {
		return api.dockerCredsPrompt()
			.then( function( answers ) {
				answers.serveraddress = "https://index.docker.io/v1";
				var encoded = new Buffer( JSON.stringify( answers ) ).toString( "base64" );
				fs.writeFileSync( dockerCredsPath, encoded );
				return encoded;
			} );
	},

	getDockerCreds: function( MCMFolder ) {
		var dockerCredsPath = path.join( MCMFolder, "./.credentials" );
		return api.readDockerCreds( dockerCredsPath )
			.catch( function( err ) {
				return api.saveDockerCreds( dockerCredsPath );
			} );
	}
};

module.exports = api;

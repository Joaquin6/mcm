require( "../setup.js" );

describe( "dockerSetup", () => {
	let api, fs, inquirer;
	beforeEach( () => {
		fs = {
			statSync: sinon.stub(),
			readFileSync: sinon.stub(),
			writeFileSync: sinon.stub()
		};

		inquirer = {
			prompt: sinon.stub()
		};

		api = proxyquire( "../src/dockerSetup", {
			fs,
			inquirer
		} );
	} );
	describe( "readDockerCreds", () => {
		describe( "when file does not exist", () => {
			beforeEach( () => {
				fs.statSync.throws( new Error( "I can't even" ) );
			} );
			it( "should reject with an error", () => {
				return api.readDockerCreds( "/my/creds" ).should.be.rejectedWith( /Credentials not found/ );
			} );
		} );
		describe( "when file does exist", () => {
			let result;
			beforeEach( () => {
				fs.readFileSync.returns( "someCreds" );
				result = api.readDockerCreds( "/my/creds" );
				return result;
			} );
			it( "should try to find the file", () => {
				fs.statSync.should.be.calledWith( "/my/creds" );
			} );
			it( "should read the file", () => {
				fs.readFileSync.should.be.calledWith( "/my/creds" );
			} );
			it( "should return the results from the file", () => {
				return result.should.eventually.equal( "someCreds" );
			} );
		} );
	} );
	describe( "dockerCredsPrompt", () => {
		let result;
		beforeEach( () => {
			inquirer.prompt.callsArgWith( 1, "MY_CREDS" );
			result = api.dockerCredsPrompt();
			return result;
		} );
		it( "should ask for the correct information", () => {
			inquirer.prompt.should.be.calledWith( [
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
			] );
		} );
		it( "should return the answers", () => {
			return result.should.eventually.equal( "MY_CREDS" );
		} );
	} );
	describe( "saveDockerCreds", () => {
		let result;
		beforeEach( () => {
			sinon.stub( api, "dockerCredsPrompt" ).resolves( { username: "me" } );
			result = api.saveDockerCreds( "/my/creds" );
			return result;
		} );
		it( "should write the creds with the encoded values", () => {
			fs.writeFileSync.should.be.calledWith( "/my/creds", "eyJ1c2VybmFtZSI6Im1lIiwic2VydmVyYWRkcmVzcyI6Imh0dHBzOi8vaW5kZXguZG9ja2VyLmlvL3YxIn0=" );
		} );
		it( "should return the encoded value", () => {
			return result.should.eventually.equal( "eyJ1c2VybmFtZSI6Im1lIiwic2VydmVyYWRkcmVzcyI6Imh0dHBzOi8vaW5kZXguZG9ja2VyLmlvL3YxIn0=" );
		} );
	} );
	describe( "getDockerCreds", () => {
		describe( "when creds exist", () => {
			let result, read;
			beforeEach( () => {
				read = sinon.stub( api, "readDockerCreds" ).resolves( "MY_CREDS" );
				result = api.getDockerCreds( "/my/folder" );
				return result;
			} );
			it( "should use the correct file", () => {
				read.should.be.calledWith( "/my/folder/.credentials" );
			} );
			it( "should return the credentials", () => {
				return result.should.eventually.equal( "MY_CREDS" );
			} );
		} );
		describe( "when creds do not exist", () => {
			let result, save;
			beforeEach( () => {
				sinon.stub( api, "readDockerCreds" ).rejects( new Error( "NOT FOUND" ) );
				save = sinon.stub( api, "saveDockerCreds" ).resolves( "MY_CREDS" );
				result = api.getDockerCreds( "/my/folder" );
				return result;
			} );
			it( "should call save with the correct file", () => {
				save.should.be.calledWith( "/my/folder/.credentials" );
			} );
			it( "should return the credentials", () => {
				return result.should.eventually.equal( "MY_CREDS" );
			} );
		} );
	} );
} );

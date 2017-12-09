require( "../setup.js" );

describe( "Service Loader Behavior", () => {
	var fs, loader;
	before( () => {
		fs = {
			readdirSync: sinon.stub(),
			readJsonSync: sinon.stub()
		};

		loader = proxyquire( "../src/loader", {
			"fs-extra": fs
		} );
	} );

	describe( "when local service directory does not exist", () => {
		describe( "when reading the service JSON succeeds", () => {
			var results;
			before( () => {
				fs.readdirSync.withArgs( "/local/services" ).throws();
				fs.readdirSync.withArgs( "/main/services" ).returns( [ "service1.json", "service2.json" ] );
				fs.readJsonSync.withArgs( "/main/services/service1.json" ).returns( { name: "service1" } );
				fs.readJsonSync.withArgs( "/main/services/service2.json" ).returns( { name: "service2" } );
				results = loader( {
					log: {},
					main: "/main/services",
					local: "/local/services"
				} );
			} );

			it( "should load the main services", () => {
				results.should.eql( {
					service1: {
						name: "service1",
						weight: 100
					},
					service2: {
						name: "service2",
						weight: 100
					}
				} );
			} );

			after( () => {
				fs.readdirSync.reset();
			} );
		} );
		describe( "when reading the service JSON fails", () => {
			var results, error, errorLog;
			before( () => {
				error = new Error( "nope" );
				errorLog = sinon.stub();
				fs.readdirSync.withArgs( "/local/services" ).throws();
				fs.readdirSync.withArgs( "/main/services" ).returns( [ "service1.json", "service2.json" ] );
				fs.readJsonSync.withArgs( "/main/services/service1.json" ).throws( error );
				fs.readJsonSync.withArgs( "/main/services/service2.json" ).returns( { name: "service2" } );
				results = loader( {
					log: { error: errorLog },
					main: "/main/services",
					local: "/local/services"
				} );
			} );

			it( "should load the main services", () => {
				results.should.eql( {
					service2: {
						name: "service2",
						weight: 100
					}
				} );
			} );

			it( "should log the error", () => {
				errorLog.should.be.calledOnce.and.calledWith( error );
			} );

			after( () => {
				fs.readdirSync.reset();
			} );
		} );
	} );

	describe( "when a local service directory does exist", () => {
		var results;
		before( () => {
			fs.readdirSync.withArgs( "/local/services" ).returns( [ "service2.json", "service3.json" ] );
			fs.readdirSync.withArgs( "/main/services" ).returns( [ "service1.json", "service2.json" ] );
			fs.readJsonSync.withArgs( "/main/services/service1.json" ).returns( { name: "service1", weight: 10 } );
			fs.readJsonSync.withArgs( "/main/services/service2.json" ).returns( { name: "service2-main", weight: 88 } );
			fs.readJsonSync.withArgs( "/local/services/service2.json" ).returns( { name: "service2-local", weight: 99 } );
			fs.readJsonSync.withArgs( "/local/services/service3.json" ).returns( { name: "service3" } );
			results = loader( {
				log: {},
				main: "/main/services",
				local: "/local/services"
			} );
		} );

		it( "should prefer local services", () => {
			results.should.eql( {
				service1: {
					name: "service1",
					weight: 10
				},
				service2: {
					name: "service2-local",
					weight: 99
				},
				service3: {
					name: "service3",
					weight: 100
				}
			} );
		} );

		after( () => {
			fs.readdirSync.reset();
		} );
	} );
} );

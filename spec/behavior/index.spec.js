require( "../setup.js" );
const path = require( "path" );

describe( "index", () => {
	let index,
		logStub,
		setup,
		serviceLoader,
		dockerApiFactory,
		serviceFactory,
		configDefaults,
		dockerDefaults,
		config,
		verifyConfigurationFiles,
		run,
		Docker;
	beforeEach( () => {
		process.env.MCM_DIRECTORY = "/my/MCM/folder";
		logStub = {
			error: sinon.stub()
		};
		verifyConfigurationFiles = sinon.stub();
		run = sinon.stub();
		setup = sinon.stub().returns( {
			verifyConfigurationFiles,
			run
		} );
		serviceLoader = sinon.stub().returns( {
			service1: "SERVICE1_DEFINITTION",
			service2: "SERVICE2_DEFINITTION"
		} );
		dockerApiFactory = sinon.stub().returns( "DOCKER_API" );
		serviceFactory = sinon.stub().returnsArg( 0 );
		configDefaults = "GLOBAL_CONFIG_DEFAULTS";
		dockerDefaults = "GLOBAL_DOCKER_DEFAULTS";
		config = {
			config: "USER_CONFIGURATION",
			services: {
				service1: {
					port: 1000
				},
				service2: {
					port: 2000
				},
				service3: {
					port: 3000
				}
			},
			sql: "SQL_CONFIG"
		};
		Docker = sinon.stub();
		index = proxyquire.noCallThru().load( "../src/index", {
			"./setup": setup,
			"./log": logStub,
			"./loader": serviceLoader,
			"./api": dockerApiFactory,
			"./service": serviceFactory,
			"../config/config.defaults.json": configDefaults,
			"../config/docker.defaults.json": dockerDefaults,
			"/my/MCM/folder/config.json": config,
			dockerode: Docker
		} );
	} );

	afterEach( () => {
		proxyquire.callThru();
	} );

	describe( "initialization", () => {
		it( "should call setup with the correct folder", () => {
			setup.should.be.calledOnce.and.calledWith( {
				MCMFolder: "/my/MCM/folder"
			} );
		} );
		it( "should verify the configuration files", () => {
			verifyConfigurationFiles.should.be.calledOnce;
		} );
		it( "should call the service loader", () => {
			serviceLoader.should.be.calledWith( {
				log: logStub,
				main: path.resolve( "./services" ),
				local: "/my/MCM/folder/services"
			} );
		} );
	} );

	describe( "startup", () => {
		describe( "when options are provided", () => {
			let result;
			beforeEach( () => {
				run.resolves( {
					docker: "DOCKER_CONFIG",
					configDefaultValues: "PROCESSED_CONFIG",
					dockerDefaults: "PROCESSED_DOCKER_DEFAULTS"
				} );
				result = index.startup( {
					configDefaults: "CONFIG_DEFAULTS",
					userConfig: "USER_CONFIG",
					dockerDefaults: "DOCKER_DEFAULTS"
				} );
				return result;
			} );

			it( "should call run with the correct object", () => {
				run.should.be.calledWith( {
					configDefaults: "CONFIG_DEFAULTS",
					userConfig: "USER_CONFIG",
					dockerDefaults: "DOCKER_DEFAULTS"
				} );
			} );
		} );
		describe( "when options are not provided", () => {
			let result;
			beforeEach( () => {
				run.resolves( {
					docker: "DOCKER_CONFIG",
					configDefaultValues: "PROCESSED_CONFIG",
					dockerDefaults: "PROCESSED_DOCKER_DEFAULTS"
				} );
				result = index.startup();
				return result;
			} );

			it( "should call run with the correct object", () => {
				run.should.be.calledWith( {
					configDefaults: "GLOBAL_CONFIG_DEFAULTS",
					dockerDefaults: "GLOBAL_DOCKER_DEFAULTS",
					userConfig: "USER_CONFIGURATION"
				} );
			} );

			it( "should initialize the docker api", () => {
				dockerApiFactory.should.be.calledWith( sinon.match.instanceOf( Docker ), "DOCKER_CONFIG" );
			} );

			it( "should log an error for services that no longer exist", () => {
				logStub.error.should.be.calledOnce.and.calledWith( "[%s] No service file found. Please remove entry from MCM configuration.", "service3" );
			} );

			it( "should return the services and setup config", () => {
				return result.should.eventually.eql( {
					setupConfig: {
						docker: "DOCKER_CONFIG",
						configDefaultValues: "PROCESSED_CONFIG",
						dockerDefaults: "PROCESSED_DOCKER_DEFAULTS"
					},
					services: [
						{
							name: "service1",
							configuration: {
								port: 1000,
								sql: "SQL_CONFIG"
							},
							serviceDef: "SERVICE1_DEFINITTION",
							configDefaultValues: "PROCESSED_CONFIG",
							docker: "DOCKER_API",
							dockerDefaults: "PROCESSED_DOCKER_DEFAULTS",
							MCMFolder: "/my/MCM/folder"
						},
						{
							name: "service2",
							configuration: {
								port: 2000,
								sql: "SQL_CONFIG"
							},
							serviceDef: "SERVICE2_DEFINITTION",
							configDefaultValues: "PROCESSED_CONFIG",
							docker: "DOCKER_API",
							dockerDefaults: "PROCESSED_DOCKER_DEFAULTS",
							MCMFolder: "/my/MCM/folder"
						}
					]
				} );
			} );
		} );
	} );

	describe( "runServices", () => {
		let services, s1, s2, s3;
		beforeEach( () => {
			s1 = {
				name: "s1",
				weight: 500,
				start: sinon.stub().resolves(),
				stop: sinon.stub().resolves()
			};
			s2 = {
				name: "s2",
				weight: 200,
				start: sinon.stub().resolves(),
				stop: sinon.stub().resolves()
			};
			s3 = {
				name: "s3",
				weight: 800,
				start: sinon.stub().resolves(),
				stop: sinon.stub().resolves()
			};
			services = [ s1, s2, s3 ];
			sinon.stub( index, "startup" ).resolves( { services } );
		} );
		describe( "when include option is present", () => {
			beforeEach( () => {
				return index.runServices( {
					include: [ "s1", "s2" ],
					update: true
				} );
			} );
			it( "should start the correct services", () => {
				s1.start.should.be.calledOnce
					.and.calledWith( true, sinon.match.array );
				s2.start.should.be.calledOnce;
				s2.start.should.be.calledBefore( s1 );
				s3.start.should.not.be.called;
			} );
		} );
		describe( "when omit option is present", () => {
			beforeEach( () => {
				s2.omit = true;
				return index.runServices( {
					omit: [ "s1" ],
					update: true
				} );
			} );
			it( "should start the correct services", () => {
				s1.stop.should.be.calledOnce;
				s2.stop.should.be.calledOnce;
				s3.start.should.be.calledOnce;
			} );
		} );
		describe( "when there is an error", () => {
			let exit;
			beforeEach( () => {
				s1.start.rejects( new Error( "can't start" ) );
				exit = sinon.stub( process, "exit" );
				return index.runServices( {} );
			} );

			it( "should log the error", () => {
				logStub.error.should.be.calledWith( "can't start" );
				logStub.error.should.be.calledWith( "MCM Exiting..." );
			} );

			it( "should exit the process", () => {
				exit.should.be.calledWith( 1 );
			} );

			afterEach( () => {
				exit.restore();
			} );
		} );
	} );

	describe( "stopServices", () => {
		let services, s1, s2, s3;
		beforeEach( () => {
			s1 = {
				name: "s1",
				weight: 500,
				stop: sinon.stub().resolves()
			};
			s2 = {
				name: "s2",
				weight: 200,
				stop: sinon.stub().resolves()
			};
			s3 = {
				name: "s3",
				weight: 800,
				stop: sinon.stub().resolves()
			};
			services = [ s1, s2, s3 ];
			sinon.stub( index, "startup" ).resolves( { services } );
		} );
		describe( "when include option is present", () => {
			beforeEach( () => {
				return index.stopServices( {
					include: [ "s1", "s2" ]
				} );
			} );
			it( "should stop the correct services", () => {
				s1.stop.should.be.calledOnce;
				s2.stop.should.be.calledOnce;
				s1.stop.should.be.calledBefore( s2 );
				s3.stop.should.not.be.called;
			} );
		} );
		describe( "when omit option is present", () => {
			beforeEach( () => {
				return index.stopServices( {} );
			} );
			it( "should stop the correct services", () => {
				s1.stop.should.be.calledOnce;
				s2.stop.should.be.calledOnce;
				s3.stop.should.be.calledOnce;
				s3.stop.should.be.calledBefore( s1 );
				s1.stop.should.be.calledBefore( s2 );
			} );
		} );
		describe( "when there is an error", () => {
			let exit;
			beforeEach( () => {
				s1.stop.rejects( new Error( "can't stop" ) );
				exit = sinon.stub( process, "exit" );
				return index.stopServices( {} );
			} );

			it( "should log the error", () => {
				logStub.error.should.be.calledWith( "can't stop" );
				logStub.error.should.be.calledWith( "MCM Exiting..." );
			} );

			it( "should exit the process", () => {
				exit.should.be.calledWith( 1 );
			} );

			afterEach( () => {
				exit.restore();
			} );
		} );
	} );
} );

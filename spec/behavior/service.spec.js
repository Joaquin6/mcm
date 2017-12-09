require( "../setup.js" );
var path = require( "path" );
var _ = require( "lodash" );

describe( "Service Behavior", function() {
	var serviceFactory, service, logger, docker, configuration, serviceDef, dockerDefaults, configDefaultValues, fs, serviceHooks, requireAll;
	before( function() {
		logger = {
			info: sinon.stub(),
			data: sinon.stub(),
			error: sinon.stub(),
			reset: function() {
				this.info.resetHistory();
				this.data.resetHistory();
				this.error.resetHistory();
			}
		};

		fs = {
			accessSync: sinon.stub().throws(),
			mkdirpSync: sinon.stub(),
			copySync: sinon.stub()
		};

		serviceHooks = {
			postInit: sinon.stub(),
			preStart: sinon.stub(),
			postFileSystem: sinon.stub()
		};

		requireAll = sinon.stub().returns( {
			serviceWithMixin: "myMixin"
		} );

		serviceFactory = proxyquire( "../src/service", {
			"./log": logger,
			"fs-extra": fs,
			"require-all": requireAll
		} );

		docker = {
			pullImage: sinon.stub(),
			startContainer: sinon.stub(),
			run: sinon.stub(),
			getAllContainers: sinon.stub(),
			destroyContainer: sinon.stub(),
			getImage: sinon.stub()
		};

		configuration = {
			omit: true,
			tag: "mySpecialTag",
			config: {
				host: 2000,
				logging: true
			},
			env: {
				DEBUG: "*,-express*"
			},
			ports: {
				http: 1000
			}
		};

		serviceDef = {
			image: "my/image",
			env: {
				SOMETHING: "hereissomething",
				DEBUG: "*"
			},
			weight: 9,
			config: {
				host: 1000,
				debug: false,
				name: "<%= SERVICE_NAME %>",
				envName: "<%= ENVIRONMENT %>",
				dbHost: "<%= SQL_HOST %>",
				lk_test: "aValue" // eslint-disable-line camelcase
			},
			folders: [
				"/test/aFolder",
				"/test/anotherFolder"
			],
			files: [
				{ location: "/files/test/somefile.json", destination: "/test/folder/somefile.json" },
				{ location: "/files/test/somefile2.json", destination: "/test/folder/somefile2.json" },
				{ location: "/files/test/somefile3.json", destination: "/test/folder/somefile3.json", preserve: false }
			],
			run: {
				Tty: false,
				HostConfig: {
					Binds: [
						"/test/someFolder:/aFolder",
						"/test/someOtherFolder:/anotherFolder"
					]
				}
			},
			ports: {
				http: {
					env: "HOST_PORT",
					container: 8000,
					host: 8001
				},
				server: {
					env: "SERVER_PORT",
					container: 9000,
					host: 9001,
					protocol: "udp"
				},
				other: {
					container: 9999,
					host: 9999
				}
			}
		};

		dockerDefaults = {
			Tty: true,
			Env: [],
			HostConfig: {
				PortBindings: {}
			},
			ExposedPorts: {}
		};
		configDefaultValues = {
			SQL_HOST: "localmssql"
		};

		service = serviceFactory( {
			name: "myService",
			docker: docker,
			configuration: configuration,
			serviceDef: serviceDef,
			dockerDefaults: dockerDefaults,
			configDefaultValues: configDefaultValues,
			MCMFolder: "~/.MCM",
			hooks: serviceHooks
		} );
	} );

	describe( "initialization", () => {
		it( "should set the name", () => {
			service.name.should.eql( "myService" );
		} );

		it( "should store the api object", () => {
			service.api.should.eql( docker );
		} );

		it( "should set the config", () => {
			service.config.should.eql( configuration );
		} );

		it( "should save the service definition", () => {
			service.serviceDef.should.eql( serviceDef );
		} );

		it( "should set omit if included in the configuration", () => {
			service.omit.should.be.ok;
		} );

		it( "should set the tag", () => {
			service.tag.should.eql( "mySpecialTag" );
		} );

		it( "should set the service weight", () => {
			service.weight.should.eql( 9 );
		} );

		it( "should set the image", () => {
			service.baseImage.should.equal( "my/image" );
			service.image.should.equal( "my/image:mySpecialTag" );
		} );

		it( "should setup the docker run config properly", () => {
			service.runConfig.should.eql( {
				Tty: false,
				Env: [
					"LK_HOST=2000",
					"LK_LOGGING=true",
					"LK_DEBUG=false",
					"LK_NAME=myService",
					"LK__ENV_NAME=dev",
					"LK__DB_HOST=localmssql",
					"LK_TEST=aValue",
					"LK_HOST_PORT=8000",
					"LK_SERVER_PORT=9000",
					"DEBUG=*,-express*",
					"SOMETHING=hereissomething"
				],
				HostConfig: {
					PortBindings: {
						"8000/tcp": [ { HostPort: "1000" } ],
						"9000/udp": [ { HostPort: "9001" } ],
						"9999/tcp": [ { HostPort: "9999" } ]
					},
					Binds: [
						"~/.MCM/containers/test/someFolder:/aFolder",
						"~/.MCM/containers/test/someOtherFolder:/anotherFolder"
					]
				},
				ExposedPorts: {
					"8000/tcp": { HostPort: "1000" },
					"9000/udp": { HostPort: "9001" },
					"9999/tcp": { HostPort: "9999" }
				}
			} );
		} );

		it( "should set the MCM folder", () => {
			service.MCMFolder.should.equal( "~/.MCM" );
		} );

		it( "should set the container data folder", () => {
			service.containersFolder.should.equal( "~/.MCM/containers" );
		} );

		it( "should save the public ports", () => {
			service.publicPorts.should.eql( {
				http: "1000",
				server: "9001",
				other: "9999"
			} );
		} );

		it( "should fire the postInit hooks", () => {
			serviceHooks.postInit.should.have.been.calledWith( {
				name: "myService",
				docker: docker,
				configuration: configuration,
				serviceDef: serviceDef,
				dockerDefaults: dockerDefaults,
				configDefaultValues: configDefaultValues,
				MCMFolder: "~/.MCM",
				hooks: serviceHooks
			} );
		} );

		after( () => {
			fs.accessSync.resetHistory();
			fs.mkdirpSync.resetHistory();
			fs.copySync.resetHistory();
		} );
	} );

	describe( "minimal initialization", () => {
		var instance;
		before( () => {
			instance = serviceFactory( {
				name: "minimalService",
				MCMFolder: "/my/folder",
				configuration: {},
				serviceDef: {}
			} );
		} );
		it( "should set the tag", () => {
			instance.tag.should.equal( "latest" );
		} );
		it( "should set the ports", () => {
			instance.ports.should.eql( [] );
		} );
	} );

	describe( "initialization with mixin", () => {
		var instance;
		before( () => {
			instance = serviceFactory( {
				name: "serviceWithMixin",
				MCMFolder: "/my/folder",
				configuration: {},
				serviceDef: {}
			} );
		} );
		it( "should set the hooks", () => {
			instance.hooks.should.equal( "myMixin" );
		} );
	} );

	describe( "pull", () => {
		var instance;
		before( () => {
			instance = serviceFactory( {
				name: "myService",
				docker: docker,
				configuration: configuration,
				serviceDef: serviceDef,
				dockerDefaults: dockerDefaults,
				configDefaultValues: configDefaultValues,
				MCMFolder: "~/.MCM"
			} );

			instance.image = "myImageToPull";
		} );

		describe( "when the call is successful", () => {
			var result;
			before( () => {
				docker.pullImage.resolves( "imageHere" );
				result = instance.pull();
				return result;
			} );

			it( "should pull the correct image", () => {
				docker.pullImage.should.have.been.calledWith( "myImageToPull" );
			} );

			it( "should resolve with the image", () => {
				return result.should.eventually.equal( "imageHere" );
			} );

			after( () => {
				docker.pullImage.resetHistory();
			} );
		} );

		describe( "when there is an error", () => {
			var result, error;
			before( () => {
				error = new Error( "No pulling allowed" );
				docker.pullImage.rejects( error );
				result = instance.pull();
				return result;
			} );

			it( "should log the error", () => {
				logger.error.should.have.been.calledWith( error );
			} );

			it( "should resolve with the image", () => {
				return result.should.eventually.eql( null );
			} );

			after( () => {
				docker.pullImage.resetHistory();
				logger.reset();
			} );
		} );
	} );

	describe( "run", () => {
		var instance;
		before( () => {
			instance = serviceFactory( {
				name: "myService",
				docker: docker,
				configuration: configuration,
				serviceDef: serviceDef,
				dockerDefaults: dockerDefaults,
				configDefaultValues: configDefaultValues,
				MCMFolder: "~/.MCM"
			} );

			instance.image = "myServiceImage";
			instance.run();
		} );

		it( "should pull the correct image", () => {
			docker.run.should.have.been.calledWith( "myServiceImage", "myService", instance.runConfig );
		} );

		after( () => {
			docker.run.resetHistory();
		} );
	} );

	describe( "getImage", () => {
		var instance;
		before( () => {
			instance = serviceFactory( {
				name: "myService",
				docker: docker,
				configuration: configuration,
				serviceDef: serviceDef,
				dockerDefaults: dockerDefaults,
				configDefaultValues: configDefaultValues,
				MCMFolder: "~/.MCM"
			} );

			instance.image = "myServiceImage";
			instance.getImage();
		} );

		it( "should get the correct image", () => {
			docker.getImage.should.have.been.calledWith( "myServiceImage" );
		} );

		after( () => {
			docker.run.resetHistory();
		} );
	} );

	describe( "cleanup", () => {
		var instance;
		before( () => {
			instance = serviceFactory( {
				name: "myService",
				docker: docker,
				configuration: configuration,
				serviceDef: serviceDef,
				dockerDefaults: dockerDefaults,
				configDefaultValues: configDefaultValues,
				MCMFolder: "~/.MCM"
			} );
		} );
		describe( "when no containers were found", () => {
			before( () => {
				docker.getAllContainers.resolves( [] );
			} );

			it( "should resolve with null", () => {
				return instance.cleanup().should.eventually.eql( null );
			} );

			after( () => {
				docker.getAllContainers.resetHistory();
				docker.destroyContainer.resetHistory();
			} );
		} );

		describe( "when containers were found", () => {
			before( () => {
				docker.getAllContainers.resolves( [ "c1", "c2" ] );
				return instance.cleanup();
			} );

			it( "should look for the correct containers", () => {
				docker.getAllContainers.should.have.been.calledWith( "my/image" );
			} );

			it( "should destroy the found containers", () => {
				docker.destroyContainer.should.have.been.calledTwice;
				docker.destroyContainer.should.have.been.calledWith( "c1", "myService" );
				docker.destroyContainer.should.have.been.calledWith( "c2", "myService" );
			} );

			after( () => {
				docker.getAllContainers.resetHistory();
				docker.destroyContainer.resetHistory();
			} );
		} );
	} );

	describe( "start", () => {
		var instance, cleanup, getImage, pull, run, setupFs;
		before( () => {
			instance = serviceFactory( {
				name: "myService",
				docker: docker,
				configuration: configuration,
				serviceDef: serviceDef,
				dockerDefaults: dockerDefaults,
				configDefaultValues: configDefaultValues,
				MCMFolder: "~/.MCM",
				hooks: serviceHooks
			} );

			cleanup = sinon.stub( instance, "cleanup" ).resolves();
			getImage = sinon.stub( instance, "getImage" ).resolves();
			pull = sinon.stub( instance, "pull" ).resolves();
			run = sinon.stub( instance, "run" ).resolves();
			setupFs = sinon.stub( instance, "_setupFilesystem" );
		} );

		describe( "when no existing image is found", () => {
			before( () => {
				getImage.resolves( null );
				return instance.start();
			} );

			it( "should pull and run", () => {
				pull.should.have.been.called;
				run.should.have.been.called;
			} );

			after( () => {
				pull.resetHistory();
				run.resetHistory();
				cleanup.resetHistory();
				getImage.resetHistory();
			} );
		} );

		describe( "when image is found and update is not set", () => {
			before( () => {
				getImage.resolves( "someImage" );
				return instance.start();
			} );

			it( "should call the preStart hook", () => {
				serviceHooks.preStart.should.have.been.calledWith( undefined );
			} );

			it( "should set up the necessary files", () => {
				setupFs.should.have.been.called;
			} );

			it( "should cleanup", () => {
				cleanup.should.have.been.called;
			} );

			it( "should get the image", () => {
				getImage.should.have.been.called;
			} );

			it( "should not pull", () => {
				pull.should.not.have.been.called;
			} );

			it( "should run", () => {
				run.should.have.been.called;
			} );

			after( () => {
				pull.resetHistory();
				run.resetHistory();
				cleanup.resetHistory();
				getImage.resetHistory();
			} );
		} );

		describe( "when the update flag has been set", () => {
			before( () => {
				getImage.resolves( "someImage" );
				return instance.start( true, [ 1, 2 ] );
			} );

			it( "should call the preStart hook", () => {
				serviceHooks.preStart.should.have.been.calledWith( true, [ 1, 2 ] );
			} );

			it( "should pull and run", () => {
				pull.should.have.been.called;
				run.should.have.been.called;
			} );

			after( () => {
				pull.resetHistory();
				run.resetHistory();
				cleanup.resetHistory();
				getImage.resetHistory();
			} );
		} );
	} );

	describe( "stop", () => {
		var cleanup;
		before( () => {
			var instance = serviceFactory( {
				name: "myService",
				docker: docker,
				configuration: configuration,
				serviceDef: serviceDef,
				dockerDefaults: dockerDefaults,
				configDefaultValues: configDefaultValues,
				MCMFolder: "~/.MCM"
			} );

			cleanup = sinon.stub( instance, "cleanup" ).resolves();
			return instance.stop();
		} );

		it( "should call cleanup", () => {
			cleanup.should.have.been.called;
		} );
	} );

	describe( "_setupFilesystem", () => {
		describe( "when no files or folders are specified", () => {
			var instance;
			before( () => {
				var localServiceDef = _.cloneDeep( serviceDef );
				delete localServiceDef.folders;
				delete localServiceDef.files;
				instance = serviceFactory( {
					name: "myService",
					docker: docker,
					configuration: configuration,
					serviceDef: localServiceDef,
					dockerDefaults: dockerDefaults,
					configDefaultValues: configDefaultValues,
					MCMFolder: "~/.MCM",
					hooks: serviceHooks
				} );

				instance._setupFilesystem();
			} );

			it( "should not manipulate any files or folders", () => {
				fs.accessSync.should.not.be.called;
				fs.mkdirpSync.should.not.be.called;
				fs.copySync.should.not.be.called;
			} );

			it( "should call the postFileSystem hook", () => {
				serviceHooks.postFileSystem.should.have.been.calledWith( [] );
			} );

			after( () => {
				fs.accessSync.resetHistory();
				fs.mkdirpSync.resetHistory();
				fs.copySync.resetHistory();
			} );
		} );
		describe( "when files and folders are specified", () => {
			var instance;
			before( () => {
				instance = serviceFactory( {
					name: "myService",
					docker: docker,
					configuration: configuration,
					serviceDef: serviceDef,
					dockerDefaults: dockerDefaults,
					configDefaultValues: configDefaultValues,
					MCMFolder: "~/.MCM",
					hooks: serviceHooks
				} );

				instance._setupFilesystem();
			} );

			it( "should check for the necessary folders", () => {
				fs.accessSync.should.have.been.calledWith( "~/.MCM/containers/test/aFolder" );
				fs.accessSync.should.have.been.calledWith( "~/.MCM/containers/test/anotherFolder" );
			} );

			it( "should create the necessary folders", () => {
				fs.mkdirpSync.should.have.been.calledWith( "~/.MCM/containers/test/aFolder" );
				fs.mkdirpSync.should.have.been.calledWith( "~/.MCM/containers/test/anotherFolder" );
			} );

			it( "should check for the necessary files", () => {
				fs.accessSync.should.have.been.calledWith( "~/.MCM/containers/test/folder/somefile.json" );
				fs.accessSync.should.have.been.calledWith( "~/.MCM/containers/test/folder/somefile2.json" );
				fs.accessSync.should.not.have.been.calledWith( "~/.MCM/containers/test/folder/somefile3.json" );
			} );

			it( "should create the necessary files", () => {
				var rootDirectory = path.resolve( __dirname, "../../" );
				fs.copySync.should.have.been.calledWith( path.join( rootDirectory, "/files/test/somefile.json" ), "~/.MCM/containers/test/folder/somefile.json" );
				fs.copySync.should.have.been.calledWith( path.join( rootDirectory, "/files/test/somefile2.json" ), "~/.MCM/containers/test/folder/somefile2.json" );
				fs.copySync.should.have.been.calledWith( path.join( rootDirectory, "/files/test/somefile3.json" ), "~/.MCM/containers/test/folder/somefile3.json" );
			} );

			it( "should call the postFileSystem hook", () => {
				serviceHooks.postFileSystem.should.have.been.calledWith( [
					"~/.MCM/containers/test/folder/somefile.json",
					"~/.MCM/containers/test/folder/somefile2.json",
					"~/.MCM/containers/test/folder/somefile3.json"
				] );
			} );

			after( () => {
				fs.accessSync.resetHistory();
				fs.mkdirpSync.resetHistory();
				fs.copySync.resetHistory();
			} );
		} );
	} );
} );

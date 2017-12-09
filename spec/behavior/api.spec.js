require( "../setup.js" );
const PassThrough = require( "stream" ).PassThrough;
const _ = require( "lodash" );

describe( "Docker API Interactions", function() {
	const logger = {
		info: sinon.stub(),
		data: sinon.stub(),
		reset() {
			this.info.reset();
			this.data.reset();
		}
	};

	const config = {
		auth: "base64string"
	};

	let api, docker, logUpdate, apiFactory;

	before( function() {
		logUpdate = sinon.stub();
		logUpdate.done = sinon.stub();

		apiFactory = proxyquire( "../src/api", {
			"./log": logger,
			"log-update": logUpdate
		} );

		docker = {
			pull: sinon.stub(),
			listContainers: sinon.stub(),
			getContainer: sinon.stub(),
			createContainer: sinon.stub(),
			listImages: sinon.stub()
		};
		api = apiFactory( docker, config );
	} );

	describe( "pullImage", function() {
		describe( "when an error happens", function() {
			let err;
			before( function() {
				err = new Error( "NO IMAGE HERE" );
				docker.pull.callsArgWith( 2, err );
			} );

			it( "should reject with error", function() {
				return api.pullImage( "someImage" ).should.be.rejectedWith( err );
			} );

			after( function() {
				docker.pull.reset();
				logger.reset();
			} );
		} );

		describe( "when the image is pulled successfully", function() {
			describe( "when there are lines to log", () => {
				let stream;
				before( function( done ) {
					stream = new PassThrough();

					docker.pull.callsArgWith( 2, null, stream );
					api.pullImage( "someImage" )
						.then( function() {
							return done();
						} );

					process.nextTick( function() {
						const msgs = [ {
								status: 1,
								progress: 2,
								id: 123
							}, {
								status: 3,
								progress: 4,
								id: 456
							}, {
								status: "Doing good",
								id: 789
							},
							" ", {
								status: 3
							}, {
								status: "Already exists",
								progress: 4,
								id: 1
							}, {
								id: "latest"
							}, {
								id: 2,
								progress: "Pull complete"
							}
						];
						msgs.forEach( m => {
							stream.write( _.isObject( m ) ? JSON.stringify( m ) : m );
						} );
						stream.end();
					} );
				} );

				it( "should call pull with the correct information", function() {
					docker.pull.should.have.been.calledWith( "someImage", {
						authconfig: {
							base64: "base64string"
						}
					}, sinon.match.func );
				} );

				it( "should log the data", function() {
					logUpdate.should.have.been.calledWith( "1: 2\n3: 4\nDoing good" );
				} );

				it( "should close the logUpdate", () => {
					logUpdate.done.should.have.been.called;
				} );

				after( function() {
					docker.pull.reset();
					logger.reset();
					logUpdate.reset();
				} );
			} );
			describe( "when there are no lines to log", () => {
				let stream;
				before( function( done ) {
					stream = new PassThrough();

					docker.pull.callsArgWith( 2, null, stream );
					api.pullImage( "someImage" )
						.then( function() {
							return done();
						} );

					process.nextTick( function() {
						const msgs = [ {
							id: 2,
							progress: "Pull complete"
						} ];
						msgs.forEach( m => {
							stream.write( _.isObject( m ) ? JSON.stringify( m ) : m );
						} );
						stream.end();
					} );
				} );

				it( "should not log any data", function() {
					logUpdate.should.not.be.called;
				} );

				it( "should close the logUpdate", () => {
					logUpdate.done.should.have.been.called;
				} );

				after( function() {
					docker.pull.reset();
					logger.reset();
					logUpdate.reset();
				} );
			} );
		} );

		describe( "when no auth config is provided", () => {
			let instance, stream, localDocker;
			before( done => {
				stream = new PassThrough();
				localDocker = {
					pull: sinon.stub().callsArgWith( 2, null, stream )
				};
				instance = apiFactory( localDocker );
				instance.pullImage( "someImage" )
					.then( function() {
						return done();
					} );
				process.nextTick( () => {
					stream.end();
				} );
			} );
			it( "should call pull with the correct information", function() {
				localDocker.pull.should.have.been.calledWith( "someImage", {
					authconfig: {
						base64: undefined
					}
				}, sinon.match.func );
			} );
		} );
	} );

	describe( "getImage", () => {
		describe( "when there is an error", () => {
			let error;
			before( () => {
				error = new Error( "no image" );
				docker.listImages.callsArgWith( 0, error );
			} );

			it( "should reject with error", () => {
				return api.getImage( "myImage" ).should.be.rejectedWith( error );
			} );

			after( () => {
				docker.listImages.reset();
			} );
		} );

		describe( "when image is not found", () => {
			before( () => {
				docker.listImages.callsArgWith( 0, null, null );
			} );

			it( "should return empty", () => {
				return api.getImage( "myImage" ).should.eventually.eql( undefined );
			} );

			after( () => {
				docker.listImages.reset();
			} );
		} );

		describe( "when the image is found", () => {
			let image1, image2;
			before( () => {
				image1 = {
					Id: "123",
					RepoTags: [ "/some/image:latest", "/some/image:other" ]
				};

				image2 = {
					Id: "123",
					RepoTags: [ "/other/image:latest", "/other/image:other" ]
				};

				docker.listImages.callsArgWith( 0, null, [ image2, image1 ] );
			} );

			it( "should resolve with the image", () => {
				return api.getImage( "/some/image:latest" ).should.eventually.eql( image1 );
			} );

			after( () => {
				docker.listImages.reset();
			} );
		} );
	} );

	describe( "getAllContainers", function() {
		describe( "when there is an error", function() {
			let error;
			before( function() {
				error = new Error( "Can't list" );
				docker.listContainers.callsArgWith( 1, error );
			} );

			it( "should reject with error", function() {
				return api.getAllContainers( "myContainer" ).should.be.rejectedWith( error );
			} );

			after( function() {
				docker.listContainers.reset();
				logger.reset();
			} );
		} );

		describe( "when no container is found", function() {
			let result;
			before( function() {
				docker.listContainers.callsArgWith( 1, null, null );
				result = api.getAllContainers( "/some/image" );
				return result;
			} );

			it( "should resolve with an empty array", function() {
				return result.should.eventually.eql( [] );
			} );

			after( function() {
				docker.listContainers.reset();
				logger.reset();
			} );
		} );

		describe( "when a container is found", function() {
			let container, container2, container3, result;
			before( function() {
				container = {
					Id: "abc123",
					Names: [ "/myContainer" ],
					Image: "/some/image"
				};

				container2 = {
					Id: "abc456",
					Names: [ "/myContainer" ],
					Image: "/some/other/image"
				};

				container3 = {
					Id: "abc789",
					Names: [ "/myContainer" ],
					Image: "/some/image"
				};

				docker.listContainers.callsArgWith( 1, null, [ container, container2, container3 ] );
				docker.getContainer.onFirstCall().returns( container );
				docker.getContainer.onSecondCall().returns( container3 );
				result = api.getAllContainers( "/some/image" );
				return result;
			} );

			it( "should call listContainers with the correct arguments", function() {
				docker.listContainers.should.have.been.calledWith( {
					all: 1
				} );
			} );

			it( "should get the correct container", function() {
				docker.getContainer.should.have.been.calledTwice.and.calledWith( "abc123" ).and.calledWith( "abc789" );
			} );

			it( "should return the container instance", function() {
				return result.should.eventually.eql( [ container, container3 ] );
			} );

			after( function() {
				docker.listContainers.reset();
				docker.getContainer.reset();
				logger.reset();
			} );
		} );
	} );

	describe( "stopContainer", function() {
		let container;
		before( function() {
			container = {
				stop: sinon.stub()
			};
		} );

		describe( "when there is no error", function() {
			before( function() {
				container.stop.callsArgWith( 0, null );
			} );

			it( "should resolve with the container", function() {
				return api.stopContainer( container ).should.eventually.eql( container );
			} );

			after( function() {
				logger.reset();
				container.stop.reset();
			} );
		} );

		describe( "when there is an unknown error", function() {
			let error;
			before( function() {
				error = new Error( "uh oh" );
				container.stop.callsArgWith( 0, error );
			} );

			it( "should reject with the error", function() {
				return api.stopContainer( container ).should.be.rejectedWith( error );
			} );

			after( function() {
				logger.reset();
				container.stop.reset();
			} );
		} );

		describe( "when the container is already stopped", function() {
			let result;
			before( function() {
				const error = new Error( "uh oh" );
				error.statusCode = 304;
				container.stop.callsArgWith( 0, error );
				result = api.stopContainer( container, "someContainer" );
				return result;
			} );

			it( "should log a message", function() {
				logger.info.should.have.been.calledWith( "[%s] Container already stopped", "someContainer" );
			} );

			it( "should resolve with the container", function() {
				return result.should.eventually.eql( container );
			} );

			after( function() {
				logger.reset();
				container.stop.reset();
			} );
		} );

		describe( "when the container doesn't exist", function() {
			let result;
			before( function() {
				const error = new Error( "uh oh" );
				error.statusCode = 404;
				container.stop.callsArgWith( 0, error );
				result = api.stopContainer( container, "noWorky" );
				return result;
			} );

			it( "should log a message", function() {
				logger.info.should.have.been.calledWith( "[%s] Container not found", "noWorky" );
			} );

			it( "should resolve with the container", function() {
				return result.should.eventually.eql( container );
			} );

			after( function() {
				logger.reset();
				container.stop.reset();
			} );
		} );
	} );

	describe( "killContainer", function() {
		let container;
		before( function() {
			container = {
				kill: sinon.stub()
			};
		} );

		describe( "when there is no error", function() {
			before( function() {
				container.kill.callsArgWith( 0, null );
			} );

			it( "should resolve with the container", function() {
				return api.killContainer( container ).should.eventually.eql( container );
			} );

			after( function() {
				logger.reset();
				container.kill.reset();
			} );
		} );

		describe( "when there is an unknown error", function() {
			let error;
			before( function() {
				error = new Error( "uh oh" );
				container.kill.callsArgWith( 0, error );
			} );

			it( "should reject with the error", function() {
				return api.killContainer( container ).should.be.rejectedWith( error );
			} );

			after( function() {
				logger.reset();
				container.kill.reset();
			} );
		} );

		describe( "when the container doesn't exist", function() {
			let result;
			before( function() {
				const error = new Error( "uh oh" );
				error.statusCode = 404;
				container.kill.callsArgWith( 0, error );
				result = api.killContainer( container, "noWorky" );
				return result;
			} );

			it( "should log a message", function() {
				logger.info.should.have.been.calledWith( "[%s] Container not found", "noWorky" );
			} );

			it( "should resolve with the container", function() {
				return result.should.eventually.eql( container );
			} );

			after( function() {
				logger.reset();
				container.kill.reset();
			} );
		} );
	} );

	describe( "removeContainer", function() {
		let container;
		before( function() {
			container = {
				remove: sinon.stub()
			};
		} );

		describe( "when there is no error", function() {
			before( function() {
				container.remove.callsArgWith( 0, null );
			} );

			it( "should resolve with the container", function() {
				return api.removeContainer( container ).should.eventually.eql( container );
			} );

			after( function() {
				logger.reset();
				container.remove.reset();
			} );
		} );

		describe( "when there is an unknown error", function() {
			let error;
			before( function() {
				error = new Error( "uh oh" );
				container.remove.callsArgWith( 0, error );
			} );

			it( "should reject with the error", function() {
				return api.removeContainer( container ).should.be.rejectedWith( error );
			} );

			after( function() {
				logger.reset();
				container.remove.reset();
			} );
		} );

		describe( "when the container doesn't exist", function() {
			let result;
			before( function() {
				const error = new Error( "uh oh" );
				error.statusCode = 404;
				container.remove.callsArgWith( 0, error );
				result = api.removeContainer( container, "NOPE" );
				return result;
			} );

			it( "should log a message", function() {
				logger.info.should.have.been.calledWith( "[%s] Container not found", "NOPE" );
			} );

			it( "should resolve with the container", function() {
				return result.should.eventually.eql( container );
			} );

			after( function() {
				logger.reset();
				container.remove.reset();
			} );
		} );
	} );

	describe( "_destroyContainer", function() {
		describe( "when there is no error", () => {
			let stop, remove, result, container, kill;
			before( function() {
				container = "someContainer";
				stop = sinon.stub( api, "stopContainer" ).resolves( container );
				remove = sinon.stub( api, "removeContainer" ).resolves();
				kill = sinon.stub( api, "killContainer" ).resolves();
				result = api._destroyContainer( container );
				return result;
			} );

			it( "should pass the container through", function() {
				stop.should.have.been.calledWith( container );
				remove.should.have.been.calledOnce.and.calledWith( container );
			} );

			it( "should not try to kill the container", () => {
				kill.should.not.have.been.called;
			} );

			after( function() {
				stop.restore();
				remove.restore();
				kill.restore();
			} );
		} );

		describe( "when there is an error removing container", () => {
			let stop, remove, result, container, kill;
			before( function() {
				container = "someContainer";
				stop = sinon.stub( api, "stopContainer" ).resolves( container );
				remove = sinon.stub( api, "removeContainer" ).resolves();
				remove.onFirstCall().rejects( new Error( "NOPE" ) );
				remove.onSecondCall().resolves();
				kill = sinon.stub( api, "killContainer" ).resolves();
				result = api._destroyContainer( container );
				return result;
			} );

			it( "should pass the container through", function() {
				stop.should.have.been.calledWith( container );
				remove.should.have.been.calledTwice.and.calledWith( container );
			} );

			it( "should kill the container", () => {
				kill.should.have.been.calledWith( container );
			} );

			after( function() {
				stop.restore();
				remove.restore();
				kill.restore();
			} );
		} );

		describe( "when there is an error killing container", () => {
			let stop, remove, result, container, kill;
			before( function() {
				container = "someContainer";
				stop = sinon.stub( api, "stopContainer" ).resolves( container );
				remove = sinon.stub( api, "removeContainer" ).resolves();
				remove.onFirstCall().rejects( new Error( "NOPE" ) );
				remove.onSecondCall().rejects( new Error( "Still Nope" ) );
				remove.onThirdCall().resolves();
				kill = sinon.stub( api, "killContainer" ).resolves();
				result = api._destroyContainer( container );
				return result;
			} );

			it( "should pass the container through", function() {
				stop.should.have.been.calledWith( container );
				remove.should.have.been.calledThrice.and.calledWith( container );
			} );

			it( "should kill the container", () => {
				kill.should.have.been.calledWith( container );
			} );

			after( function() {
				stop.restore();
				remove.restore();
				kill.restore();
			} );
		} );
	} );

	describe( "destroyContainer", () => {
		describe( "when the destroy is successful the first time", () => {
			let destroy;
			before( () => {
				destroy = sinon.stub( api, "_destroyContainer" ).resolves();
			} );

			it( "should resolve", () => {
				return api.destroyContainer().should.be.fulfilled;
			} );

			after( () => {
				destroy.restore();
			} );
		} );

		describe( "when the destroy is successful the third time", () => {
			this.timeout( 2000 );
			let destroy;
			before( () => {
				const error = new Error( "NOPE" );
				destroy = sinon.stub( api, "_destroyContainer" );
				destroy.onFirstCall().rejects( error );
				destroy.onSecondCall().rejects( error );
				destroy.onThirdCall().resolves();
			} );

			it( "should resolve", () => {
				return api.destroyContainer().should.be.fulfilled;
			} );

			after( () => {
				destroy.restore();
			} );
		} );

		describe( "when the destroy is not succesful", () => {
			let destroy;
			before( () => {
				destroy = sinon.stub( api, "_destroyContainer" ).rejects( new Error( "NOPE" ) );
			} );

			it( "should resolve", () => {
				return api.destroyContainer().should.be.rejected;
			} );

			it( "should attempt to destroy 3 times", () => {
				destroy.callCount.should.equal( 3 );
			} );

			after( () => {
				destroy.restore();
			} );
		} );
	} );

	describe( "startContainer", function() {
		let container;
		before( function() {
			container = {
				start: sinon.stub()
			};
		} );

		describe( "when there is no error", function() {
			before( function() {
				container.start.callsArgWith( 0, null );
			} );

			it( "should resolve with the container", function() {
				return api.startContainer( container ).should.eventually.eql( container );
			} );

			after( function() {
				logger.reset();
				container.start.reset();
			} );
		} );

		describe( "when there is an unknown error", function() {
			let error;
			before( function() {
				error = new Error( "uh oh" );
				container.start.callsArgWith( 0, error );
			} );

			it( "should reject with the error", function() {
				return api.startContainer( container ).should.be.rejectedWith( error );
			} );

			after( function() {
				logger.reset();
				container.start.reset();
			} );
		} );

		describe( "when the container is already running", function() {
			let result;
			before( function() {
				const error = new Error( "uh oh" );
				error.statusCode = 304;
				container.start.callsArgWith( 0, error );
				result = api.startContainer( container, "alreadyStarted" );
				return result;
			} );

			it( "should log a message", function() {
				logger.info.should.have.been.calledWith( "[%s] Container already started", "alreadyStarted" );
			} );

			it( "should resolve with the container", function() {
				return result.should.eventually.eql( container );
			} );

			after( function() {
				logger.reset();
				container.start.reset();
			} );
		} );
	} );

	describe( "createContainer", function() {
		let image, container, options;
		before( function() {
			image = "my/image";
			container = "myContainerInstance";
			options = {
				myDockerOpts: true
			};
		} );

		describe( "when there is no error", function() {
			let result;
			before( function() {
				docker.createContainer.callsArgWith( 1, null, container );
				result = api.createContainer( image, options );
				return result;
			} );

			it( "should resolve with the container", function() {
				return result.should.eventually.eql( container );
			} );

			it( "should create the container with the correct options", () => {
				docker.createContainer.should.have.been.calledWith( {
					Image: "my/image",
					myDockerOpts: true
				} );
			} );

			after( function() {
				logger.reset();
				docker.createContainer.reset();
			} );
		} );

		describe( "when there is an unknown error", function() {
			let error;
			before( function() {
				error = new Error( "uh oh" );
				docker.createContainer.callsArgWith( 1, error );
			} );

			it( "should reject with the error", function() {
				return api.createContainer( image, {} ).should.be.rejectedWith( error );
			} );

			after( function() {
				logger.reset();
				docker.createContainer.reset();
			} );
		} );
	} );

	describe( "renameContainer", function() {
		let container, instance;
		before( function() {
			container = {
				rename: sinon.stub()
			};
			instance = "someContainerInstance";
		} );

		describe( "when there is no error", function() {
			let result;
			before( function() {
				container.rename.callsArgWith( 1, null, instance );
				result = api.renameContainer( "cName", container );
				return result;
			} );

			it( "should resolve with the container instance", function() {
				return result.should.eventually.eql( instance );
			} );

			it( "should create the container with the correct options", () => {
				container.rename.should.have.been.calledWith( {
					name: "cName"
				} );
			} );

			after( function() {
				logger.reset();
			} );
		} );

		describe( "when there is an unknown error", function() {
			let error;
			before( function() {
				error = new Error( "uh oh" );
				container.rename.callsArgWith( 1, error );
			} );

			it( "should reject with the error", function() {
				return api.renameContainer( "cName", container ).should.be.rejectedWith( error );
			} );

			after( function() {
				logger.reset();
			} );
		} );
	} );

	describe( "run", function() {
		let createStub, startStub, renameStub, createResult, startResult, renameResult, finalResult;
		before( function() {
			createResult = "createResult";
			createStub = sinon.stub( api, "createContainer" ).resolves( createResult );

			startResult = "startResult";
			startStub = sinon.stub( api, "startContainer" ).resolves( startResult );

			renameResult = "renameResult";
			renameStub = sinon.stub( api, "renameContainer" ).resolves( renameResult );

			finalResult = api.run( "myImage", "myName", {
				myOptions: true
			} );
			return finalResult;
		} );

		it( "should call create", function() {
			createStub.should.have.been.calledWith( "myImage", {
				myOptions: true
			} );
		} );

		it( "should call start", function() {
			startStub.should.have.been.calledWith( createResult );
		} );

		it( "should call rename", function() {
			renameStub.should.have.been.calledWith( "myName", startResult );
		} );

		it( "should resolve correctly", function() {
			return finalResult.should.eventually.eql( renameResult );
		} );

		after( function() {
			createStub.restore();
			startStub.restore();
			renameStub.restore();
		} );
	} );
} );

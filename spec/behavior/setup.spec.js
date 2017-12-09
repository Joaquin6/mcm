require( "../setup.js" );
var path = require( "path" );

describe( "Setup Behavior", () => {
	var api, fs, cp, hostile, dockerSetup, os;
	before( () => {
		os = {
			networkInterfaces: sinon.stub()
		};

		fs = {
			accessSync: sinon.stub(),
			copySync: sinon.stub(),
			mkdirpSync: sinon.stub()
		};

		cp = {
			exec: sinon.stub(),
			spawn: sinon.stub()
		};

		hostile = {
			get: sinon.stub()
		};

		dockerSetup = {
			getDockerCreds: sinon.stub()
		};

		api = proxyquire( "../src/setup", {
			"fs-extra": fs,
			child_process: cp, // eslint-disable-line
			hostile: hostile,
			"./dockerSetup": dockerSetup,
			os: os
		} )( {
			MCMFolder: "~/me/.MCM"
		} );
	} );

	describe( "run", () => {
		var setupDockerConfig, parseConfig, result;
		before( ( done ) => {
			dockerSetup.getDockerCreds.resolves( "i'm encoded" );
			setupDockerConfig = sinon.stub( api, "setupDockerConfig" ).resolves( { dockerConfig: "stuff" } );
			parseConfig = sinon.stub( api, "parseConfig" ).returns( { config: "stuff" } );

			api.run( {
				vmOptions: "some overrides",
				dockerDefaults: { dockerDefaults: true },
				configDefaults: "configDefaults",
				userConfig: "userConfig"
			} ).then( res => {
				result = res;
				done();
			} );
		} );

		after( () => {
			setupDockerConfig.restore();
			parseConfig.restore();
		} );

		it( "should pass the docker defaults and config defaults through", () => {
			setupDockerConfig.should.have.been.calledWith( { dockerDefaults: true }, { config: "stuff" } );
		} );

		it( "should parse the correct configs", () => {
			parseConfig.should.have.been.calledWith( "configDefaults", "userConfig" );
		} );

		it( "should return the correct data", () => {
			result.should.eql( {
				docker: {
					auth: "i'm encoded"
				},
				dockerDefaults: {
					dockerConfig: "stuff"
				},
				configDefaultValues: {
					config: "stuff"
				}
			} );
		} );
	} );

	describe( "verifyConfigurationFiles", () => {
		describe( "when the config files exist", () => {
			before( () => {
				fs.accessSync.returns( true );
				api.verifyConfigurationFiles();
			} );

			it( "should check for the MCM home folder", () => {
				fs.accessSync.should.have.been.calledWith( "~/me/.MCM/" );
			} );

			it( "should check for the config file", () => {
				fs.accessSync.should.have.been.calledWith( path.join( "~/me/.MCM/", "./config.json" ) );
			} );

			it( "should not copy anything", () => {
				fs.copySync.should.not.have.been.called;
			} );

			after( () => {
				fs.accessSync.reset();
			} );
		} );

		describe( "when the config files do not exist", () => {
			before( () => {
				fs.accessSync.throws();
				api.verifyConfigurationFiles();
			} );

			it( "should create the MCM folder", () => {
				fs.mkdirpSync.should.have.been.calledWith( "~/me/.MCM/" );
			} );

			it( "should copy the sample config file", () => {
				fs.copySync.should.have.been.calledWith( path.join( __dirname, "../../config.json.sample" ), path.join( "~/me/.MCM", "./config.json" ) );
			} );

			after( () => {
				fs.accessSync.reset();
				fs.copySync.reset();
			} );
		} );
	} );

	describe( "parseConfig", () => {
		describe( "when two configurations are given", () => {
			it( "should merge and flatten them correctly", () => {
				var userConfig = {
					sql: {
						database: "myDb",
						host: "localhost"
					},
					redis: {
						host: "localhost"
					}
				};

				var configDefaults = {
					sql: {
						database: "defaultDb",
						host: "defaultHost",
						user: "someUser"
					},
					rabbitmq: {
						host: "wabbit"
					}
				};

				api.parseConfig( configDefaults, userConfig ).should.eql( {
					SQL_DATABASE: "myDb",
					SQL_HOST: "localhost",
					SQL_USER: "someUser",
					REDIS_HOST: "localhost",
					RABBITMQ_HOST: "wabbit"
				} );
			} );
		} );
		describe( "when no configurations are given", () => {
			it( "should return an empty object", () => {
				api.parseConfig().should.eql( {} );
			} );
		} );
	} );

	describe( "getHostIp", () => {
		describe( "when the interface exists", () => {
			describe( "when the interface has an ipv4 address", () => {
				before( () => {
					os.networkInterfaces.returns( {
						en0: [ {
							address: "192.168.0.100",
							family: "IPv4"
						} ]
					} );
				} );

				it( "should find the correct interface", () => {
					api.getHostIp( "en0" ).should.equal( "192.168.0.100" );
				} );

				after( () => {
					os.networkInterfaces.reset();
				} );
			} );
			describe( "when the interface does not have an ipv4 address", () => {
				before( () => {
					os.networkInterfaces.returns( {
						en0: [ {
							address: "192.168.0.100",
							family: "IPv6"
						} ]
					} );
				} );

				it( "should throw an error", () => {
					( function() {
						api.getHostIp( "en0" );
					} ).should.throw();
				} );

				after( () => {
					os.networkInterfaces.reset();
				} );
			} );
		} );
		describe( "when the interface does not exist", () => {
			before( () => {
				os.networkInterfaces.returns( {
					en0: [ {
						address: "192.168.0.100",
						family: "IPv6"
					} ]
				} );
			} );

			it( "should throw an error", () => {
				( function() {
					api.getHostIp( "en5" );
				} ).should.throw();
			} );

			after( () => {
				os.networkInterfaces.reset();
			} );
		} );
	} );

	describe( "setupDockerConfig", () => {
		describe( "with no overriding config", () => {
			var result;
			before( done => {
				sinon.stub( api, "getHostIp" ).withArgs( "en0" ).returns( "192.168.0.1" );
				var hosts = [
					[ "172.16.82.175", "127.0.0.1 localhost.kanban.com" ],
					[ "127.0.0.1", "me " ],
					[ "255.255.255.255", "hello" ],
					[ "10.10.10.1", "" ],
					[ null, "hostonly" ],
					[ "::1", "here" ],
					[ "128.48.18.204", "localhost" ],
					[ "255.23.24.24", "broadcasthost" ],
					[ "123.43.12.435", "public.host.local" ],
					[ "123.43.12.432", "docker.host.local" ],
					[ "\t28.18.29.20", "something.com localhost" ]
				];

				var dockerDefaults = {
					HostConfig: {
						ExtraHosts: [ "vagrant.local:192.168.33.1" ]
					}
				};

				hostile.get.callsArgWith( 1, null, hosts );
				api.setupDockerConfig( dockerDefaults, {} )
					.then( res => {
						result = res;
						done();
					} );
			} );

			after( () => {
				hostile.get.reset();
				api.getHostIp.restore();
			} );

			it( "should not preserve hostfile formatting", () => {
				hostile.get.should.have.been.calledWith( false );
			} );

			it( "should return the correct docker config", () => {
				result.should.eql( {
					HostConfig: {
						ExtraHosts: [
							"vagrant.local:192.168.33.1",
							"docker.host.local:172.17.0.1",
							"public.host.local:192.168.0.1",
							"127.0.0.1:172.16.82.175",
							"localhost.kanban.com:172.16.82.175",
							"me:172.17.0.1",
							"something.com:28.18.29.20"
						]
					}
				} );
			} );
		} );
		describe( "when overriding the docker ip", () => {
			var result;
			before( done => {
				sinon.stub( api, "getHostIp" ).withArgs( "en0" ).returns( "192.168.0.1" );
				var hosts = [ ];

				var dockerDefaults = {
					HostConfig: {
						ExtraHosts: []
					}
				};

				hostile.get.callsArgWith( 1, null, hosts );
				api.setupDockerConfig( dockerDefaults, { NETWORK_DOCKER_IP: "172.1.1.1" } )
					.then( res => {
						result = res;
						done();
					} );
			} );

			it( "should return the correct docker config", () => {
				result.should.eql( {
					HostConfig: {
						ExtraHosts: [
							"docker.host.local:172.1.1.1",
							"public.host.local:192.168.0.1"
						]
					}
				} );
			} );

			after( () => {
				hostile.get.reset();
				api.getHostIp.restore();
			} );
		} );
		describe( "when overriding the public interface", () => {
			var result;
			before( done => {
				sinon.stub( api, "getHostIp" ).withArgs( "en5" ).returns( "192.168.0.125" );
				var hosts = [ ];

				var dockerDefaults = {
					HostConfig: {
						ExtraHosts: []
					}
				};

				hostile.get.callsArgWith( 1, null, hosts );
				api.setupDockerConfig( dockerDefaults, { NETWORK_PUBLIC_INTERFACE: "en5" } )
					.then( res => {
						result = res;
						done();
					} );
			} );

			it( "should return the correct docker config", () => {
				result.should.eql( {
					HostConfig: {
						ExtraHosts: [
							"docker.host.local:172.17.0.1",
							"public.host.local:192.168.0.125"
						]
					}
				} );
			} );

			after( () => {
				hostile.get.reset();
				api.getHostIp.restore();
			} );
		} );
		describe( "when overriding the public ip", () => {
			var result;
			before( done => {
				sinon.stub( api, "getHostIp" );
				var hosts = [ ];

				var dockerDefaults = {
					HostConfig: {
						ExtraHosts: []
					}
				};

				hostile.get.callsArgWith( 1, null, hosts );
				api.setupDockerConfig( dockerDefaults, {
					NETWORK_PUBLIC_IP: "10.10.10.10",
					PROXY_HOST: "11.11.11.11"
				} )
					.then( res => {
						result = res;
						done();
					} );
			} );

			it( "should return the correct docker config", () => {
				result.should.eql( {
					HostConfig: {
						ExtraHosts: [
							"docker.host.local:172.17.0.1",
							"public.host.local:10.10.10.10"
						]
					}
				} );
			} );

			after( () => {
				hostile.get.reset();
				api.getHostIp.restore();
			} );
		} );
		describe( "when overriding with the legacy proxy host value", () => {
			var result;
			before( done => {
				sinon.stub( api, "getHostIp" );
				var hosts = [ ];

				var dockerDefaults = {
					HostConfig: {
						ExtraHosts: []
					}
				};

				hostile.get.callsArgWith( 1, null, hosts );
				api.setupDockerConfig( dockerDefaults, {
					PROXY_HOST: "11.11.11.11"
				} )
					.then( res => {
						result = res;
						done();
					} );
			} );

			it( "should return the correct docker config", () => {
				result.should.eql( {
					HostConfig: {
						ExtraHosts: [
							"docker.host.local:172.17.0.1",
							"public.host.local:11.11.11.11"
						]
					}
				} );
			} );

			after( () => {
				hostile.get.reset();
				api.getHostIp.restore();
			} );
		} );
	} );
} );

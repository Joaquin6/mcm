require( "../../setup.js" );

describe( "Service - HAProxy", () => {
	var fs, service;

	before( () => {
		fs = {
			readFileSync: sinon.stub(),
			writeFileSync: sinon.stub()
		};

		service = proxyquire( "../src/services/haproxy", {
			"fs-extra": fs
		} );
	} );

	describe( "postInit", () => {
		it( "should store the kanban host configuration", () => {
			var context = {};
			service.postInit.call( context, {
				configDefaultValues: {
					KANBAN_HOST: "somekanban.com"
				}
			} );
			context.proxyConfig.kanbanHost.should.equal( "somekanban.com" );
		} );
	} );

	describe( "preStart", () => {
		describe( "when the proxy path is a string", () => {
			it( "should construct the haproxy statements correctly", () => {
				var context = {
					proxyConfig: {}
				};
				var services = [
					{ name: "other" },
					{
						name: "api",
						publicPorts: {
							http: 8080
						},
						proxy: {
							path: "/my/api",
							port: "http"
						}
					}
				];
				service.preStart.call( context, false, services );

				context.proxyEntries.should.eql( {
					backendPaths: [
						"use_backend bk_api if { path_beg -i /my/api }" ],
					backendDefinitions: [
						"backend bk_api\n\tserver api public.host.local:8080"
					]
				} );
			} );
		} );
		describe( "when the proxy path is an array", () => {
			it( "should construct the haproxy statements correctly", () => {
				var context = {
					proxyConfig: {}
				};
				var services = [
					{ name: "other" },
					{
						name: "api",
						publicPorts: {
							http: 8080
						},
						proxy: {
							path: [ "/my/api", "/other/path" ],
							port: "http"
						}
					}
				];
				service.preStart.call( context, false, services );

				context.proxyEntries.should.eql( {
					backendPaths: [
						"use_backend bk_api if { path_beg -i /my/api }",
						"use_backend bk_api if { path_beg -i /other/path }"
					],
					backendDefinitions: [
						"backend bk_api\n\tserver api public.host.local:8080"
					]
				} );
			} );
		} );

		describe( "when the proxy path is an object", () => {
			describe( "when the acl is an array", () => {
				it( "should construct the haproxy statements correctly", () => {
					var context = {
						proxyConfig: {}
					};
					var services = [
						{ name: "other" },
						{
							name: "api",
							publicPorts: {
								http: 8080
							},
							proxy: {
								path: {
									path_end: [ "/my/api", "/other/path" ], // eslint-disable-line
									path_beg: "/other/api" // eslint-disable-line
								},
								port: "http",
								backend: [
									"line1",
									"line2"
								],
								acl: [ "some_acl_rule" ]
							}
						}
					];
					service.preStart.call( context, false, services );

					context.proxyEntries.should.eql( {
						backendPaths: [
							"use_backend bk_api if { path_end -i /my/api }",
							"use_backend bk_api if { path_end -i /other/path }",
							"use_backend bk_api if { path_beg -i /other/api }",
							"use_backend bk_api if some_acl_rule"
						],
						backendDefinitions: [
							"backend bk_api\n\tserver api public.host.local:8080\n\tline1\n\tline2"
						]
					} );
				} );
			} );
			describe( "when the acl is a string", () => {
				it( "should construct the haproxy statements correctly", () => {
					var context = {
						proxyConfig: {}
					};
					var services = [
						{ name: "other" },
						{
							name: "api",
							publicPorts: {
								http: 8080
							},
							proxy: {
								path: {
									path_end: [ "/my/api", "/other/path" ], // eslint-disable-line
									path_beg: "/other/api" // eslint-disable-line
								},
								port: "http",
								backend: [
									"line1",
									"line2"
								],
								acl: "some_acl_rule"
							}
						}
					];
					service.preStart.call( context, false, services );

					context.proxyEntries.should.eql( {
						backendPaths: [
							"use_backend bk_api if { path_end -i /my/api }",
							"use_backend bk_api if { path_end -i /other/path }",
							"use_backend bk_api if { path_beg -i /other/api }",
							"use_backend bk_api if some_acl_rule"
						],
						backendDefinitions: [
							"backend bk_api\n\tserver api public.host.local:8080\n\tline1\n\tline2"
						]
					} );
				} );
			} );
		} );
	} );

	describe( "postFileSystem", () => {
		before( () => {
			fs.readFileSync.returns( "<%= BACKEND_PATHS %>\n\n<%= BACKEND_DEFINITIONS %>\n\n<%= KANBAN_HOST %>" );
			var context = {
				proxyEntries: {
					backendPaths: [
						"use_backend bk_api if { path_beg -i /my/api }",
						"use_backend bk_api if { path_beg -i /other/path }"
					],
					backendDefinitions: [
						"backend bk_api\n\tserver api public.host.local:8080",
						"backend bk_kanban\n\tserver api public.host.local:9000"
					]
				},
				proxyConfig: {
					kanbanHost: "kanbanana.com"
				}
			};
			service.postFileSystem.call( context, [ "~/.MCM/containers/haproxy.cfg" ] );
		} );

		it( "should write the configuration file correctly", () => {
			var cfg = "use_backend bk_api if { path_beg -i /my/api }\n\tuse_backend bk_api if { path_beg -i /other/path }\n\nbackend bk_api\n\tserver api public.host.local:8080\n\nbackend bk_kanban\n\tserver api public.host.local:9000\n\nkanbanana.com";
			fs.writeFileSync.should.have.been.calledWith( "~/.MCM/containers/haproxy.cfg", cfg );
		} );

		after( () => {
			fs.readFileSync.reset();
			fs.writeFileSync.reset();
		} );
	} );
} );

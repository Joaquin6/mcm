const chai = require( "chai" );
chai.use( require( "chai-as-promised" ) );
chai.use( require( "sinon-chai" ) );
global.should = chai.should();
global.sinon = require( "sinon" );
global.proxyquire = require( "proxyquire" ).noPreserveCache();

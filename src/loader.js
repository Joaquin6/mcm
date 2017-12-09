var fs = require( "fs-extra" );
var path = require( "path" );
var _ = require( "lodash" );
module.exports = function( options ) {
	var log = options.log;
	var serviceList = {};

	fs.readdirSync( options.main ).forEach( function( file ) {
		var name = path.basename( file, ".json" );
		var filePath = path.join( options.main, file );
		serviceList[ name ] = filePath;
	} );

	var localServices = [];
	try {
		localServices = fs.readdirSync( options.local );
	} catch ( e ) {} // eslint-disable-line no-empty

	localServices.forEach( function( file ) {
		var name = path.basename( file, ".json" );
		var filePath = path.join( options.local, file );
		serviceList[ name ] = filePath;
	} );

	return _.reduce( serviceList, function( memo, filePath, name ) {
		try {
			memo[ name ] = fs.readJsonSync( filePath );
			if ( _.isUndefined( memo[ name ].weight ) ) {
				memo[ name ].weight = 100;
			}
		} catch ( e ) {
			log.error( e );
		}
		return memo;
	}, {} );
};

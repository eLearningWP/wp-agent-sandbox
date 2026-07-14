const VALUE_OPTIONS = new Set( [ 'config', 'port', 'prepare', 'profile', 'provider' ] );
const BOOLEAN_OPTIONS = new Set( [ 'force', 'json' ] );

export function parseArguments( argv ) {
	const command = argv[ 0 ] ?? 'help';
	const options = {
		force: false,
		json: false,
		prepare: [],
	};
	const passthrough = [];
	let afterSeparator = false;

	for ( let index = 1; index < argv.length; index += 1 ) {
		const value = argv[ index ];

		if ( afterSeparator ) {
			passthrough.push( value );
			continue;
		}

		if ( '--' === value ) {
			afterSeparator = true;
			continue;
		}

		if ( ! value.startsWith( '--' ) ) {
			passthrough.push( value );
			continue;
		}

		const equalsIndex = value.indexOf( '=' );
		const key = value.slice( 2, equalsIndex > -1 ? equalsIndex : undefined );
		let optionValue = equalsIndex > -1 ? value.slice( equalsIndex + 1 ) : undefined;

		if ( BOOLEAN_OPTIONS.has( key ) ) {
			options[ key ] = true;
			continue;
		}

		if ( ! VALUE_OPTIONS.has( key ) ) {
			throw new Error( `Unknown option --${ key }.` );
		}

		if ( undefined === optionValue ) {
			index += 1;
			optionValue = argv[ index ];
		}

		if ( ! optionValue ) {
			throw new Error( `Option --${ key } requires a value.` );
		}

		if ( 'prepare' === key ) {
			options.prepare.push( optionValue );
		} else {
			options[ key ] = optionValue;
		}
	}

	return { command, options, passthrough };
}

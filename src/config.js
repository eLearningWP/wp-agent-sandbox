import { access, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export const CONFIG_FILENAME = 'wp-agent-sandbox.config.json';

async function exists( candidate ) {
	try {
		await access( candidate );
		return true;
	} catch {
		return false;
	}
}

export async function findConfig( cwd, explicitPath ) {
	if ( explicitPath ) {
		const resolved = path.resolve( cwd, explicitPath );
		if ( ! await exists( resolved ) ) {
			throw new Error( `Configuration not found: ${ resolved }` );
		}
		return resolved;
	}

	let current = path.resolve( cwd );
	while ( true ) {
		const candidate = path.join( current, CONFIG_FILENAME );
		if ( await exists( candidate ) ) {
			return candidate;
		}
		const parent = path.dirname( current );
		if ( parent === current ) {
			break;
		}
		current = parent;
	}

	throw new Error( `Could not find ${ CONFIG_FILENAME } from ${ cwd }.` );
}

function assertString( value, label ) {
	if ( 'string' !== typeof value || '' === value.trim() ) {
		throw new Error( `${ label } must be a non-empty string.` );
	}
}

function validateCommand( command, label ) {
	if ( ! Array.isArray( command ) || 0 === command.length ) {
		throw new Error( `${ label } must be a non-empty argument array.` );
	}
	command.forEach( ( value, index ) => assertString( value, `${ label }[${ index }]` ) );
}

function validateConfig( config ) {
	assertString( config.name, 'name' );
	if ( ! config.project || 'object' !== typeof config.project ) {
		throw new Error( 'project is required.' );
	}
	assertString( config.project.slug, 'project.slug' );
	assertString( config.project.entrypoint, 'project.entrypoint' );
	if ( ! config.wordpress || 'object' !== typeof config.wordpress ) {
		throw new Error( 'wordpress is required.' );
	}
	assertString( config.wordpress.version, 'wordpress.version' );
	assertString( config.wordpress.phpVersion, 'wordpress.phpVersion' );
	if ( ! config.profiles || 0 === Object.keys( config.profiles ).length ) {
		throw new Error( 'At least one profile is required.' );
	}

	for ( const [ index, preparation ] of ( config.prepare ?? [] ).entries() ) {
		assertString( preparation.id, `prepare[${ index }].id` );
		validateCommand( preparation.command, `prepare[${ index }].command` );
	}

	for ( const [ profileName, profile ] of Object.entries( config.profiles ) ) {
		for ( const [ index, command ] of ( profile.wpEnv?.seed ?? [] ).entries() ) {
			validateCommand( command, `profiles.${ profileName }.wpEnv.seed[${ index }]` );
		}
		for ( const [ index, command ] of ( profile.wpEnv?.verify ?? [] ).entries() ) {
			validateCommand( command, `profiles.${ profileName }.wpEnv.verify[${ index }]` );
		}
	}
}

function mergeProfile( base, addition ) {
	return {
		...base,
		...addition,
		wpEnv: {
			...( base.wpEnv ?? {} ),
			...( addition.wpEnv ?? {} ),
			seed: [ ...( base.wpEnv?.seed ?? [] ), ...( addition.wpEnv?.seed ?? [] ) ],
			verify: [ ...( base.wpEnv?.verify ?? [] ), ...( addition.wpEnv?.verify ?? [] ) ],
		},
		playground: {
			...( base.playground ?? {} ),
			...( addition.playground ?? {} ),
			httpChecks: [
				...( base.playground?.httpChecks ?? [] ),
				...( addition.playground?.httpChecks ?? [] ),
			],
		},
	};
}

export function resolveProfile( config, profileName, trail = [] ) {
	const profile = config.profiles[ profileName ];
	if ( ! profile ) {
		throw new Error( `Unknown profile "${ profileName }".` );
	}
	if ( trail.includes( profileName ) ) {
		throw new Error( `Profile inheritance cycle: ${ [ ...trail, profileName ].join( ' -> ' ) }.` );
	}

	let resolved = {};
	for ( const parent of ( profile.extends ?? [] ) ) {
		resolved = mergeProfile( resolved, resolveProfile( config, parent, [ ...trail, profileName ] ) );
	}

	return mergeProfile( resolved, profile );
}

export async function loadConfig( cwd, explicitPath ) {
	const configPath = await findConfig( cwd, explicitPath );
	const raw = await readFile( configPath, 'utf8' );
	let config;
	try {
		config = JSON.parse( raw );
	} catch ( error ) {
		throw new Error( `Invalid JSON in ${ configPath }: ${ error.message }` );
	}
	validateConfig( config );

	const projectRoot = await realpath( path.dirname( configPath ) );
	return { config, configPath, projectRoot };
}

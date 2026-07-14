import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { packageBinary } from '../package-bin.js';
import { findAvailablePort } from '../port.js';
import { runProcess } from '../process.js';
import { ensureStateDirectory, readState, removeState, writeState } from '../state.js';

function wpEnvEnvironment( context ) {
	return {
		WP_ENV_HOME: path.join( context.paths.root, 'wp-env-home' ),
		WP_ENV_PORT: String( context.port ),
	};
}

function generatedConfigPath( context ) {
	return path.join( context.paths.root, 'wp-env.json' );
}

async function writeGeneratedConfig( context ) {
	const config = {
		core: 'latest' === context.config.wordpress.version
			? null
			: `WordPress/WordPress#${ context.config.wordpress.version }`,
		phpVersion: context.config.wordpress.phpVersion,
		multisite: Boolean( context.config.wordpress.multisite ),
		plugins: context.config.wordpress.plugins ?? [],
		themes: context.config.wordpress.themes ?? [],
		config: context.config.wordpress.config ?? {},
		port: context.port,
		autoPort: true,
		testsEnvironment: false,
		mappings: {
			[ `wp-content/plugins/${ context.config.project.slug }` ]: context.projectRoot,
		},
	};

	await ensureStateDirectory( context.paths );
	await writeFile( generatedConfigPath( context ), `${ JSON.stringify( config, null, 2 ) }\n`, 'utf8' );
}

async function runWpEnv( context, args, options = {} ) {
	const binary = packageBinary( '@wordpress/env', 'wp-env' );
	return runProcess(
		process.execPath,
		[ binary, `--config=${ generatedConfigPath( context ) }`, ...args ],
		{
			cwd: context.projectRoot,
			env: wpEnvEnvironment( context ),
			...options,
		}
	);
}

async function runProfileCommands( context, commands ) {
	for ( const command of commands ) {
		await runWpEnv( context, [ 'run', 'cli', 'wp', ...command ], { inherit: true } );
	}
}

export function normalizeStatus( context, wpEnvStatus ) {
	const url = wpEnvStatus.urls?.development ?? `http://127.0.0.1:${ context.port }`;
	return {
		id: context.id,
		provider: 'wp-env',
		profile: context.profileName,
		status: wpEnvStatus.status ?? 'running',
		worktree: context.projectRoot,
		url,
		adminUrl: `${ url.replace( /\/$/, '' ) }/wp-admin/`,
		credentials: {
			username: 'admin',
			password: 'password',
		},
		subsites: ( context.profile.subsites ?? [] ).map( ( subsite ) => `${ url.replace( /\/$/, '' ) }/${ subsite.replace( /^\//, '' ) }` ),
		stateDirectory: context.paths.root,
		wpEnv: wpEnvStatus,
	};
}

async function statusFromWpEnv( context, options = {} ) {
	const result = await runWpEnv( context, [ 'status', '--json' ], { allowFailure: true } );
	if ( 0 !== result.exitCode ) {
		const stored = await readState( context.paths );
		return stored ? { ...stored, status: 'stopped' } : null;
	}

	let parsed;
	try {
		parsed = JSON.parse( result.stdout );
	} catch {
		throw new Error( `wp-env returned invalid JSON status: ${ result.stdout || result.stderr }` );
	}
	const status = normalizeStatus( context, parsed );
	if ( options.useStoredProfile ) {
		const stored = await readState( context.paths );
		if ( stored?.profile ) {
			status.profile = stored.profile;
		}
	}
	return status;
}

export const wpEnvProvider = {
	async up( context ) {
		const existing = await this.status( context );
		if ( existing && 'running' === existing.status ) {
			if ( existing.profile !== context.profileName ) {
				throw new Error( `Sandbox is already running with profile "${ existing.profile }"; use reset or destroy before selecting "${ context.profileName }".` );
			}
			return existing;
		}
		context.port = await findAvailablePort( context.port );
		await writeGeneratedConfig( context );
		await runWpEnv( context, [ 'start', '--auto-port' ], { stream: true } );
		await runProfileCommands( context, context.profile.wpEnv?.seed ?? [] );
		const status = await statusFromWpEnv( context );
		await writeState( context.paths, status );
		return status;
	},

	async status( context ) {
		if ( ! await readState( context.paths ) ) {
			return null;
		}
		return statusFromWpEnv( context, { useStoredProfile: true } );
	},

	async wp( context, args ) {
		if ( 0 === args.length ) {
			throw new Error( 'wp requires WP-CLI arguments after --.' );
		}
		await runWpEnv( context, [ 'run', 'cli', 'wp', ...args ], { inherit: true } );
	},

	async verify( context ) {
		await runProfileCommands( context, context.profile.wpEnv?.verify ?? [] );
	},

	async logs( context ) {
		await runWpEnv( context, [ 'logs' ], { inherit: true, allowFailure: true } );
	},

	async stop( context ) {
		await runWpEnv( context, [ 'stop' ], { inherit: true, allowFailure: true } );
		const stored = await readState( context.paths );
		if ( stored ) {
			await writeState( context.paths, { ...stored, status: 'stopped' } );
		}
	},

	async reset( context ) {
		await runWpEnv( context, [ 'reset', 'all' ], { inherit: true } );
		await runProfileCommands( context, context.profile.wpEnv?.seed ?? [] );
		const status = await statusFromWpEnv( context );
		await writeState( context.paths, status );
		return status;
	},

	async destroy( context ) {
		await runWpEnv( context, [ 'destroy', '--force' ], { inherit: true, allowFailure: true } );
		await removeState( context.paths );
	},
};

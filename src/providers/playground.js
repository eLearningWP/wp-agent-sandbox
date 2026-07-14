import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { packageBinary } from '../package-bin.js';
import { findAvailablePort } from '../port.js';
import { readState, removeState, writeState, ensureStateDirectory } from '../state.js';

function isAlive( pid ) {
	if ( ! Number.isInteger( pid ) ) {
		return false;
	}
	try {
		process.kill( pid, 0 );
		return true;
	} catch {
		return false;
	}
}

async function waitForHttp( url, pid, timeoutMs = 180000 ) {
	const startedAt = Date.now();
	let lastError;
	while ( Date.now() - startedAt < timeoutMs ) {
		if ( ! isAlive( pid ) ) {
			throw new Error( 'Playground exited before its HTTP server became ready.' );
		}
		try {
			const response = await fetch( url, { redirect: 'manual' } );
			if ( response.status < 500 ) {
				return;
			}
			lastError = new Error( `HTTP ${ response.status }` );
		} catch ( error ) {
			lastError = error;
		}
		await new Promise( ( resolve ) => setTimeout( resolve, 500 ) );
	}
	throw new Error( `Playground did not become ready: ${ lastError?.message ?? 'timeout' }` );
}

async function stopProcess( state ) {
	if ( ! isAlive( state?.pid ) ) {
		return;
	}
	try {
		process.kill( state.pid, 'SIGTERM' );
	} catch {
		return;
	}
	for ( let attempt = 0; attempt < 20 && isAlive( state.pid ); attempt += 1 ) {
		await new Promise( ( resolve ) => setTimeout( resolve, 100 ) );
	}
	if ( isAlive( state.pid ) ) {
		process.kill( state.pid, 'SIGKILL' );
	}
}

function normalizedState( context, pid ) {
	const url = `http://127.0.0.1:${ context.port }`;
	return {
		id: context.id,
		provider: 'playground',
		profile: context.profileName,
		status: 'running',
		pid,
		worktree: context.projectRoot,
		url,
		adminUrl: `${ url }/wp-admin/`,
		credentials: {
			username: 'admin',
			password: 'password',
		},
		// Playground is a single-site compatibility probe. Multisite on custom
		// per-agent ports is not supported by WordPress Playground.
		subsites: [],
		stateDirectory: context.paths.root,
	};
}

export const playgroundProvider = {
	async up( context ) {
		const existing = await this.status( context );
		if ( existing && 'running' === existing.status ) {
			if ( existing.profile !== context.profileName ) {
				throw new Error( `Sandbox is already running with profile "${ existing.profile }"; use reset or destroy before selecting "${ context.profileName }".` );
			}
			return existing;
		}
		const blueprint = context.profile.playground?.blueprint;
		if ( ! blueprint ) {
			throw new Error( `Profile "${ context.profileName }" does not define a Playground Blueprint.` );
		}
		context.port = await findAvailablePort( context.port );
		await ensureStateDirectory( context.paths );

		const binary = packageBinary( '@wp-playground/cli', 'wp-playground-cli' );
		const blueprintPath = path.resolve( context.projectRoot, blueprint );
		const mount = `${ context.projectRoot }:/wordpress/wp-content/plugins/${ context.config.project.slug }`;
		const logHandle = await open( context.paths.log, 'a' );
		const child = spawn(
			process.execPath,
			[
				binary,
				'server',
				`--port=${ context.port }`,
				`--wp=${ context.config.wordpress.version }`,
				`--php=${ context.config.wordpress.phpVersion }`,
				'--workers=1',
				`--mount-before-install=${ mount }`,
				`--blueprint=${ blueprintPath }`,
				'--blueprint-may-read-adjacent-files',
			],
			{
				cwd: context.projectRoot,
				detached: true,
				stdio: [ 'ignore', logHandle.fd, logHandle.fd ],
			}
		);
		child.unref();
		await logHandle.close();

		try {
			await waitForHttp( `http://127.0.0.1:${ context.port }/`, child.pid );
		} catch ( error ) {
			let log = '';
			try {
				log = await readFile( context.paths.log, 'utf8' );
			} catch {}
			throw new Error( `${ error.message }${ log ? `\n${ log }` : '' }` );
		}

		const state = normalizedState( context, child.pid );
		await writeState( context.paths, state );
		return state;
	},

	async status( context ) {
		const state = await readState( context.paths );
		if ( ! state ) {
			return null;
		}
		return { ...state, status: isAlive( state.pid ) ? 'running' : 'stopped' };
	},

	async wp() {
		throw new Error( 'The Playground provider does not expose a persistent WP-CLI proxy; use wp-env for WP-CLI verification.' );
	},

	async verify( context ) {
		const state = await this.status( context );
		if ( ! state || 'running' !== state.status ) {
			throw new Error( 'Playground is not running.' );
		}
		for ( const check of ( context.profile.playground?.httpChecks ?? [] ) ) {
			const response = await fetch( new URL( check, state.url ), {
				redirect: 'manual',
				signal: AbortSignal.timeout( 30000 ),
			} );
			if ( response.status >= 400 ) {
				throw new Error( `Playground compatibility check ${ check } returned HTTP ${ response.status }.` );
			}
		}
	},

	async logs( context ) {
		try {
			process.stdout.write( await readFile( context.paths.log, 'utf8' ) );
		} catch ( error ) {
			if ( 'ENOENT' !== error.code ) {
				throw error;
			}
		}
	},

	async stop( context ) {
		const state = await readState( context.paths );
		await stopProcess( state );
		if ( state ) {
			await writeState( context.paths, { ...state, status: 'stopped' } );
		}
	},

	async reset( context ) {
		await this.destroy( context );
		return this.up( context );
	},

	async destroy( context ) {
		const state = await readState( context.paths );
		await stopProcess( state );
		await removeState( context.paths );
	},
};

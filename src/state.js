import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function sandboxHome() {
	if ( process.env.WP_AGENT_SANDBOX_HOME ) {
		return path.resolve( process.env.WP_AGENT_SANDBOX_HOME );
	}
	if ( process.env.XDG_CACHE_HOME ) {
		return path.join( process.env.XDG_CACHE_HOME, 'wp-agent-sandbox' );
	}
	return path.join( os.homedir(), '.cache', 'wp-agent-sandbox' );
}

export function sandboxId( name, projectRoot ) {
	const digest = createHash( 'sha256' ).update( projectRoot ).digest( 'hex' ).slice( 0, 12 );
	return `${ name }-${ digest }`;
}

export function statePaths( name, projectRoot, provider ) {
	const root = path.join( sandboxHome(), sandboxId( name, projectRoot ), provider );
	return {
		root,
		manifest: path.join( root, 'state.json' ),
		log: path.join( root, `${ provider }.log` ),
	};
}

export async function ensureStateDirectory( paths ) {
	await mkdir( paths.root, { recursive: true } );
}

export async function readState( paths ) {
	try {
		return JSON.parse( await readFile( paths.manifest, 'utf8' ) );
	} catch ( error ) {
		if ( 'ENOENT' === error.code ) {
			return null;
		}
		throw error;
	}
}

export async function writeState( paths, state ) {
	await ensureStateDirectory( paths );
	await writeFile( paths.manifest, `${ JSON.stringify( state, null, 2 ) }\n`, 'utf8' );
}

export async function removeState( paths ) {
	await rm( paths.root, { recursive: true, force: true } );
}

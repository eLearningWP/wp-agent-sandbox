import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

function processIsAlive( pid ) {
	if ( ! Number.isInteger( pid ) || pid <= 0 ) {
		return false;
	}
	try {
		process.kill( pid, 0 );
		return true;
	} catch ( error ) {
		return 'EPERM' === error.code;
	}
}

async function lockHolder( lockPath ) {
	try {
		const pid = Number.parseInt( ( await readFile( lockPath, 'utf8' ) ).trim(), 10 );
		return Number.isInteger( pid ) && pid > 0 ? pid : null;
	} catch ( error ) {
		if ( 'ENOENT' === error.code ) {
			return null;
		}
		throw error;
	}
}

async function acquire( lockPath, timeoutMs, pollMs ) {
	await mkdir( path.dirname( lockPath ), { recursive: true } );
	const deadline = Date.now() + timeoutMs;

	while ( true ) {
		try {
			const handle = await open( lockPath, 'wx' );
			try {
				await handle.writeFile( `${ process.pid }\n`, 'utf8' );
			} finally {
				await handle.close();
			}
			return;
		} catch ( error ) {
			if ( 'EEXIST' !== error.code ) {
				throw error;
			}

			const holder = await lockHolder( lockPath );
			if ( holder && ! processIsAlive( holder ) ) {
				await rm( lockPath, { force: true } );
				continue;
			}

			if ( Date.now() >= deadline ) {
				throw new Error( `Timed out waiting for sandbox operation lock ${ lockPath } (PID ${ holder ?? 'unknown' }).` );
			}
			await new Promise( ( resolve ) => setTimeout( resolve, pollMs ) );
		}
	}
}

export async function withFileLock( lockPath, callback, options = {} ) {
	await acquire( lockPath, options.timeoutMs ?? 300000, options.pollMs ?? 100 );
	try {
		return await callback();
	} finally {
		await rm( lockPath, { force: true } );
	}
}

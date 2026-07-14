import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { withFileLock } from '../src/lock.js';

test( 'serializes concurrent operations and removes the lock', async () => {
	const root = await mkdtemp( path.join( os.tmpdir(), 'wp-agent-lock-' ) );
	const lock = path.join( root, 'operation.lock' );
	let active = 0;
	let maximum = 0;
	const operation = () => withFileLock( lock, async () => {
		active += 1;
		maximum = Math.max( maximum, active );
		await new Promise( ( resolve ) => setTimeout( resolve, 25 ) );
		active -= 1;
	}, { pollMs: 5 } );

	try {
		await Promise.all( [ operation(), operation() ] );
		assert.equal( maximum, 1 );
		await assert.rejects( access( lock ), { code: 'ENOENT' } );
	} finally {
		await rm( root, { recursive: true, force: true } );
	}
} );

test( 'reclaims a lock whose process no longer exists', async () => {
	const root = await mkdtemp( path.join( os.tmpdir(), 'wp-agent-stale-lock-' ) );
	const lock = path.join( root, 'operation.lock' );
	try {
		await mkdir( path.dirname( lock ), { recursive: true } );
		await writeFile( lock, '999999999\n', 'utf8' );
		assert.equal( await withFileLock( lock, async () => 'reclaimed', { pollMs: 5, timeoutMs: 100 } ), 'reclaimed' );
	} finally {
		await rm( root, { recursive: true, force: true } );
	}
} );

import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readState, sandboxId, writeState } from '../src/state.js';

test( 'sandbox identity is stable per canonical worktree path', () => {
	assert.equal( sandboxId( 'project', '/tmp/one' ), sandboxId( 'project', '/tmp/one' ) );
	assert.notEqual( sandboxId( 'project', '/tmp/one' ), sandboxId( 'project', '/tmp/two' ) );
} );

test( 'writes state through an atomic replacement', async () => {
	const root = await mkdtemp( path.join( os.tmpdir(), 'wp-agent-state-' ) );
	const paths = {
		root,
		manifest: path.join( root, 'state.json' ),
	};
	try {
		await writeState( paths, { status: 'running' } );
		assert.deepEqual( await readState( paths ), { status: 'running' } );
		await access( paths.manifest );
	} finally {
		await rm( root, { recursive: true, force: true } );
	}
} );

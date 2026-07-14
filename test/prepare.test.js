import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareProject } from '../src/prepare.js';

test( 'runs mandatory and requested preparation without a provider', async () => {
	const root = await mkdtemp( path.join( os.tmpdir(), 'wp-agent-prepare-' ) );
	const config = {
		prepare: [
			{
				id: 'composer',
				command: [ process.execPath, '-e', 'process.stdout.write( "composer output" )' ],
				unlessPathExists: 'vendor-ready',
			},
			{
				id: 'browser-assets',
				command: [ process.execPath, '-e', 'process.stdout.write( "build output" )' ],
				optional: true,
			},
		],
	};

	try {
		await writeFile( path.join( root, 'vendor-ready' ), '', 'utf8' );
		const normal = await prepareProject( config, root );
		assert.deepEqual( normal.ran, [] );
		assert.deepEqual( normal.skipped, [
			{ id: 'composer', reason: 'output-exists' },
			{ id: 'browser-assets', reason: 'not-requested' },
		] );

		let output = '';
		const originalWrite = process.stdout.write;
		process.stdout.write = ( chunk ) => {
			output += chunk;
			return true;
		};
		let forced;
		try {
			forced = await prepareProject( config, root, {
				force: true,
				groups: [ 'browser-assets' ],
				quiet: true,
			} );
		} finally {
			process.stdout.write = originalWrite;
		}
		assert.deepEqual( forced.ran, [ 'composer', 'browser-assets' ] );
		assert.deepEqual( forced.skipped, [] );
		assert.equal( output, '' );
	} finally {
		await rm( root, { recursive: true, force: true } );
	}
} );

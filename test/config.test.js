import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CONFIG_FILENAME, loadConfig, resolveProfile } from '../src/config.js';

const baseConfig = {
	name: 'example',
	project: {
		type: 'plugin',
		slug: 'example-plugin',
		entrypoint: 'example.php',
	},
	wordpress: {
		version: '7.0',
		phpVersion: '8.3',
		multisite: true,
	},
	profiles: {
		minimal: {
			wpEnv: {
				seed: [ [ 'plugin', 'activate', 'example-plugin', '--network' ] ],
				verify: [ [ 'plugin', 'status', 'example-plugin' ] ],
			},
			playground: {
				httpChecks: [ '/wp-json/' ],
			},
			subsites: [ 'alpha/' ],
		},
		torture: {
			extends: [ 'minimal' ],
			wpEnv: {
				seed: [ [ 'eval-file', 'fixture.php' ] ],
			},
			playground: {
				httpChecks: [ '/fixture/' ],
			},
		},
	},
};

test( 'loads a discovered manifest and resolves composable profiles', async () => {
	const directory = await mkdtemp( path.join( os.tmpdir(), 'wp-agent-sandbox-config-' ) );
	try {
		await writeFile( path.join( directory, CONFIG_FILENAME ), JSON.stringify( baseConfig ), 'utf8' );
		const loaded = await loadConfig( directory );
		const profile = resolveProfile( loaded.config, 'torture' );
		assert.equal( loaded.projectRoot, await realpath( directory ) );
		assert.deepEqual( profile.wpEnv.seed, [
			[ 'plugin', 'activate', 'example-plugin', '--network' ],
			[ 'eval-file', 'fixture.php' ],
		] );
		assert.deepEqual( profile.playground.httpChecks, [ '/wp-json/', '/fixture/' ] );
		assert.deepEqual( profile.subsites, [ 'alpha/' ] );
	} finally {
		await rm( directory, { recursive: true, force: true } );
	}
} );

test( 'rejects profile inheritance cycles', () => {
	const config = {
		...baseConfig,
		profiles: {
			one: { extends: [ 'two' ] },
			two: { extends: [ 'one' ] },
		},
	};
	assert.throws( () => resolveProfile( config, 'one' ), /inheritance cycle/ );
} );

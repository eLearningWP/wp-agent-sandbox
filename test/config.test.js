import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	CONFIG_FILENAME,
	DEFAULT_PHP_VERSION,
	loadConfig,
	normalizeConfig,
	resolveProfile,
} from '../src/config.js';

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

test( 'defaults WordPress to latest and PHP to the default version when omitted', async () => {
	const directory = await mkdtemp( path.join( os.tmpdir(), 'wp-agent-sandbox-config-' ) );
	try {
		const config = { ...baseConfig, wordpress: { multisite: true } };
		await writeFile( path.join( directory, CONFIG_FILENAME ), JSON.stringify( config ), 'utf8' );
		const loaded = await loadConfig( directory );
		assert.equal( loaded.config.wordpress.version, 'latest' );
		assert.equal( loaded.config.wordpress.phpVersion, DEFAULT_PHP_VERSION );
		assert.equal( loaded.config.wordpress.multisite, true );
	} finally {
		await rm( directory, { recursive: true, force: true } );
	}
} );

test( 'accepts "latest" in any casing and keeps pinned versions', () => {
	assert.equal( normalizeConfig( { wordpress: { version: 'Latest' } } ).wordpress.version, 'latest' );
	assert.equal( normalizeConfig( { wordpress: { version: '6.8', phpVersion: '8.2' } } ).wordpress.version, '6.8' );
	assert.equal( normalizeConfig( { wordpress: { version: '6.8', phpVersion: '8.2' } } ).wordpress.phpVersion, '8.2' );
} );

test( 'rejects empty explicit WordPress or PHP versions', async () => {
	const directory = await mkdtemp( path.join( os.tmpdir(), 'wp-agent-sandbox-config-' ) );
	try {
		for ( const wordpress of [ { version: '' }, { phpVersion: ' ' }, { version: 7 } ] ) {
			await writeFile( path.join( directory, CONFIG_FILENAME ), JSON.stringify( { ...baseConfig, wordpress } ), 'utf8' );
			await assert.rejects( loadConfig( directory ), /must be a non-empty string/ );
		}
	} finally {
		await rm( directory, { recursive: true, force: true } );
	}
} );

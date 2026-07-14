import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeStatus } from '../src/providers/wp-env.js';

test( 'normalizes wp-env JSON status for agents', () => {
	const status = normalizeStatus(
		{
			id: 'example-a1b2c3',
			port: 9012,
			profileName: 'minimal',
			projectRoot: '/tmp/example',
			profile: { subsites: [ 'alpha/', 'beta/' ] },
			paths: { root: '/tmp/state' },
		},
		{
			status: 'running',
			runtime: 'docker',
			urls: { development: 'http://localhost:9012' },
			ports: { development: 9012 },
		}
	);

	assert.equal( status.url, 'http://localhost:9012' );
	assert.equal( status.adminUrl, 'http://localhost:9012/wp-admin/' );
	assert.deepEqual( status.subsites, [
		'http://localhost:9012/alpha/',
		'http://localhost:9012/beta/',
	] );
	assert.equal( status.wpEnv.runtime, 'docker' );
} );

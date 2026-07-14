import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArguments } from '../src/arguments.js';

test( 'parses provider, repeated preparation groups, and passthrough arguments', () => {
	assert.deepEqual(
		parseArguments( [ 'wp', '--provider', 'wp-env', '--prepare=assets', '--prepare', 'fixtures', '--', 'option', 'get', 'home' ] ),
		{
			command: 'wp',
		options: {
			json: false,
			prepare: [ 'assets', 'fixtures' ],
				provider: 'wp-env',
			},
			passthrough: [ 'option', 'get', 'home' ],
		}
	);
} );

test( 'rejects unknown options', () => {
	assert.throws( () => parseArguments( [ 'up', '--mystery' ] ), /Unknown option/ );
} );

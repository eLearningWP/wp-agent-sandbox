import assert from 'node:assert/strict';
import test from 'node:test';

import { sandboxId } from '../src/state.js';

test( 'sandbox identity is stable per canonical worktree path', () => {
	assert.equal( sandboxId( 'project', '/tmp/one' ), sandboxId( 'project', '/tmp/one' ) );
	assert.notEqual( sandboxId( 'project', '/tmp/one' ), sandboxId( 'project', '/tmp/two' ) );
} );

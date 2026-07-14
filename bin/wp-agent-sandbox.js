#!/usr/bin/env node

import { main } from '../src/cli.js';

main().catch( ( error ) => {
	const message = error instanceof Error ? error.message : String( error );
	process.stderr.write( `wp-agent-sandbox: ${ message }\n` );
	process.exitCode = 1;
} );

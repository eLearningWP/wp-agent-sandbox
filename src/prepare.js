import { access } from 'node:fs/promises';
import path from 'node:path';

import { runProcess } from './process.js';

async function exists( candidate ) {
	try {
		await access( candidate );
		return true;
	} catch {
		return false;
	}
}

export async function prepareProject( config, projectRoot, requestedGroups = [] ) {
	const requested = new Set( requestedGroups );

	for ( const preparation of ( config.prepare ?? [] ) ) {
		if ( preparation.optional && ! requested.has( preparation.id ) ) {
			continue;
		}

		if ( preparation.unlessPathExists ) {
			const candidate = path.resolve( projectRoot, preparation.unlessPathExists );
			if ( await exists( candidate ) ) {
				continue;
			}
		}

		const [ command, ...args ] = preparation.command;
		process.stdout.write( `Preparing ${ preparation.id }...\n` );
		await runProcess( command, args, { cwd: projectRoot, inherit: true } );
	}
}

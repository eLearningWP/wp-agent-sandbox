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

export async function prepareProject( config, projectRoot, options = {} ) {
	const requested = new Set( options.groups ?? [] );
	const force = Boolean( options.force );
	const quiet = Boolean( options.quiet );
	const report = {
		ran: [],
		skipped: [],
	};

	for ( const preparation of ( config.prepare ?? [] ) ) {
		if ( preparation.optional && ! requested.has( preparation.id ) ) {
			report.skipped.push( { id: preparation.id, reason: 'not-requested' } );
			continue;
		}

		if ( ! force && preparation.unlessPathExists ) {
			const candidate = path.resolve( projectRoot, preparation.unlessPathExists );
			if ( await exists( candidate ) ) {
				report.skipped.push( { id: preparation.id, reason: 'output-exists' } );
				continue;
			}
		}

		const [ command, ...args ] = preparation.command;
		if ( ! quiet ) {
			process.stdout.write( `Preparing ${ preparation.id }...\n` );
		}
		await runProcess( command, args, { cwd: projectRoot, inherit: ! quiet } );
		report.ran.push( preparation.id );
	}

	return report;
}

import path from 'node:path';

import { parseArguments } from './arguments.js';
import { loadConfig, resolveProfile } from './config.js';
import { withFileLock } from './lock.js';
import { prepareProject } from './prepare.js';
import { sandboxId, statePaths } from './state.js';
import { wpEnvProvider } from './providers/wp-env.js';
import { playgroundProvider } from './providers/playground.js';

const PROVIDERS = {
	'wp-env': wpEnvProvider,
	playground: playgroundProvider,
};

function help() {
	return `wp-agent-sandbox <command> [options]\n\nCommands:\n  prepare    Prepare the worktree without starting WordPress\n  up         Prepare and start the selected sandbox\n  status     Show normalized sandbox state\n  wp         Proxy WP-CLI arguments (wp-env only; pass after --)\n  verify     Run the selected profile's verification\n  logs       Show provider logs\n  reset      Reset data and reapply the selected profile\n  stop       Stop the sandbox but retain its data\n  destroy    Remove only this worktree's sandbox state\n  check      Validate configuration and profile inheritance\n\nOptions:\n  --config <path>       Explicit configuration file\n  --provider <name>     wp-env or playground\n  --profile <name>      Profile from the project manifest\n  --port <number>       Starting HTTP port\n  --prepare <group>     Run an optional preparation group (repeatable)\n  --force               Rerun preparation even when outputs exist\n  --json                Emit machine-readable output\n`;
}

function printPreparation( context, report, json ) {
	const result = {
		status: 'prepared',
		worktree: context.projectRoot,
		ran: report.ran,
		skipped: report.skipped,
	};
	if ( json ) {
		process.stdout.write( `${ JSON.stringify( result, null, 2 ) }\n` );
		return;
	}
	process.stdout.write( `Preparation complete (${ report.ran.length } ran, ${ report.skipped.length } skipped).\n` );
}

function preparationOptions( options ) {
	return {
		force: options.force,
		groups: options.prepare,
		quiet: options.json,
	};
}

function printStatus( status, json ) {
	if ( json ) {
		process.stdout.write( `${ JSON.stringify( status, null, 2 ) }\n` );
		return;
	}
	if ( ! status ) {
		process.stdout.write( 'status: absent\n' );
		return;
	}
	process.stdout.write( `status: ${ status.status }\nprovider: ${ status.provider }\nprofile: ${ status.profile }\nurl: ${ status.url }\nadmin: ${ status.adminUrl }\nworktree: ${ status.worktree }\n` );
}

function contextFrom( loaded, options ) {
	const { config, configPath, projectRoot } = loaded;
	const providerName = options.provider ?? config.defaults?.provider ?? 'wp-env';
	const profileName = options.profile ?? config.defaults?.profile ?? Object.keys( config.profiles )[ 0 ];
	const provider = PROVIDERS[ providerName ];
	if ( ! provider ) {
		throw new Error( `Unknown provider "${ providerName }".` );
	}
	const port = Number.parseInt( options.port ?? config.defaults?.port ?? '8888', 10 );
	if ( ! Number.isInteger( port ) || port < 1024 || port > 65535 ) {
		throw new Error( `Invalid port "${ options.port }".` );
	}
	const id = sandboxId( config.name, projectRoot );
	return {
		config,
		configPath,
		projectRoot,
		provider,
		providerName,
		profileName,
		profile: resolveProfile( config, profileName ),
		port,
		id,
		paths: statePaths( config.name, projectRoot, providerName ),
	};
}

export async function main( argv = process.argv.slice( 2 ), cwd = process.cwd() ) {
	const { command, options, passthrough } = parseArguments( argv );
	if ( 'help' === command || '--help' === command || '-h' === command ) {
		process.stdout.write( help() );
		return;
	}

	const context = contextFrom( await loadConfig( cwd, options.config ), options );

	switch ( command ) {
		case 'check': {
			const result = {
				status: 'valid',
				config: path.relative( context.projectRoot, context.configPath ) || path.basename( context.configPath ),
				provider: context.providerName,
				profile: context.profileName,
				wordpress: {
					version: context.config.wordpress.version,
					phpVersion: context.config.wordpress.phpVersion,
				},
				worktree: context.projectRoot,
			};
			if ( options.json ) {
				process.stdout.write( `${ JSON.stringify( result, null, 2 ) }\n` );
			} else {
				process.stdout.write( `status: ${ result.status }\nconfig: ${ result.config }\nprovider: ${ result.provider }\nprofile: ${ result.profile }\nwordpress: ${ result.wordpress.version }\nphp: ${ result.wordpress.phpVersion }\nworktree: ${ result.worktree }\n` );
			}
			break;
		}
		case 'prepare': {
			const report = await withFileLock(
				context.paths.lock,
				() => prepareProject( context.config, context.projectRoot, preparationOptions( options ) )
			);
			printPreparation( context, report, options.json );
			break;
		}
		case 'up': {
			const status = await withFileLock( context.paths.lock, async () => {
				await prepareProject( context.config, context.projectRoot, preparationOptions( options ) );
				return context.provider.up( context );
			} );
			printStatus( status, options.json );
			break;
		}
		case 'status':
			printStatus( await context.provider.status( context ), options.json );
			break;
		case 'wp':
			await context.provider.wp( context, passthrough );
			break;
		case 'verify':
			await context.provider.verify( context );
			process.stdout.write( 'Verification passed.\n' );
			break;
		case 'logs':
			await context.provider.logs( context );
			break;
		case 'reset':
			printStatus( await withFileLock( context.paths.lock, () => context.provider.reset( context ) ), options.json );
			break;
		case 'stop':
			await withFileLock( context.paths.lock, () => context.provider.stop( context ) );
			printStatus( await context.provider.status( context ), options.json );
			break;
		case 'destroy':
			await withFileLock( context.paths.lock, () => context.provider.destroy( context ) );
			printStatus( null, options.json );
			break;
		default:
			throw new Error( `Unknown command "${ command }".\n\n${ help() }` );
	}
}

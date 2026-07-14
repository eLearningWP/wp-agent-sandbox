import { spawn } from 'node:child_process';

export async function runProcess( command, args, options = {} ) {
	return new Promise( ( resolve, reject ) => {
		const child = spawn( command, args, {
			cwd: options.cwd,
			env: { ...process.env, ...( options.env ?? {} ) },
			stdio: options.inherit ? 'inherit' : [ 'ignore', 'pipe', 'pipe' ],
		} );
		let stdout = '';
		let stderr = '';

		if ( ! options.inherit ) {
			child.stdout.on( 'data', ( chunk ) => {
				stdout += chunk;
				if ( options.stream ) {
					process.stdout.write( chunk );
				}
			} );
			child.stderr.on( 'data', ( chunk ) => {
				stderr += chunk;
				if ( options.stream ) {
					process.stderr.write( chunk );
				}
			} );
		}

		child.on( 'error', reject );
		child.on( 'close', ( exitCode ) => {
			const result = { exitCode: exitCode ?? 1, stdout, stderr };
			if ( 0 !== result.exitCode && ! options.allowFailure ) {
				reject( new Error( `${ command } ${ args.join( ' ' ) } failed (${ result.exitCode }): ${ stderr || stdout }`.trim() ) );
				return;
			}
			resolve( result );
		} );
	} );
}

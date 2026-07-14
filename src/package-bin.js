import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire( import.meta.url );

export function packageBinary( packageName, binaryName ) {
	const packagePath = require.resolve( `${ packageName }/package.json` );
	const packageJson = require( packagePath );
	const relativeBin = 'string' === typeof packageJson.bin
		? packageJson.bin
		: packageJson.bin?.[ binaryName ];

	if ( ! relativeBin ) {
		throw new Error( `${ packageName } does not declare the ${ binaryName } binary.` );
	}

	return path.resolve( path.dirname( packagePath ), relativeBin );
}

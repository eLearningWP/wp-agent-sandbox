import net from 'node:net';

function canListen( port ) {
	return new Promise( ( resolve ) => {
		const server = net.createServer();
		server.unref();
		server.once( 'error', () => resolve( false ) );
		// Match provider servers that bind all interfaces (including IPv6).
		server.listen( { port }, () => {
			server.close( () => resolve( true ) );
		} );
	} );
}

export async function findAvailablePort( startingPort ) {
	for ( let port = startingPort; port <= 65535; port += 1 ) {
		if ( await canListen( port ) ) {
			return port;
		}
	}
	throw new Error( `No available port found from ${ startingPort }.` );
}

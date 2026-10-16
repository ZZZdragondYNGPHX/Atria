import net from 'node:net';

// Ask the OS for an available local port; scenarios do not own fixed ranges.
export function reservePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
            const port = server.address().port;
            server.close(error => error ? reject(error) : resolve(port));
        });
    });
}

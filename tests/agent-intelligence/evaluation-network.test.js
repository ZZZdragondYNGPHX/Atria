import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

test('fixed worker loader denies direct node-fetch without a parent RPC', async () => {
    let calls = 0;
    const server = createServer((_req, res) => { calls++; res.end('{}'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const endpoint = `http://127.0.0.1:${server.address().port}/v1/embeddings`;
        const script = `import fetch, { Headers, Response } from 'node-fetch';
            if (!new Headers() || !new Response()) process.exit(1);
            try { await fetch(${JSON.stringify(endpoint)}); process.exit(2); }
            catch (error) { process.stdout.write(error.message); }`;
        const { stdout } = await promisify(execFile)(process.execPath, ['--experimental-loader',
            fileURLToPath(new URL('../../src/native/agent-intelligence/evaluation/loader.js', import.meta.url)), '--input-type=module', '-e', script]);
        expect(stdout).toBe('evaluation_network_denied'); expect(calls).toBe(0);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

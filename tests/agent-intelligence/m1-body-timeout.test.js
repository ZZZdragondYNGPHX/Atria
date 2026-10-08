import { expect, test } from '@jest/globals';
import { createServer } from 'node:http';
import { fetch } from 'undici';
import { m1BodyFailure } from './m1-response.js';
import { M1RetryPolicy } from './m1-retry.js';

test('HTTP success followed by a stalled body is a single failed response, preserving the failure window', async () => {
    const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const policy = new M1RetryPolicy();
    try {
        const response = await fetch('http://127.0.0.1:' + server.address().port, { signal: AbortSignal.timeout(100) });
        policy.observe('fixture');
        let bodyError;
        try { await response.json(); } catch (error) { bodyError = error; }
        expect(m1BodyFailure(bodyError)).toBe(true);
        policy.incomplete('fixture');
        expect(policy.state('fixture')).toEqual({ consecutive: 1, recent: [true], stopped: null });
        expect(m1BodyFailure(new Error('agent_evolution_base_changed'))).toBe(false);
        expect(m1BodyFailure(new TypeError('terminated', { cause: new DOMException('request timeout', 'TimeoutError') }))).toBe(true);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

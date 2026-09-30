import http from 'node:http';
import assert from 'node:assert/strict';

// Package-specific protocol smoke. All model responses are synthetic and local.
export async function turnSmoke({ load, h, svc, session }) {
    const { NativeGenerationHost } = await load('src/native/adapters/generation-host.js');
    const { seedGenerationProfiles } = await load('tests/native/helpers/generation-fixture.js');
    const { createHttpGenerationProvider } = await load('src/native/adapters/http-generation-provider.js');
    const seen = [];
    let failNarrator = true;
    const server = http.createServer(async (req, res) => {
        try {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks));
            seen.push(body);
            if (!body.tools?.length && failNarrator) { res.writeHead(503); res.end('{}'); return; }
            const message = body.tools?.length
                ? { content: '', tool_calls: [{ id: 'foundation', type: 'function', function: { name: body.tools[0].function.name, arguments: '{}' } }] }
                : { content: JSON.stringify('P1 foundation diagnostic completed.') };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ choices: [{ message }] }));
        } catch { res.writeHead(500); res.end('{}'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions', roles: ['narrator', 'intent_resolver'] });
        const host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
            providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'local-test-only' } });
        const binding = { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId };
        const input = { sessionId: session.session.sessionId, revisionId: session.revision.revisionId, invocationId: 'p1-turn', userInput: 'Foundation diagnostic.', slotBindings: { narrative: binding, structured: binding } };
        await assert.rejects(host.executeTurn(h.handle, input));
        const failed = await svc.core.load(h.handle, session.session.sessionId);
        assert.deepEqual(failed.states, session.states);
        assert.equal(failed.revision.revisionId, session.revision.revisionId);
        failNarrator = false;
        const next = await host.executeTurn(h.handle, input);
        assert.equal(next.timeline.at(-1).content, 'P1 foundation diagnostic completed.');
        assert.equal(next.states.atri_action_receipts.receipts.length, 1);
        assert.equal(next.states.atri_action_receipts.receipts[0].actionId, 'foundation.check');
        assert.equal(next.states.atri_lifecycle.clocks.world, 0);
        assert(!JSON.stringify(seen).includes('P1_PRIVATE_CANON_SENTINEL'));
        assert(!JSON.stringify(seen).includes('privateNote'));
        const count = seen.length;
        assert.equal((await host.executeTurn(h.handle, input)).revision.revisionId, next.revision.revisionId);
        assert.equal(seen.length, count);
        return 'local HTTP resolver + exact Narrator Task; failure zero publication, same-process retry and idempotent finalization';
    } finally {
        await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    }
}

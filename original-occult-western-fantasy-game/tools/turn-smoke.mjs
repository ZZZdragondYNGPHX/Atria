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
            if (!body.tools?.length && failNarrator) { res.writeHead(503, { Connection: 'close' }); res.end('{}'); return; }
            const message = body.tools?.length
                ? { content: '', tool_calls: [{ id: 'foundation', type: 'function', function: { name: body.tools.find(t => t.function.parameters.properties.objective?.enum?.includes('obtain_account')).function.name, arguments: JSON.stringify({ target: 'fixture', method: 'ask', objective: 'obtain_account' }) } }] }
                : { content: JSON.stringify('P2 synthetic interview completed.') };
            res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
            res.end(JSON.stringify({ choices: [{ message }] }));
        } catch (error) { console.error('Synthetic provider failed', error); res.writeHead(500, { Connection: 'close' }); res.end('{}'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions', roles: ['narrator', 'intent_resolver'] });
        const host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
            providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'local-test-only' } });
        const binding = { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId };
        const input = { sessionId: session.session.sessionId, revisionId: session.revision.revisionId, invocationId: 'p2-turn', userInput: 'Ask the clerk about the registry slip.', slotBindings: { narrative: binding, structured: binding } };
        await assert.rejects(host.executeTurn(h.handle, input));
        const failed = await svc.core.load(h.handle, session.session.sessionId);
        assert.deepEqual(failed.states, session.states);
        assert.equal(failed.revision.revisionId, session.revision.revisionId);
        failNarrator = false;
        const next = await host.executeTurn(h.handle, input);
        assert.equal(next.timeline.at(-1).content, 'P2 synthetic interview completed.');
        assert.equal(next.states.atri_action_receipts.receipts.length, 1);
        assert.equal(next.states.atri_action_receipts.receipts[0].actionId, 'interaction.interview');
        assert.equal(next.states.atri_lifecycle.clocks.world, 10);
        assert(!JSON.stringify(seen).includes('P1_PRIVATE_CANON_SENTINEL'));
        assert(!JSON.stringify(seen).includes('privateNote'));
        assert.equal(seen.filter(request => request.tools?.length).length, 1, 'same-process selection pin');
        const narrationRequests = seen.filter(request => !request.tools?.length);
        assert.deepEqual(narrationRequests[0].messages, narrationRequests[1].messages, 'retry uses the same frozen authority context');
        const count = seen.length;
        assert.equal((await host.executeTurn(h.handle, input)).revision.revisionId, next.revision.revisionId);
        assert.equal(seen.length, count);
        const { typedSmoke } = await import('./typed-smoke.mjs');
        await typedSmoke({ load, h, svc, host, binding, session, setNarratorFailure: value => { failNarrator = value; } });
        assert(!JSON.stringify(seen).includes('P1_PRIVATE_CANON_SENTINEL'));
        assert(!JSON.stringify(seen).includes('privateNote'));
        return 'nine fixed typed bridge actions (one CAS each, zero-mutation typed failure/retry) plus local HTTP resolver + exact Narrator Task; failure zero publication, same-process retry and idempotent finalization';
    } finally {
        await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    }
}

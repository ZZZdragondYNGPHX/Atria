import { jest } from '@jest/globals';
import http from 'node:http';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';
import { authorityCatalog, authoritySelection, resolverRequest } from '../../src/native/authority-turn.js';
import { buildAuthorityObservation } from '../../src/native/authority-transaction.js';

const durable = base => ({ revision: base.revision, states: base.states, timeline: base.timeline, variants: base.variants });
describe.each(CONTRACT_HARNESSES)('C3 authority Turn - $name', ({ make }) => {
    let h, f, server, seen, response;
    beforeEach(async () => {
        h = await make(); seen = [];
        server = http.createServer(async (req, res) => {
            try {
                const chunks = []; for await (const chunk of req) chunks.push(chunk);
                const body = JSON.parse(Buffer.concat(chunks)); seen.push(body);
                const message = await response(body);
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message }] }));
            } catch { res.writeHead(503); res.end('{}'); }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        f = await authorityTurnFixture(h, 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions');
        response = async body => {
            expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
            return body.tools?.length ? { content: '', tool_calls: [{ id: 'call', type: 'function', function: { name: body.tools[0].function.name, arguments: JSON.stringify(f.selection.input) } }] } : { content: 'The note is updated.' };
        };
    });
    afterEach(async () => { if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); await h?.cleanup(); });
    test('resolver, private candidate Narrator and Action receipt finalize in exactly one CAS', async () => {
        const commit = jest.spyOn(f.core._sessions, 'commitSnapshot');
        const next = await f.host.executeTurn(h.handle, f.input);
        expect(commit).toHaveBeenCalledTimes(1);
        expect(seen).toHaveLength(2);
        expect(JSON.stringify(seen)).not.toContain('PRIVATE READ SENTINEL');
        expect(JSON.stringify(seen)).not.toContain('validators');
        expect(JSON.stringify(seen)).not.toContain('Authoritative current Native world');
        expect(JSON.stringify(seen[0])).toContain('old public note');
        expect(JSON.stringify(seen[1])).toContain('visible new note');
        expect(JSON.stringify(seen[1])).toContain('Note action resolved.');
        expect(seen[1].tools).toBeUndefined();
        expect(next.timeline.at(-1).content).toBe('The note is updated.');
        expect(next.states.atri_world_state.worlds[next.states.atri_world_state.primaryWorldId].state.hp).toBe(6);
        expect(next.states.atri_lifecycle.clocks.world).toBe(1);
        expect(next.states.atri_lifecycle.domains.other.records[0].value.text).toBe('other changed');
        expect(next.states.atri_action_receipts.receipts).toHaveLength(1);
        expect(next.states.atri_action_receipts.receipts[0].committedRevisionId).toBe(next.revision.revisionId);
        expect(next.states.atri_task_results.records[0].storedRevisionId).toBe(next.revision.revisionId);
        expect(durable(await f.host.executeTurn(h.handle, f.input))).toEqual(durable(next));
        expect(seen).toHaveLength(2);
        await expect(f.host.executeTurn(h.handle, { ...f.input, userInput: 'Changed input' })).rejects.toThrow('conflict');
        await expect(f.host.executeTurn(h.handle, { ...f.input, invocationId: 'stale' })).rejects.toThrow('conflict');
    });
    test('failed provider publishes nothing; same anchored retry skips resolver and preserves Fortune', async () => {
        const original = response; let failed = false;
        response = async body => { if (!body.tools?.length && !failed) { failed = true; throw new Error('provider failure'); } return original(body); };
        await expect(f.host.executeTurn(h.handle, f.input)).rejects.toThrow();
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
        const failedNarrator = seen[1];
        const restartedHost = new NativeGenerationHost({ ...f.host, sessionCore: f.core });
        const next = await restartedHost.executeTurn(h.handle, f.input);
        expect(seen.filter(item => item.tools?.length)).toHaveLength(1);
        expect(seen[2]).toEqual(failedNarrator);
        expect(next.states.atri_action_receipts.receipts).toHaveLength(1);
    });
    test.each(['empty', 'tools', 'stale', 'cancel'])('Narrator %s cannot publish a half turn', async mode => {
        const original = response; let current = f.base; const controller = new AbortController();
        response = async body => {
            if (body.tools?.length) return original(body);
            if (mode === 'stale') current = await f.core.appendTimeline(h.handle, f.base.session.sessionId, { role: 'user', content: 'Other action' });
            if (mode === 'cancel') controller.abort();
            if (mode === 'tools') return { content: 'Invented outcome', tool_calls: [{ id: 'bad', type: 'function', function: { name: 'state_patch', arguments: '{}' } }] };
            return { content: mode === 'empty' ? '' : 'Provisional only' };
        };
        await expect(f.host.executeTurn(h.handle, f.input, controller.signal)).rejects.toThrow();
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(current));
    });
    test('public finalize cannot forge a candidate or bypass the Transaction proof', async () => {
        for (const authorityProof of [undefined, {}, { candidate: f.base }]) await expect(f.core.finalizeTurn(h.handle, f.base.session.sessionId,
            { invocationId: 'forged', envelope: { schemaVersion: 1, narrative: 'Forged', outcomes: [], diagnostics: [] }, authorityProof },
            { expectedRevisionId: f.base.revision.revisionId })).rejects.toThrow('proof');
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
    });
    test('selected input conflicts fail closed and prepared proof cannot write narrator outcomes', async () => {
        const original = response;
        response = async body => { if (body.tools?.length) return original(body); throw new Error('fail'); };
        await expect(f.host.executeTurn(h.handle, f.input)).rejects.toThrow();
        await expect(f.host.executeTurn(h.handle, { ...f.input, userInput: 'new user text' })).rejects.toThrow('anchor');
        await expect(f.host.executeTurn(h.handle, f.input, undefined, undefined, { transaction: f.selection })).rejects.toThrow('conflict');
        const proof = await f.core.prepareAuthorityTurn(h.handle, f.base, f.selection);
        await expect(f.core.finalizeTurn(h.handle, f.base.session.sessionId, { invocationId: 'write', authorityProof: proof.proof,
            envelope: { schemaVersion: 1, narrative: 'Changed mechanics', outcomes: [{ requestId: 'write', interpretation: {} }], diagnostics: [] } },
        { expectedRevisionId: f.base.revision.revisionId })).rejects.toThrow();
    });
    test('concurrent identical invocations share one finalization; late finalization failure publishes nothing', async () => {
        const commit = jest.spyOn(f.core._sessions, 'commitSnapshot');
        const original = f.core._validateProjections.bind(f.core);
        const validate = jest.spyOn(f.core, '_validateProjections').mockRejectedValueOnce(new TypeError('final validation'));
        await expect(f.host.executeTurn(h.handle, f.input)).rejects.toThrow('final validation');
        expect(commit).not.toHaveBeenCalled();
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
        validate.mockImplementation(original);
        const [one, two] = await Promise.all([f.host.executeTurn(h.handle, f.input), f.host.executeTurn(h.handle, f.input)]);
        expect(one.revision).toEqual(two.revision); expect(commit).toHaveBeenCalledTimes(1);
    });
    test('Ready Barrier fails before resolver/provider execution', async () => {
        let unready = await f.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
        unready = await f.core.appendTimeline(h.handle, unready.session.sessionId, { role: 'user', content: 'Update' });
        await expect(f.host.executeTurn(h.handle, { ...f.input, sessionId: unready.session.sessionId, revisionId: unready.revision.revisionId, userInput: 'Update' })).rejects.toThrow('ready');
        expect(seen).toEqual([]);
        expect(durable(await f.core.load(h.handle, unready.session.sessionId))).toEqual(durable(unready));
    });
    test('catalog is strict, bounded and non-disclosing', async () => {
        const installed = await f.core._openPackage(h.handle, f.base.session.packageId, f.base.session.packageVersionId, f.base.session.entryPointId);
        const catalog = await authorityCatalog(f.base, installed);
        expect(Object.keys(catalog[0]).sort()).toEqual(['id', 'inputSchema', 'intent', 'verb']);
        expect(() => authoritySelection(catalog, { ...f.selection, domainId: 'notes' })).toThrow();
        expect(() => authoritySelection(catalog, { transactionId: 'dynamic', input: {} })).toThrow();
        expect(() => authoritySelection(catalog, { ...f.selection, input: { ...f.selection.input, amount: 100 } })).toThrow();
        const request = resolverRequest(catalog, buildAuthorityObservation(f.base), 'Update');
        expect(() => request.select({ toolCalls: [] })).toThrow();
        expect(() => request.select({ toolCalls: [{ name: 'unknown', args: {} }] })).toThrow();
    });
    test('Branch Retry forks pre-effect authority, leaving the committed branch unchanged', async () => {
        const committed = await f.host.executeTurn(h.handle, f.input);
        const retry = await f.core.retryReply(h.handle, f.base.session.sessionId, { messageId: committed.timeline.at(-1).messageId, expectedRevisionId: committed.revision.revisionId });
        expect(retry.revision.branchId).not.toBe(committed.revision.branchId);
        expect(retry.states.atri_lifecycle.clocks.world).toBe(0);
        expect(retry.timeline.at(-1).role).toBe('user');
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId, { revisionId: committed.revision.revisionId }))).toEqual(durable(committed));
    });
});

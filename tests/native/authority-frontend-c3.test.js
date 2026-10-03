import assert from 'node:assert/strict';
import { jest } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';
import { compileFrontend, compileProjectFrontends } from '../../src/native/frontend/compiler.js';
import { compileBridge, validateCompiledBridge, EMPTY } from '../../src/native/frontend/bridge.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';
import { createFrontendBridge } from '../../public/scripts/native/frontend/bridge.js';

function frontend(f) {
    const binding = { id: 'update', kind: 'action', target: { transactionId: 'note.update' }, inputSchema: f.logic.transactions[0].inputSchema, outputSchema: EMPTY };
    const files = new Map([
        ['frontend.json', Buffer.from(JSON.stringify({ format: 'atria-frontend-source', version: 3, primaryView: 'main', bridge: 'bridge.json',
            views: [{ id: 'main', root: 'Main', surface: 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }] }))],
        ['bridge.json', Buffer.from(JSON.stringify({ version: 1, bindings: [binding] }))],
        ['Main.aui', Buffer.from('<template><main node-id="root"><button node-id="submit" on:click="submit">Update</button></main></template><contract>' + JSON.stringify({ interactions: { submit: [{ kind: 'action.invoke', target: 'update', value: { object: f.request.input } }] } }) + '</contract>')],
    ]);
    const compiled = compileFrontend({ source: 'frontend.json', files, mode: 'full', experienceContract: f.contract, transactions: f.logic.transactions });
    for (const [path, bytes] of [...files, ...compiled.files]) f.installed.sourceFiles.set(path, bytes);
    f.base.manifest.runtime.experience = { mode: 'full', frontend: { kind: 'native', version: 3, entry: compiled.entry } };
    f.binding = binding; f.frontendFiles = files;
}
const durable = base => ({ revision: base.revision, states: base.states, timeline: base.timeline });
describe('C3 fixed Native Frontend transaction', () => {
    let h, f, bridge, opened, svc;
    beforeEach(async () => {
        h = await makeTempFsEngineHarness(); f = await authorityTurnFixture(h, 'http://127.0.0.1:1/v1/chat/completions', frontend);
        bridge = new FrontendBridgeService(); svc = { core: f.core, generationHost: f.host };
        opened = await bridge.open(svc, h.handle, f.base.session.sessionId);
        f.host.execute = jest.fn(async (_handle, _request, _signal, _chunk, options) => {
            assert.equal(options.lanePlan.authorityContext.mode, 'narrator');
            assert.deepEqual(durable(await f.core.load(h.handle, f.base.session.sessionId)), durable(f.base));
            return { response: { text: 'Typed update.' }, snapshot: { safe: true } };
        });
    });
    afterEach(async () => { bridge?.dispose(); await h?.cleanup(); });
    const call = (extra = {}) => bridge.request(svc, h.handle, { epoch: opened.epoch, revision: f.base.revision.revisionId,
        componentId: 'Main', bindingId: 'update', method: 'action.invoke', input: f.selection.input, idempotencyKey: 'one', ...extra });
    test('fixed binding uses the same preparation API and publishes user + assistant + receipt in one CAS', async () => {
        const prepare = jest.spyOn(f.core, 'prepareAuthorityTurn'); const commit = jest.spyOn(f.core._sessions, 'commitSnapshot');
        const reply = await call(); expect(reply.ok).toBe(true); expect(reply.data).toEqual({});
        expect(prepare).toHaveBeenCalledTimes(1); expect(prepare.mock.calls[0][2]).toEqual(f.selection);
        expect(commit).toHaveBeenCalledTimes(1); expect(f.host.execute).toHaveBeenCalledTimes(1);
        const next = await f.core.load(h.handle, f.base.session.sessionId);
        expect(next.timeline.length).toBe(f.base.timeline.length + 2);
        expect(next.timeline.at(-2).metadata.atri_authority_input).toEqual(f.selection);
        expect(next.states.atri_lifecycle.clocks.world).toBe(1);
        expect(next.states.atri_action_receipts.receipts[0].source).toBe('frontend');
        expect(JSON.stringify(reply)).not.toContain('candidate'); expect(JSON.stringify(reply)).not.toContain('PRIVATE');
        expect(await call()).toEqual(reply);
        // A new transport epoch replays the same durable invocation without reexecution.
        opened = await bridge.open(svc, h.handle, f.base.session.sessionId, opened.epoch);
        expect((await call()).ok).toBe(true); expect(f.host.execute).toHaveBeenCalledTimes(1);
        expect((await call({ input: { ...f.selection.input, amount: 3 } })).ok).toBe(false);
        expect((await call({ idempotencyKey: 'stale' })).ok).toBe(false);
    });
    test('rejected preparation releases its pin for a newly reviewed draft at the same revision', async () => {
        const commit = jest.spyOn(f.core._sessions, 'commitSnapshot');
        expect((await call({ input: { ...f.selection.input, target: 'missing' } })).ok).toBe(false);
        expect(commit).not.toHaveBeenCalled();
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
        expect(f.host.execute).not.toHaveBeenCalled();
        expect((await call({ idempotencyKey: 'reviewed-again', input: { ...f.selection.input, amount: 3 } })).ok).toBe(true);
        expect(commit).toHaveBeenCalledTimes(1);
    });
    test('failed typed Narrator publishes not even its private user draft; retry does not reroll', async () => {
        f.host.execute.mockRejectedValueOnce(new Error('provider failed'));
        expect((await call()).ok).toBe(false);
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
        const receipt = f.host.execute.mock.calls[0][4].lanePlan.authorityContext.receipt;
        expect((await call({ idempotencyKey: 'replacement', input: { ...f.selection.input, amount: 3 } })).ok).toBe(false);
        expect((await call()).ok).toBe(true);
        expect(f.host.execute.mock.calls[1][4].lanePlan.authorityContext.receipt).toEqual(receipt);
    });
    test('typed Branch Retry restores pre-effect authority and reuses the fixed input on a new branch', async () => {
        expect((await call()).ok).toBe(true);
        const committed = await f.core.load(h.handle, f.base.session.sessionId);
        const retry = await f.core.retryReply(h.handle, f.base.session.sessionId, { messageId: committed.timeline.at(-1).messageId, expectedRevisionId: committed.revision.revisionId });
        expect(retry.states.atri_lifecycle.clocks.world).toBe(0);
        expect(retry.timeline.at(-1).role).toBe('user');
        expect(retry.revision.branchId).not.toBe(committed.revision.branchId);
        f.base = retry;
        const result = await f.host.executeTurn(h.handle, { sessionId: retry.session.sessionId, revisionId: retry.revision.revisionId,
            invocationId: 'branch-retry', userInput: retry.timeline.at(-1).content, slotBindings: {} });
        expect(result.states.atri_lifecycle.clocks.world).toBe(1);
        expect(result.states.atri_action_receipts.receipts.at(-1).authorityId).not.toBe(committed.states.atri_action_receipts.receipts[0].authorityId);
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId, { revisionId: committed.revision.revisionId }))).toEqual(durable(committed));
    });
    test('client scoped invoke uses the closed binding without exposing the candidate', async () => {
        const descriptor = compileBridge({ version: 1, bindings: [f.binding] }, f.contract, f.logic.transactions);
        const client = await createFrontendBridge({ descriptor, transport: { open: previous => bridge.open(svc, h.handle, f.base.session.sessionId, previous), request: body => bridge.request(svc, h.handle, body) } });
        const scope = client.scope('Main', ['update']);
        try { const result = await scope.invoke('update', f.selection.input); expect(result.ok).toBe(true); expect(result.data).toEqual({}); }
        finally { scope.dispose(); client.dispose(); }
    });
    test.each([
        b => b.target.transactionId = 'unknown', b => b.target.transactionId = { input: 'target' },
        b => b.target.domainId = 'notes', b => b.target.commandId = 'save', b => b.mapping = { fields: { patch: { input: 'text' } } },
        b => b.inputSchema = EMPTY, b => b.kind = 'operation',
    ])('compile rejects dynamic target, mixed authority and schema mismatch', change => {
        const binding = structuredClone(f.binding); change(binding);
        expect(() => compileBridge({ version: 1, bindings: [binding] }, f.contract, f.logic.transactions)).toThrow();
    });
    test('Build and install graph validation use exact pinned Game Logic, not frontend supplied declarations', () => {
        const manifest = structuredClone(f.base.manifest);
        manifest.runtime.experience = { mode: 'full', frontend: { kind: 'native', version: 3, source: 'frontend.json' } };
        const files = new Map([...f.frontendFiles, ['logic.json', Buffer.from(JSON.stringify(f.logic))]]);
        expect(() => compileProjectFrontends(manifest, files)).not.toThrow();
        const compiled = compileBridge({ version: 1, bindings: [f.binding] }, f.contract, f.logic.transactions);
        expect(() => validateCompiledBridge(compiled, f.contract, [])).toThrow();
        const changed = structuredClone(f.logic.transactions); changed[0].inputSchema.properties.amount.maximum = 2;
        expect(() => validateCompiledBridge(compiled, f.contract, changed)).toThrow();
        expect(() => compileBridge({ version: 1, bindings: [f.binding] }, {}, f.logic.transactions)).toThrow();
    });
});

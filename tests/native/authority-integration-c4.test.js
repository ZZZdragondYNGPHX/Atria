import { jest } from '@jest/globals';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { NATIVE_RESOURCE_KINDS } from '../../src/native/index.js';
import { authoritySelectionCache } from '../../src/native/authority-turn.js';

const durable = base => ({ revision: base.revision, states: base.states, timeline: base.timeline, variants: base.variants });
const receipt = base => base.states.atri_action_receipts.receipts.at(-1);
async function archives(h, f) {
    const save = await f.saveSystem.manualSave(h.handle, f.base.session.sessionId);
    return { saveArchive: (await f.saveSystem.exportSnapshot(h.handle, f.base.session.sessionId, save.saveId)).archive,
        packageArchive: await f.assetStore.readBlob(h.handle, f.base.session.packageContentHash) };
}
async function restore(h, exported, endpoint) {
    const svc = services(h);
    await svc.packageInstaller.install(h.handle, exported.packageArchive);
    const base = await svc.saveSystem.importSave(h.handle, exported.saveArchive);
    const seeded = await seedGenerationProfiles({ ...h, endpoint, roles: ['narrator', 'intent_resolver'] });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
        providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
    return { ...svc, base, host };
}
function childRestore(request) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(new URL('./helpers/authority-restore-process.js', import.meta.url))],
            { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
        const out = [], err = [];
        child.stdout.on('data', chunk => out.push(chunk)); child.stderr.on('data', chunk => err.push(chunk));
        child.on('error', reject);
        child.on('close', code => {
            if (code) reject(new Error(Buffer.concat(err).toString()));
            else { try { resolve(JSON.parse(Buffer.concat(out))); } catch (error) { reject(error); } }
        });
        child.stdin.end(JSON.stringify(request));
    });
}

describe.each(CONTRACT_HARNESSES)('C4 integrated authority gate - $name', ({ make }) => {
    let h, target, f, server, endpoint, seen, failNarrator;
    beforeEach(async () => {
        h = await make(); seen = []; failNarrator = false;
        server = http.createServer(async (req, res) => {
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks)); seen.push(body);
            if (!body.tools?.length && failNarrator) { res.writeHead(503); res.end('{}'); return; }
            const message = body.tools?.length
                ? { content: '', tool_calls: [{ id: 'call', type: 'function', function: { name: body.tools[0].function.name, arguments: JSON.stringify(f.selection.input) } }] }
                : { content: 'Only the approved outcome is narrated.' };
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message }] }));
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        endpoint = 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions';
    });
    afterEach(async () => {
        if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
        await target?.cleanup(); target = null; await h?.cleanup();
    });
    test.each(['intent', 'typed'])('%s save-container restore preserves the same anchor/Fortune without a selection pin', async source => {
        f = await authorityTurnFixture(h, endpoint);
        const options = source === 'typed' ? { transaction: f.selection } : {};
        const prepare = jest.spyOn(f.core, 'prepareAuthorityTurn');
        failNarrator = true;
        await expect(f.host.executeTurn(h.handle, f.input, undefined, undefined, options)).rejects.toThrow();
        const failed = (await prepare.mock.results[0].value).prepared;
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
        const exported = await archives(h, f);
        target = await make(); const other = await restore(target, exported, endpoint);
        expect(other.base.revision).toEqual(f.base.revision);
        expect(authoritySelectionCache(other.core).size).toBe(0);
        const restoredPrepare = jest.spyOn(other.core, 'prepareAuthorityTurn');
        const commit = jest.spyOn(other.core._sessions, 'commitSnapshot');
        failNarrator = false;
        const result = await other.host.executeTurn(target.handle, f.input, undefined, undefined, options);
        const prepared = (await restoredPrepare.mock.results[0].value).prepared;
        expect(prepared.identity).toBe(failed.identity); expect(prepared.inputHash).toBe(failed.inputHash);
        expect(prepared.receipt).toEqual(failed.receipt);
        expect(commit).toHaveBeenCalledTimes(1);
        expect(result.states.atri_lifecycle.clocks.world).toBe(1);
        expect(result.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('visible new note');
        expect(result.states.atri_lifecycle.domains.other.records[0].value.text).toBe('other changed');
        expect(result.states.atri_lifecycle.domains.public_notes.records[0].value.text).toBe('visible new note');
        expect(receipt(result).authorityId).toBe(failed.identity);
        expect(receipt(result).committedRevisionId).toBe(result.revision.revisionId);
        expect(result.timeline.at(-1).role).toBe('assistant');
        expect(JSON.stringify(seen)).not.toContain('PRIVATE READ SENTINEL');
        expect(seen.filter(body => body.tools?.length)).toHaveLength(source === 'intent' ? 2 : 0);
        const count = seen.length;
        expect(durable(await other.host.executeTurn(target.handle, f.input, undefined, undefined, options))).toEqual(durable(result));
        expect(seen).toHaveLength(count);
    });
    test.each(['intent', 'typed'])('%s committed save retains idempotency and coherent Branch Retry, not prose reroll', async source => {
        f = await authorityTurnFixture(h, endpoint);
        const options = source === 'typed' ? { transaction: f.selection } : {};
        const committed = await f.host.executeTurn(h.handle, f.input, undefined, undefined, options);
        const exported = await archives(h, f);
        target = await make(); const other = await restore(target, exported, endpoint);
        expect(durable(other.base)).toEqual(durable(committed));
        const commit = jest.spyOn(other.core._sessions, 'commitSnapshot'); const count = seen.length;
        expect(durable(await other.host.executeTurn(target.handle, f.input, undefined, undefined, options))).toEqual(durable(committed));
        await expect(other.host.executeTurn(target.handle, { ...f.input, userInput: 'different' }, undefined, undefined, options)).rejects.toThrow('conflict');
        await expect(other.host.executeTurn(target.handle, { ...f.input, invocationId: 'new-stale' }, undefined, undefined, options)).rejects.toThrow('conflict');
        expect(seen).toHaveLength(count); expect(commit).not.toHaveBeenCalled();
        const retry = await other.core.retryReply(target.handle, committed.session.sessionId,
            { messageId: committed.timeline.at(-1).messageId, expectedRevisionId: committed.revision.revisionId });
        expect(retry.revision.branchId).not.toBe(committed.revision.branchId);
        expect(retry.states.atri_lifecycle.clocks.world).toBe(0);
        const result = await other.host.executeTurn(target.handle, { ...f.input, revisionId: retry.revision.revisionId,
            invocationId: 'restored-branch-retry', userInput: retry.timeline.at(-1).content });
        expect(result.states.atri_lifecycle.clocks.world).toBe(1);
        expect(receipt(result).authorityId).not.toBe(receipt(committed).authorityId);
        expect(durable(await other.core.load(target.handle, committed.session.sessionId, { revisionId: committed.revision.revisionId }))).toEqual(durable(committed));
    });
    test.each(['computed', 'expanded'])('%s invalid effect fails before Narrator and publishes nothing', async kind => {
        f = await authorityTurnFixture(h, endpoint, value => {
            if (kind === 'computed') value.logic.transactions[0].effects[0].payload.amount = { formula: 'args.amount * 100' };
            else {
                value.contract.authorityRuntime.policy.maxEffects = 6;
                value.contract.lifecycleRuntime.automations = Array.from({ length: 6 }, (_, i) => ({ id: 'due-' + i, scopeId: 'session', maxCatchUp: 1,
                    trigger: { kind: 'world.schedule', clockId: 'world', at: 1, catchUp: 'all' },
                    action: { kind: 'app.command', domainId: 'other', commandId: 'save', recordId: 'main', args: { text: 'due' } } }));
            }
        });
        const commit = jest.spyOn(f.core._sessions, 'commitSnapshot');
        await expect(f.host.executeTurn(h.handle, f.input)).rejects.toThrow();
        expect(seen).toHaveLength(1); expect(seen[0].tools.length).toBeGreaterThan(0);
        expect(commit).not.toHaveBeenCalled();
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
    });
    test('ordinary clock pump refreshes due-work projection in its single authority publication', async () => {
        f = await authorityTurnFixture(h, endpoint, value => {
            value.contract.lifecycleRuntime.automations = [{ id: 'due', scopeId: 'session', maxCatchUp: 1,
                trigger: { kind: 'world.schedule', clockId: 'world', at: 1, catchUp: 'all' },
                action: { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'due public note' } } }];
        });
        const command = (action, id) => f.core.applyLifecycleCommand(h.handle, f.base.session.sessionId,
            { type: 'lifecycle', invocationId: id, action }, { expectedRevisionId: f.base.revision.revisionId });
        f.base = await command({ kind: 'clock.advance', commandId: 'advance', ticks: 1 }, 'advance');
        const commit = jest.spyOn(f.core._sessions, 'commitSnapshot');
        const result = await command({ kind: 'pump' }, 'pump');
        expect(commit).toHaveBeenCalledTimes(1);
        expect(result.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('due public note');
        expect(result.states.atri_lifecycle.domains.public_notes.records[0].value.text).toBe('due public note');
        expect(seen).toEqual([]);
    });
    test('storage HEAD failure after successful Narrator exposes no partial authority or receipt', async () => {
        f = await authorityTurnFixture(h, endpoint);
        const original = h.engine.withTransaction.bind(h.engine);
        const storage = jest.spyOn(h.engine, 'withTransaction').mockImplementation((owner, fn) => original(owner, tx => fn(new Proxy(tx, {
            get(target, prop) {
                if (prop === 'putResourceIfMatch') return async (key, integrity, record) => {
                    if (key.kind === NATIVE_RESOURCE_KINDS.session) throw new Error('injected final HEAD failure');
                    return target.putResourceIfMatch(key, integrity, record);
                };
                const value = target[prop]; return typeof value === 'function' ? value.bind(target) : value;
            },
        }))));
        const prepare = jest.spyOn(f.core, 'prepareAuthorityTurn');
        await expect(f.host.executeTurn(h.handle, f.input)).rejects.toThrow('injected final HEAD failure');
        expect(seen.filter(body => !body.tools?.length)).toHaveLength(1);
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
        storage.mockRestore();
        const result = await f.host.executeTurn(h.handle, f.input);
        expect(result.states.atri_action_receipts.receipts).toHaveLength(1);
        expect((await prepare.mock.results[1].value).prepared.receipt).toEqual((await prepare.mock.results[0].value).prepared.receipt);
        expect(seen.filter(body => body.tools?.length)).toHaveLength(1);
    });
    test('separate Node process restores the unresolved anchor from an actual save container', async () => {
        // A real process boundary, not merely constructing another Host on the same engine.
        // The resolver runs anew; this proves deterministic same-selection mechanics,
        // not persistence of an uncommitted free-text selection across a crash.
        f = await authorityTurnFixture(h, endpoint); failNarrator = true;
        const prepare = jest.spyOn(f.core, 'prepareAuthorityTurn');
        await expect(f.host.executeTurn(h.handle, f.input)).rejects.toThrow();
        const failed = (await prepare.mock.results[0].value).prepared;
        const exported = await archives(h, f); failNarrator = false;
        const result = await childRestore({ input: f.input, endpoint,
            packageArchive: exported.packageArchive.toString('base64'), saveArchive: exported.saveArchive.toString('base64') });
        expect(result.anchor).toEqual(f.base.revision);
        expect(result.receipts.at(-1).authorityId).toBe(failed.identity);
        expect(result.receipts.at(-1).inputHash).toBe(failed.inputHash);
        expect(result.clock).toBe(1);
        expect(seen.filter(body => body.tools?.length)).toHaveLength(2);
        const narratorBodies = seen.filter(body => !body.tools?.length);
        expect(narratorBodies).toHaveLength(2);
        expect(narratorBodies[1].messages).toEqual(narratorBodies[0].messages);
        expect(JSON.stringify(seen)).not.toContain('PRIVATE READ SENTINEL');
    }, 30000);
});

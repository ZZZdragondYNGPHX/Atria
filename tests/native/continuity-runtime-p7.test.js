import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionFixture, installFixture, services } from './helpers/session-fixture.js';
import { continuityFixture } from './helpers/continuity-fixture.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';

describe('P7 strict Continuity contract', () => {
    test('typed domains reuse lifecycle schemas, commands and bounded retention', () => {
        expect(assertNativeExperienceContract(continuityFixture()).continuityRuntime.domains).toHaveLength(2);
    });
    test.each([
        c => { c.continuityRuntime.cloudUrl = 'https://example.com'; },
        c => { c.continuityRuntime.domains[0].commands = c.continuityRuntime.domains[1].commands; },
        c => { c.continuityRuntime.transfers[0].sessionDomainId = 'missing'; },
        c => { c.continuityRuntime.views[0].fields = ['secret']; },
        c => { c.continuityRuntime.views[0].context = true; },
        c => { c.continuityRuntime.domains[0].retention.terminalTtl = { clockId: 'world', ticks: 1 }; },
        c => { c.continuityRuntime.domains[1].commands[0].assign = { 'unknown.path': 1 }; },
    ])('rejects unsupported authority/exposure/mutation declarations %#', mutate => {
        const c = continuityFixture(); mutate(c); expect(() => assertNativeExperienceContract(c)).toThrow();
    });
});

describe.each(CONTRACT_HARNESSES)('P7 Continuity and Transfer Saga - $name', ({ make }) => {
    let h, f, base, serial;
    beforeEach(async () => {
        h = await make(); serial = 0;
        const fixture = sessionFixture(); fixture.manifest.runtime = { experienceContract: continuityFixture() };
        f = await installFixture(h, fixture); base = await f.core.create(h.handle, f.start);
        base = await app(base, 'sword', 'Unique sword');
    });
    afterEach(async () => { jest.restoreAllMocks(); await h?.cleanup(); });
    const read = () => f.core.load(h.handle, base.session.sessionId);
    const app = (snapshot, recordId, text) => f.core.applyLifecycleCommand(h.handle, snapshot.session.sessionId,
        { type: 'lifecycle', invocationId: 'app-' + ++serial, action: { kind: 'app.command', domainId: 'inventory', recordId, commandId: 'save', args: { text } } },
        { expectedRevisionId: snapshot.revision.revisionId });
    const apply = (snapshot, action, invocationId = 'p7-' + ++serial) => f.core.applyContinuityCommand(h.handle, snapshot.session.sessionId,
        { type: 'continuity', invocationId, action }, { expectedRevisionId: snapshot.revision.revisionId });
    const deposit = (snapshot = base, extra = {}) => ({ kind: 'transfer', transferId: 'vault', direction: 'deposit', recordId: 'sword', scopeEpoch: 0, expectedContinuityRevisionId: snapshot.continuityRevisionId ?? null, ...extra });
    const vault = (snapshot = base) => f.core.getContinuityProjection(h.handle, snapshot.session.sessionId, 'vault');
    const inventory = snapshot => snapshot.states.atri_lifecycle.domains.inventory.records;

    test('local-first Continuity has independent immutable revisions, typed commands and exact display provenance', async () => {
        const action = { kind: 'command', domainId: 'unlocks', recordId: 'perk', commandId: 'save', args: { text: 'Unlocked' }, expectedContinuityRevisionId: null };
        const next = await apply(base, action, 'unlock');
        expect(next.revision.revisionId).toBe(base.revision.revisionId);
        const replay = await apply(base, action, 'unlock'); expect(replay.continuityRevisionId).toBe(next.continuityRevisionId);
        const projected = await f.core.getContinuityProjection(h.handle, base.session.sessionId, 'unlocks');
        expect(projected).toMatchObject({ exposure: 'display', revisionId: next.continuityRevisionId, records: [{ id: 'perk', value: { text: 'Unlocked' } }] });
        await expect(apply(base, action, 'stale')).rejects.toThrow(/conflict/);
        const second = await apply(base, { ...action, args: { text: 'Updated' }, expectedContinuityRevisionId: next.continuityRevisionId });
        const historical = await f.core.getContinuityProjection(h.handle, base.session.sessionId, 'unlocks', { revisionId: next.continuityRevisionId });
        expect(historical.records[0].value.text).toBe('Unlocked');
        const graph = await f.core.getContinuityGraph(h.handle, base.session.sessionId, 1);
        expect(graph.nodes[0].revisionId).toBe(second.continuityRevisionId); expect(graph.cursor).toBe(next.continuityRevisionId);
        expect((await services(h).core.getContinuityProjection(h.handle, base.session.sessionId, 'unlocks')).records[0].value.text).toBe('Updated');
    });
    test('deposit commits once, with separate transfer/Session receipts and no World mutation', async () => {
        const action = deposit(); const next = await apply(base, action, 'deposit');
        expect(inventory(next)).toEqual([]); expect((await vault()).records).toHaveLength(1);
        expect(next.states.atri_world_state).toEqual(base.states.atri_world_state);
        expect(next.continuityReceipt).toMatchObject({ kind: 'transfer', status: 'committed', sessionRevisionId: next.revision.revisionId });
        const replay = await apply(base, action, 'deposit'); expect(replay.continuityRevisionId).toBe(next.continuityRevisionId);
        await expect(apply(base, { ...action, recordId: 'other' }, 'deposit')).rejects.toThrow(/conflict/);
        expect((await f.core.getContinuityGraph(h.handle, base.session.sessionId)).nodes.map(node => node.event.kind)).toEqual(['transfer.committed', 'transfer.prepared']);
    });
    test('fork, save restore and branch switch cannot re-create externalized lineage', async () => {
        const save = await f.core.createSavePoint(h.handle, base.session.sessionId);
        const next = await apply(base, deposit());
        const fork = await f.core.forkBranch(h.handle, base.session.sessionId, { revisionId: base.revision.revisionId, expectedRevisionId: next.revision.revisionId });
        expect(inventory(fork)).toEqual([]);
        const switched = await f.core.switchBranch(h.handle, base.session.sessionId, base.revision.branchId, { expectedRevisionId: fork.revision.revisionId });
        expect(inventory(switched)).toEqual([]);
        const restored = await f.core.restoreSavePoint(h.handle, base.session.sessionId, save.saveId, { expectedRevisionId: switched.revision.revisionId });
        expect(inventory(restored)).toEqual([]); expect((await vault()).records).toHaveLength(1);
        const historical = await f.core.load(h.handle, base.session.sessionId, { revisionId: base.revision.revisionId });
        expect(inventory(historical)).toHaveLength(1); expect(historical.externalEffects[0].status).toBe('committed');
        const recreated = await app(restored, 'sword', 'Duplicate'); expect(inventory(recreated)).toEqual([]);
        await expect(apply(recreated, deposit(next))).rejects.toThrow(/unavailable/);
    });
    test('withdraw into a second Session and re-deposit preserves one lineage across restores', async () => {
        const next = await apply(base, deposit()); const id = next.continuityReceipt.lineageId;
        const other = await f.core.create(h.handle, f.start);
        const withdrawn = await apply(other, { ...deposit(next), direction: 'withdraw', recordId: 'inherited', lineageId: id });
        expect(inventory(withdrawn)[0].value.text).toBe('Unique sword'); expect((await vault()).records).toEqual([]);
        const deposited = await apply(withdrawn, { ...deposit(withdrawn), recordId: 'inherited' });
        expect(deposited.continuityReceipt.lineageId).toBe(id);
        const fork = await f.core.forkBranch(h.handle, other.session.sessionId, { revisionId: withdrawn.revision.revisionId, expectedRevisionId: deposited.revision.revisionId });
        expect(inventory(fork)).toEqual([]); expect((await vault()).records).toHaveLength(1);
        const old = await f.core.forkBranch(h.handle, base.session.sessionId, { revisionId: base.revision.revisionId, expectedRevisionId: next.revision.revisionId });
        expect(inventory(old)).toEqual([]);
    });
    test('concurrent source claims have one winner', async () => {
        const results = await Promise.allSettled([apply(base, deposit(), 'race-a'), apply(base, deposit(), 'race-b')]);
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect((await vault()).records).toHaveLength(1);
    });
    test('scope epochs, forged values and arbitrary vault Commands are rejected without publication', async () => {
        await expect(apply(base, { ...deposit(), scopeEpoch: 1 })).rejects.toThrow(/stale/);
        await expect(apply(base, { ...deposit(), value: { text: 'forged' } })).rejects.toThrow(/unknown field/);
        await expect(apply(base, { kind: 'command', domainId: 'vault', recordId: 'fake', commandId: 'save', args: { text: 'forged' }, expectedContinuityRevisionId: null })).rejects.toThrow(/Unknown/);
        expect((await read()).revision.revisionId).toBe(base.revision.revisionId); expect((await vault()).records).toEqual([]);
    });
    test('failure after prepare reserves ownership, survives reload, and exact retry completes once', async () => {
        jest.spyOn(f.sessionRepo, 'commitSnapshot').mockRejectedValueOnce(new Error('simulated Session IO failure'));
        const action = deposit(); await expect(apply(base, action, 'recover')).rejects.toThrow(/IO/);
        const pending = await read(); expect(inventory(pending)).toEqual([]); expect(pending.externalEffects[0].status).toBe('prepared');
        await expect(f.sessionRepo.delete(h.handle, base.session.sessionId)).rejects.toThrow(/pending/);
        const host = new NativeGenerationHost({ sessionCore: f.core });
        await expect(host.execute(h.handle, { role: 'narrator', sessionId: base.session.sessionId, revisionId: pending.revision.revisionId }, null, null, { preview: true })).rejects.toThrow(/native_transfer_pending/);
        await expect(f.core.forkBranch(h.handle, base.session.sessionId, { expectedRevisionId: base.revision.revisionId })).rejects.toThrow(/pending/);
        f.core = services(h).core;
        const recovered = await apply(base, action, 'recover'); expect(recovered.continuityReceipt.status).toBe('committed'); expect((await vault()).records).toHaveLength(1);
    });
    test('failure after Session debit is recoverable after process-service reopen', async () => {
        const original = f.sessionRepo.continuity.commit.bind(f.sessionRepo.continuity);
        jest.spyOn(f.sessionRepo.continuity, 'commit').mockImplementation(async (...args) => {
            if (args[4].kind === 'transfer.committed') throw new Error('simulated final IO failure');
            return original(...args);
        });
        const action = deposit(); await expect(apply(base, action, 'recover')).rejects.toThrow(/IO/);
        expect((await vault()).records).toEqual([]); expect(inventory(await read())).toEqual([]);
        jest.restoreAllMocks(); f.core = services(h).core;
        const current = await read();
        const completed = await apply(current, { kind: 'transfer.resume', intentId: current.externalEffects[0].intentId }); expect((await vault()).records).toHaveLength(1);
        expect((await apply(base, action, 'recover')).revision.revisionId).toBe(completed.revision.revisionId);
    });
    test('explicit compensation before Session debit releases escrow without minting a second asset', async () => {
        jest.spyOn(f.sessionRepo, 'commitSnapshot').mockRejectedValueOnce(new Error('simulated IO failure'));
        await expect(apply(base, deposit(), 'cancel-me')).rejects.toThrow(/IO/);
        const revision = await f.sessionRepo.continuity.load(h.handle, base.session.packageId);
        const cancelled = await apply(base, { kind: 'transfer.cancel', intentId: base.session.sessionId + ':cancel-me', expectedContinuityRevisionId: revision.revisionId });
        expect(cancelled.continuityReceipt.status).toBe('compensated'); expect(inventory(cancelled)).toHaveLength(1); expect((await vault()).records).toEqual([]);
        await expect(apply(base, deposit(), 'cancel-me')).rejects.toThrow(/compensated/);
    });
    test('prepared deposits reserve capacity against other Sessions and release it on compensation', async () => {
        const fixture = sessionFixture(); fixture.manifest.runtime = { experienceContract: continuityFixture() };
        fixture.manifest.runtime.experienceContract.continuityRuntime.domains[0].retention.maxItems = 1;
        f = await installFixture(h, fixture); base = await f.core.create(h.handle, f.start); base = await app(base, 'sword', 'Reserved');
        let other = await f.core.create(h.handle, f.start); other = await app(other, 'sword', 'Second lineage');
        jest.spyOn(f.sessionRepo, 'commitSnapshot').mockRejectedValueOnce(new Error('simulated IO failure'));
        await expect(apply(base, deposit(), 'reserved')).rejects.toThrow(/IO/);
        const reserved = await f.sessionRepo.continuity.load(h.handle, base.session.packageId);
        await expect(apply(other, deposit(other, { expectedContinuityRevisionId: reserved.revisionId }))).rejects.toThrow(/retention/);
        expect(inventory(await f.core.load(h.handle, other.session.sessionId))).toHaveLength(1);
        const cancelled = await apply(base, { kind: 'transfer.cancel', intentId: base.session.sessionId + ':reserved', expectedContinuityRevisionId: reserved.revisionId });
        await apply(other, deposit(other, { expectedContinuityRevisionId: cancelled.continuityRevisionId }));
        expect((await vault()).records[0].value.text).toBe('Second lineage');
    });
    test('withdrawal interrupted after Session credit stays unspendable until durable resume', async () => {
        const deposited = await apply(base, deposit()); const other = await f.core.create(h.handle, f.start);
        const original = f.sessionRepo.continuity.commit.bind(f.sessionRepo.continuity);
        jest.spyOn(f.sessionRepo.continuity, 'commit').mockImplementation(async (...args) => {
            if (args[4].kind === 'transfer.committed') throw new Error('simulated final IO failure');
            return original(...args);
        });
        const action = { ...deposit(deposited), direction: 'withdraw', lineageId: deposited.continuityReceipt.lineageId, recordId: 'inherited' };
        await expect(apply(other, action, 'withdraw')).rejects.toThrow(/IO/);
        const pending = await f.core.load(h.handle, other.session.sessionId);
        expect(inventory(pending)).toEqual([]); expect((await vault()).records).toEqual([]);
        await expect(apply(pending, { kind: 'transfer.cancel', intentId: pending.externalEffects[0].intentId, expectedContinuityRevisionId: pending.continuityRevisionId })).rejects.toThrow(/already published/);
        jest.restoreAllMocks(); f.core = services(h).core;
        const resumed = await apply(pending, { kind: 'transfer.resume', intentId: pending.externalEffects[0].intentId });
        expect(inventory(resumed)).toHaveLength(1); expect((await vault()).records).toEqual([]);
    });
    test('protected Session ownership markers cannot be patched/deleted through runtime', async () => {
        await expect(f.core.applyRuntimeCommit(h.handle, base.session.sessionId, { statePatch: { atri_transfers: {} } }, { expectedRevisionId: base.revision.revisionId })).rejects.toThrow();
        await expect(f.core.applyRuntimeCommit(h.handle, base.session.sessionId, { deleteNamespaces: ['atri_transfers'] }, { expectedRevisionId: base.revision.revisionId })).rejects.toThrow();
    });
    test('authenticated HTTP owns account identity and validates Continuity commands before any write', async () => {
        const http = express(); http.use(express.json());
        http.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
        http.use(createNativeSessionRouter(() => ({ core: f.core })));
        const body = { handle: 'untrusted-player', sessionId: base.session.sessionId, expectedRevisionId: base.revision.revisionId,
            command: { type: 'continuity', invocationId: 'http', action: deposit() } };
        const rejected = await request(http).post('/command').send({ ...body, command: { ...body.command, action: { ...deposit(), rawPatch: {} } } });
        expect(rejected.status).toBe(400);
        const response = await request(http).post('/command').send(body); expect(response.status).toBe(200);
        expect(response.body.continuityReceipt.status).toBe('committed');
        const view = await request(http).post('/continuity/projection').send({ sessionId: base.session.sessionId, viewId: 'vault', handle: 'untrusted-player' });
        expect(view.status).toBe(200); expect(view.body.records).toHaveLength(1);
        expect((await request(http).post('/continuity/graph').send({ sessionId: base.session.sessionId })).body.nodes).toHaveLength(2);
        const anonymous = express(); anonymous.use(express.json()); anonymous.use(createNativeSessionRouter(() => ({ core: f.core })));
        expect((await request(anonymous).post('/command').send(body)).status).toBe(401);
    });
    test('importing an old local save cannot resurrect the exported lineage', async () => {
        const { archive } = await f.saveSystem.exportSession(h.handle, base.session.sessionId);
        await apply(base, deposit());
        await f.sessionRepo.delete(h.handle, base.session.sessionId);
        const imported = await f.saveSystem.importSave(h.handle, archive);
        expect(inventory(imported)).toEqual([]); expect((await vault()).records).toHaveLength(1);
    });
    test('Continuity is account-isolated and schema changes require explicit migration', async () => {
        await apply(base, deposit());
        const other = await make();
        try { expect(await services(other).sessionRepo.continuity.load(other.handle, base.session.packageId)).toBeNull(); } finally { await other.cleanup(); }
        const revision = await f.sessionRepo.continuity.load(h.handle, base.session.packageId);
        expect(revision.parentRevisionId).not.toBeNull();
        const bad = structuredClone(revision.state); bad.definitionHash = 'wrong';
        await f.sessionRepo.continuity.commit(h.handle, base.session.packageId, revision, bad, { kind: 'test.corrupt' });
        await expect(read()).rejects.toThrow(/migration/);
    });
});

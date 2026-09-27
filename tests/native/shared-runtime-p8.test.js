import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { SharedAuthority, sharedRoll } from '../../src/native/shared-authority.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionFixture, installFixture, services } from './helpers/session-fixture.js';
import { sharedFixture } from './helpers/shared-fixture.js';

describe('P8 Shared strict contract and deterministic rules', () => {
    test.each([
        c => { c.sharedRuntime.network = 'ws://example.com'; },
        c => { c.sharedRuntime.seats[0].viewIds = ['missing']; },
        c => { c.sharedRuntime.seats[1].viewIds = ['pov0']; },
        c => { c.sharedRuntime.rules[0].commandId = 'patch'; },
        c => { c.sharedRuntime.seats[0].actorId = 'unknown'; },
        c => { c.sharedRuntime.rules[0].roll = { argument: 'text', sides: 20 }; },
        c => { c.sharedRuntime.realm.transfers[0].sessionDomainId = 'inventory'; },
    ])('rejects undeclared network/identity/exposure/authority %#', mutate => {
        const c = sharedFixture(sessionFixture()); mutate(c); expect(() => assertNativeExperienceContract(c)).toThrow();
    });
    test('RNG is stable, bounded and domain separated', () => {
        const samples = Array.from({ length: 40 }, (_, i) => sharedRoll('seed', 'session', 'turn-' + i, 'seat', 20));
        expect(samples).toEqual(Array.from({ length: 40 }, (_, i) => sharedRoll('seed', 'session', 'turn-' + i, 'seat', 20)));
        expect(new Set(samples).size).toBeGreaterThan(8); expect(samples.every(n => n >= 1 && n <= 20)).toBe(true);
        expect(() => sharedRoll('seed', 's', 't', 'a', Infinity)).toThrow();
    });
});

describe.each(CONTRACT_HARNESSES)('P8 Shared Session / Realm - $name', ({ make }) => {
    let h, f, base, shared, view, serial;
    beforeEach(async () => {
        h = await make(); serial = 0;
        const fixture = sessionFixture(); sharedFixture(fixture);
        f = await installFixture(h, fixture); base = await f.core.create(h.handle, f.start);
        shared = new SharedAuthority(f.core); view = await shared.enable(h.handle, base.session.sessionId, base.revision.revisionId);
    });
    afterEach(async () => { jest.restoreAllMocks(); await h?.cleanup(); });
    const room = () => base.session.sessionId;
    const read = () => f.core.load(h.handle, room());
    const join = () => shared.membership(h.handle, room(), h.handle, { expectedAccessRevisionId: view.accessRevisionId, handle: 'guest', role: 'participant', seatId: 'seat1' });
    const command = async (action, principal = h.handle) => {
        view = await shared.snapshot(h.handle, room(), principal);
        return shared.command(h.handle, room(), principal, { invocationId: 'p8-' + ++serial, expectedRevisionId: view.revisionId, expectedAccessRevisionId: view.accessRevisionId, ...action });
    };
    const open = () => command({ kind: 'turn.open', scopeId: 'session', scopeEpoch: 0 });
    const app = async (domainId, recordId, text) => {
        const s = await read(); return f.core.applyLifecycleCommand(h.handle, room(), { type: 'lifecycle', invocationId: 'app-' + ++serial,
            action: { kind: 'app.command', domainId, recordId, commandId: 'save', args: { text } } }, { expectedRevisionId: s.revision.revisionId });
    };
    const realm = async (action, invocationId = 'realm-' + ++serial, snapshot = null) => {
        const s = snapshot ?? await read();
        return f.core.applyRealmCommand(h.handle, room(), { type: 'continuity', invocationId, action }, { expectedRevisionId: s.revision.revisionId });
    };
    const deposit = () => ({ kind: 'transfer', transferId: 'vault', direction: 'deposit', recordId: 'relic', scopeEpoch: 0, expectedRealmRevisionId: null });

    test('late join receives only granted POV, cursor reset and ephemeral Presence', async () => {
        await join();
        const guest = await shared.snapshot(h.handle, room(), 'guest');
        expect(Object.keys(guest.projection)).toEqual(['pov1']); expect(guest.states).toBeUndefined(); expect(guest.timeline).toBeUndefined();
        expect(guest.packageContentHash).toBe(base.session.packageContentHash);
        const unchanged = await shared.snapshot(h.handle, room(), 'guest', guest.cursor);
        expect(unchanged).toMatchObject({ reset: false, projection: null });
        const pulse = await shared.heartbeat(h.handle, room(), 'guest'); expect(pulse.participants.find(p => p.seatId === 'seat1').online).toBe(true);
        expect((await read()).revision.revisionId).toBe(base.revision.revisionId);
        await expect(shared.snapshot(h.handle, room(), 'intruder')).rejects.toThrow(/denied/);
    });
    test('ACL cannot be forged, escalated or resurrected by Branch restore', async () => {
        await join();
        await expect(shared.membership(h.handle, room(), 'guest', { expectedAccessRevisionId: view.accessRevisionId, handle: 'guest', role: 'host', seatId: 'seat1' })).rejects.toThrow(/denied/);
        const current = await shared.snapshot(h.handle, room(), h.handle);
        await shared.membership(h.handle, room(), h.handle, { expectedAccessRevisionId: current.accessRevisionId, handle: 'guest', role: 'revoked' });
        const s = await read(); await f.core.forkBranch(h.handle, room(), { revisionId: base.revision.revisionId, expectedRevisionId: s.revision.revisionId });
        await expect(new SharedAuthority(services(h).core).snapshot(h.handle, room(), 'guest')).rejects.toThrow(/denied/);
    });
    test('shared inputs settle atomically in stable seat order and restart/replay once', async () => {
        await join(); const turn = await open(); const turnId = turn.turn.id;
        await command({ kind: 'turn.submit', turnId, ruleId: 'save', args: { text: 'Guest input' } }, 'guest');
        expect((await read()).states.atri_lifecycle.domains.realm_inventory.records).toEqual([]);
        await expect(command({ kind: 'turn.commit', turnId })).rejects.toThrow(/awaits/);
        await command({ kind: 'turn.submit', turnId, ruleId: 'save', args: { text: 'Host input' } });
        shared = new SharedAuthority(services(h).core);
        const s = await shared.snapshot(h.handle, room(), h.handle);
        const action = { kind: 'turn.commit', invocationId: 'commit', turnId, expectedRevisionId: s.revisionId, expectedAccessRevisionId: s.accessRevisionId };
        const done = await shared.command(h.handle, room(), h.handle, action);
        const records = (await read()).states.atri_lifecycle.domains.realm_inventory.records;
        expect(records.map(r => [r.id, r.value.text])).toEqual([['seat0', 'Host input'], ['seat1', 'Guest input']]);
        expect((await shared.command(h.handle, room(), h.handle, action)).revisionId).toBe(done.revisionId);
        expect(done.turn.status).toBe('committed');
    });
    test('concurrent submissions have one CAS winner and a bounded retry path', async () => {
        await join(); const turn = await open(); const turnId = turn.turn.id;
        const common = { kind: 'turn.submit', turnId, ruleId: 'save', expectedRevisionId: turn.revisionId, expectedAccessRevisionId: turn.accessRevisionId, args: { text: 'input' } };
        const results = await Promise.allSettled([shared.command(h.handle, room(), h.handle, { ...common, invocationId: 'host' }), shared.command(h.handle, room(), 'guest', { ...common, invocationId: 'guest' })]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect((await read()).states.atri_shared.turns.session.submissions).toHaveLength(1);
    });
    test('intervening authority or ACL change invalidates pending Turn; Host can cancel', async () => {
        await join(); const turn = await open();
        await app('realm_inventory', 'other', 'intervening');
        await expect(command({ kind: 'turn.submit', turnId: turn.turn.id, ruleId: 'save', args: { text: 'late' } }, 'guest')).rejects.toThrow(/stale/);
        await command({ kind: 'turn.cancel', turnId: turn.turn.id });
        const second = await open(); const access = await shared.snapshot(h.handle, room(), h.handle);
        await shared.membership(h.handle, room(), h.handle, { expectedAccessRevisionId: access.accessRevisionId, handle: 'guest', role: 'revoked' });
        await expect(command({ kind: 'turn.commit', turnId: second.turn.id })).rejects.toThrow(/stale/);
    });
    test('guest cannot commit, submit arbitrary snapshots or read owner APIs over HTTP', async () => {
        await join(); const app = express(); app.use(express.json());
        app.use((req, _res, next) => { req.user = { profile: { handle: 'guest' } }; next(); });
        app.use(createNativeSessionRouter(() => ({ core: f.core, sessionRepo: f.sessionRepo, packageInstaller: f.packageInstaller, assets: f.assetStore })));
        const snapshot = await request(app).post('/shared/snapshot').send({ owner: h.handle, sessionId: room() }); expect(snapshot.status).toBe(200);
        const forged = await request(app).post('/shared/command').send({ owner: h.handle, sessionId: room(), action: { kind: 'publishArbitraryWorldSnapshot', invocationId: 'forge', expectedRevisionId: snapshot.body.revisionId, expectedAccessRevisionId: snapshot.body.accessRevisionId, states: {} } });
        expect(forged.status).toBe(400);
        expect((await request(app).post('/shared/membership').send({ owner: h.handle, sessionId: room(), action: { handle: 'intruder', role: 'participant', seatId: 'seat0' } })).status).toBe(400);
        expect((await request(app).post('/load').send({ sessionId: room() })).status).not.toBe(200);
        const resolved = await request(app).post('/runtime/resolve').send({ sharedOwner: h.handle, sessionId: room() });
        expect(resolved.status).toBe(200); expect(resolved.body.descriptor.packageContentHash).toBe(base.session.packageContentHash);
        expect((await request(app).post('/runtime/resource').send({ sharedOwner: h.handle, sessionId: room(), path: '../secret.json' })).status).toBe(400);
        expect((await request(app).get('/asset/asset_' + 'f'.repeat(32)).query({ sharedOwner: h.handle, sessionId: room() })).status).toBe(400);
    });
    test('Realm uses independent revisions and Saga reservations; old saves cannot duplicate', async () => {
        await app('realm_inventory', 'relic', 'Realm relic'); const before = await read();
        const next = await realm(deposit(), 'deposit', before);
        expect(next.realmReceipt.status).toBe('committed'); expect(next.continuityRevisionId).toBeNull();
        expect(next.realmViews.vault.records).toHaveLength(1);
        expect((await realm(deposit(), 'deposit', before)).realmRevisionId).toBe(next.realmRevisionId);
        const restored = await f.core.forkBranch(h.handle, room(), { revisionId: before.revision.revisionId, expectedRevisionId: next.revision.revisionId });
        expect(restored.states.atri_lifecycle.domains.realm_inventory.records).toEqual([]); expect(restored.realmViews.vault.records).toHaveLength(1);
        expect((await services(h).core.load(h.handle, room())).realmRevisionId).toBe(next.realmRevisionId);
    });
    test('Realm crash after Session publication resumes forward with durable marker', async () => {
        await app('realm_inventory', 'relic', 'Unique');
        const original = f.sessionRepo.realm.commit.bind(f.sessionRepo.realm);
        const fail = jest.spyOn(f.sessionRepo.realm, 'commit').mockImplementation((...args) => { if (args[4].kind === 'transfer.committed') throw new Error('crash'); return original(...args); });
        await expect(realm(deposit(), 'crash')).rejects.toThrow('crash'); fail.mockRestore();
        const pending = await read(); expect(pending.externalEffects.find(e => e.authority === 'realm').status).toBe('prepared');
        await expect(app('realm_inventory', 'blocked', 'blocked')).rejects.toThrow(/pending/);
        await expect(f.sessionRepo.delete(h.handle, room())).rejects.toThrow();
        f.core = services(h).core;
        const done = await realm({ kind: 'transfer.resume', intentId: room() + ':crash' });
        expect(done.realmViews.vault.records).toHaveLength(1); expect(done.externalEffects.find(e => e.authority === 'realm').status).toBe('committed');
    });
    test('Realm typed commands never rewrite Player authority', async () => {
        const done = await realm({ kind: 'command', domainId: 'unlocks', recordId: 'realm-perk', commandId: 'save', args: { text: 'Realm perk' }, expectedRealmRevisionId: null });
        expect(done.realmViews.unlocks.records).toHaveLength(1); expect(done.continuityViews.unlocks.records).toEqual([]);
        expect(done.revision.revisionId).toBe(base.revision.revisionId);
    });
    test('split party has isolated Scene projections and independent pending Turns', async () => {
        const fixture = sessionFixture(); const c = sharedFixture(fixture);
        c.lifecycleRuntime.scopes.push({ id: 'side', kind: 'scene', sceneId: 'side' });
        c.lifecycleRuntime.domains.find(d => d.id === 'realm_inventory').scopeId = 'side';
        const guestSource = { id: 'side-items', kind: 'application', semantic: 'truth', domainId: 'realm_inventory', scopeId: 'side', fields: [['text']] };
        c.informationRuntime.sources.push(guestSource); c.informationRuntime.views[1].sources = ['side-items'];
        c.informationRuntime.actors[1].scopeId = 'side'; c.sharedRuntime.seats[1].scopeId = 'side';
        c.sharedRuntime.rules.push({ id: 'host-save', domainId: 'inventory', commandId: 'save' }); c.sharedRuntime.seats[0].ruleIds = ['host-save'];
        f = await installFixture(h, fixture); base = await f.core.create(h.handle, f.start); shared = new SharedAuthority(f.core);
        view = await shared.enable(h.handle, room(), base.revision.revisionId); await join();
        const main = await open();
        await command({ kind: 'turn.open', scopeId: 'side', scopeEpoch: 0 });
        const guest = await shared.snapshot(h.handle, room(), 'guest');
        expect(guest.participants.map(p => p.seatId)).toEqual(['seat1']); expect(Object.keys(guest.scopes)).toEqual(['side']);
        await command({ kind: 'turn.submit', turnId: guest.turn.id, ruleId: 'save', args: { text: 'SIDE ONLY' } }, 'guest');
        await command({ kind: 'turn.commit', turnId: guest.turn.id });
        const hostView = await shared.snapshot(h.handle, room(), h.handle); expect(JSON.stringify(hostView)).not.toContain('SIDE ONLY');
        expect(hostView.turn.id).toBe(main.turn.id); expect(hostView.turn.stale).toBe(false);
        const guestView = await shared.snapshot(h.handle, room(), 'guest'); expect(JSON.stringify(guestView)).toContain('SIDE ONLY');
        await command({ kind: 'turn.submit', turnId: main.turn.id, ruleId: 'host-save', args: { text: 'MAIN' } });
        await command({ kind: 'turn.commit', turnId: main.turn.id });
        const next = await read(); expect(next.states.atri_lifecycle.domains.inventory.records[0].value.text).toBe('MAIN');
    });
    test('failed multi-participant settlement publishes neither partial facts nor receipt', async () => {
        const fixture = sessionFixture(); const c = sharedFixture(fixture);
        c.lifecycleRuntime.domains.find(d => d.id === 'realm_inventory').retention.maxItems = 1;
        f = await installFixture(h, fixture); base = await f.core.create(h.handle, f.start); shared = new SharedAuthority(f.core);
        view = await shared.enable(h.handle, room(), base.revision.revisionId); await join(); const turn = await open();
        await command({ kind: 'turn.submit', turnId: turn.turn.id, ruleId: 'save', args: { text: 'first' } });
        await command({ kind: 'turn.submit', turnId: turn.turn.id, ruleId: 'save', args: { text: 'second' } }, 'guest');
        const before = await read(); await expect(command({ kind: 'turn.commit', turnId: turn.turn.id })).rejects.toThrow(/limit|retention|budget/);
        const after = await read(); expect(after.revision.revisionId).toBe(before.revision.revisionId);
        expect(after.states.atri_lifecycle.domains.realm_inventory.records).toEqual([]);
    });
    test('Realm compensation before publication releases escrow and preserves source', async () => {
        await app('realm_inventory', 'relic', 'Unique');
        const fail = jest.spyOn(f.core, '_publishLocked').mockRejectedValueOnce(new Error('before publication'));
        await expect(realm(deposit(), 'cancel-me')).rejects.toThrow(/before publication/); fail.mockRestore();
        const pending = await read();
        const done = await realm({ kind: 'transfer.cancel', intentId: room() + ':cancel-me', expectedRealmRevisionId: pending.realmRevisionId });
        expect(done.realmReceipt.status).toBe('compensated'); expect(done.states.atri_lifecycle.domains.realm_inventory.records).toHaveLength(1);
        expect(done.realmViews.vault.records).toEqual([]);
    });
    test('Player and Realm transfers coexist without crossing ownership ledgers', async () => {
        await app('inventory', 'player-item', 'Player'); await app('realm_inventory', 'relic', 'Realm'); const before = await read();
        const player = await f.core.applyContinuityCommand(h.handle, room(), { type: 'continuity', invocationId: 'player-deposit', action: {
            kind: 'transfer', transferId: 'vault', direction: 'deposit', recordId: 'player-item', scopeEpoch: 0, expectedContinuityRevisionId: null,
        } }, { expectedRevisionId: before.revision.revisionId });
        const next = await realm(deposit());
        expect(next.continuityRevisionId).toBe(player.continuityRevisionId); expect(next.continuityViews.vault.records[0].value.text).toBe('Player');
        expect(next.realmViews.vault.records[0].value.text).toBe('Realm');
        const restored = await f.core.forkBranch(h.handle, room(), { revisionId: before.revision.revisionId, expectedRevisionId: next.revision.revisionId });
        expect(restored.states.atri_lifecycle.domains.inventory.records).toEqual([]); expect(restored.states.atri_lifecycle.domains.realm_inventory.records).toEqual([]);
    });
    test('a prepared Realm Saga cannot deadlock a second Player Saga on the same Session', async () => {
        await app('inventory', 'player-item', 'Player'); await app('realm_inventory', 'relic', 'Realm');
        const fail = jest.spyOn(f.core, '_publishLocked').mockRejectedValueOnce(new Error('offline'));
        await expect(realm(deposit(), 'pending')).rejects.toThrow('offline'); fail.mockRestore(); const s = await read();
        await expect(f.core.applyContinuityCommand(h.handle, room(), { type: 'continuity', invocationId: 'other', action: {
            kind: 'transfer', transferId: 'vault', direction: 'deposit', recordId: 'player-item', scopeEpoch: 0, expectedContinuityRevisionId: null,
        } }, { expectedRevisionId: s.revision.revisionId })).rejects.toThrow(/pending/);
        expect(await f.sessionRepo.continuity.load(h.handle, s.session.packageId)).toBeNull();
        const done = await realm({ kind: 'transfer.resume', intentId: room() + ':pending' }); expect(done.realmViews.vault.records).toHaveLength(1);
    });
    test('granted Realm participant Commands use authenticated record identity and independent cursor', async () => {
        const fixture = sessionFixture(); const c = sharedFixture(fixture);
        c.sharedRuntime.seats[1].realmViewIds = ['unlocks']; c.sharedRuntime.seats[1].realmCommands = [{ domainId: 'unlocks', commandId: 'save' }];
        f = await installFixture(h, fixture); base = await f.core.create(h.handle, f.start); shared = new SharedAuthority(f.core);
        view = await shared.enable(h.handle, room(), base.revision.revisionId); await join(); const guest = await shared.snapshot(h.handle, room(), 'guest');
        const command = { type: 'realm', invocationId: 'realm-guest', action: { kind: 'command', domainId: 'unlocks', commandId: 'save', args: { text: 'Contribution' }, expectedRealmRevisionId: null } };
        const next = await shared.realm(h.handle, room(), 'guest', command, guest.revisionId, guest.accessRevisionId);
        expect(next.revisionId).toBe(guest.revisionId); expect(next.cursor).not.toBe(guest.cursor);
        expect(next.realm.unlocks.records[0]).toMatchObject({ value: { text: 'Contribution' } }); expect(next.realm.unlocks.records[0].id).toMatch(/^player\./);
        await expect(shared.realm(h.handle, room(), 'guest', { ...command, invocationId: 'forge', action: { ...command.action, recordId: 'someone-else' } }, guest.revisionId, guest.accessRevisionId)).rejects.toThrow(/Host-owned/);
        const current = await shared.snapshot(h.handle, room(), h.handle);
        const observer = await shared.membership(h.handle, room(), h.handle, { expectedAccessRevisionId: current.accessRevisionId, handle: 'guest', role: 'observer', seatId: 'seat1' });
        await expect(shared.realm(h.handle, room(), 'guest', command, guest.revisionId, guest.accessRevisionId)).rejects.toThrow(/conflict/);
        await expect(shared.realm(h.handle, room(), 'guest', command, guest.revisionId, observer.accessRevisionId)).rejects.toThrow(/denied/);
        expect(JSON.stringify(next)).not.toContain('seed'); expect(next.playerRef.trust).toBe('authenticated-local');
    });
    test('RNG arguments are Host-owned, persisted and replayable with exact rules and seed', async () => {
        const fixture = sessionFixture(); const c = sharedFixture(fixture);
        const d = c.lifecycleRuntime.domains.find(item => item.id === 'realm_inventory');
        const integer = { type: 'integer', minimum: 1, maximum: 20 };
        d.recordSchema.properties.roll = integer; d.recordSchema.required.push('roll'); d.initial.roll = 1;
        d.commands[0].argsSchema.properties.roll = integer; d.commands[0].argsSchema.required.push('roll'); d.commands[0].assign.roll = { formula: 'args.roll' };
        c.sharedRuntime.rules[0].roll = { argument: 'roll', sides: 20 };
        f = await installFixture(h, fixture); base = await f.core.create(h.handle, f.start); shared = new SharedAuthority(f.core);
        view = await shared.enable(h.handle, room(), base.revision.revisionId); const turn = await open();
        await expect(command({ kind: 'turn.submit', turnId: turn.turn.id, ruleId: 'save', args: { text: 'forged', roll: 20 } })).rejects.toThrow(/Host-owned/);
        await command({ kind: 'turn.submit', turnId: turn.turn.id, ruleId: 'save', args: { text: 'dice' } });
        const done = await command({ kind: 'turn.commit', turnId: turn.turn.id });
        const access = await f.sessionRepo.sharedAccess.load(h.handle, room());
        const expected = sharedRoll(access.state.seed, room(), turn.turn.id, 'seat0', 20);
        expect(done.receipts.at(-1).rolls[0].result).toBe(expected);
        expect((await read()).states.atri_lifecycle.domains.realm_inventory.records[0].value.roll).toBe(expected);
    });
});

import express from 'express';
import request from 'supertest';
import { PNG } from 'pngjs';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { sessionFixture, installFixture } from './helpers/session-fixture.js';
import { sharedFixture } from './helpers/shared-fixture.js';
import { SharedAuthority } from '../../src/native/shared-authority.js';
import { PersonaRepo } from '../../src/native/repositories/persona-repo.js';
import { EMPTY_PERSONA_FINGERPRINT as empty } from '../../src/native/persona-contract.js';
import { fixedHostTarget, projectPersonaStatus } from '../../public/shared/native-frontend-host.js';
import { createHeadlessConversation } from '../../public/scripts/native/frontend/conversation.js';

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Persona shared %s', (_label, make) => {
    test('different authenticated seats use their own library, epoch/CAS checked, public description hidden, revoke clears selection', async () => {
        const h = await make();
        try {
            const owner = h.handle, guest = 'guest';
            const guestDirs = Object.fromEntries(Object.entries(h.dirs).map(([k, v]) => [k, path.join(h.dataRoot, guest, path.relative(h.dirs.root, v))]));
            fs.mkdirSync(guestDirs.root, { recursive: true });
            h.engine._directoriesByHandle = handle => handle === owner ? h.dirs : guestDirs;
            const fixture = sessionFixture(); sharedFixture(fixture);
            const f = await installFixture(h, fixture); f.assetStore._directoriesByHandle = h.engine._directoriesByHandle;
            const personas = new PersonaRepo({ engine: h.engine, assetStore: f.assetStore, handles: async () => [owner, guest] }); f.core.personas = personas;
            const create = (principal, name) => personas.create(principal, { expectedFingerprint: empty, content: { name, description: 'PRIVATE ' + name, avatar: null, managementNotes: 'NOTE ' + name } });
            const a = await create(owner, 'Owner');
            const bytes = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([30, 90, 150, 255]) });
            const avatar = await personas.avatar(guest, { bytes: bytes.toString('base64'), mediaType: 'image/png' });
            const b = await personas.create(guest, { expectedFingerprint: empty, content: { name: 'Guest', description: 'PRIVATE Guest', avatar, managementNotes: 'NOTE Guest' } });
            await expect(personas.get(owner, { ref: b.ref })).rejects.toMatchObject({ code: 'native_persona_unavailable' });
            const base = await f.core.create(owner, { ...f.start, personaSelection: null });
            const ready = await f.core.applyLifecycleCommand(owner, base.session.sessionId, { type: 'lifecycle', invocationId: 'ready', action: { kind: 'experience.ready' } }, { expectedRevisionId: base.revision.revisionId });
            const shared = new SharedAuthority(f.core), id = base.session.sessionId;
            let view = await shared.enable(owner, id, ready.revision.revisionId);
            await shared.membership(owner, id, owner, { expectedAccessRevisionId: view.accessRevisionId, handle: guest, role: 'participant', seatId: 'seat1' });
            const input = async principal => { const v = await shared.snapshot(owner, id, principal); return { seatId: v.seatId, expectedRevisionId: v.revisionId, expectedAccessRevisionId: v.accessRevisionId, accessEpoch: v.accessEpoch, scopeEpoch: v.scopes.session.epoch }; };
            const ownerInput = await input(owner);
            await expect(shared.selectPersona(owner, id, owner, { ...ownerInput, seatId: 'seat1', selection: b.ref })).rejects.toMatchObject({ code: 'native_persona_scope_denied' });
            await shared.selectPersona(owner, id, owner, { ...ownerInput, selection: a.ref });
            const guestInput = await input(guest);
            await expect(shared.selectPersona(owner, id, guest, { ...guestInput, accessEpoch: -1, selection: b.ref })).rejects.toMatchObject({ code: 'native_persona_conflict' });
            view = await shared.selectPersona(owner, id, guest, { ...guestInput, selection: b.ref });
            expect(view.personas.map(item => item.name)).toEqual(['Owner', 'Guest']);
            expect(JSON.stringify(view)).not.toMatch(/PRIVATE|NOTE|persona_|managementNotes/);
            const state = (await f.core.load(owner, id)).states.atri_player_persona;
            expect((await f.assetStore.read(owner, avatar.assetId)).bytes).toEqual(bytes);
            const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: req.headers['x-user'] ?? guest } }; next(); });
            app.use(createNativeSessionRouter(() => ({ core: f.core, assets: f.assetStore, sessionRepo: f.sessionRepo, packageInstaller: f.packageInstaller })));
            await request(app).get('/asset/' + avatar.assetId).query({ sharedOwner: owner, sessionId: id, contentHash: avatar.contentHash }).expect(200);
            const unrelated = await personas.avatar(owner, { bytes: bytes.toString('base64'), mediaType: 'image/png' });
            await request(app).get('/asset/' + unrelated.assetId).query({ sharedOwner: owner, sessionId: id }).expect(400);
            expect(state.seats.seat1.ref).toEqual(b.ref); expect(state.seats.seat0.ref).toEqual(a.ref);
            await expect(personas.delete(guest, { personaId: b.ref.personaId, expectedFingerprint: b.expectedFingerprint })).rejects.toMatchObject({ code: 'native_persona_referenced' });
            view = await shared.membership(owner, id, owner, { expectedAccessRevisionId: view.accessRevisionId, handle: guest, role: 'observer', seatId: 'seat1' });
            await expect(shared.selectPersona(owner, id, guest, { ...await input(guest), selection: b.ref })).rejects.toMatchObject({ code: 'native_persona_scope_denied' });
            expect((await f.core.load(owner, id)).states.atri_player_persona.seats.seat1).toBeUndefined();
            await request(app).get('/asset/' + avatar.assetId).query({ sharedOwner: owner, sessionId: id }).expect(400);
        } finally { await h.cleanup(); }
    });
});

test('Host whitelist exposes display status and gated selector only; stale revision and missing picker reject', async () => {
    expect(fixedHostTarget({ service: 'host.persona', method: 'status' }).kind).toBe('read');
    expect(fixedHostTarget({ service: 'host.persona', method: 'openSelector' }).local).toBe(true);
    expect(() => fixedHostTarget({ service: 'host.persona', method: 'list' })).toThrow();
    const snapshot = { session: { sessionId: 'session' }, revision: { revisionId: 'r1' }, states: {} };
    expect(projectPersonaStatus(snapshot)).toMatchObject({ status: 'legacy-unbound', name: '' });
    const bridge = createHeadlessConversation({ runtime: { active: true, snapshot } });
    await expect(bridge.invoke({ service: 'host.persona', method: 'openSelector' }, {}, 'old')).rejects.toMatchObject({ code: 'bridge_revision_stale' });
    await expect(bridge.invoke({ service: 'host.persona', method: 'openSelector' }, {}, 'r1')).rejects.toMatchObject({ code: 'bridge_host_unavailable' });
});

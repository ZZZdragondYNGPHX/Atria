import express from 'express';
import request from 'supertest';
import { expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { authorityCandidateFixture } from './helpers/authority-candidate-fixture.js';
import { services } from './helpers/session-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';

async function fixture() {
    const h = await makeTempFsEngineHarness();
    try {
        const f = authorityCandidateFixture(({ contract, logic }) => {
                logic.transactions[0].effects = logic.transactions[0].effects.filter(effect => !['clock.advance', 'workflow.transition'].includes(effect.kind));
                contract.informationRuntime.views.push({ ...contract.informationRuntime.views[0], id: 'author.private', audience: 'narrator', exposure: ['context'] });
            }), svc = services(h);
        const { archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() });
        await svc.packageInstaller.install(h.handle, archive);
        let base = await svc.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
        for (const action of [{ kind: 'experience.ready' },
            { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'old public note' } },
            { kind: 'app.command', domainId: 'other', commandId: 'save', recordId: 'main', args: { text: 'PRIVATE HTTP SENTINEL' } }]) {
            base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'http-setup-' + base.revision.revisionId, action }, { expectedRevisionId: base.revision.revisionId });
        }
        base = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Update the note.' });
        const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
        app.use(createNativeSessionRouter(() => ({ core: svc.core })));
        const body = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
            request: { kind: 'transaction', viewId: 'player.notes', anchor: projectInformation(base, 'player.notes').anchor,
                transactionId: f.request.transactionId, input: f.request.input } };
        return { h, ...svc, base, body, app };
    } catch (error) { await h.cleanup(); throw error; }
}

test('S22 real HTTP deterministic preparation returns public hypothetical data without state, Task or fee publication', async () => {
    const f = await fixture();
    try {
        const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId), commit = jest.spyOn(f.sessionRepo, 'commitSnapshot');
        const result = await request(f.app).post('/hypothetical/prepare').send(f.body);
        expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('private, no-store');
        expect(result.body).toMatchObject({ kind: 'hypothetical', mode: 'deterministic', operation: 'transaction' });
        expect(result.body.delta[0].after.data.text).toBe('visible new note');
        expect(JSON.stringify(result.body)).not.toContain('PRIVATE HTTP SENTINEL');
        expect(result.body.candidate).toBeUndefined(); expect(result.body.receipt).toBeUndefined(); expect(result.body.proof).toBeUndefined();
        expect((await request(f.app).post('/hypothetical/current').send({ sessionId: f.body.sessionId, artifact: result.body })).body).toEqual({ current: true });
        expect(commit).not.toHaveBeenCalled(); expect(await f.core.load(f.h.handle, f.body.sessionId)).toEqual(f.base);
        expect(await f.core.runs.status(f.h.handle, f.body.sessionId)).toEqual(bank);
    } finally { await f.h.cleanup(); }
});

test('S22 HTTP freshness rejects historical HEAD, invalid fields, private views and foreign actor authority', async () => {
    const f = await fixture();
    try {
        const artifact = (await request(f.app).post('/hypothetical/prepare').send(f.body)).body;
        const changed = await f.core.appendTimeline(f.h.handle, f.body.sessionId, { role: 'user', content: 'A new current turn.' });
        expect((await request(f.app).post('/hypothetical/current').send({ sessionId: f.body.sessionId, artifact })).body).toEqual({ current: false });
        const historical = await request(f.app).post('/hypothetical/prepare').send(f.body); expect(historical.status).toBe(409); expect(historical.body.error).toBe('native_hypothetical_revision_conflict');
        const current = { ...f.body, revisionId: changed.revision.revisionId, request: { ...f.body.request, anchor: projectInformation(changed, 'player.notes').anchor } };
        for (const body of [
            { ...current, handle: 'author' },
            { ...current, request: { ...current.request, viewId: 'author.private' } },
            { ...current, request: { ...current.request, proof: {}, candidate: changed.states } },
            { ...current, request: { ...current.request, anchor: { ...current.request.anchor, sessionId: 'ses_' + 'f'.repeat(32) } } },
        ]) {
            const result = await request(f.app).post('/hypothetical/prepare').send(body);
            expect(result.status).toBe(400); expect(JSON.stringify(result.body)).not.toContain('PRIVATE HTTP SENTINEL');
        }
        expect(await f.core.load(f.h.handle, f.body.sessionId)).toEqual(changed);
        const anonymous = express(); anonymous.use(express.json()); anonymous.use(createNativeSessionRouter(() => ({ core: f.core })));
        expect((await request(anonymous).post('/hypothetical/prepare').send(current)).status).toBe(401);
    } finally { await f.h.cleanup(); }
});

test('S22 HTTP post-prepare revision race refuses the artifact and preserves only the real intervening turn', async () => {
    const f = await fixture();
    try {
        const bank = await f.core.runs.status(f.h.handle, f.body.sessionId), originalLoad = f.core.load.bind(f.core);
        let loads = 0, changed;
        const spy = jest.spyOn(f.core, 'load').mockImplementation(async (...args) => {
            loads++;
            if (loads === 2) {
                spy.mockRestore();
                changed = await f.core.appendTimeline(f.h.handle, f.body.sessionId, { role: 'user', content: 'Intervening real turn.' });
            }
            return originalLoad(...args);
        });
        const result = await request(f.app).post('/hypothetical/prepare').send(f.body);
        expect(result.status).toBe(409); expect(result.body).toEqual({ error: 'native_hypothetical_revision_conflict' });
        expect(await originalLoad(f.h.handle, f.body.sessionId)).toEqual(changed);
        expect(changed.states.atri_lifecycle.logicalTime).toBe(f.base.states.atri_lifecycle.logicalTime + 1);
        expect({ ...changed.states, atri_lifecycle: { ...changed.states.atri_lifecycle, logicalTime: f.base.states.atri_lifecycle.logicalTime } }).toEqual(f.base.states);
        expect(changed.timeline.at(-1).content).toBe('Intervening real turn.');
        expect(await f.core.runs.status(f.h.handle, f.body.sessionId)).toEqual(bank);
    } finally { await f.h.cleanup(); }
});

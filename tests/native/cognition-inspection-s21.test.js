import express from 'express';
import request from 'supertest';
import path from 'node:path';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { sessionFixture, installFixture } from './helpers/session-fixture.js';
import { informationFixture } from './helpers/information-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { ProjectStore } from '../../src/native/project-store.js';
import { assertAtriaProjectSource } from '../../src/native/project-source.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { displayInformation, projectInformation } from '../../public/shared/native-information-runtime.js';
import { cognitionAuthorSourceHash, cognitionDisclosure, inspectCognition } from '../../src/native/cognition-inspection.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';

describe('S21 explicit authoring inspector and independent player disclosure', () => {
    let h, f, store, source, snapshot, app;
    beforeEach(async () => {
        h = await makeTempFsEngineHarness();
        const fixture = sessionFixture(), actorId = fixture.manifest.actors[0].actorId;
        const contract = informationFixture(actorId, fixture.worldId), info = contract.informationRuntime;
        info.graphs = [];
        const domain = contract.lifecycleRuntime.domains.find(domain => domain.id === 'beliefs');
        const basis = { type: 'object', properties: { reason: { type: 'string', maxLength: 256 } }, required: ['reason'], additionalProperties: false };
        domain.recordSchema.properties.basis = basis; domain.recordSchema.required.push('basis'); domain.initial.basis = { reason: '' };
        domain.commands[0].argsSchema = structuredClone(domain.recordSchema); domain.commands[0].assign.basis = { formula: 'args.basis' };
        info.sources.push({ ...info.sources.find(item => item.id === 'beliefs'), id: 'inspected-beliefs', fields: [['text'], ['basis']] });
        info.views.push({ id: 'cognition-inspector', audience: 'inspector', actorId, sources: ['inspected-beliefs', 'memories'], exposure: ['display'], knowledge: false,
            maxItems: 128, maxCharacters: 32768 });
        info.views.find(view => view.id === 'player').sources = ['beliefs'];
        info.inspection = { projectId: createNativeId('project'), sourceHash: '0'.repeat(64), viewIds: ['cognition-inspector'] };
        fixture.manifest.runtime = { experienceContract: contract };
        source = assertAtriaProjectSource({ format: 'atria-project-source', schemaVersion: 1,
            project: { projectId: info.inspection.projectId, packageId: fixture.manifest.packageId, displayName: 'Author work' },
            package: { name: fixture.manifest.name, version: fixture.manifest.version, actors: fixture.manifest.actors,
                entryPoints: fixture.manifest.entryPoints, capabilities: fixture.manifest.capabilities, permissions: [], runtime: fixture.manifest.runtime },
            worlds: fixture.manifest.worlds, knowledge: fixture.manifest.knowledge,
            knowledgeBindings: fixture.manifest.knowledgeBindings.map(binding => ({ ...binding, source: { ...binding.source, kind: 'project' } })) });
        source = structuredClone(source);
        source.package.runtime.experienceContract.informationRuntime.inspection.sourceHash = cognitionAuthorSourceHash(source);
        fixture.manifest.runtime = source.package.runtime;
        store = new ProjectStore({ directoriesByHandle: handle => handle === h.handle ? h.dirs : { root: path.join(h.dataRoot, handle) } });
        await store.create(h.handle, source);
        f = await installFixture(h, fixture);
        snapshot = await f.core.create(h.handle, f.start);
        for (const [domainId, recordId, value] of [['availability', 'main', { available: true }],
            ['beliefs', 'rumor', { text: '公开猜测', status: 'suspected', channel: 'rumor', basis: { reason: 'PRIVATE BASIS' } }],
            ['memories', 'secret', { text: 'PRIVATE MEMORY' }]]) {
            const initial = contract.lifecycleRuntime.domains.find(domain => domain.id === domainId).initial;
            snapshot = await f.core.applyLifecycleCommand(h.handle, snapshot.session.sessionId, { type: 'lifecycle', invocationId: 'seed-' + domainId,
                action: { kind: 'app.command', domainId, recordId, commandId: 'save', args: { ...initial, ...value } } }, { expectedRevisionId: snapshot.revision.revisionId });
        }
        app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
        app.use(createNativeSessionRouter(() => ({ core: f.core, projectStore: store })));
    });
    afterEach(async () => { await h.cleanup(); });

    test('only the exact owned Project source grants its selected inspector fields and actor state', async () => {
        const before = structuredClone(snapshot);
        const inspected = await inspectCognition(snapshot, h.handle, store, { viewId: 'cognition-inspector' });
        expect(JSON.stringify(inspected)).toContain('PRIVATE BASIS'); expect(JSON.stringify(inspected)).toContain('PRIVATE MEMORY');
        expect(inspected.anchor.revisionId).toBe(snapshot.revision.revisionId); expect(snapshot).toEqual(before);
        await expect(inspectCognition(snapshot, 'foreign', store, { viewId: 'cognition-inspector' })).rejects.toMatchObject({ code: 'native_cognition_inspection_denied' });
        await expect(inspectCognition(snapshot, h.handle, store, { viewId: 'actor' })).rejects.toMatchObject({ code: 'native_cognition_inspection_denied' });
    });

    test('the player consumer and general display never inherit inspector grants', () => {
        const result = cognitionDisclosure(snapshot), text = JSON.stringify(result);
        expect(Object.keys(result.projection)).toEqual(['player']); expect(text).toContain('公开猜测');
        expect(text).not.toContain('PRIVATE BASIS'); expect(text).not.toContain('PRIVATE MEMORY');
        expect(displayInformation(snapshot)).not.toHaveProperty('cognition-inspector');
        expect(projectInformation(snapshot, 'cognition-inspector').items[0].data).toEqual({ text: '公开猜测', basis: { reason: 'PRIVATE BASIS' } });
    });

    test('editing the authoring source or changing its Package binding invalidates an installed inspector grant', async () => {
        const changed = structuredClone(source); changed.package.actors[0].displayName = 'Changed';
        await store.save(h.handle, changed);
        await expect(inspectCognition(snapshot, h.handle, store, { viewId: 'cognition-inspector' })).rejects.toMatchObject({ code: 'native_cognition_inspection_denied' });
        const forged = structuredClone(snapshot); forged.session.packageId = createNativeId('package');
        await expect(inspectCognition(forged, h.handle, store, { viewId: 'cognition-inspector' })).rejects.toMatchObject({ code: 'native_cognition_inspection_denied' });
    });

    test('an installed Package cannot enlarge the granted view while retaining the author source hash', async () => {
        const expanded = structuredClone(snapshot);
        expanded.manifest.runtime.experienceContract.informationRuntime.views.find(view => view.id === 'cognition-inspector').sources.push('world');
        await expect(inspectCognition(expanded, h.handle, store, { viewId: 'cognition-inspector' })).rejects.toMatchObject({ code: 'native_cognition_inspection_denied' });
    });

    test('stale revision, branch and scope epoch cannot be reused as a current inspection anchor', async () => {
        const anchor = projectInformation(snapshot, 'cognition-inspector').anchor;
        await expect(inspectCognition(snapshot, h.handle, store, { viewId: 'cognition-inspector', expectedAnchor: { ...anchor, revisionId: createNativeId('revision') } })).rejects.toThrow('stale');
        expect(() => cognitionDisclosure(snapshot, { ...anchor, branchId: createNativeId('branch') })).toThrow('stale');
        await expect(inspectCognition(snapshot, h.handle, store, { viewId: 'cognition-inspector', expectedAnchor: { ...anchor, scopeEpochs: { session: 99 } } })).rejects.toThrow('stale');
    });

    test('HTTP consumers pin projections, reject caller authority and retain no-store responses', async () => {
        const body = { sessionId: snapshot.session.sessionId, viewId: 'cognition-inspector' };
        const inspected = await request(app).post('/cognition/inspect').send(body);
        expect(inspected.status).toBe(200); expect(inspected.headers['cache-control']).toBe('private, no-store');
        expect(JSON.stringify(inspected.body)).toContain('PRIVATE BASIS');
        const player = await request(app).post('/cognition/display').send({ sessionId: body.sessionId });
        expect(player.status).toBe(200); expect(JSON.stringify(player.body)).not.toContain('PRIVATE');
        expect((await request(app).post('/cognition/inspect').send({ ...body, handle: 'author', sourceHash: source.package.runtime.experienceContract.informationRuntime.inspection.sourceHash })).status).toBe(400);
        expect((await request(app).post('/cognition/inspect').send({ ...body, viewId: 'actor' })).status).toBe(403);
    });

    test('authorized historical inspection reads original values and current reads respect Actor availability', async () => {
        const oldRevisionId = snapshot.revision.revisionId;
        const domain = source.package.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === 'beliefs');
        let current = await f.core.applyLifecycleCommand(h.handle, snapshot.session.sessionId, { type: 'lifecycle', invocationId: 'revise-belief',
            action: { kind: 'app.command', domainId: 'beliefs', recordId: 'rumor', commandId: 'save', args: { ...domain.initial,
                text: '新的猜测', status: 'suspected', channel: 'rumor', basis: { reason: 'REVISED PRIVATE BASIS' } } } }, { expectedRevisionId: oldRevisionId });
        const old = await request(app).post('/cognition/inspect').send({ sessionId: snapshot.session.sessionId, revisionId: oldRevisionId, viewId: 'cognition-inspector' });
        expect(old.status).toBe(200); expect(old.body.anchor.revisionId).toBe(oldRevisionId);
        expect(old.body.items[0].data).toEqual({ text: '公开猜测', basis: { reason: 'PRIVATE BASIS' } });
        const revised = await request(app).post('/cognition/inspect').send({ sessionId: snapshot.session.sessionId, viewId: 'cognition-inspector' });
        expect(revised.body.items[0].data).toEqual({ text: '新的猜测', basis: { reason: 'REVISED PRIVATE BASIS' } });
        const availability = source.package.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === 'availability');
        current = await f.core.applyLifecycleCommand(h.handle, current.session.sessionId, { type: 'lifecycle', invocationId: 'unavailable',
            action: { kind: 'app.command', domainId: 'availability', recordId: 'main', commandId: 'save', args: { ...availability.initial, available: false } } },
        { expectedRevisionId: current.revision.revisionId });
        expect((await inspectCognition(current, h.handle, store, { viewId: 'cognition-inspector' })).items).toEqual([]);
    });

    test('legacy works keep their contract and fail closed on undeclared inspection', async () => {
        const contract = informationFixture();
        expect(assertNativeExperienceContract(contract).informationRuntime).not.toHaveProperty('inspection');
        const legacy = structuredClone(snapshot); delete legacy.manifest.runtime.experienceContract.informationRuntime.inspection;
        await expect(inspectCognition(legacy, h.handle, store, { viewId: 'cognition-inspector' })).rejects.toMatchObject({ code: 'native_cognition_inspection_denied' });
    });

    test.each(['context', 'knowledge', 'unbound-view', 'bad-source', 'extra-field'])('strict inspector contract rejects %s', variant => {
        const contract = structuredClone(source.package.runtime.experienceContract), info = contract.informationRuntime;
        const view = info.views.find(view => view.audience === 'inspector');
        if (variant === 'context') view.exposure.push('context');
        if (variant === 'knowledge') view.knowledge = true;
        if (variant === 'unbound-view') info.inspection.viewIds = ['player'];
        if (variant === 'bad-source') info.inspection.sourceHash = 'untrusted';
        if (variant === 'extra-field') info.inspection.allowOwner = true;
        expect(() => assertNativeExperienceContract(contract)).toThrow();
    });
});

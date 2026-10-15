import express from 'express';
import request from 'supertest';
import path from 'node:path';
import { csrfSync } from 'csrf-sync';
import { createNativeOrchestrationRouter } from '../../src/endpoints/native-orchestration.js';
import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { RpRunControl } from '../../src/native/rp-run-control.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const command = () => createNativeId('orchestrationCommand');

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s original source Plan Binding HTTP', (_name, make) => {
    let h, app, service, session, base, project, task, projectServices, rpControl, chats, selector, planRef, csrfToken;
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        const directories = handle => handle === h.handle ? h.dirs : { ...h.dirs, root: path.join(h.dataRoot, 'other-owner') };
        if (h.engine._directoriesByHandle) h.engine._directoriesByHandle = directories;
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: directories });
        session = await installFixture(h); base = await session.core.create(h.handle, session.start);
        projectServices = services(h); projectServices.studio._projects._directoriesByHandle = directories;
        const source = projectSource(); project = await projectServices.studio.createProject(h.handle, source);
        task = await projectServices.agent.createTask(h.handle, source.project.projectId, { intent: 'Choose an exact Plan', baseRevision: project.revision.revision });
        rpControl = new RpRunControl({ engine: h.engine }); chats = new ChatRepo({ engine: h.engine });
        const locator = { charDir: 'Actor', name: 'empty', isGroup: false, groupId: null };
        await chats.save(h.handle, locator.charDir, locator.name, {}, [], null);
        const { controlId } = await rpControl.bind(h.handle, locator);
        selector = { session: { domain: 'native_session', sessionId: base.session.sessionId, entryPointId: base.session.entryPointId },
            project: { domain: 'project', projectId: source.project.projectId, taskId: task.taskId }, rp: { domain: 'rp_chat', controlId } };
        service = createOrchestrationAuthoringService(h.engine, { sessionCore: session.core, studio: projectServices.studio, projectAgent: projectServices.agent, rpControl });
        const created = await service.plans.create(h.handle, command(), planFixture());
        const expected = { planId: created.planId, expectedDraftVersion: created.draftVersion, expectedDefinitionHash: created.definitionHash };
        const report = await service.plans.validate(h.handle, expected);
        ({ planRef } = await service.plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(report) }));
        const csrf = csrfSync({ getTokenFromState: req => req.session.csrfToken,
            storeTokenInState: (req, token) => { req.session.csrfToken = token; }, getTokenFromRequest: req => req.get('X-CSRF-Token') });
        const sessionState = {}; csrfToken = csrf.generateToken({ session: sessionState });
        app = express(); app.use(express.json());
        app.use((req, _res, next) => { req.session = sessionState; if (req.get('X-Test-Owner')) req.user = { profile: { handle: req.get('X-Test-Owner'), enabled: true } }; next(); });
        app.use(csrf.csrfSynchronisedProtection);
        app.use('/api/native/orchestration', createNativeOrchestrationRouter(() => service));
        app.use((error, _req, res, _next) => res.status(error.statusCode ?? 500).json({ error: error.code }));
    });
    afterEach(async () => { setReadOnly(false); await h?.engine.close(); await h?.cleanup(); });
    const read = (selected, owner = h.handle) => request(app).post('/api/native/orchestration/bindings/get').set('X-Test-Owner', owner)
        .set('X-CSRF-Token', csrfToken).send({ schemaVersion: 1, body: { sourceSelector: selected } });
    const save = (selected, expectedVersion = null, options = {}) => request(app).post('/api/native/orchestration/bindings/save')
        .set('X-Test-Owner', options.owner ?? h.handle).set('X-CSRF-Token', options.csrf ?? csrfToken).set('X-Atria-Host-Boot-Id', options.boot ?? service.hostBootId)
        .send({ schemaVersion: 1, commandId: options.commandId ?? command(), expectedHostBootId: options.boot ?? service.hostBootId,
            body: { sourceSelector: selected, planRef, expectedVersion } });
    async function sourceDigest() {
        const chat = await chats.get(h.handle, 'Actor', 'empty');
        return hashNativeDocument({ session: await session.core.observe(h.handle, base.session.sessionId),
            project: await projectServices.studio.observeRevision(h.handle, selector.project.projectId),
            task: await projectServices.repository.get(h.handle, selector.project.projectId, task.taskId),
            rp: await rpControl.status(h.handle, selector.rp.controlId), chat: { header: chat.header, body: chat.body } });
    }

    test('three original domains and nullable domain selectors save/read by CAS without changing their source', async () => {
        const before = await sourceDigest();
        for (const selected of [selector.session, { ...selector.session, entryPointId: null }, selector.project, { ...selector.project, taskId: null }, selector.rp]) {
            expect((await read(selected).expect(200)).body.outcome).toBeNull();
            const commandId = command(), first = (await save(selected, null, { commandId }).expect(200)).body.outcome;
            expect(first).toMatchObject({ version: 0, sourceSelector: selected, planRef, changedBy: { handle: h.handle } });
            expect((await save(selected, null, { commandId }).expect(200)).body.outcome).toEqual(first);
            expect((await read(selected).expect(200)).body.outcome).toEqual(first);
            await save(selected).expect(409);
            expect((await save(selected, 0).expect(200)).body.outcome.version).toBe(1);
        }
        expect(await sourceDigest()).toBe(before);
    });

    test('RP binding reads an empty registered chat inside the real Host transaction without queue deadlock', async () => {
        let timer;
        try {
            await expect(Promise.race([save(selector.rp).expect(200), new Promise((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error('RP binding transaction did not complete')), 2000);
            })])).resolves.toHaveProperty('status', 200);
        } finally { clearTimeout(timer); }
    });

    test('auth, original CSRF, Host boot, owner boundary and read-only fences apply without opening Run routes', async () => {
        await request(app).post('/api/native/orchestration/bindings/get').set('X-CSRF-Token', csrfToken).send({ schemaVersion: 1, body: { sourceSelector: selector.session } }).expect(401);
        await save(selector.session, null, { csrf: 'forged' }).expect(403);
        await save(selector.session, null, { boot: 'previous-boot' }).expect(409);
        await save(selector.session).expect(200);
        await read(selector.session, 'another-owner').expect(404);
        await read(selector.rp, 'another-owner').expect(404);
        await read({ ...selector.project, taskId: null }, 'another-owner').expect(404);
        setReadOnly(true);
        await save(selector.session, 0).expect(503);
        expect((await read(selector.session).expect(200)).body.outcome.version).toBe(0);
        await request(app).post('/api/native/orchestration/runs/start').set('X-Test-Owner', h.handle).set('X-CSRF-Token', csrfToken).send({}).expect(404);
    });

    test.each(['session', 'entrypoint', 'project', 'task', 'wrong-project-task', 'rp'])('%s absent or mismatched source cannot save or read bindings', async problem => {
        let selected;
        if (problem === 'session') selected = { ...selector.session, sessionId: createNativeId('session') };
        if (problem === 'entrypoint') selected = { ...selector.session, entryPointId: createNativeId('entryPoint') };
        if (problem === 'project') selected = { ...selector.project, projectId: createNativeId('project'), taskId: null };
        if (problem === 'task') selected = { ...selector.project, taskId: 'absent-task' };
        if (problem === 'wrong-project-task') {
            const other = projectSource(); await projectServices.studio.createProject(h.handle, other);
            selected = { ...selector.project, projectId: other.project.projectId };
        }
        if (problem === 'rp') selected = { ...selector.rp, controlId: createNativeId('rpControl') };
        expect((await save(selected)).status).toBe(404); expect((await read(selected)).status).toBe(404);
    });

    test('an RP control whose registered chat header has changed cannot bind and is not repaired', async () => {
        const commandId = command(); await save(selector.rp, null, { commandId }).expect(200);
        await chats.save(h.handle, 'Actor', 'empty', { chat_metadata: { nativeControlId: createNativeId('rpControl') } }, [], null);
        const before = await sourceDigest();
        await save(selector.rp, 0).expect(404); await read(selector.rp).expect(404);
        await save(selector.rp, null, { commandId }).expect(404);
        expect(await sourceDigest()).toBe(before);
    });

    test('unwired domain authorities remain unavailable rather than accepting selections', async () => {
        service = createOrchestrationAuthoringService(h.engine);
        for (const selected of Object.values(selector)) { expect((await save(selected)).status).toBe(503); expect((await read(selected)).status).toBe(503); }
    });

    test('saving an existing source never accepts a missing exact Plan revision', async () => {
        planRef = { ...planRef, planRevisionId: createNativeId('orchestrationRevision') };
        await save(selector.session).expect(404);
        expect((await read(selector.session).expect(200)).body.outcome).toBeNull();
    });
});

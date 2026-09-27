import fs from 'node:fs';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionFixture, services } from './helpers/session-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';

describe.each(CONTRACT_HARNESSES)('P4 atomic Opening - $name', ({ make }) => {
    let h, f, base;
    beforeEach(async () => {
        h = await make(); f = { ...sessionFixture(), ...services(h) };
        const { lifecycleRuntime } = lifecycleFixture(); lifecycleRuntime.automations = []; lifecycleRuntime.workflows = [];
        const ui = JSON.parse(fs.readFileSync(new URL('./fixtures/component-v2-opening.json', import.meta.url), 'utf8'));
        ui.actions.start.steps.unshift({ op: 'command.dispatch', commandId: 'begin', args: { name: { expr: 'ui.name' } } });
        f.manifest.runtime = { game: { logic: 'logic.json' }, experience: { mode: 'component', componentModelVersion: 2, component: 'ui.json' },
            experienceContract: { schemaVersion: 1, capabilities: [], dataResources: [], lifecycleRuntime } };
        const logic = { schemaVersion: 2, mutations: [{ id: 'begin', event: 'opening.began', argsSchema: { type: 'object', additionalProperties: false,
            required: ['name'], properties: { name: { type: 'string' } } }, assign: { hp: { formula: 'world.hp + 1' } } }] };
        const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map([['ui.json', Buffer.from(JSON.stringify(ui))], ['logic.json', Buffer.from(JSON.stringify(logic))]]), assetPayloads: new Map() });
        await f.packageInstaller.install(h.handle, archive);
        base = await f.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
    });
    afterEach(async () => h.cleanup());
    const apply = async (action, invocationId = action.kind) => f.core.applyLifecycleCommand(h.handle, base.session.sessionId,
        { type: 'lifecycle', action, invocationId }, { expectedRevisionId: base.revision.revisionId });
    const progress = (overrides = {}) => ({ kind: 'opening.progress', step: 'review', history: ['setup'], values: { name: 'Ada', path: 'explorer' }, variant: null, ...overrides });
    const complete = () => ({ kind: 'opening.complete', preferences: { compact: false }, confirmation: { commandId: 'begin', args: { name: 'Ada' } },
        submission: { text: 'Name: Ada; Path: explorer' } });

    test('conditional progress resumes across restart; completion commits facts, canonical input and once-only marker together', async () => {
        base = await apply(progress());
        const saved = base;
        f.core = services(h).core;
        expect((await f.core.load(h.handle, base.session.sessionId)).states.atri_lifecycle.opening).toMatchObject({ step: 'review', history: ['setup'], values: { name: 'Ada' }, completed: false });
        const next = await apply(complete(), 'confirm');
        expect(next.states.atri_world_state.worlds[f.worldId].state.hp).toBe(9);
        expect(next.states.atri_lifecycle.opening.completed).toBe(true);
        expect(next.timeline.at(-1)).toMatchObject({ role: 'user', content: 'Name: Ada; Path: explorer' });
        expect(next.timeline).toHaveLength(2);
        expect((await apply(complete(), 'confirm')).revision).toEqual(next.revision);
        const fork = await f.core.forkBranch(h.handle, next.session.sessionId, { revisionId: saved.revision.revisionId, expectedRevisionId: next.revision.revisionId });
        expect(fork.states.atri_lifecycle.opening.completed).toBe(false);
        expect(fork.states.atri_world_state.worlds[f.worldId].state.hp).toBe(8);
        expect(fork.timeline).toHaveLength(1);
    });
    test('server enforces conditional navigation, typed setup values, no forged history or malformed draft', async () => {
        await expect(apply(progress({ values: { name: '', path: 'explorer' } }))).rejects.toThrow();
        await expect(apply(progress({ history: [] }))).rejects.toThrow();
        await expect(apply(progress({ values: { name: 7, path: 'explorer' } }))).rejects.toThrow();
        await expect(apply(progress({ values: { name: 'Ada', injected: true } }))).rejects.toThrow();
        expect((await f.core.load(h.handle, base.session.sessionId)).revision).toEqual(base.revision);
    });
    test('forged command args or canonical input never publish partial authority', async () => {
        base = await apply(progress());
        const wrong = complete(); wrong.confirmation.args.name = 'forged';
        await expect(apply(wrong)).rejects.toThrow('pinned');
        wrong.confirmation.args.name = 'Ada'; wrong.submission.text = 'forged';
        await expect(apply(wrong)).rejects.toThrow('pinned');
        const current = await f.core.load(h.handle, base.session.sessionId);
        expect(current.revision).toEqual(base.revision);
        expect(current.states.atri_world_state.worlds[f.worldId].state.hp).toBe(8);
        expect(current.timeline).toHaveLength(1);
    });
    test('back navigation preserves saved drafts and completion is terminal for new requests', async () => {
        base = await apply(progress(), 'forward');
        base = await apply(progress({ step: 'setup', history: [] }), 'back');
        base = await apply(progress(), 'forward-again');
        base = await apply(complete(), 'confirm');
        await expect(apply(complete(), 'confirm-again')).rejects.toThrow('complete');
        await expect(apply(progress(), 'edit-after')).rejects.toThrow('complete');
    });
});

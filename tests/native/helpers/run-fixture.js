import { authorityCandidateFixture } from './authority-candidate-fixture.js';
import { services } from './session-fixture.js';
import { closed } from './authority-fixture.js';
import { buildAtriaPackageContainer } from '../../../src/native/index.js';
import { seedGenerationProfiles } from './generation-fixture.js';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../../src/native/adapters/http-generation-provider.js';

export async function runFixture(h, endpoint, change = () => {}) {
    const f = authorityCandidateFixture();
    const { contract, logic } = f;
    contract.capabilities.push(...['story-start', 'run-policy', 'generation-budget'].map(id => ({ id, version: 1, required: true })));
    contract.storyStart = { schemaVersion: 1, transactionId: 'story.begin', narrativeField: 'opening' };
    contract.runPolicy = { schemaVersion: 1, deathTransactions: ['note.update'], deathOutcome: 'death' };
    contract.generationBudget = { schemaVersion: 1, resolverAttempts: 2, narratorAttempts: 2, turnAttempts: 4,
        backgroundAttempts: 2, backgroundWindowTurns: 4, backgroundPeriodTurns: 20, backgroundPeriodAttempts: 10,
        turnCounter: { domainId: 'progress', recordId: 'main', field: 'effectiveTurns' } };
    const counter = closed({ effectiveTurns: { type: 'integer', minimum: 0, maximum: 1000000 } });
    contract.lifecycleRuntime.domains.push({ ...structuredClone(contract.lifecycleRuntime.domains[0]), id: 'progress',
        recordSchema: counter, initial: { effectiveTurns: 0 }, commands: [{ id: 'advance', argsSchema: counter,
            event: 'progress.changed', assign: { effectiveTurns: { formula: 'args.effectiveTurns' } } }] });
    contract.taskRuntime = { schemaVersion: 1, slots: [], tasks: [], turn: { policy: 'authority-first', stages: [] } };
    contract.informationRuntime.views.push({ id: 'narrator.notes', audience: 'narrator', sources: ['public.notes'], exposure: ['context'], knowledge: false, memory: false, maxItems: 64, maxCharacters: 16384 });
    const tx = logic.transactions[0];
    tx.resolution = { kind: 'bounded_fortune', sides: 1000, cases: [{ id: 'fatal', when: 'args.amount == 8', outcome: 'death' }], fallback: 'success' };
    tx.receipt.schema.properties.roll = { type: 'integer', minimum: 1, maximum: 1000 }; tx.receipt.schema.required.push('roll'); tx.receipt.projection.roll = { formula: 'resolution.roll' };
    tx.reads.push({ id: 'progress', domainId: 'progress', recordId: 'main', fields: ['effectiveTurns'] });
    tx.effects = tx.effects.filter(item => item.kind !== 'workflow.transition');
    tx.effects.push({ kind: 'app.command', domainId: 'progress', commandId: 'advance', recordId: 'main', args: { effectiveTurns: { formula: 'reads.progress.effectiveTurns + 1' } } });
    logic.transactions.push({ id: 'story.begin', verb: 'begin_story', intent: { expose: false, description: 'Confirm the authored start.' },
        inputSchema: closed({ mode: { type: 'string', enum: ['ordinary', 'ironman'], maxLength: 16 }, name: { type: 'string', maxLength: 64 } }),
        reads: [], validators: [{ id: 'name', formula: 'args.name != "invalid"', error: 'Invalid combination' }],
        resolution: { kind: 'deterministic', cases: [], fallback: 'started' },
        effects: ['notes', 'other'].map(domainId => ({ kind: 'app.command', domainId, commandId: 'save', recordId: 'main', args: { text: { formula: 'args.name' } } })).concat([
            { kind: 'app.command', domainId: 'progress', commandId: 'advance', recordId: 'main', args: { effectiveTurns: 0 } }]),
        derivedPublications: ['notes.publication'], receipt: { schema: closed({ opening: { type: 'string', maxLength: 1024 } }), projection: { opening: 'The harbor wakes.' }, maxBytes: 4096 } });
    f.base.manifest.entryPoints[0].initialTimeline = [];
    change(f); f.sync();
    const svc = services(h);
    const { archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() });
    await svc.packageInstaller.install(h.handle, archive);
    let base = await svc.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
    base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId,
        { type: 'lifecycle', invocationId: 'ready', action: { kind: 'experience.ready' } }, { expectedRevisionId: base.revision.revisionId });
    const seeded = await seedGenerationProfiles({ ...h, endpoint, roles: ['narrator', 'intent_resolver'] });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
        providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
    const begin = (mode = 'ordinary', name = 'Ada', invocationId = 'begin') => svc.core.beginStory(h.handle, base.session.sessionId,
        { input: { mode, name }, invocationId, expectedRevisionId: base.revision.revisionId });
    return { ...f, ...svc, base, begin, host, seeded, archive, selection: { transactionId: tx.id, input: { target: 'main', text: 'updated', amount: 2 } } };
}

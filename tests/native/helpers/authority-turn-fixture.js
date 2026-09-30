import { authorityCandidateFixture } from './authority-candidate-fixture.js';
import { services } from './session-fixture.js';
import { buildAtriaPackageContainer } from '../../../src/native/index.js';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { seedGenerationProfiles } from './generation-fixture.js';
import { createHttpGenerationProvider } from '../../../src/native/adapters/http-generation-provider.js';

export async function authorityTurnFixture(h, endpoint, change = () => {}) {
    const f = authorityCandidateFixture();
    f.contract.capabilities[0].required = false; // Staged Host gate stays closed until integration.
    f.contract.taskRuntime = { schemaVersion: 1, slots: [], tasks: [], turn: { policy: 'authority-first', stages: [] } };
    f.contract.informationRuntime.views.push({ id: 'narrator.notes', audience: 'narrator', sources: ['public.notes'], exposure: ['context'], knowledge: false, memory: false, maxItems: 64, maxCharacters: 16384 });
    f.logic.transactions[0].reads.push({ id: 'secret', domainId: 'other', recordId: 'main', fields: ['text'] });
    f.logic.transactions[0].resolution = { kind: 'bounded_fortune', sides: 1000, cases: [], fallback: 'success' };
    f.logic.transactions[0].receipt.schema.properties.roll = { type: 'integer', minimum: 1, maximum: 1000 };
    f.logic.transactions[0].receipt.schema.required.push('roll');
    f.logic.transactions[0].receipt.projection.roll = { formula: 'resolution.roll' };
    change(f); f.sync();
    const svc = services(h);
    const { archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() });
    await svc.packageInstaller.install(h.handle, archive);
    let base = await svc.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
    const command = async (invocationId, action) => { base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId,
        { type: 'lifecycle', invocationId, action }, { expectedRevisionId: base.revision.revisionId }); };
    await command('ready', { kind: 'experience.ready' });
    for (const domainId of ['notes', 'other']) await command('seed-' + domainId, { kind: 'app.command', domainId, commandId: 'save', recordId: 'main', args: { text: domainId === 'other' ? 'PRIVATE READ SENTINEL' : 'old public note' } });
    base = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Update the note.' });
    const seeded = await seedGenerationProfiles({ ...h, endpoint, roles: ['narrator', 'intent_resolver'] });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
        providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
    const input = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, invocationId: 'authority-turn', userInput: base.timeline.at(-1).content, slotBindings: {} };
    return { ...f, ...svc, host, base, input, seeded, selection: { transactionId: f.request.transactionId, input: f.request.input } };
}

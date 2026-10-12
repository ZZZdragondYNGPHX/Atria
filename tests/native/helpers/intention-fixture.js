import { createNativeId } from '../../../src/native/index.js';
import { sessionFixture, installFixture } from './session-fixture.js';
import { informationFixture } from './information-fixture.js';
import { lifecycleFixture } from './lifecycle-fixture.js';
import { projectInformation } from '../../../public/shared/native-information-runtime.js';
import { informationItemFingerprint } from '../../../public/shared/native-cognition-runtime.js';

const string = maxLength => ({ type: 'string', maxLength });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export function intentionSchema() {
    return object({ text: string(12000), actor: string(64), status: string(32), goalId: string(64),
        commitmentIds: { type: 'array', items: string(256), maxItems: 16 }, priority: { type: 'integer', minimum: 0, maximum: 100 }, conflictKey: string(128),
        expiresAt: { type: 'integer', minimum: 0 }, basis: object({ viewId: string(128),
            anchor: object({ sessionId: string(64), packageVersionId: string(64), revisionId: string(64), branchId: string(64), scopeEpochs: object({ session: { type: 'integer', minimum: 0 } }) }),
            sourceRefs: { type: 'array', maxItems: 16, items: object({ itemId: string(256), fingerprint: string(64) }) } }) });
}

export async function installIntentionFixture(h, { taskWriter = false } = {}) {
    const fixture = sessionFixture(), actorId = fixture.manifest.actors[0].actorId, otherActorId = createNativeId('actor');
    fixture.manifest.actors[0].displayName = '阿岚';
    fixture.manifest.actors.push({ actorId: otherActorId, displayName: '沈墨' });
    fixture.manifest.entryPoints[0].actorIds.push(otherActorId);
    const contract = informationFixture(actorId, fixture.worldId), info = contract.informationRuntime;
    info.graphs = [];
    const defaultValue = { text: 'Author intention', actor: actorId, status: 'active', goalId: '', commitmentIds: [], priority: 50, conflictKey: '', expiresAt: 0,
        basis: { viewId: 'actor', anchor: { sessionId: 'ses_' + 'a'.repeat(32), packageVersionId: 'pkgv_' + 'a'.repeat(32), revisionId: 'rev_' + 'a'.repeat(32), branchId: 'br_' + 'a'.repeat(32), scopeEpochs: { session: 0 } }, sourceRefs: [] } };
    for (const [domainId, semantic] of [['desires', 'desire'], ['intentions', 'intention']]) {
        contract.lifecycleRuntime.domains.push({ id: domainId, scopeId: 'session', schemaVersion: 1, recordSchema: intentionSchema(), initial: defaultValue,
            commands: [{ id: 'save', argsSchema: intentionSchema(), event: 'cognition.saved', assign: Object.fromEntries(Object.keys(defaultValue).map(key => [key, { formula: 'args.' + key }])) }],
            retention: { maxItems: 32, maxLogicalBytes: 262144, keepPinned: true, keepReferenced: true } });
        info.sources.push({ id: domainId, kind: 'application', semantic, scopeId: 'session', domainId, actorField: 'actor', statusField: 'status',
            fields: ['text', 'goalId', 'commitmentIds', 'priority', 'conflictKey', 'expiresAt'].map(field => [field]) });
    }
    const contextSources = ['beliefs', 'loops', 'memories', 'desires', 'intentions'];
    info.views.find(view => view.id === 'actor').sources = contextSources;
    info.views.find(view => view.id === 'pov').sources = contextSources;
    Object.assign(info.views.find(view => view.id === 'player'), { actorId, sources: ['beliefs', 'loops', 'desires', 'intentions'] });
    info.actors.push({ id: otherActorId, scopeId: 'session' });
    info.views.push({ ...info.views.find(view => view.id === 'actor'), id: 'other-actor', actorId: otherActorId });
    info.narration = { mode: 'limited', contextViewId: 'pov', disclosureViewId: 'player' };
    contract.taskRuntime = lifecycleFixture().taskRuntime;
    contract.taskRuntime.tasks[0].context = ['input', 'projection'];
    info.views.push({ ...info.views.find(view => view.id === 'actor'), id: 'intent-task', audience: 'task', taskId: 'summarize' });
    const variant = contract.taskRuntime.tasks[0].variants[0];
    if (taskWriter) {
        contract.taskRuntime.tasks[0].resultPolicy = { resultClass: 'declared_app_command', sink: 'app_command' };
        variant.outputSchema = intentionSchema();
        variant.resultBinding = { kind: 'app.command', domainId: 'intentions', recordId: 'task-plan', commandId: 'save' };
        contract.lifecycleRuntime.automations = [{ id: 'on-ready', scopeId: 'session', trigger: { kind: 'experience.ready' },
            action: { kind: 'task', taskId: 'summarize', variantId: 'default', input: {} }, maxCatchUp: 1 }];
    }
    fixture.manifest.resources = [
        { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: variant.prompt.revision,
            displayName: 'Intent fixture', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
        { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: variant.generation.revision,
            displayName: 'Intent fixture', output: { maxTokens: 128 } } },
    ].map(item => ({ ...item, origin: { scope: 'package', packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId } }));
    fixture.manifest.runtime = { experienceContract: contract };
    const installed = await installFixture(h, fixture);
    let snapshot = await installed.core.create(h.handle, installed.start), serial = 0;
    const write = async (domainId, recordId, value) => {
        const domain = contract.lifecycleRuntime.domains.find(domain => domain.id === domainId);
        snapshot = await installed.core.applyLifecycleCommand(h.handle, snapshot.session.sessionId, { type: 'lifecycle', invocationId: 's17-seed-' + ++serial,
            action: { kind: 'app.command', domainId, recordId, commandId: 'save', args: { ...domain.initial, ...value } } }, { expectedRevisionId: snapshot.revision.revisionId });
        return snapshot;
    };
    const plan = async (recordId, extra = {}, domainId = 'intentions') => {
        const actor = extra.actor ?? actorId, viewId = actor === actorId ? 'actor' : 'other-actor';
        const projection = projectInformation(snapshot, viewId, { purpose: 'context', includeRollups: false });
        const commitmentIds = extra.commitmentIds ?? (actor === actorId ? ['loops:promise'] : []);
        const ids = new Set([actor === actorId ? 'beliefs:rumor' : 'beliefs:other', ...commitmentIds]);
        return write(domainId, recordId, { ...defaultValue, actor, text: actor === actorId ? '阿岚打算在下次被问到时归还借来的书。' : '沈墨打算保留自己的推断。',
            commitmentIds, basis: { viewId, anchor: projection.anchor, sourceRefs: projection.items.filter(item => ids.has(item.id))
                .map(item => ({ itemId: item.id, fingerprint: informationItemFingerprint(item) })) }, ...extra });
    };
    await write('availability', 'main', { available: true });
    await write('beliefs', 'rumor', { text: '阿岚听说借书人将在下次询问时要求归还，但尚未证实。', status: 'suspected', channel: 'rumor' });
    await write('beliefs', 'other', { actor: otherActorId, text: '沈墨怀疑有人跟踪自己。', status: 'believed', channel: 'inference' });
    await write('loops', 'promise', { status: 'open', text: '阿岚承诺在下次被问到时归还蓝封面书。' });
    await write('memories', 'private', { text: '阿岚私下曾犹豫是否履约。' });
    return { ...installed, actorId, otherActorId, write, plan, current: () => snapshot };
}

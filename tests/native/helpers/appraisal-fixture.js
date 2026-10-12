import { installIntentionFixture } from './intention-fixture.js';
import { APPRAISAL_INPUT_SCHEMA, APPRAISAL_OUTPUT_SCHEMA, appraisalStateSchema } from '../../../public/shared/native-appraisal-contract.js';
import { authorityFixture } from './authority-fixture.js';

const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = maxLength => ({ type: 'string', maxLength });
const authorMeta = { origin: 'author', invocationId: 'author', taskId: 'author', variantId: 'author', profileId: 'default', profileRevision: 'v1', modelProfileId: 'author',
    modelProfileHash: '0'.repeat(64), requestSnapshotHash: '0'.repeat(64), previousHash: '0'.repeat(64), promptId: 'author', promptRevision: 'v1', generationId: 'author', generationRevision: 'v1' };

export const appraisalCandidate = f => ({ significance: 'appraise', rationale: '澄清事件可能改变阿岚的担忧及对沈墨的评价；这是阿岚的解释。', updates: [
    { kind: 'emotion', dimension: 'worry', target: '', delta: -10, text: '阿岚对这段传闻的担忧有所减轻。', sourceItemIds: ['events:contact'] },
    { kind: 'relationship', dimension: 'trust', target: f.otherActorId, delta: -5, text: '阿岚对沈墨的说法仍有所保留。', sourceItemIds: ['events:contact'] },
] });

export async function installAppraisalFixture(h, { publicAppraisal = false, importance = 'high', promptBody = null, configure = null } = {}) {
    const f = await installIntentionFixture(h, { configure: setup => {
        const { fixture, contract, actorId, otherActorId } = setup, info = contract.informationRuntime;
        const schema = object({ actor: string(64), target: string(64), text: string(2048), importance: { ...string(32), enum: ['low', 'high'] } });
        const initial = { actor: actorId, target: otherActorId, text: '', importance: 'low' };
        contract.lifecycleRuntime.domains.push({ id: 'events', scopeId: 'session', schemaVersion: 1, recordSchema: schema, initial,
            commands: [{ id: 'save', argsSchema: schema, event: 'contact.observed', assign: Object.fromEntries(Object.keys(initial).map(key => [key, { formula: 'args.' + key }])) }],
            retention: { maxItems: 32, maxLogicalBytes: 65536, keepPinned: true, keepReferenced: true } });
        info.sources.push({ id: 'events', kind: 'application', semantic: 'truth', scopeId: 'session', domainId: 'events', actorField: 'actor', fields: [['text'], ['target'], ['importance']] });
        for (const [id, semantic] of [['emotions', 'emotion'], ['relations', 'relationship']]) {
            const recordSchema = appraisalStateSchema(), value = { actor: actorId, target: semantic === 'emotion' ? '' : otherActorId, dimension: semantic === 'emotion' ? 'worry' : 'trust',
                level: semantic === 'emotion' ? 40 : 0, status: 'active', text: 'Author baseline', rationale: '', appraisal: authorMeta,
                basis: { viewId: 'actor', anchor: { sessionId: 'ses_' + 'a'.repeat(32), packageVersionId: 'pkgv_' + 'a'.repeat(32), revisionId: 'rev_' + 'a'.repeat(32), branchId: 'br_' + 'a'.repeat(32), scopeEpochs: { session: 0 } }, sourceRefs: [] } };
            contract.lifecycleRuntime.domains.push({ id, scopeId: 'session', schemaVersion: 1, recordSchema, initial: value,
                commands: [{ id: 'save', argsSchema: recordSchema, event: 'appraisal.saved', assign: Object.fromEntries(Object.keys(value).map(key => [key, { formula: 'args.' + key }])) }],
                retention: { maxItems: 32, maxLogicalBytes: 262144, keepPinned: true, keepReferenced: true } });
            info.sources.push({ id, kind: 'application', semantic, scopeId: 'session', domainId: id, actorField: 'actor', statusField: 'status', fields: [['text'], ['target'], ['dimension'], ['level'], ['rationale']] });
            info.sources.push({ ...info.sources.at(-1), id: 'public-' + id, fields: [['text']] });
        }
        for (const view of info.views.filter(view => view.exposure.includes('context'))) view.sources = [...view.sources, 'events', 'emotions', 'relations', 'public-emotions', 'public-relations'];
        const player = info.views.find(view => view.id === 'player'); player.sources.push('events');
        if (publicAppraisal) player.sources.push('public-emotions', 'public-relations');
        const task = contract.taskRuntime.tasks[0], variant = task.variants[0];
        task.inputSchema = APPRAISAL_INPUT_SCHEMA; task.resultPolicy = { resultClass: 'declared_app_command', sink: 'app_command' };
        variant.outputSchema = APPRAISAL_OUTPUT_SCHEMA;
        variant.resultBinding = { kind: 'cognition.appraise', viewId: 'intent-task', eventSourceIds: ['events'], eventGate: { field: 'importance', equals: 'high' },
            emotion: { sourceId: 'emotions', domainId: 'emotions', commandId: 'save' }, relationship: { sourceId: 'relations', domainId: 'relations', commandId: 'save' },
            profile: { id: 'author-s18', revision: 'v1', emotionDimensions: ['worry', 'relief'], relationshipDimensions: ['trust', 'affinity'], maxDelta: 30 } };
        contract.lifecycleRuntime.workflows = [{ id: 'appraisal', scopeId: 'session', initial: 'idle',
            nodes: [{ id: 'idle', kind: 'user_gate' }, { id: 'observe', kind: 'model_task', action: { kind: 'task', taskId: task.id, variantId: variant.id, input: { eventItemId: 'events:contact' } } }],
            transitions: [{ id: 'begin', from: 'idle', to: 'observe' }] }];
        const progressSchema = object({ effectiveTurns: { type: 'integer', minimum: 0, maximum: 1000000 } });
        contract.lifecycleRuntime.domains.push({ id: 'progress', scopeId: 'session', schemaVersion: 1, recordSchema: progressSchema, initial: { effectiveTurns: 0 },
            commands: [{ id: 'save', argsSchema: progressSchema, event: 'progress.changed', assign: { effectiveTurns: { formula: 'args.effectiveTurns' } } }],
            retention: { maxItems: 32, maxLogicalBytes: 65536, keepPinned: true, keepReferenced: true } });
        contract.capabilities.push({ id: 'generation-budget', version: 1, required: true });
        contract.capabilities.push({ id: 'authority-transaction', version: 1, required: true });
        contract.authorityRuntime = { ...authorityFixture().contract.authorityRuntime, intentObservation: { viewIds: ['player'], maxItems: 64, maxBytes: 16384 } };
        fixture.manifest.runtime = { game: { logic: 'logic.json' } };
        fixture.sourceFiles = new Map([['logic.json', Buffer.from(JSON.stringify({ schemaVersion: 3, commands: [], rules: [], interpretations: [], reducers: [], derivedPublications: [],
            transactions: [{ id: 'observe', verb: 'observe', inputSchema: object({}), intent: { expose: true, description: 'Observe the current state.' }, reads: [], validators: [],
                resolution: { kind: 'deterministic', cases: [], fallback: 'observed' }, effects: [], derivedPublications: [], receipt: { schema: object({}), projection: {}, maxBytes: 1024 } }] }))]]);
        contract.generationBudget = { schemaVersion: 1, resolverAttempts: 2, narratorAttempts: 2, turnAttempts: 4, backgroundAttempts: 2,
            backgroundWindowTurns: 4, backgroundPeriodTurns: 20, backgroundPeriodAttempts: 3, turnCounter: { domainId: 'progress', recordId: 'main', field: 'effectiveTurns' } };
        if (promptBody) {
            const prompt = fixture.manifest.resources.find(item => item.resourceType === 'core.prompt-program').resource;
            const moduleId = 'pmod_' + 'e'.repeat(32);
            prompt.stages[0].moduleRefs = [{ resourceType: 'core.prompt-module', scope: 'package', packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId, resourceId: moduleId, revision: 'v1' }];
            fixture.manifest.resources.push({ resourceType: 'core.prompt-module', resource: { schemaVersion: 1, promptModuleId: moduleId, revision: 'v1', displayName: 'Event appraisal', target: 'system.foundation', stages: ['stage.main'], body: promptBody },
                origin: { scope: 'package', packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId } });
        }
        configure?.(setup);
    } });
    await f.write('events', 'contact', { text: '沈墨向阿岚澄清先前关于借书的传闻不准确，阿岚听到了这一澄清。', importance });
    await f.write('progress', 'main', { effectiveTurns: 4 });
    const ready = async () => {
        const current = f.current();
        return f.core.applyLifecycleCommand(h.handle, current.session.sessionId, { type: 'lifecycle', invocationId: 's18-ready', action: { kind: 'experience.ready' } }, { expectedRevisionId: current.revision.revisionId });
    };
    const queue = async () => {
        const current = await f.core.load(h.handle, f.current().session.sessionId);
        return f.core.applyLifecycleCommand(h.handle, current.session.sessionId, { type: 'lifecycle', invocationId: 's18-queue', action: { kind: 'workflow.transition', workflowId: 'appraisal', transitionId: 'begin' } }, { expectedRevisionId: current.revision.revisionId });
    };
    return { ...f, ready, queue };
}

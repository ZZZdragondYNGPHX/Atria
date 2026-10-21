import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';
import { jsonTextFragment } from './json-fragment.js';
import { planRefSchema } from './orchestration-actions.js';

const base = '/api/native/generation';
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/), hash = z.string().regex(/^[a-f0-9]{64}$/), sequence = z.number().int().nonnegative();
const segment = z.string().min(1).max(255).refine(v => !/[\\/\x00-\x1f]/.test(v) && v !== '.' && v !== '..', 'Safe scope segment required');
export const cognitionScope = z.discriminatedUnion('domain', [
    z.strictObject({ domain: z.literal('project'), projectId: id }), z.strictObject({ domain: z.literal('rp_session'), sessionId: id }),
    z.strictObject({ domain: z.literal('rp_chat'), charDir: segment.or(z.literal('')), name: segment, isGroup: z.boolean(), groupId: segment.or(z.literal('')) })
        .refine(v => v.isGroup ? v.charDir === '' && v.groupId !== '' : v.charDir !== '' && v.groupId === '', 'Exact chat/group scope required'),
]);
const scope = { scope: cognitionScope, subject: z.string().min(1).max(512) };
const selector = z.union([
    z.strictObject({ kind: z.literal('message'), messageId: id, floor: sequence.optional() }),
    z.strictObject({ kind: z.literal('artifact'), invocationId: id, grant: z.strictObject({ taskId: id, variantId: id, usageId: id }) }),
    z.strictObject({ kind: z.literal('task'), taskId: id }),
    z.strictObject({ kind: z.literal('project_field'), path: z.array(z.string().min(1).max(128).refine(v => !['__proto__', 'constructor', 'prototype'].includes(v))).max(16) }),
]);
const budget = z.strictObject({ maxRequests: z.number().int().min(1).max(32), maxTokens: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    localWork: z.strictObject({ maxJobs: z.number().int().min(1).max(32), maxItems: z.number().int().min(1).max(10000),
        maxInputBytes: z.number().int().min(1).max(16777216) }).optional() });
const criterion = z.strictObject({ criterionId: id, description: z.string().min(1).max(512), selector,
    path: z.array(z.string().min(1).max(128).refine(v => !['__proto__', 'constructor', 'prototype'].includes(v))).max(16), equals: z.json() });
const goalDefinition = z.strictObject({ subject: z.strictObject({ kind: z.enum(['user', 'actor']), actorId: id.nullable() }),
    scope: cognitionScope, intent: z.string().min(1).max(512), criteria: z.array(criterion).min(1).max(32), invariants: z.array(criterion).max(32), budget: budget.nullable() });
const feedbackTarget = z.strictObject({ kind: z.enum(['evidence', 'project_task']), id, integrity: hash, scope: cognitionScope });
const feedback = z.strictObject({ signal: z.enum(['correction', 'prefer', 'avoid']), dimension: z.enum(['behavior', 'style', 'correctness', 'workflow', 'general']), note: z.string().max(4096) });
const evolutionTarget = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('skill'), scope: z.union([z.strictObject({ kind: z.literal('project'), projectId: id }), z.strictObject({ kind: z.literal('character'), characterFile: segment })]), name: segment }),
    z.strictObject({ kind: z.literal('plan-prompt'), bindingId: hash, expectedBindingVersion: sequence, planRef: planRefSchema,
        nodeId: z.string().regex(/^onode_[a-f0-9]{32}$/), promptModuleRef: z.strictObject({ scope: z.literal('library'), resourceType: z.literal('core.prompt-module'), resourceId: id, revision: id }) }),
    z.strictObject({ kind: z.literal('plan-strategy'), bindingId: hash, expectedBindingVersion: sequence, planRef: planRefSchema,
        nodeId: z.string().regex(/^onode_[a-f0-9]{32}$/), fieldPath: z.enum(['reviewPolicy.maxRounds', 'routeRef',
            ...['maxSteps', 'maxAttempts', 'maxReplans', 'maxReviews', 'maxDelegates', 'maxHandoffs', 'maxEdgeVisits', 'maxLoopIterations', 'deadlineMs'].map(field => 'limits.' + field)]) }),
    z.strictObject({ kind: z.literal('project-prompt'), presetId: id, runtimeRouteId: id, moduleRef: z.strictObject({ scope: z.literal('library'), resourceType: z.literal('core.prompt-module'), resourceId: id, revision: id }) }),
    z.strictObject({ kind: z.literal('project-strategy'), taskId: id, field: z.literal('maxRepairRounds') }),
]);
const outputPage = { outputOffset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0), outputLimit: z.number().int().min(1).max(24000).default(12000) };
const bounded = (action, response, page = null) => {
    const data = redact(response.data), encoded = JSON.stringify(data);
    if (page) return { action, status: response.status, ok: response.ok, serverBootId: response.serverBootId,
        data: page.outputOffset === 0 && encoded.length <= page.outputLimit ? data : jsonTextFragment(encoded, page.outputOffset, page.outputLimit),
        page: { contentHash: fingerprint(data), totalChars: encoded.length, offset: page.outputOffset, nextOffset: page.outputOffset + page.outputLimit < encoded.length ? page.outputOffset + page.outputLimit : null } };
    const summary = data && typeof data === 'object' ? Object.fromEntries(['observationFingerprint', 'sourceSetFingerprint', 'goalDefinitionFingerprint',
        'taskId', 'taskFingerprint', 'sourceFingerprint', 'configurationFingerprint', 'budget', 'execution', 'validity'].filter(key => data[key] !== undefined).map(key => [key, data[key]])) : {};
    if (data?.goal) summary.goal = { goalId: data.goal.goalId, sequence: data.goal.sequence, scope: data.goal.scope };
    if (data?.document) summary.document = { sequence: data.document.sequence, scope: data.document.scope, subject: data.document.subject };
    if (data?.scope?.sequence !== undefined) summary.scope = { sequence: data.scope.sequence, scope: data.scope.scope, subject: data.scope.subject };
    return { action, status: response.status, ok: response.ok, serverBootId: response.serverBootId,
        data: encoded.length <= 24000 ? data : { ...summary, contentHash: fingerprint(data), omitted: 'Large cognitive document; use scoped Native inspection' } };
};

export function registerCognitionActions(registry, browser) {
    const request = (method, path, input = {}, guards = {}) => requestAuthority(browser, method, base + path, input, guards);
    const read = async (path, input) => { const r = await request('POST', path, input); if (!r.ok || !r.serverBootId) throw new Error('Native cognitive authority unavailable: ' + r.status); return r; };
    const add = (action, risk, shape, path, guard = null, effects = [], payload = i => i) => registry.register({ version: 1, id: action,
        domain: action.split('.')[0], title: action, risk, authority: 'Native scoped cognitive authority', adapter: 'fixed-http', externalEffects: effects,
        guards: risk === 'READ' ? [] : ['current-server-boot', 'exact-owner-scope-sequence', 'before-and-after-approval-authority'],
        approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Exact owning Native store and sequence; no second cognitive database' } },
    z.strictObject({ ...shape, ...(risk === 'READ' ? outputPage : {}) }), z.json(), async (i, context = {}) => {
        const { outputOffset, outputLimit, ...nativeInput } = i;
        return bounded(action, await request('POST', path, payload(risk === 'READ' ? nativeInput : i), context.before ?? {}), risk === 'READ' ? { outputOffset, outputLimit } : null);
    },
    guard && (async i => { if ((await browser.runtimeIdentity())?.mutationGuards !== 1) throw new Error('Native mutation guards unavailable'); return guard(i); }));

    add('goal.snapshot', 'READ', { goalId: id }, '/goals/snapshot');
    add('goal.snapshots', 'READ', {}, '/goals/snapshots');
    add('goal.context', 'READ', { scope: cognitionScope }, '/goals/context');
    add('goal.associations', 'READ', { goalId: id, viewId: id }, '/goals/associations');
    registry.register({ version: 1, id: 'cognition.quality.profiles', domain: 'cognition', title: 'Native quality profiles and source readiness', risk: 'READ',
        authority: 'Native QUALITY_PROFILES / pilot source readiness', adapter: 'fixed-http', externalEffects: [], guards: [], approval: 'none',
        availability: { available: true, reason: 'Original readiness registry; no model call' } }, z.strictObject({}), z.json(),
    async () => bounded('cognition.quality.profiles', await request('GET', '/quality-profiles')));
    add('evidence.snapshot', 'READ', { evidenceId: hash }, '/evidence/snapshot');
    add('experience.observe', 'READ', scope, '/experience/observe');
    add('evolution.observe', 'READ', scope, '/evolution/observe');
    add('goal.create.preflight', 'READ', goalDefinition.shape, '/goals/create-preflight');
    add('goal.create', 'MUTATE', { definition: goalDefinition, expectedAnchorFingerprint: hash }, '/goals/create-checked', async i => {
        const r = await read('/goals/create-preflight', i.definition);
        if (r.data.anchorFingerprint !== i.expectedAnchorFingerprint) throw new Error('Goal creation source anchor changed');
        return { target: { scope: i.definition.scope, subject: i.definition.subject }, serverBootId: r.serverBootId,
            anchorFingerprint: i.expectedAnchorFingerprint, definitionFingerprint: fingerprint(i.definition), budget: i.definition.budget };
    }, ['Create only a Native Goal definition and budget; no background model begins']);
    add('goal.execution.preflight', 'READ', { goalId: id, taskId: id.optional() }, '/goals/preflight');
    const goalGuard = async i => {
        const r = await read('/goals/snapshot', { goalId: i.goalId });
        if (!r.data.document || r.data.document.sequence !== i.expectedSequence) throw new Error('Goal sequence conflict');
        return { target: { goalId: i.goalId, scope: r.data.document.scope }, serverBootId: r.serverBootId,
            sequence: i.expectedSequence, goalFingerprint: fingerprint(r.data.document) };
    };
    add('goal.evaluate', 'MUTATE', { goalId: id, expectedSequence: sequence }, '/goals/evaluate', goalGuard,
        ['Re-evaluate and persist Native Goal progress from source evidence; may reconcile Native source state']);
    add('goal.control', 'INTERACT', { goalId: id, expectedSequence: sequence, action: z.enum(['pause', 'cancel']) }, '/goals/control', goalGuard,
        ['Pause/cancel Native Goal execution; cancellation does not undo committed effects']);
    const goalExecutionShape = { goalId: id, expectedSequence: sequence, expectedGoalDefinition: hash, expectedTaskFingerprint: hash,
        expectedSourceFingerprint: hash, expectedConfigurationFingerprint: hash };
    const executionGuard = async i => {
        const r = await read('/goals/preflight', { goalId: i.goalId, ...(i.taskId ? { taskId: i.taskId } : {}) });
        if (r.data.goal.sequence !== i.expectedSequence || r.data.goalDefinitionFingerprint !== i.expectedGoalDefinition
            || r.data.taskFingerprint !== i.expectedTaskFingerprint || r.data.sourceFingerprint !== i.expectedSourceFingerprint
            || r.data.configurationFingerprint !== i.expectedConfigurationFingerprint) throw new Error('Goal execution preflight stale');
        return { target: { goalId: i.goalId, scope: r.data.goal.scope, taskId: r.data.taskId }, serverBootId: r.serverBootId,
            sequence: i.expectedSequence, definitionFingerprint: i.expectedGoalDefinition, taskFingerprint: i.expectedTaskFingerprint,
            configurationFingerprint: i.expectedConfigurationFingerprint, budget: r.data.budget, providerTargets: r.data.providerTargets, execution: r.data.execution };
    };
    for (const action of ['bind', 'wake', 'pump', 'resume']) add(`goal.${action}`, 'MUTATE', { ...goalExecutionShape,
        ...(action === 'bind' ? { taskId: id } : {}), ...(action === 'wake' ? { eventId: id } : {}) }, '/goals/controlled', executionGuard,
        [action === 'wake' || action === 'pump' ? 'Explicit Native background Project Agent execution within reviewed Goal/Task/Provider configuration and budgets; stops at formal Review'
            : action === 'bind' ? 'Bind exact Native Goal to the reviewed Project Task; no model starts' : 'Resume exact Native Goal state; does not implicitly pump or wake'],
        i => ({ action, ...i }));
    const experienceGuard = async i => {
        const r = await read('/experience/observe', { scope: i.scope, subject: i.subject });
        const doc = r.data.document;
        if (!doc || doc.sequence !== i.expectedSequence) throw new Error('Experience sequence conflict');
        if (i.id && !doc.feedback.some(item => item.id === i.id)) throw new Error('Feedback is not in the reviewed scope');
        return { target: { scope: i.scope, subject: i.subject, ...(i.id ? { feedbackId: i.id } : {}) }, serverBootId: r.serverBootId,
            sequence: i.expectedSequence, sourceFingerprint: fingerprint(doc) };
    };
    for (const action of ['withdraw', 'delete']) add(`experience.feedback.${action}`, action === 'delete' ? 'DESTRUCTIVE' : 'MUTATE',
        { ...scope, id, expectedSequence: sequence }, '/experience/' + action, experienceGuard,
        [action === 'delete' ? 'Remove only exact scoped feedback and invalidate dependent diagnoses' : 'Withdraw exact scoped feedback and invalidate dependent diagnoses']);
    add('experience.retention.update', 'MUTATE', { ...scope, expectedSequence: sequence, days: z.number().int().min(1).max(365) }, '/experience/retention', experienceGuard,
        ['Change scoped retention and prune expired feedback/diagnoses in the Native ledger']);
    const targetGuard = async i => {
        let r, source;
        if (i.target.kind === 'evidence') {
            r = await read('/evidence/snapshot', { evidenceId: i.target.id }); source = r.data.document;
        } else {
            if (i.target.scope.domain !== 'project') throw new Error('Project task target requires exact Project scope');
            r = await requestAuthority(browser, 'GET', `/api/native/studio/projects/${i.target.scope.projectId}/agent/tasks/${i.target.id}/observation`);
            if (!r.ok || !r.serverBootId) throw new Error('Project Task observation unavailable');
            const { storedIntegrity: _integrity, ...task } = r.data; source = task;
        }
        if (!source || fingerprint(source) !== i.target.integrity) throw new Error('Exact feedback source changed');
        return { target: { feedbackSource: i.target }, serverBootId: r.serverBootId, sourceIntegrity: i.target.integrity };
    };
    add('experience.target.inspect', 'INTERACT', { kind: z.enum(['evidence', 'project_task']), id, scope: cognitionScope }, '/experience/controlled',
        async i => ({ target: { scope: i.scope, kind: i.kind, id: i.id }, serverBootId: (await browser.runtimeIdentity()).serverBootId }),
        ['Resolve and validate Native feedback source; may reconcile source state; automatic Evolution wake is suppressed'], i => ({ action: 'target', input: i }));
    add('experience.feedback.submit', 'MUTATE', { target: feedbackTarget, subject: z.string().min(1).max(512), expectedSequence: sequence.nullable(), feedback }, '/experience/controlled',
        async i => {
            const guard = await targetGuard(i), r = await read('/experience/observe', { scope: i.target.scope, subject: i.subject });
            if (r.serverBootId !== guard.serverBootId || (r.data.document?.sequence ?? null) !== i.expectedSequence) throw new Error('Feedback destination sequence changed');
            return { ...guard, target: { ...guard.target, subject: i.subject }, sequence: i.expectedSequence };
        }, ['Persist independently approved explicit human feedback at exact Native source/subject/sequence; automatic Evolution wake is suppressed'],
        i => ({ action: 'submit', input: { target: i.target, expectedSequence: i.expectedSequence, feedback: { kind: 'explicit', ...i.feedback } }, expectedSubject: i.subject }));
    add('experience.feedback.correct', 'MUTATE', { ...scope, id, expectedSequence: sequence, feedback }, '/experience/controlled', experienceGuard,
        ['Correct exact explicit feedback with trusted user approval; automatic Evolution wake is suppressed'],
        i => ({ action: 'correct', input: { ...i, feedback: { kind: 'explicit', ...i.feedback } } }));
    for (const action of ['reflection', 'purge', 'export', 'exportLearning', 'deleteScope']) {
        const shape = action === 'exportLearning' ? { ...scope, expectedSequence: sequence, purpose: z.literal('offline-analysis') }
            : action === 'reflection' || action === 'export' ? scope : { ...scope, expectedSequence: sequence };
        add(action === 'exportLearning' ? 'experience.learning.export' : `experience.${action === 'deleteScope' ? 'scope.delete' : action}`,
            action === 'deleteScope' ? 'DESTRUCTIVE' : 'INTERACT', shape, '/experience/controlled',
            async i => { const r = await read('/experience/observe', { scope: i.scope, subject: i.subject });
                if (i.expectedSequence !== undefined && r.data.document?.sequence !== i.expectedSequence) throw new Error('Experience sequence conflict');
                return { target: { scope: i.scope, subject: i.subject }, serverBootId: r.serverBootId, sourceFingerprint: fingerprint(r.data.document) }; },
            ['Native source/retention reconciliation may persist; no model call or automatic Evolution wake'], i => ({ action, input: i }));
    }
    add('experience.diagnosis.create', 'MUTATE', { ...scope, expectedSequence: sequence, batchHash: hash, rationale: z.string().max(4096),
        conditions: z.array(z.string().max(4096)).max(16), counterexamples: z.array(z.string().max(4096)).max(16), direction: z.enum(['skill', 'prompt', 'orchestration', 'undetermined']),
        attribution: z.strictObject({ loci: z.array(z.enum(['prompt', 'context', 'state', 'runtime', 'evaluator', 'model', 'unknown'])).min(1).max(3),
            intervention: z.enum(['local_target', 'engineering', 'none']) }).optional() }, '/experience/controlled', experienceGuard,
        ['Persist a model hypothesis, with Native source/batch checks; never forge human/host assessment or wake Evolution'], i => ({ action: 'diagnose', input: i }));
    for (const action of ['withdrawDiagnosis', 'deleteDiagnosis']) add(`experience.diagnosis.${action === 'withdrawDiagnosis' ? 'withdraw' : 'delete'}`,
        action === 'deleteDiagnosis' ? 'DESTRUCTIVE' : 'MUTATE', { ...scope, id, expectedSequence: sequence }, '/experience/controlled',
        async i => { const r = await read('/experience/observe', { scope: i.scope, subject: i.subject });
            if (!r.data.document || r.data.document.sequence !== i.expectedSequence || !r.data.document.diagnoses.some(d => d.id === i.id)) throw new Error('Diagnosis scope/sequence conflict');
            return { target: { scope: i.scope, subject: i.subject, diagnosisId: i.id }, serverBootId: r.serverBootId, sequence: i.expectedSequence,
                sourceFingerprint: fingerprint(r.data.document) }; }, ['Change only exact Native diagnosis and dependency state'], i => ({ action, input: i }));
    add('evidence.preflight', 'READ', { scope: cognitionScope, selectors: z.array(selector).min(1).max(32) }, '/evidence/preflight');
    add('evidence.begin', 'MUTATE', { scope: cognitionScope.refine(s => s.domain !== 'project', 'RP Evidence source required'), rootRunId: id,
        selectors: z.array(selector).min(1).max(32), expectedSourcesFingerprint: hash }, '/evidence/controlled', async i => {
        const r = await read('/evidence/preflight', { scope: i.scope, selectors: i.selectors });
        if (fingerprint(r.data) !== i.expectedSourcesFingerprint) throw new Error('Evidence sources changed after review');
        return { target: { scope: i.scope, rootRunId: i.rootRunId }, serverBootId: r.serverBootId, sourceFingerprint: i.expectedSourcesFingerprint };
    }, ['Create Native client_observation Evidence from exact captured source references; no forged Host outcome, collection or model wake'],
    ({ expectedSourcesFingerprint, ...input }) => ({ action: 'begin', input, expectedSourcesFingerprint }));
    const traceStrings = ['type', 'eventId', 'runId', 'parentRunId', 'stepId', 'effectId', 'agentId', 'nodeId', 'requestId', 'hostRequestId', 'attemptId',
        'status', 'lane', 'runtimeRouteId', 'usageStatus', 'attemptScope', 'parentInvocationId', 'targetKind', 'versionId', 'presetId', 'skillName', 'skillScopeKind', 'characterFile', 'projectId'];
    const eventShape = Object.fromEntries(traceStrings.map(key => [key, z.string().min(1).max(1024).optional()]));
    for (const key of ['type', 'eventId', 'runId']) eventShape[key] = z.string().min(1).max(1024);
    for (const key of ['generation', 'version', 'attempt', 'inputTokens', 'outputTokens', 'totalTokens']) eventShape[key] = sequence.optional();
    const trace = z.strictObject({ schemaVersion: z.literal(1), events: z.array(z.strictObject(eventShape)).max(512), missing: sequence,
        reasons: z.array(z.enum(['invalid_event', 'event_conflict', 'capture_limit', 'events_missing', 'transport_failed', 'output_unbound'])).max(6) })
        .refine(v => Buffer.byteLength(JSON.stringify(v)) <= 262144, 'Native Evidence trace bound');
    const outputRef = z.strictObject({ selector, anchor: z.record(id, z.union([id, sequence])), contentHash: hash }).nullable();
    const evidenceGuard = async i => {
        const r = await read('/evidence/snapshot', { evidenceId: i.evidenceId }), doc = r.data.document;
        if (!doc || doc.sequence !== i.expectedSequence) throw new Error('Evidence sequence conflict');
        return { target: { evidenceId: i.evidenceId, scope: doc.scope }, serverBootId: r.serverBootId, sequence: doc.sequence,
            origin: doc.origin, recordFingerprint: fingerprint(doc) };
    };
    add('evidence.update', 'MUTATE', { evidenceId: hash, expectedSequence: sequence, sequence,
        status: z.enum(['capturing', 'completed', 'cancelled', 'failed']), trace, output: outputRef }, '/evidence/controlled', async i => {
        const guard = await evidenceGuard(i); if (guard.origin !== 'client_observation') throw new Error('Host Evidence cannot be forged by a client'); return guard;
    }, ['Update only Native client_observation Evidence with source-verified output; suppress automatic Experience collection and Evolution wake'],
    ({ expectedSequence, ...input }) => ({ action: 'update', input, expectedSequence }));
    add('evidence.delete', 'DESTRUCTIVE', { evidenceId: hash, expectedSequence: sequence, expectedRecordFingerprint: hash }, '/evidence/controlled', async i => {
        const guard = await evidenceGuard(i); if (guard.recordFingerprint !== i.expectedRecordFingerprint) throw new Error('Evidence exact record changed'); return guard;
    }, ['Delete exact owned Native Evidence and invalidate dependent Experience/Evolution sources'],
    i => ({ action: 'delete', input: { evidenceId: i.evidenceId }, expectedRecordFingerprint: i.expectedRecordFingerprint }));
    for (const action of ['collect', 'outcome']) add(`experience.${action}`, 'MUTATE', action === 'collect'
        ? { kind: z.enum(['evidence', 'project_task']), id, scope: cognitionScope, expectedSourceIntegrity: hash }
        : { target: feedbackTarget, expectedSequence: sequence.nullable() }, '/experience/controlled', async i => {
        const selected = action === 'collect' ? { target: { kind: i.kind, id: i.id, scope: i.scope, integrity: i.expectedSourceIntegrity } } : i;
        return targetGuard(selected);
    }, ['Collect only Native-verified source outcomes; signal/origin comes from its owning authority; automatic Evolution wake is suppressed'],
    i => ({ action, input: action === 'collect' ? { kind: i.kind, id: i.id, scope: i.scope } : i }));
    add('experience.quality.check', 'MUTATE', { target: feedbackTarget, expectedSequence: sequence.nullable(),
        profile: z.strictObject({ profileId: z.literal('legacy.project_repair'), revision: hash }), checkerId: z.literal('project.validation') }, '/experience/controlled', targetGuard,
    ['Run only the fixed Native project.validation checker; no fabricated model assessment, preference or Evolution wake'], i => ({ action: 'checkQuality', input: i }));
    const sourceRetention = { scope: cognitionScope, days: z.number().int().min(1).max(365), limit: z.number().int().min(1).max(128) };
    add('experience.sources.preflight', 'READ', sourceRetention, '/experience/observeSourceRetention');
    add('experience.sources.purge', 'DESTRUCTIVE', { ...sourceRetention, expectedSourceSetFingerprint: hash }, '/experience/controlled', async i => {
        const { expectedSourceSetFingerprint, ...input } = i, r = await read('/experience/observeSourceRetention', input);
        if (r.data.sourceSetFingerprint !== expectedSourceSetFingerprint) throw new Error('Source retention reviewed set changed');
        return { target: { scope: i.scope, days: i.days, limit: i.limit }, serverBootId: r.serverBootId,
            sourceSetFingerprint: expectedSourceSetFingerprint, exactSources: r.data.selected };
    }, ['Delete only reviewed expired scoped Native Evidence/completed Task sources with per-source integrity CAS; invalidates dependent cognition'],
    ({ expectedSourceSetFingerprint, ...input }) => ({ action: 'purgeSources', input, expectedSourceSetFingerprint }));
    const evolutionGuard = ({ requireReview = false, requireBudget = false } = {}) => async i => {
        const r = await read('/evolution/observe', { scope: i.scope, subject: i.subject }), doc = r.data.scope;
        if (!doc || doc.sequence !== i.expectedSequence) throw new Error('Evolution sequence conflict');
        if (requireReview && doc.policy?.mode !== 'review') throw new Error('Independent human review/publish requires Native review mode');
        if (requireBudget && !r.data.owner?.limits) throw new Error('Explicit Native Evolution owner budget required');
        const job = i.jobId ? doc.jobs.find(j => j.id === i.jobId) : null;
        const candidate = i.candidateId ? job?.candidates.find(c => c.candidateId === i.candidateId) : null;
        if (i.jobId && !job || i.candidateId && !candidate) throw new Error('Evolution job/candidate is not in the reviewed scope');
        if (i.expectedReportHash && fingerprint(candidate.report) !== i.expectedReportHash) throw new Error('Evolution report hash conflict');
        return { target: { scope: i.scope, subject: i.subject, ...(i.jobId ? { jobId: i.jobId, candidateId: i.candidateId } : {}) },
            serverBootId: r.serverBootId, sequence: i.expectedSequence, sourceFingerprint: fingerprint(doc), ownerBudget: r.data.owner,
            policyFingerprint: doc.policy?.fingerprint ?? null };
    };
    add('evolution.mode.update', 'MUTATE', { ...scope, expectedSequence: sequence, mode: z.enum(['paused', 'disabled']) }, '/evolution/mode', evolutionGuard(),
        ['Pause/disable Native Evolution and request cancellation; no automatic learning is enabled']);
    add('evolution.job.start', 'MUTATE', { ...scope, expectedSequence: sequence }, '/evolution/start', evolutionGuard({ requireReview: true, requireBudget: true }),
        ['Explicit paid Native learning/evaluation under existing owner limits and review policy; no automatic publication']);
    const learningRecord = z.strictObject({ id: hash, family: hash,
        observation: z.strictObject({ sourceKind: z.enum(['evidence', 'project_task']), sourceHash: hash }),
        action: z.strictObject({ kind: z.enum(['project_task', 'captured_run']), status: id }),
        outcome: z.strictObject({ status: id, origin: z.literal('host') }).nullable(), receipt: z.array(z.strictObject({ hash })).min(1).max(256).nullable(),
        preference: z.strictObject({ signal: id, dimension: id, origin: z.literal('user') }).nullable(), reward: z.null(),
        label: z.strictObject({ kind: z.enum(['explicit', 'technical', 'observation', 'assessment']), origin: z.enum(['user', 'host', 'client_observation', 'host_check', 'model_assessment']), signal: id, dimension: id, derived: z.boolean() }),
        diagnoses: z.array(z.strictObject({ id: hash, origin: z.enum(['user_hypothesis', 'model_hypothesis']), direction: z.enum(['skill', 'prompt', 'orchestration', 'undetermined']), derived: z.literal(true) })).max(64),
        missing: z.array(z.enum(['observation', 'action', 'outcome', 'receipt', 'preference', 'reward'])).max(6), missingReasons: z.record(id, id) });
    const trajectory = z.strictObject({ format: z.literal('atria-learning-trajectory'), schemaVersion: z.literal(1), purpose: z.literal('offline-analysis'),
        ownerHash: hash, scopeHash: hash, sequence, exportedAt: sequence, records: z.array(learningRecord).min(1).max(256), integrity: hash })
        .refine(v => Buffer.byteLength(JSON.stringify(v)) <= 262144, 'Native learning export bound');
    add('evolution.learning.start', 'MUTATE', { ...scope, expectedSequence: sequence, backend: z.literal('native-prompt-optimizer-v1'),
        purpose: z.literal('prompt-optimization'), trajectory }, '/evolution/start-learning', async i => {
        const guard = await evolutionGuard({ requireReview: true, requireBudget: true })(i);
        if (i.trajectory.scopeHash !== fingerprint(i.scope)) throw new Error('Learning trajectory scope mismatch');
        return { ...guard, trajectoryFingerprint: fingerprint(i.trajectory), recordsFingerprint: fingerprint(i.trajectory.records), backend: i.backend };
    }, ['Explicit paid Native Prompt optimizer in review mode; Native rejoins exact authenticated current Experience and rejects forged, stale or foreign trajectories']);
    add('evolution.reconcile', 'MUTATE', { ...scope, expectedSequence: sequence }, '/evolution/reconcile', evolutionGuard(),
        ['Native reconciliation may invalidate publications, rollback and clean expired candidate artifacts'],
        ({ expectedSequence: _sequence, ...i }) => i);
    add('evolution.publish', 'MUTATE', { ...scope, expectedSequence: sequence, jobId: id, candidateId: id, expectedReportHash: hash }, '/evolution/publish',
        evolutionGuard({ requireReview: true }), ['Independent approved publication via exact Native report, target binding and CAS; no model boolean approval'],
        ({ expectedSequence: _sequence, ...i }) => ({ ...i, review: true }));
    add('evolution.preflight', 'READ', scope, '/evolution/preflight');
    const preflightGuard = async i => {
        const r = await read('/evolution/preflight', { scope: i.scope, subject: i.subject });
        if (i.expectedObservationFingerprint !== r.data.observationFingerprint) throw new Error('Evolution preflight changed');
        return { target: { scope: i.scope, subject: i.subject, ...(i.target ? { evolutionTarget: i.target } : {}) }, serverBootId: r.serverBootId,
            observationFingerprint: r.data.observationFingerprint, configurationFingerprint: fingerprint(r.data.configuration),
            ownerBudget: r.data.state.owner, sourceFingerprint: fingerprint(r.data.experience), choicesFingerprint: fingerprint(r.data.choices) };
    };
    add('evolution.target.declare', 'MUTATE', { ...scope, target: evolutionTarget, expectedBaseHash: hash, expectedObservationFingerprint: hash }, '/evolution/declare',
        async i => {
            const guard = await preflightGuard(i), r = await read('/evolution/preflight', { scope: i.scope, subject: i.subject });
            if (!r.data.choices.some(choice => fingerprint(choice.target) === fingerprint(i.target) && choice.baseHash === i.expectedBaseHash)) throw new Error('Evolution exact target base changed');
            return guard;
        }, ['Declare only an exact local Native Evolution target; no learning or automatic model execution'],
        ({ expectedObservationFingerprint: _expected, ...i }) => i);
    const price = z.strictObject({ source: z.string().min(1).max(512), currency: z.string().min(1).max(8),
        inputPerMillion: z.number().min(0).max(1000000), outputPerMillion: z.number().min(0).max(1000000), confirmedAt: z.number().int().positive() }).nullable();
    for (const mode of ['review', 'auto']) add(`evolution.configure.${mode}`, 'MUTATE', { ...scope, target: evolutionTarget, routeId: id, price,
        expectedSequence: sequence, expectedObservationFingerprint: hash }, '/evolution/controlled-configure', async i => {
        const guard = await preflightGuard(i), r = await read('/evolution/observe', { scope: i.scope, subject: i.subject });
        if ((r.data.scope?.sequence ?? 0) !== i.expectedSequence || mode === 'auto' && !r.data.owner?.limits) throw new Error('Evolution policy sequence/explicit owner budget conflict');
        return { ...guard, mode, confirmedPriceEstimate: i.price };
    }, [mode === 'auto' ? 'Independently authorize Native automatic local learning/publication under exact target, Provider configuration and cumulative owner limits; future costs possible'
        : 'Configure Native review policy; later learning and publication require independent actions'],
    ({ expectedObservationFingerprint, ...i }) => ({ expectedObservationFingerprint, input: { ...i, mode } }));
    add('evolution.budget.update', 'MUTATE', { ...scope, expectedOwnerSequence: sequence,
        limits: z.strictObject({ maxRequests: z.number().int().min(1).max(2048), maxTokens: z.number().int().min(1).max(10000000), minIntervalMs: z.number().int().min(1000).max(60000) }) }, '/evolution/budget', async i => {
        const r = await read('/evolution/observe', { scope: i.scope, subject: i.subject });
        if ((r.data.owner?.sequence ?? 0) !== i.expectedOwnerSequence) throw new Error('Evolution owner budget sequence conflict');
        return { target: { kind: 'owner-evolution-budget' }, serverBootId: r.serverBootId, ownerBudget: r.data.owner, requestedLimits: i.limits };
    }, ['Change the cumulative Native owner-wide Evolution ceiling; preserves existing charges and unknown reservations'],
    i => ({ limits: i.limits, expectedSequence: i.expectedOwnerSequence }));
    add('evolution.label', 'MUTATE', { ...scope, expectedSequence: sequence, jobId: id, candidateId: id, pairHash: hash,
        preference: z.enum(['candidate', 'baseline', 'tie', 'uncertain']), deltas: z.record(id, z.number().int().min(-4).max(4)) }, '/evolution/controlled-label',
        async i => {
            const guard = await evolutionGuard()(i), r = await read('/evolution/observe', { scope: i.scope, subject: i.subject });
            const pair = r.data.scope.jobs.find(j => j.id === i.jobId)?.candidates.find(c => c.candidateId === i.candidateId)?.report?.pairs?.find(p => p.pairHash === i.pairHash);
            if (!pair || fingerprint(Object.keys(i.deltas).sort()) !== fingerprint([...pair.case.behaviorDimensions].sort())) throw new Error('Exact Native human comparison dimensions required');
            return { ...guard, pairFingerprint: fingerprint(pair), humanPreference: i.preference, humanDeltas: i.deltas };
        }, ['Record independently approved owner comparison; suppress automatic publication and require a separate publish action']);
    add('evolution.rollback', 'MUTATE', { ...scope, expectedSequence: sequence, publicationId: id, expectedPublicationFingerprint: hash }, '/evolution/controlled-rollback',
        async i => {
            const guard = await evolutionGuard()(i), r = await read('/evolution/observe', { scope: i.scope, subject: i.subject });
            const publication = r.data.scope.publications.find(p => p.id === i.publicationId);
            if (!publication || fingerprint(publication) !== i.expectedPublicationFingerprint) throw new Error('Evolution exact publication changed');
            return { ...guard, target: { ...guard.target, publicationId: i.publicationId }, publicationFingerprint: i.expectedPublicationFingerprint };
        }, ['Pause Native policy and restore only the exact previous target via Native rollback CAS; concurrent user changes are preserved']);
    for (const action of ['catalog', 'inspect', 'export']) add(`evolution.${action}`, 'INTERACT', scope, '/evolution/' + action,
        async i => { const r = await read('/evolution/observe', i); return { target: i, serverBootId: r.serverBootId, sourceFingerprint: fingerprint(r.data) }; },
        ['Native source/retention/publication reconciliation may persist or rollback; no new evaluation starts']);
    add('goal.continuation.inspect', 'MUTATE', { goalId: id, expectedSequence: sequence }, '/goals/inspect', goalGuard,
        ['Inspect and reconcile original Goal / Project Task; no model send'], i => ({ goalId: i.goalId }));
    const consumerGuard = async i => {
        const configuration = await request('GET', '/configuration');
        if (!configuration.ok || !configuration.serverBootId) throw Error('Native consumer configuration unavailable');
        let source = {};
        if (i.sessionId) {
            const r = await requestAuthority(browser, 'POST', '/api/native/session/observe', { sessionId: i.sessionId });
            if (!r.ok || r.serverBootId !== configuration.serverBootId || i.revisionId && r.data.revision.revisionId !== i.revisionId) throw Error('Consumer Session revision conflict');
            source = { sessionId: i.sessionId, revisionId: r.data.revision.revisionId, branchId: r.data.revision.branchId };
        } else if (i.projectId) {
            const r = await requestAuthority(browser, 'GET', `/api/native/studio/projects/${i.projectId}/agent/tasks/${i.taskId}/observation`);
            if (!r.ok || r.serverBootId !== configuration.serverBootId || r.data.sequence !== i.expectedSequence) throw Error('Consumer Project Task sequence conflict');
            source = { projectId: i.projectId, taskId: i.taskId, expectedSequence: r.data.sequence, executionFingerprint: r.data.executionFingerprint };
        }
        return { target: source, serverBootId: configuration.serverBootId, configurationFingerprint: fingerprint(configuration.data),
            providerTargets: configuration.data.connections.map(c => ({ connectionProfileId: c.connectionProfileId, endpoint: c.endpoint })), requestHash: fingerprint(i) };
    };
    const requestDocument = z.record(z.string(), z.json());
    for (const name of ['prediction', 'comparison']) {
        add(name + '.prepare', 'INTERACT', { sessionId: id, revisionId: id, request: requestDocument }, '/' + name + '/prepare', consumerGuard,
            ['Original bounded private candidate computation', 'Explicit original advisory model requests and compute accounting when declared', 'No adoption or Session publication']);
        add(name + '.current', 'READ', name === 'prediction' ? { sessionId: id, artifact: requestDocument } : { sessionId: id, comparisonId: id }, '/' + name + '/current');
    }
    add('comparison.feedback', 'MUTATE', { sessionId: id, comparisonId: id, receiptId: id }, '/comparison/feedback', consumerGuard,
        ['Record feedback only after verifying the original committed transaction Receipt; no candidate apply']);
    add('comparison.project.prepare', 'INTERACT', { projectId: id, taskId: id, expectedSequence: sequence,
        candidates: z.array(z.strictObject({ id, operations: z.array(requestDocument).min(1).max(32) })).min(1).max(8) }, '/project-comparison/prepare', consumerGuard,
        ['Original temporary Workspace evaluation and restoration', 'Advisory comparison only; no formal commit']);
    for (const action of ['current', 'outcome']) add('comparison.project.' + action, 'READ', { comparisonId: id }, '/project-comparison/' + action);
    return registry;
}

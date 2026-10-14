import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';

const base = '/api/native/generation';
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z.strictObject({ scope: z.literal('library'), resourceType: z.enum(['core.prompt-module', 'core.prompt-program', 'core.generation-profile']), resourceId: id, revision: id });
const routeRef = z.strictObject({ scope: z.literal('player'), runtimeRouteId: id });
const exactSource = i => Boolean(i.sessionId) === Boolean(i.revisionId) && Boolean(i.projectId) === Boolean(i.revision)
    && Boolean(i.sessionId) !== Boolean(i.projectId);
const preview = z.strictObject({ requestId: id, role: z.enum(['narrator', 'studio', 'memory', 'search', 'orchestrator', 'intent_resolver', 'event_interpreter']),
    sessionId: id.optional(), revisionId: id.optional(), projectId: id.optional(), revision: id.optional(), routeRef,
    messages: z.array(z.strictObject({ role: z.enum(['system', 'user', 'assistant']), content: z.string().max(32000) })).max(32).optional(),
    prompt: z.strictObject({ parameters: z.record(id, z.json()).optional(), locals: z.record(id, z.json()).optional() }).optional(),
    previewRefs: z.strictObject({ promptProgramRef: ref.optional(), generationProfileRef: ref.optional() }).optional(),
}).refine(exactSource, 'One exact Session or Project revision required');
const bounded = (action, response) => {
    const value = redact(response.data), text = JSON.stringify(value);
    return { action, authority: 'Native Model/Prompt/Runtime', status: response.status, ok: response.ok, serverBootId: response.serverBootId,
        data: text.length <= 24000 ? value : { contentHash: fingerprint(value), omitted: 'Large Native result; inspect a smaller exact resource' } };
};

export function registerRuntimeActions(registry, browser) {
    const request = (method, path, input = {}, guards = {}) => requestAuthority(browser, method, base + path, input, guards);
    const read = async (method, path, input = {}) => { const r = await request(method, path, input); if (!r.ok || !r.serverBootId) throw new Error('Native Runtime authority unavailable: ' + r.status); return r; };
    const add = (action, risk, schema, handler, guard = null, effects = []) => registry.register({ version: 1, id: action, domain: 'runtime', title: action,
        risk, authority: 'Native Model/Prompt/Runtime', adapter: 'fixed-http', externalEffects: effects,
        guards: risk === 'READ' ? [] : ['current-server-boot', 'exact-native-configuration', 'before-and-after-approval-authority'],
        approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Authenticated fixed Native authority; no arbitrary endpoint or credential values' } },
    schema, z.json(), handler, guard && (async i => { if ((await browser.runtimeIdentity())?.mutationGuards !== 1) throw new Error('Native mutation guards unavailable'); return guard(i); }));
    for (const [kind, key] of [['connection', 'connections'], ['model', 'models'], ['route', 'routes']]) {
        add(`runtime.${kind}.list`, 'READ', z.strictObject({}), async () => {
            const r = await request('GET', '/configuration'); if (r.ok) r.data = r.data[key]; return bounded(`runtime.${kind}.list`, r);
        });
        add(`runtime.${kind}.get`, 'READ', z.strictObject({ resourceId: id }), async i => {
            const r = await request('GET', '/configuration');
            if (r.ok) r.data = r.data[key].find(v => v[kind === 'connection' ? 'connectionProfileId' : kind === 'model' ? 'modelProfileId' : 'runtimeRouteId'] === i.resourceId) ?? null;
            return bounded(`runtime.${kind}.get`, r);
        });
    }
    add('runtime.connection.dependencies', 'READ', z.strictObject({ connectionProfileId: id }), async i => {
        const r = await request('GET', '/configuration');
        if (r.ok) r.data = { models: r.data.models.filter(v => v.connectionProfileRef.connectionProfileId === i.connectionProfileId), routes: r.data.routes.filter(v => v.connectionProfileRef.connectionProfileId === i.connectionProfileId) };
        return bounded('runtime.connection.dependencies', r);
    });
    add('runtime.route.resolve', 'READ', z.strictObject({ routeRef, role: z.string().regex(/^role\.[a-z_]+$/), requirements: z.array(id).max(32).default([]) }),
        async i => bounded('runtime.route.resolve', await request('POST', '/routes/resolve', i)));
    add('runtime.resource.exact', 'READ', ref, async i => bounded('runtime.resource.exact', await request('POST', '/resources/exact', i)));
    for (const action of ['runtime.prompt.preview', 'runtime.context.preview']) add(action, 'READ', preview,
        async i => bounded(action, await request('POST', '/preview', i)));
    add('runtime.connection.target.inspect', 'READ', z.strictObject({ connectionProfileId: id }),
        async i => bounded('runtime.connection.target.inspect', await request('POST', '/connections/credential-target/inspect', i)));
    const targetGuard = async i => {
        const r = await read('POST', '/connections/credential-target/inspect', { connectionProfileId: i.connectionProfileId });
        if (r.data.connectionFingerprint !== i.expectedFingerprint || r.data.targetFingerprint !== i.expectedTargetFingerprint
            || i.expectedPermitFingerprint && r.data.permitFingerprint !== i.expectedPermitFingerprint) throw new Error('Credential target fingerprint conflict');
        return { target: { connectionProfileId: i.connectionProfileId, credentialTarget: r.data.target }, serverBootId: r.serverBootId,
            expectedFingerprint: i.expectedFingerprint, targetFingerprint: r.data.targetFingerprint, permitFingerprint: r.data.permitFingerprint, authorized: r.data.authorized };
    };
    add('runtime.connection.target.authorize', 'MUTATE', z.strictObject({ connectionProfileId: id, expectedFingerprint: digest,
        expectedTargetFingerprint: digest, expectedPermitFingerprint: digest, allowLocal: z.boolean().optional() }),
    async (i, { before }) => ({ ...bounded('runtime.connection.target.authorize', await request('POST', '/connections/credential-target/authorize', i, before)),
        receiptEvidence: { recovery: 'Inspect the Native credential target permit. Authorization does not send a Provider request.' } }), targetGuard,
    ['Persist an independently reviewed exact SecretRef to network target permit; no Provider send']);
    add('runtime.connection.probe', 'INTERACT', z.strictObject({ connectionProfileId: id, expectedFingerprint: digest, expectedTargetFingerprint: digest }),
    async (i, { before }) => {
        const config = await read('GET', '/configuration'), connection = config.data.connections.find(c => c.connectionProfileId === i.connectionProfileId);
        if (config.serverBootId !== before.serverBootId || fingerprint(connection) !== i.expectedFingerprint) throw new Error('Connection changed before probe');
        return bounded('runtime.connection.probe', await request('POST', '/connections/probe', connection, before));
    }, async i => { const guard = await targetGuard(i); if (!guard.authorized) throw new Error('Native credential target permit required before probe'); return guard; },
    ['Provider network request with exact reviewed SecretRef/target; may incur cost; never automatically retried']);
    add('runtime.resource.revision.create', 'MUTATE', z.strictObject({ resourceType: z.enum(['core.prompt-module', 'core.prompt-program', 'core.generation-profile']), resource: z.record(id, z.json()), expectedCurrentRevision: id.nullable() }),
    async (i, { before }) => bounded('runtime.resource.revision.create', await request('POST', '/resources/revision', i, before)), async i => {
        const resourceId = i.resource.promptModuleId ?? i.resource.promptProgramId ?? i.resource.generationProfileId;
        const current = await read('POST', '/resources/current', { resourceType: i.resourceType, resourceId });
        if ((current.data?.ref?.revision ?? null) !== i.expectedCurrentRevision) throw new Error('Library resource current Revision conflict');
        return { target: { resourceType: i.resourceType, resourceId: i.resource.promptModuleId ?? i.resource.promptProgramId ?? i.resource.generationProfileId, revision: i.resource.revision },
            serverBootId: current.serverBootId, contentHash: fingerprint(i.resource), expectedCurrentRevision: i.expectedCurrentRevision };
    }, ['Create immutable Native Library resource revision; existing Runtime routes remain pinned']);
    add('runtime.preset.list', 'READ', z.strictObject({}), async () => bounded('runtime.preset.list', await request('GET', '/presets')));
    add('runtime.preset.get', 'READ', z.strictObject({ presetId: id }), async i => bounded('runtime.preset.get', await request('GET', `/presets/${i.presetId}`)));
    const presetGuard = async i => {
        const r = await read('GET', `/presets/${i.presetId}`);
        if (i.expectedRevision !== undefined && r.data.revision !== i.expectedRevision) throw new Error('Prompt Preset revision conflict');
        return { target: { presetId: i.presetId }, serverBootId: r.serverBootId, presetFingerprint: fingerprint(r.data), revision: r.data.revision };
    };
    const presetDocument = z.strictObject({ format: z.literal('atria.prompt-preset'), schemaVersion: z.literal(1), programId: id,
        entries: z.array(z.strictObject({ resourceType: z.enum(['core.prompt-module', 'core.prompt-program', 'core.generation-profile']), resource: z.record(id, z.json()) })).min(1).max(256),
        displayName: z.string().min(1).max(256).optional(), categories: z.array(z.strictObject({ id, name: z.string().min(1).max(256), parentId: id.nullable().optional() })).max(128).optional(),
        moduleCategories: z.record(id, id).optional(), regexScripts: z.array(z.record(id, z.json())).max(64).optional() });
    add('runtime.preset.create', 'MUTATE', z.strictObject({ preset: presetDocument, importing: z.boolean().default(false) }),
        async (i, { before }) => bounded('runtime.preset.create', await request('POST', '/presets', { ...i, expectedRevision: null }, before)),
        async i => ({ target: { kind: 'new-prompt-preset', contentHash: fingerprint(i.preset) }, serverBootId: (await browser.runtimeIdentity()).serverBootId }),
        ['Create a new Native versioned Prompt Preset with its own exact resource closure']);
    add('runtime.preset.update', 'MUTATE', z.strictObject({ presetId: id, expectedRevision: id, preset: presetDocument }),
        async (i, { before }) => bounded('runtime.preset.update', await request('PUT', `/presets/${i.presetId}`, { preset: i.preset, expectedRevision: i.expectedRevision }, before)),
        presetGuard, ['Save Native immutable Preset revisions under exact current revision CAS; no implicit Runtime route rebinding']);
    add('runtime.preset.delete', 'DESTRUCTIVE', z.strictObject({ presetId: id, expectedRevision: id }),
        async (i, { before }) => bounded('runtime.preset.delete', await request('DELETE', `/presets/${i.presetId}`, { expectedRevision: i.expectedRevision }, before)),
        presetGuard, ['Delete only the owning Preset after Native dependency/reference checks']);
    const candidatePath = (i, action) => `/presets/${i.presetId}/prompt-candidates/${action}`;
    add('runtime.prompt.candidate.inspect', 'READ', z.strictObject({ presetId: id }), async i => bounded('runtime.prompt.candidate.inspect', await request('POST', candidatePath(i, 'inspect'))));
    add('runtime.prompt.candidate.check', 'READ', z.strictObject({ presetId: id, candidateId: digest }),
        async i => bounded('runtime.prompt.candidate.check', await request('POST', candidatePath(i, 'check'), { candidateId: i.candidateId })));
    add('runtime.prompt.candidate.declare', 'MUTATE', z.strictObject({ presetId: id, expectedRevision: id, moduleRefs: z.array(ref).max(64) }),
        async (i, { before }) => bounded('runtime.prompt.candidate.declare', await request('POST', candidatePath(i, 'declare'), { expectedRevision: i.expectedRevision, moduleRefs: i.moduleRefs }, before)),
        presetGuard, ['Declare exact evolvable modules in the owning Preset; does not enable model learning']);
    add('runtime.prompt.candidate.prepare', 'MUTATE', z.strictObject({ presetId: id, runtimeRouteId: id, expectedRouteFingerprint: digest,
        moduleRef: ref, body: z.string().max(65536) }), async (i, { before }) => {
        const { presetId: _, ...input } = i;
        return bounded('runtime.prompt.candidate.prepare', await request('POST', candidatePath(i, 'prepare'), input, before));
    }, async i => {
        const guard = await presetGuard(i), config = await read('GET', '/configuration'), route = config.data.routes.find(r => r.runtimeRouteId === i.runtimeRouteId);
        if (config.serverBootId !== guard.serverBootId || fingerprint(route) !== i.expectedRouteFingerprint) throw new Error('Prompt Candidate Runtime route conflict');
        return { ...guard, target: { ...guard.target, runtimeRouteId: i.runtimeRouteId, moduleRef: i.moduleRef }, routeFingerprint: i.expectedRouteFingerprint };
    }, ['Create Native immutable candidate revisions and metadata; effective Runtime route remains unchanged']);
    for (const action of ['apply', 'rollback']) add(`runtime.prompt.candidate.${action}`, 'MUTATE', z.strictObject({ presetId: id, candidateId: digest, expectedCandidateFingerprint: digest }),
        async (i, { before }) => bounded(`runtime.prompt.candidate.${action}`, await request('POST', candidatePath(i, action), { candidateId: i.candidateId }, before)),
        async i => {
            const r = await read('POST', candidatePath(i, action === 'rollback' ? 'checkRollback' : 'check'), { candidateId: i.candidateId });
            if (fingerprint(r.data.candidate) !== i.expectedCandidateFingerprint) throw new Error('Prompt Candidate changed');
            return { target: { presetId: i.presetId, candidateId: i.candidateId, runtimeRouteId: r.data.desiredRoute.runtimeRouteId },
                serverBootId: r.serverBootId, candidateFingerprint: i.expectedCandidateFingerprint, desiredRouteFingerprint: fingerprint(r.data.desiredRoute),
                currentApplied: r.data.alreadyApplied };
        }, [`Independent reviewed Native Prompt Candidate ${action} with exact closure and Runtime Route CAS`]);
    const { previewRefs: _previewRefs, ...executeFields } = preview.shape;
    const executeSchema = z.strictObject(executeFields).refine(exactSource, 'One exact Session or Project revision required');
    add('runtime.generation.start', 'INTERACT', executeSchema,
        async (i, { before }) => bounded('runtime.generation.start', await request('POST', '/execute/start', { input: i,
            approvedReview: { snapshotFingerprint: before.snapshotFingerprint, configurationFingerprint: before.configurationFingerprint } }, before)), async i => {
            const r = await read('POST', '/preview', i), snapshot = r.data.snapshot;
            if (!snapshot || !r.data.preview) throw new Error('Native pure generation preview unavailable');
            const config = await read('GET', '/configuration'), connection = config.data.connections.find(c => c.connectionProfileId === snapshot.connectionProfileId);
            if (!connection || config.serverBootId !== r.serverBootId) throw new Error('Native generation configuration changed');
            const permit = await read('POST', '/connections/credential-target/inspect', { connectionProfileId: connection.connectionProfileId });
            if (!permit.data.authorized || permit.serverBootId !== r.serverBootId) throw new Error('Exact Native Provider destination permit required');
            const { createdAt: _time, ...stableSnapshot } = snapshot;
            return { target: { source: snapshot.contextPlan.source, runtimeRouteId: snapshot.runtimeRouteId, connectionProfileId: snapshot.connectionProfileId,
                credentialTarget: permit.data.target }, serverBootId: r.serverBootId, snapshotFingerprint: fingerprint(stableSnapshot),
                configurationFingerprint: fingerprint({ routes: config.data.routes, models: config.data.models, connections: config.data.connections }),
                permitFingerprint: permit.data.permitFingerprint, economics: snapshot.diagnostics.executionPlan?.economics ?? null };
        }, ['Explicit paid Native Provider execution with independent credential target approval; Native budget/usage settlement; no implicit Session commit; unknown responses are never resent']);
    for (const action of ['status', 'usage']) add(`runtime.generation.${action}`, 'READ', z.strictObject({ operationId: id }), async i => {
        const r = await request('GET', `/operations/${i.operationId}`);
        if (r.ok && action === 'usage') r.data = { operationId: i.operationId, state: r.data.status, usage: r.data.observation?.usage ?? null,
            compute: r.data.observation?.compute ?? null, currencyCost: r.data.observation?.currencyCost ?? null,
            evidence: 'Native scheduler projection; absent usage/currency remains unknown' };
        return bounded(`runtime.generation.${action}`, r);
    });
    add('runtime.generation.result', 'READ', z.strictObject({ operationId: id }), async i => bounded('runtime.generation.result', await request('GET', `/operations/${i.operationId}/result`)));
    add('runtime.generation.stop', 'INTERACT', z.strictObject({ operationId: id }),
        async (i, { before }) => bounded('runtime.generation.stop', await request('DELETE', `/operations/${i.operationId}`, {}, before)),
        async i => { const r = await read('GET', `/operations/${i.operationId}`); return { target: { operationId: i.operationId }, serverBootId: r.serverBootId, anchor: r.data.anchor ?? null }; },
        ['Request Native cancellation; Provider fees and already committed product results are retained']);
    return registry;
}

import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';
import { jsonTextFragment } from './json-fragment.js';

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
const outputPage = { outputOffset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0), outputLimit: z.number().int().min(1).max(24000).default(12000) };
const bounded = (action, response) => {
    const value = redact(response.data);
    return { action, authority: 'Native Model/Prompt/Runtime', status: response.status, ok: response.ok, serverBootId: response.serverBootId,
        data: value };
};

export function registerRuntimeActions(registry, browser) {
    const request = (method, path, input = {}, guards = {}) => requestAuthority(browser, method, base + path, input, guards);
    const read = async (method, path, input = {}) => { const r = await request(method, path, input); if (!r.ok || !r.serverBootId) throw new Error('Native Runtime authority unavailable: ' + r.status); return r; };
    const add = (action, risk, schema, handler, guard = null, effects = []) => registry.register({ version: 1, id: action, domain: 'runtime', title: action,
        risk, authority: 'Native Model/Prompt/Runtime', adapter: 'fixed-http', externalEffects: effects,
        guards: risk === 'READ' ? [] : ['current-server-boot', 'exact-native-configuration', 'before-and-after-approval-authority'],
        approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Authenticated fixed Native authority; no arbitrary endpoint or credential values' } },
    risk === 'READ' ? schema.safeExtend(outputPage) : schema, z.json(), async (input, context) => {
        const { outputOffset, outputLimit, ...nativeInput } = input;
        const result = await handler(risk === 'READ' ? nativeInput : input, context), value = result.data, text = JSON.stringify(value);
        if (risk !== 'READ') return { ...result, data: text.length <= 24000 ? value : { contentHash: fingerprint(value), omitted: 'Large Native result; inspect the corresponding exact READ action' } };
        return { ...result, data: outputOffset === 0 && text.length <= outputLimit ? value : jsonTextFragment(text, outputOffset, outputLimit),
            page: { contentHash: fingerprint(value), totalChars: text.length, offset: outputOffset, nextOffset: outputOffset + outputLimit < text.length ? outputOffset + outputLimit : null } };
    }, guard && (async i => { if ((await browser.runtimeIdentity())?.mutationGuards !== 1) throw new Error('Native mutation guards unavailable'); return guard(i); }));
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
    const runtimeRef = z.strictObject({ scope: z.enum(['library', 'project', 'package']), resourceType: ref.shape.resourceType,
        resourceId: id, revision: id, projectId: id.optional(), packageId: id.optional(), packageVersionId: id.optional() });
    add('runtime.resource.usedby', 'READ', runtimeRef, async i => bounded('runtime.resource.usedby', await request('POST', '/resources/used-by', i)));
    const configurationGuard = async i => {
        const r = await read('GET', '/configuration');
        return { target: { ...(i.resourceId ? { resourceId: i.resourceId } : {}), ...(i.ref ? { ref: i.ref } : {}), ...(i.route ? { runtimeRouteId: i.route.runtimeRouteId } : {}) },
            serverBootId: r.serverBootId, configurationFingerprint: fingerprint(r.data) };
    };
    add('runtime.api.preset.save', 'MUTATE', z.strictObject({ route: z.record(z.string(), z.json()), model: z.record(z.string(), z.json()), generation: z.record(z.string(), z.json()),
        expected: z.strictObject({ route: digest, model: digest }) }), async (i, { before }) => bounded('runtime.api.preset.save', await request('PUT', '/api-presets', i, before)),
    configurationGuard, ['Atomic original Model / Generation / Route publication; shared resources copied by original authority; does not send']);
    add('runtime.resource.archive', 'MUTATE', z.strictObject({ ref: runtimeRef, archived: z.boolean() }),
        async (i, { before }) => bounded('runtime.resource.archive', await request('POST', '/resources/archive', i, before)), configurationGuard, ['Change original Library archive state; exact ownership and references remain authoritative']);
    for (const [kind, key] of [['connection', 'connections'], ['model', 'models'], ['route', 'routes']]) add(`runtime.${kind}.delete`, 'DESTRUCTIVE',
        z.strictObject({ resourceId: id, expectedFingerprint: digest }), async (i, { before }) => bounded(`runtime.${kind}.delete`, await request('DELETE', `/configuration/${key}/${i.resourceId}`, {}, before)),
        async i => {
            const r = await read('GET', '/configuration'), item = r.data[key].find(value => value[kind === 'connection' ? 'connectionProfileId' : kind === 'model' ? 'modelProfileId' : 'runtimeRouteId'] === i.resourceId);
            if (!item || fingerprint(item) !== i.expectedFingerprint) throw Error('Runtime resource fingerprint conflict');
            return { target: { kind, resourceId: i.resourceId }, serverBootId: r.serverBootId, expectedFingerprint: i.expectedFingerprint };
        }, ['Delete original player configuration only after native dependency protection']);
    add('runtime.resource.exact', 'READ', ref, async i => bounded('runtime.resource.exact', await request('POST', '/resources/exact', i)));
    for (const action of ['runtime.prompt.preview', 'runtime.context.preview']) add(action, 'READ', preview,
        async i => bounded(action, await request('POST', '/preview', i)));
    const sample = z.strictObject({ input: z.string().max(524288), persona: z.string().max(524288).optional(),
        materials: z.array(z.string().max(524288)).max(100).optional(),
        history: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), content: z.string().max(524288) })).max(100).optional() });
    const draftRequest = z.strictObject({ ...preview.shape, sample: sample.optional(), resourceProjectId: id.optional() })
        .refine(i => i.sample ? !i.sessionId && !i.projectId && !i.messages?.length : exactSource(i), 'One exact author sample or Session/Project source required');
    const drafts = z.array(z.strictObject({ ref: runtimeRef, expectedFingerprint: digest.nullable(), resource: z.record(z.string(), z.json()) })).max(32);
    const previewRefs = preview.shape.previewRefs;
    const draftPreview = z.strictObject({ request: draftRequest, drafts, baselineDrafts: drafts.optional(), baselineRefs: previewRefs, candidateRefs: previewRefs });
    add('runtime.prompt.draft.preview', 'READ', draftPreview, async i => bounded('runtime.prompt.draft.preview', await request('POST', '/preview/draft', i)));
    const trial = z.strictObject({ request: draftRequest, drafts: drafts.optional(), refs: previewRefs, limits: z.record(z.string(), z.json()), send: z.literal(true) })
        .refine(i => Boolean(i.request.sample), 'Author trial requires an explicit sample');
    add('runtime.authoring.observe', 'READ', z.strictObject({ requestId: id, role: preview.shape.role, sample }),
        async i => bounded('runtime.authoring.observe', await request('POST', '/authoring/observe', i)));
    add('runtime.authoring.try', 'INTERACT', trial, async (i, { before }) => bounded('runtime.authoring.try', await request('POST', '/authoring/try', i, before)), async i => {
        const config = await read('GET', '/configuration');
        const r = await read('POST', '/preview/draft', { request: i.request, drafts: i.drafts ?? [], ...(i.refs ? { candidateRefs: i.refs } : {}) });
        if (r.serverBootId !== config.serverBootId || r.data.sent !== false) throw Error('Author trial source changed');
        return { target: { requestId: i.request.requestId, sampleHash: fingerprint(i.request.sample), runtimeRouteId: i.request.routeRef.runtimeRouteId },
            serverBootId: r.serverBootId, configurationFingerprint: fingerprint(config.data), previewIdentity: r.data.diff.identityFingerprint, limits: i.limits };
    }, ['Explicit exact author sample Provider send with native compute limits; unpublished; no Session commit; observe original operation instead of resending']);
    add('runtime.connection.probe', 'INTERACT', z.strictObject({ connectionProfileId: id, expectedFingerprint: digest }),
    async (i, { before }) => {
        const config = await read('GET', '/configuration'), connection = config.data.connections.find(c => c.connectionProfileId === i.connectionProfileId);
        if (config.serverBootId !== before.serverBootId || fingerprint(connection) !== i.expectedFingerprint) throw new Error('Connection changed before probe');
        return bounded('runtime.connection.probe', await request('POST', '/connections/probe', connection, before));
    }, async i => {
        const r = await read('GET', '/configuration'), connection = r.data.connections.find(c => c.connectionProfileId === i.connectionProfileId);
        if (!connection || fingerprint(connection) !== i.expectedFingerprint) throw Error('Connection fingerprint conflict');
        return { target: { connectionProfileId: i.connectionProfileId, endpoint: connection.endpoint, secretRef: connection.secretRef ?? null },
            serverBootId: r.serverBootId, expectedFingerprint: i.expectedFingerprint };
    },
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
    add('runtime.prompt.candidate.discard', 'DESTRUCTIVE', z.strictObject({ presetId: id, candidateId: digest, expectedCandidateFingerprint: digest }),
        async (i, { before }) => bounded('runtime.prompt.candidate.discard', await request('POST', candidatePath(i, 'discard'), { candidateId: i.candidateId }, before)),
        async i => {
            const r = await read('POST', candidatePath(i, 'inspect'));
            const candidate = r.data.candidates.find(item => item.candidateId === i.candidateId);
            if (!candidate || fingerprint(candidate) !== i.expectedCandidateFingerprint) throw Error('Prompt candidate fingerprint conflict');
            return { target: { presetId: i.presetId, candidateId: i.candidateId }, serverBootId: r.serverBootId, candidateFingerprint: i.expectedCandidateFingerprint };
        }, ['Delete unused candidate revisions under original Runtime Route and Plan reference protection']);
    const { previewRefs: _previewRefs, ...executeFields } = preview.shape;
    const executeSchema = z.strictObject(executeFields).refine(exactSource, 'One exact Session or Project revision required');
    add('runtime.generation.start', 'INTERACT', executeSchema,
        async (i, { before }) => bounded('runtime.generation.start', await request('POST', '/execute/start', { input: i,
            approvedReview: { snapshotFingerprint: before.snapshotFingerprint, configurationFingerprint: before.configurationFingerprint } }, before)), async i => {
            const r = await read('POST', '/preview', i), snapshot = r.data.snapshot;
            if (!snapshot || !r.data.preview) throw new Error('Native pure generation preview unavailable');
            const config = await read('GET', '/configuration'), connection = config.data.connections.find(c => c.connectionProfileId === snapshot.connectionProfileId);
            if (!connection || config.serverBootId !== r.serverBootId) throw new Error('Native generation configuration changed');
            const { createdAt: _time, ...stableSnapshot } = snapshot;
            return { target: { source: snapshot.contextPlan.source, runtimeRouteId: snapshot.runtimeRouteId, connectionProfileId: snapshot.connectionProfileId,
                endpoint: connection.endpoint, secretRef: connection.secretRef ?? null }, serverBootId: r.serverBootId, snapshotFingerprint: fingerprint(stableSnapshot),
                configurationFingerprint: fingerprint({ routes: config.data.routes, models: config.data.models, connections: config.data.connections }),
                economics: snapshot.diagnostics.executionPlan?.economics ?? null };
        }, ['Explicit paid Native Provider execution to the exact original connection destination; Native budget/usage settlement; no implicit Session commit; unknown responses are never resent']);
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

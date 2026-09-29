import { z } from 'zod';
import { redact, safeUrl } from './policy.js';
import { runtimeSchema } from './provenance.js';
import { BROWSER_ADAPTERS, browserAdapterSchema, invokeBrowserAdapter } from './capability-bridge.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const text = z.string().max(1000);
const limit = z.number().int().min(1).max(100).default(30);
const project = { projectId: id };
const session = { sessionId: id };
const work = { packageId: id };
const version = { ...work, packageVersionId: id };
const ref = z.strictObject({ resourceType: z.string().regex(/^core\.[a-z-]+$/), resourceId: id, revision: id,
    scope: z.enum(['library', 'project', 'package']).default('library'), projectId: id.optional(), packageId: id.optional(), packageVersionId: id.optional() });
const filter = { resourceType: text.optional(), search: text.optional() };
const definitions = [];
const add = (action, authority, shape, method, path, options = {}) => definitions.push({ action, authority, shape, method, path, ...options });
const studio = '/api/native/studio', product = '/api/native/product', generation = '/api/native/generation', nativeSession = '/api/native/session';
const p = i => `${studio}/projects/${i.projectId}`;
const s = i => `${product}/sessions/${i.sessionId}`;
const w = i => `${product}/works/${i.packageId}`;
const noParams = () => ({});
const pick = (...keys) => data => Object.fromEntries(keys.filter(k => data?.[k] !== undefined).map(k => [k, data[k]]));

add('session.list', 'Native Product / Session', { packageId: id.optional() }, 'GET', `${product}/sessions`);
add('session.get', 'Native Product / Session', session, 'GET', s, { query: noParams });
add('session.saves', 'Native Product / Save', session, 'GET', s, { query: noParams, project: pick('session', 'saves') });
add('chat.branches', 'Native Product / immutable Timeline', session, 'GET', s, { query: noParams, project: pick('session', 'branches', 'revisions') });
add('chat.history', 'Native Product / immutable Timeline', session, 'GET', i => s(i) + '/history', { query: noParams });
add('chat.read', 'Native Session / immutable committed Timeline', { ...session, revisionId: id.optional(), fromSequence: z.number().int().min(0).default(0), toSequence: z.number().int().min(0).optional(), limit, messageIds: z.array(id).max(100).optional() }, 'POST', `${nativeSession}/timeline`);
add('session.snapshot', 'Native Session', { ...session, revisionId: id.optional() }, 'POST', `${nativeSession}/load`);
add('session.health', 'Native Experience health', session, 'POST', `${nativeSession}/health`);
add('session.runtime', 'Native Runtime descriptor', session, 'POST', `${nativeSession}/runtime/resolve`);
add('session.continuity.graph', 'Native Continuity', { ...session, limit }, 'POST', `${nativeSession}/continuity/graph`);
add('session.continuity.projection', 'Native Continuity', { ...session, viewId: id, revisionId: id.optional() }, 'POST', `${nativeSession}/continuity/projection`);
add('generation.status', 'Native generation scheduler', { operationId: id }, 'GET', i => `${generation}/operations/${i.operationId}`, { query: noParams });

add('build.project.list', 'Native Studio', { summary: z.boolean().default(true) }, 'GET', `${studio}/projects`);
for (const [action, suffix] of [['project.get', ''], ['project.revision', '/revision'], ['source.list', '/sources'], ['resource.closure', '/resources/closure']]) {
    add('build.' + action, 'Native Studio', project, 'GET', i => p(i) + suffix, { query: noParams });
}
add('build.source.read', 'Native Studio source', { ...project, path: text.min(1) }, 'GET', i => p(i) + '/source', { query: i => ({ path: i.path }), project: data => {
    if (data.encoding !== 'base64') return data;
    const bytes = Buffer.from(data.content, 'base64');
    try { return { ...data, encoding: 'utf8', content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }; }
    catch { return { path: data.path, size: bytes.length, encoding: 'binary-omitted', contentHash: createHash('sha256').update(bytes).digest('hex') }; }
} });
add('build.history', 'Native Studio revision history', { ...project, limit }, 'GET', i => p(i) + '/history', { query: i => ({ limit: i.limit }) });
add('build.diff', 'Native Studio revision history', { ...project, revision: id }, 'GET', i => p(i) + `/history/${i.revision}/diff`, { query: noParams });
add('build.resources', 'Native Studio Resource Graph', { ...project, ...filter }, 'GET', `${studio}/resources`);
add('build.validate', 'Native Studio validation', project, 'POST', i => p(i) + '/validate', { body: noParams });
add('build.preflight', 'Native Studio preflight', { ...project, baseRevision: id }, 'POST', i => p(i) + '/preflight', { body: i => ({ baseRevision: i.baseRevision }) });
add('build.frontend.inspect', 'Native Frontend v3 Source Graph / diagnostics', { ...project, baseRevision: id, ownerId: id.default('package'), drafts: z.array(z.strictObject({ path: text.min(1), content: z.string().max(32000) })).max(16).default([]) }, 'POST', i => p(i) + '/frontend/inspect', { body: ({ projectId: _, ...body }) => body });
add('build.preview.list', 'Native Studio Preview', { projectId: id.optional() }, 'GET', `${studio}/previews`);
add('build.preview.get', 'Native Studio compiled Preview UI / runtime identity', { previewId: id }, 'GET', i => `${studio}/previews/${i.previewId}/ui`, { query: noParams });
add('library.list', 'Native Library', filter, 'GET', `${studio}/library/resources`);
add('library.search', 'Native Library', { ...filter, search: text.min(1) }, 'GET', `${studio}/library/resources`);
add('library.get', 'Native Library root / immutable revision inventory', { resourceType: ref.shape.resourceType, resourceId: id }, 'GET', `${studio}/library/resources`, { query: i => ({ resourceType: i.resourceType }), project: (data, i) => data.find(row => row.resourceId === i.resourceId) ?? null });
add('library.exact', 'Native Library getExact', { ref: ref.refine(r => r.scope === 'library', 'Library scope required') }, 'POST', `${studio}/library/resources/exact`);
add('library.graph', 'Native Resource Graph', {}, 'GET', `${studio}/resources/graph`);
add('library.registry', 'Native Resource registry', {}, 'GET', `${studio}/resources/registry`);
for (const [action, suffix, reverse] of [['references', 'references', false], ['usedby', 'references', true], ['delete.safety', 'delete-safety', undefined]]) {
    add('library.' + action, 'Native Resource Graph', { ref }, 'POST', `${studio}/resources/${suffix}`, { body: i => ({ ...i.ref, ...(reverse === undefined ? {} : { reverse }) }) });
}
add('library.bundle.inspect', 'Native Resource bundle closure', { ref }, 'POST', `${studio}/resources/bundle/export`, { project: bundle => ({ format: bundle.format, root: bundle.root, resources: bundle.resources?.map(item => ({ ref: item.ref, dependencies: item.dependencies })) }) });
add('library.fork.preflight', 'Native Resource bundle preflight', { ref }, 'POST', `${studio}/resources/bundle/preflight`, { bundlePreflight: true,
    project: result => ({ root: result.root, canImport: result.canImport, conflicts: result.conflicts, existingOrigins: result.existingOrigins, resources: result.resources?.map(item => ({ source: item.source, ref: item.ref, status: item.status })) }) });
add('library.package.original', 'Native immutable Package resource', { ref: ref.refine(r => r.scope === 'package', 'Package scope required') }, 'POST', `${studio}/resources/package-original`);
add('work.list', 'Native Product Work', {}, 'GET', `${product}/works`);
add('work.get', 'Native Product Work', work, 'GET', w, { query: noParams });
for (const [action, fields] of [['versions', ['package', 'versions']], ['sessions', ['package', 'sessions']], ['status', ['package', 'status', 'preflight', 'error']]]) {
    add('work.' + action, 'Native Product Work', work, 'GET', w, { query: noParams, project: pick(...fields) });
}
add('work.resources', 'Native Product resource setup', { ...work, sessionId: id.optional(), entryPointId: id.optional() }, 'GET', i => w(i) + '/resource-setup', { query: ({ packageId: _, ...q }) => q });
add('package.version.get', 'Native immutable PackageVersion', version, 'GET', i => w(i) + `/versions/${i.packageVersionId}`, { query: noParams });
add('package.manifest', 'Native immutable PackageVersion manifest / permissions / contributions', version, 'GET', i => w(i) + `/versions/${i.packageVersionId}`, { query: noParams });
for (const [action, fields] of [['connection.list', ['connections']], ['model.list', ['models']], ['route.list', ['routes']], ['generation.profiles', ['profiles', 'resources']]]) {
    add(action, 'Native Generation configuration', {}, 'GET', `${generation}/configuration`, { project: pick(...fields) });
}
add('generation.configuration', 'Native Generation configuration', {}, 'GET', `${generation}/configuration`);
add('generation.resources', 'Native Generation exact Library/Project/Package refs', {}, 'GET', `${generation}/resources`);
add('generation.presets', 'Native Generation presets', {}, 'GET', `${generation}/presets`);
add('generation.preset.get', 'Native Generation presets', { presetId: id }, 'GET', i => `${generation}/presets/${i.presetId}`, { query: noParams });
add('generation.retrieval', 'Native Retrieval configuration', {}, 'GET', `${generation}/retrieval`);
add('connection.secrets', 'Native opaque Secret reference inventory (never values)', {}, 'GET', `${generation}/secrets`, { project: rows => rows.map(({ secretId, label }) => ({ secretId, label })) });
add('connection.probe', 'Native Generation provider discovery', { connectionId: id }, 'POST', `${generation}/connections/probe`, { externalEffects: ['provider-network', 'mayIncurCost'], resolveConnection: true });
for (const operation of ['catalog', 'get', 'search']) add('settings.' + operation, 'SettingsRepo scoped observation', { path: operation === 'get' ? text.min(1) : text.default(''), query: text.default(''), offset: z.number().int().min(0).max(100000).default(0), limit }, 'POST', '/api/settings/observe', { body: i => ({ ...i, operation }) });
add('agents.presets.persisted', 'SettingsRepo persisted Orchestrator preset library (browser defaults may differ)', {}, 'POST', '/api/settings/observe', { body: () => ({ operation: 'get', path: 'atri_capabilities/orchestrator/agentWorkspace/presets' }) });
add('agents.bindings.persisted', 'SettingsRepo persisted Orchestrator bindings', {}, 'POST', '/api/settings/observe', { body: () => ({ operation: 'get', path: 'atri_capabilities/orchestrator/agentWorkspace/bindings' }) });
for (const [action, suffix] of [['modules', 'modules'], ['ownership', 'ownership'], ['provenance', 'provenance'], ['runtime', 'runtime-identity']]) add('diagnostics.' + action, 'Atria Diagnostics', {}, 'GET', '/api/diagnostics/' + suffix);
add('diagnostics.logs', 'Atria Diagnostics admin log query', { limit, level: text.optional(), module: text.optional(), text: text.optional(), startTime: z.number().optional(), endTime: z.number().optional(), sinceId: z.number().int().min(0).optional(), correlation: text.optional() }, 'POST', '/api/diagnostics/logs/query');
add('diagnostics.incidents', 'Atria Diagnostics user/admin incidents', { limit, status: text.optional() }, 'POST', '/api/diagnostics/incidents/list');
add('diagnostics.incident.get', 'Atria Diagnostics user/admin incident', { incidentId: id }, 'GET', i => `/api/diagnostics/incidents/${i.incidentId}`, { query: noParams });
add('diagnostics.incident.export', 'Atria Diagnostics user/admin incident export', { incidentId: id, mode: z.enum(['summary', 'full']).default('summary') }, 'POST', i => `/api/diagnostics/incidents/${i.incidentId}/export`, { body: i => ({ mode: i.mode }) });
add('diagnostics.startup.list', 'Atria Startup diagnostics', { limit: z.number().int().min(1).max(20).default(5) }, 'POST', '/api/diagnostics/startup/list');
add('diagnostics.startup.get', 'Atria Startup diagnostics', { sessionId: id }, 'GET', i => `/api/diagnostics/startup/${i.sessionId}`, { query: noParams });
add('diagnostics.startup.compare', 'Atria Startup diagnostics', { currentId: id, previousId: id }, 'POST', '/api/diagnostics/startup/compare');
add('agents.project.tasks', 'Native Studio ProjectAgent', project, 'GET', i => p(i) + '/agent/tasks', { query: noParams });
for (const [action, suffix] of [['get', ''], ['context', '/context']]) add('agents.project.task.' + action, 'Native Studio ProjectAgent', { ...project, taskId: id }, 'GET', i => p(i) + `/agent/tasks/${i.taskId}${suffix}`, { query: noParams });

const outputSchema = z.strictObject({ action: z.string(), authority: z.string(), status: z.number().int(), ok: z.boolean(),
    serverBootId: z.string().nullable(), observedAt: z.string(), data: z.json(),
    page: z.strictObject({ offset: z.number(), totalChars: z.number(), nextOffset: z.number().nullable(), contentHash: z.string() }),
    evidence: z.literal('single authority response; pagination across calls is not an atomic snapshot') });
import { createHash } from 'node:crypto';
const outputPage = { outputOffset: z.number().int().min(0).max(1048576).default(0), outputLimit: z.number().int().min(100).max(64000).default(24000) };
function boundedOutput(action, authority, response, input) {
    const clean = redact(response.data ?? null), serialized = JSON.stringify(clean);
    const { outputOffset: offset, outputLimit: size } = input;
    return { action, authority, status: response.status, ok: response.ok, serverBootId: response.serverBootId ?? null, observedAt: response.observedAt,
        data: offset === 0 && serialized.length <= size ? clean : { format: 'json-text-fragment', text: serialized.slice(offset, offset + size) },
        page: { offset, totalChars: serialized.length, nextOffset: offset + size < serialized.length ? offset + size : null, contentHash: createHash('sha256').update(serialized).digest('hex') },
        evidence: 'single authority response; pagination across calls is not an atomic snapshot' };
}

// This transport is private. Only fixed, reviewed definitions above can reach it.
export async function requestAuthority(browser, method, path, input = {}, guards = {}) {
    const url = safeUrl(path, browser.config.url);
    if (/[?#%]/.test(path)) throw new Error('Invalid fixed authority path.');
    await browser.start();
    const headers = { Accept: 'application/json', 'Cache-Control': 'no-cache' };
    if (method !== 'GET') {
        const csrf = await browser.context.request.get(browser.config.url + '/csrf-token', { maxRedirects: 0, timeout: browser.config.timeout });
        try {
            if (!csrf.ok() || !(csrf.headers()['content-type'] ?? '').includes('json')) throw new Error('CSRF unavailable; authenticate manually.');
            const bytes = await csrf.body();
            if (bytes.length > 8192) throw new Error('Invalid CSRF response.');
            const token = JSON.parse(bytes.toString()).token;
            if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid CSRF response.');
            headers['x-csrf-token'] = token;
        } finally { await csrf.dispose(); }
    } else for (const [key, value] of Object.entries(input)) if (value !== undefined) url.searchParams.set(key, String(value));
    if (guards.serverBootId) headers['x-atria-expected-server-boot-id'] = guards.serverBootId;
    if (guards.expectedFingerprint) headers['if-match'] = guards.expectedFingerprint;
    const response = await browser.context.request.fetch(url.href, { method, headers, ...(method !== 'GET' ? { data: input } : {}), maxRedirects: 0, timeout: browser.config.timeout });
    try {
        const status = response.status();
        if (status >= 300 && status < 400) throw new Error('Authority redirect blocked.');
        if (Number(response.headers()['content-length']) > browser.config.maxResponseBytes) throw new Error('Authority response exceeds bound; narrow the scope.');
        const boot = runtimeSchema.shape.serverBootId.safeParse(response.headers()['x-atria-server-boot-id']);
        const result = { status, ok: response.ok(), serverBootId: boot.success ? boot.data : null, observedAt: new Date().toISOString() };
        if (!(response.headers()['content-type'] ?? '').includes('json')) return { ...result, ok: false, data: { error: 'Authority unavailable or authentication required' } };
        const bytes = await response.body();
        if (bytes.length > browser.config.maxResponseBytes) throw new Error('Authority response exceeds bound; narrow the scope.');
        return { ...result, data: JSON.parse(bytes.toString('utf8')) };
    } finally { await response.dispose(); }
}

export function registerReadActions(registry, browser) {
    for (const d of definitions) {
        registry.register({ version: 1, id: d.action, domain: d.action.split('.')[0], title: d.action + ' — ' + d.authority,
            risk: 'READ', authority: d.authority, adapter: 'fixed-http', externalEffects: d.externalEffects ?? [], guards: [], approval: 'none',
            availability: { available: true, reason: 'Requires authenticated owning endpoint; product validates ownership/admin/exact revision. Runtime failure is reported without fallback.' } },
        z.strictObject({ ...d.shape, ...outputPage }), outputSchema, async input => {
            const { outputOffset: _, outputLimit: __, ...args } = input;
            let payload = d.method === 'GET' ? (d.query ?? (i => i))(args) : (d.body ?? (i => i))(args);
            if (d.resolveConnection) {
                const config = await requestAuthority(browser, 'GET', `${generation}/configuration`);
                if (!config.ok) return boundedOutput(d.action, d.authority, config, input);
                payload = config.data.connections.find(c => c.connectionProfileId === args.connectionId);
                if (!payload) throw new Error('Connection profile unavailable.');
            }
            if (d.bundlePreflight) {
                const bundle = await requestAuthority(browser, 'POST', `${studio}/resources/bundle/export`, { ref: args.ref });
                if (!bundle.ok) return boundedOutput(d.action, d.authority, bundle, input);
                payload = { bundle: bundle.data };
            }
            const response = await requestAuthority(browser, d.method, typeof d.path === 'function' ? d.path(args) : d.path, payload);
            if (response.ok && d.project) response.data = d.project(response.data, args);
            return boundedOutput(d.action, d.authority, response, input);
        });
    }
    for (const d of BROWSER_ADAPTERS) registry.register({ version: 1, id: d.id, domain: d.id.split('.')[0], title: d.id,
        risk: 'READ', authority: d.authority, adapter: 'fixed-browser', externalEffects: d.externalEffects, guards: [], approval: 'none',
        availability: { available: true, reason: d.availability } }, browserAdapterSchema(d.id), z.json(), input => invokeBrowserAdapter(browser, d.id, input));
    return registry;
}

export async function diagnosticSnapshot(executor, status, browser) {
    const current = await status();
    const productDiagnostics = {};
    for (const action of ['diagnostics.modules', 'diagnostics.logs', 'diagnostics.incidents', 'diagnostics.startup.list', 'diagnostics.provenance']) {
        try { productDiagnostics[action] = await executor.execute('READ', { action, input: { outputLimit: 6000 } }); }
        catch { productDiagnostics[action] = { available: false, reason: 'Authority unavailable; inspect the action directly for details.' }; }
    }
    return { status: current, browser: browser.diagnostics(), productDiagnostics,
        activeAuthorityIdentity: { evidence: 'last-observed scoped authority evidence, not current exact verification', scopes: {
            experience: browser.scopedEvidence.experience ?? { available: false, reason: 'No observed Experience authority response' },
            preview: browser.scopedEvidence.preview ?? { available: false, reason: 'No observed Preview authority response' },
        } },
        atomic: false, note: 'Independent reads may span server or scope changes; each response keeps its own serverBootId and timestamp.' };
}

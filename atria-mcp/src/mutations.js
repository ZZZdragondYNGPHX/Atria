import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
const text = z.string().max(32000);
const json = z.record(z.string(), z.json()).refine(v => JSON.stringify(v).length <= 64000, 'JSON exceeds bound');
const path = z.string().min(1).max(512).refine(v => !v.startsWith('/') && !v.includes('\\') && !v.includes('\0') && v.split('/').every(s => s && s !== '.' && s !== '..'), 'Safe source path required');
const origin = z.strictObject({ kind: z.literal('plugin'), id: z.literal('atria-mcp') });
const operation = z.strictObject({ operationId: id,
    operationType: z.enum(['frontend.patch', 'source.write', 'source.move', 'source.delete', 'project.save', 'resource.attach', 'resource.fork', 'resource.update']),
    target: z.strictObject({ resourceType: id.optional(), resourceId: id.optional(), path: path.optional() }), input: json, origin });
const workspace = z.strictObject({ projectId: id, baseRevision: id, workspaceId: id, origin, operations: z.array(operation).min(1).max(32), createdAt: z.number().int().nonnegative().optional() });
const studio = '/api/native/studio', product = '/api/native/product', session = '/api/native/session', generation = '/api/native/generation';
const projectPath = i => `${studio}/projects/${i.projectId}`;
const sessionInput = { sessionId: id, expectedRevisionId: id };
const projectInput = { projectId: id, baseRevision: id };
const snapshotIdentity = data => ({ sessionId: data.session.sessionId, revisionId: data.revision.revisionId, branchId: data.revision.branchId,
    packageVersionId: data.session.packageVersionId, packageContentHash: data.session.packageContentHash });
const equal = (a, b, reason) => { if (fingerprint(a) !== fingerprint(b)) throw new Error(reason); };
const noSecrets = value => { if (JSON.stringify(redact(value)) !== JSON.stringify(value)) throw new Error('Secret material is not accepted.'); };

// Internal transport is reachable only from the fixed definitions below, never via an MCP method/path input.
export function registerMutationActions(registry, browser) {
    const request = (method, path, body = {}, guards = {}) => requestAuthority(browser, method, path, body, guards);
    const read = async (method, path, body = {}) => {
        const response = await request(method, path, body);
        if (!response.ok || !response.serverBootId) throw new Error('Authority guard unavailable: ' + response.status);
        return response;
    };
    const boot = async () => {
        const runtime = await browser.runtimeIdentity();
        if (!runtime?.serverBootId) throw new Error('Current server identity unavailable.');
        return runtime.serverBootId;
    };
    const projectGuard = async i => {
        const response = await read('GET', projectPath(i) + '/revision');
        if (response.data.revision !== i.baseRevision) throw new Error('Project baseRevision conflict.');
        return { target: { projectId: i.projectId }, serverBootId: response.serverBootId, revision: response.data.revision };
    };
    const sessionGuard = async i => {
        const response = await read('POST', session + '/load', { sessionId: i.sessionId });
        if (response.data.revision.revisionId !== i.expectedRevisionId) throw new Error('Session revision conflict.');
        let targetSnapshot = response.data;
        if (i.revisionId && i.revisionId !== i.expectedRevisionId) {
            const historical = await read('POST', session + '/load', { sessionId: i.sessionId, revisionId: i.revisionId });
            if (historical.serverBootId !== response.serverBootId) throw new Error('Server changed during Session guard.');
            targetSnapshot = historical.data;
        }
        if (i.messageId && !targetSnapshot.timeline.some(message => message.messageId === i.messageId)) throw new Error('Message is not in the reviewed Session revision.');
        if (i.branchId) {
            const detail = await read('GET', `${product}/sessions/${i.sessionId}`);
            if (!detail.data.branches.some(branch => branch.branchId === i.branchId)) throw new Error('Branch is not in the target Session.');
        }
        return { target: { sessionId: i.sessionId }, serverBootId: response.serverBootId, identity: snapshotIdentity(response.data) };
    };
    const add = (action, risk, authority, shape, guard, run, effects = []) => registry.register({ version: 1, id: action, domain: action.split('.')[0],
        title: action, risk, authority, adapter: 'fixed-http', externalEffects: effects,
        guards: ['current-server-boot', 'exact-target', 'before-and-after-approval-authority'], approval: 'trusted-approval-required',
        availability: { available: true, reason: 'Explicit action policy, trusted client approval and current owning authority required' } },
    z.strictObject(shape).refine(v => JSON.stringify(v).length <= 128000, 'Input exceeds bound'), z.json(), run, async (i, context) => {
        if ((await browser.runtimeIdentity())?.mutationGuards !== 1) throw new Error('Product mutation guards unavailable; update product authority.');
        return guard(i, context);
    });
    const output = (response, evidence = {}) => {
        const clean = redact(response.data), serialized = JSON.stringify(clean);
        return { ok: response.ok, status: response.status, serverBootId: response.serverBootId,
            data: serialized.length <= 24000 ? clean : { contentHash: fingerprint(clean), omitted: 'Large response; use semantic reads' }, receiptEvidence: evidence };
    };
    const write = async (method, path, body, before, evidence = () => ({})) => {
        const response = await request(method, path, body, before);
        return output(response, response.ok ? evidence(response.data) : {});
    };
    const sessionEvidence = data => ({ after: data?.session && data?.revision ? snapshotIdentity(data) : data,
        recovery: 'Committed Timeline remains immutable; prior branches/revisions remain in Session history.' });

    add('session.rename', 'MUTATE', 'Native Product Session metadata', { sessionId: id, displayTitle: z.string().min(1).max(200), expectedDisplayTitle: z.string().max(200).nullable() },
        async i => { const r = await read('GET', `${product}/sessions/${i.sessionId}`); equal(r.data.session.displayTitle ?? null, i.expectedDisplayTitle, 'Session title conflict.');
            return { target: { sessionId: i.sessionId }, serverBootId: r.serverBootId, displayTitle: i.expectedDisplayTitle }; },
        (i, { before }) => write('PATCH', `${product}/sessions/${i.sessionId}`, { displayTitle: i.displayTitle, expectedDisplayTitle: i.expectedDisplayTitle }, before, data => ({ after: { displayTitle: data.displayTitle ?? i.displayTitle } })));
    add('session.save', 'MUTATE', 'Native Save System', { ...sessionInput, displayName: z.string().max(200).optional() }, sessionGuard,
        (i, { before }) => write('POST', `${product}/sessions/${i.sessionId}/save`, { kind: 'manual', expectedRevisionId: i.expectedRevisionId, displayName: i.displayName }, before,
            data => ({ after: data, created: [{ kind: 'save', id: data.saveId, sessionId: i.sessionId }] })));
    add('session.restore', 'MUTATE', 'Native Save System / Session', { ...sessionInput, saveId: id }, async i => {
        const guard = await sessionGuard(i); const r = await read('GET', `${product}/sessions/${i.sessionId}`);
        if (!r.data.saves?.some(s => s.saveId === i.saveId)) throw new Error('Save not in target Session.'); return guard;
    }, (i, { before }) => write('POST', `${product}/sessions/${i.sessionId}/load`, { saveId: i.saveId, expectedRevisionId: i.expectedRevisionId }, before, sessionEvidence));
    add('chat.branch.fork', 'MUTATE', 'Native Session immutable branch history', { ...sessionInput, revisionId: id, messageId: id.optional(), displayName: z.string().max(200).optional() }, sessionGuard,
        (i, { before }) => write('POST', session + '/command', { sessionId: i.sessionId, expectedRevisionId: i.expectedRevisionId,
            command: { type: 'fork', revisionId: i.revisionId, messageId: i.messageId, displayName: i.displayName } }, before, sessionEvidence));
    add('chat.branch.switch', 'MUTATE', 'Native Session immutable branch history', { ...sessionInput, branchId: id }, sessionGuard,
        (i, { before }) => write('POST', session + '/command', { sessionId: i.sessionId, expectedRevisionId: i.expectedRevisionId, command: { type: 'switch', branchId: i.branchId } }, before, sessionEvidence));
    for (const action of ['chat.restart.from', 'chat.remove.from.active']) add(action, 'MUTATE', 'Native Session coherent revision fork (history retained)',
        { ...sessionInput, revisionId: id }, sessionGuard, (i, { before }) => write('POST', session + '/command', {
            sessionId: i.sessionId, expectedRevisionId: i.expectedRevisionId, command: { type: 'fork', revisionId: i.revisionId } }, before, sessionEvidence));
    add('chat.retry.prepare', 'MUTATE', 'Native Session retry boundary (does not generate)', { ...sessionInput, messageId: id }, sessionGuard,
        (i, { before }) => write('POST', session + '/command', { sessionId: i.sessionId, expectedRevisionId: i.expectedRevisionId, command: { type: 'retry', messageId: i.messageId } }, before, sessionEvidence));
    const routeRef = z.strictObject({ scope: z.literal('player'), runtimeRouteId: id });
    add('chat.send', 'MUTATE', 'Native Generation turn / immutable Session commit', { ...sessionInput, invocationId: id, userInput: text.min(1),
        routeRef: routeRef.optional(), slotBindings: z.record(id, routeRef).optional() }, sessionGuard,
    async (i, { before }) => {
        const appended = await request('POST', session + '/command', { sessionId: i.sessionId, expectedRevisionId: i.expectedRevisionId,
            command: { type: 'timeline', commands: [{ type: 'append', draft: { role: 'user', content: i.userInput } }] } }, before);
        if (!appended.ok) return output(appended);
        const committed = snapshotIdentity(appended.data);
        const message = appended.data.timeline.at(-1);
        const evidence = { after: { input: committed }, created: [{ kind: 'message', id: message.messageId, sessionId: i.sessionId }],
            recovery: 'User input is committed. Read Session and generation.status before recovery; never automatically resubmit chat.send.' };
        if (appended.serverBootId !== before.serverBootId) return { ...output(appended, evidence), ok: false, partial: true };
        let response;
        try {
            response = await request('POST', generation + '/turn/start', { sessionId: i.sessionId, revisionId: committed.revisionId, invocationId: i.invocationId,
                userInput: i.userInput, routeRef: i.routeRef, slotBindings: i.slotBindings }, before);
        } catch {
            return { ...output({ ok: false, status: null, serverBootId: null, data: { error: 'Generation response unconfirmed; inspect owning authority.' } }, evidence), partial: true };
        }
        const uncertain = !response.ok || response.serverBootId !== before.serverBootId;
        return { ...output(response, { ...evidence, after: { input: committed, generation: response.data } }), ok: !uncertain, partial: uncertain };
    }, ['generation', 'provider-network', 'mayIncurCost']);
    for (const action of ['chat.regenerate', 'chat.reenter']) add(action, 'MUTATE', 'Native Session coherent boundary + Native Generation turn',
        { ...sessionInput, messageId: id, invocationId: id, userInput: action === 'chat.reenter' ? text.min(1) : z.literal('').default(''), routeRef: routeRef.optional(), slotBindings: z.record(id, routeRef).optional() },
        async i => {
            const guard = await sessionGuard(i); const r = await read('POST', session + '/load', { sessionId: i.sessionId });
            if (r.data.revision.revisionId !== i.expectedRevisionId) throw new Error('Session revision conflict.');
            const index = r.data.timeline.findIndex(m => m.messageId === i.messageId);
            if (index < 1 || (action === 'chat.reenter' ? r.data.timeline[index].role !== 'user' : r.data.timeline[index].role !== 'assistant' || index !== r.data.timeline.length - 1)) throw new Error('Invalid coherent turn boundary.');
            return { ...guard, boundary: action === 'chat.reenter' ? r.data.timeline[index - 1].messageId : i.messageId };
        }, async (i, { before }) => {
            const command = action === 'chat.regenerate' ? { type: 'retry', messageId: i.messageId }
                : { type: 'fork', revisionId: i.expectedRevisionId, messageId: before.boundary };
            const fork = await request('POST', session + '/command', { sessionId: i.sessionId, expectedRevisionId: i.expectedRevisionId, command }, before);
            if (!fork.ok) return output(fork);
            const response = await request('POST', generation + '/turn/start', { sessionId: i.sessionId, revisionId: fork.data.revision.revisionId,
                invocationId: i.invocationId, userInput: i.userInput, routeRef: i.routeRef, slotBindings: i.slotBindings }, before);
            return { ...output(response, { ...sessionEvidence(fork.data), after: { branch: snapshotIdentity(fork.data), generation: response.data },
                changed: [{ kind: 'session-branch', id: fork.data.revision.branchId }], recovery: 'Branch was derived; original history retained even if generation fails. Poll generation.status; never auto retry.'
                }), partial: !response.ok };
        }, ['generation', 'provider-network', 'mayIncurCost']);
    add('generation.stop', 'INTERACT', 'Native task scheduler cancellation', { operationId: id }, async i => {
        const r = await read('GET', generation + '/operations/' + i.operationId);
        return { target: { operationId: i.operationId }, serverBootId: r.serverBootId, operation: r.data };
    }, (i, { before }) => write('DELETE', generation + '/operations/' + i.operationId, {}, before));

    add('work.start', 'MUTATE', 'Native Product exact Work / PackageVersion', { packageId: id, packageVersionId: id, entryPointId: id, displayTitle: z.string().max(200).optional() }, async i => {
        const r = await read('GET', `${product}/works/${i.packageId}/versions/${i.packageVersionId}`);
        if (!r.data.manifest?.entryPoints?.some(e => e.entryPointId === i.entryPointId)) throw new Error('Exact Work EntryPoint unavailable.');
        const setup = await read('GET', `${product}/works/${i.packageId}/resource-setup`, { entryPointId: i.entryPointId });
        return { target: { packageId: i.packageId, packageVersionId: i.packageVersionId, entryPointId: i.entryPointId }, serverBootId: r.serverBootId, manifestHash: fingerprint(r.data.manifest), setupHash: fingerprint(setup.data) };
    }, (i, { before }) => write('POST', `${product}/works/${i.packageId}/start`, { packageVersionId: i.packageVersionId, entryPointId: i.entryPointId, displayTitle: i.displayTitle }, before,
        data => ({ ...sessionEvidence(data), created: [{ kind: 'session', id: data.session.sessionId, initialRevision: data.revision.revisionId }] })));

    add('build.project.create', 'MUTATE', 'Native Studio ProjectStore', { source: json, files: z.array(z.strictObject({ path, content: text, encoding: z.literal('utf8').default('utf8') })).max(32).default([]) },
        async i => {
            const projectId = id.parse(i.source.project?.projectId);
            const existing = await request('GET', projectPath({ projectId }));
            if (existing.status !== 404) throw new Error('Project must be absent before creation.');
            return { target: { projectId }, serverBootId: await boot(), sourceFingerprint: fingerprint(i) };
        },
        (i, { before }) => write('POST', studio + '/projects', i, before, data => ({ created: [{ kind: 'project', id: i.source.project.projectId, initialRevision: data.revision.revision }], after: { projectId: i.source.project.projectId, contentHash: fingerprint(data) } })));
    const workspaceGuard = async (i, context, requireEvaluation = false) => {
        const w = i.workspace; const guard = await projectGuard(w);
        const inspected = await read('POST', projectPath(w) + '/workspaces/inspect', w);
        const binding = { projectId: w.projectId, baseRevision: w.baseRevision, workspaceId: w.workspaceId,
            operationsFingerprint: fingerprint(inspected.data.workspace.operations), changesFingerprint: fingerprint(inspected.data.changes) };
        if (requireEvaluation) {
            const receipt = context.receipts.get(i.evaluationReceiptId);
            if (!receipt || receipt.status !== 'succeeded' || !['build.change.evaluate', 'build.frontend.evaluate'].includes(receipt.action)
                || receipt.provenance.serverBootId !== guard.serverBootId || receipt.evaluation?.validation?.status !== 'passed') throw new Error('Successful evaluation receipt required.');
            equal(receipt.evaluation.binding, binding, 'Workspace/evaluation drift; re-evaluate.');
            if (receipt.evaluation.preview) {
                const p = receipt.evaluation.preview;
                const current = await read('GET', studio + '/previews/' + p.previewId + '/ui');
                if (current.data.packageVersionId !== p.packageVersionId) throw new Error('Evaluated Preview changed or closed.');
            }
        }
        return { ...guard, workspace: binding };
    };
    // Prepare/inspect have no product persistence and remain READ, but return normalized exact evidence.
    for (const action of ['build.change.prepare', 'build.change.inspect']) registry.register({ version: 1, id: action, domain: 'build', title: action, risk: 'READ',
        authority: 'Native Studio Workspace inspection', adapter: 'fixed-http', externalEffects: [], guards: [], approval: 'none',
        availability: { available: true, reason: 'Native Studio exact base revision required' } }, z.strictObject({ workspace }), z.json(), async i => {
        const r = await read('POST', projectPath(i.workspace) + '/workspaces/inspect', i.workspace); return output(r);
    });
    for (const action of ['build.change.evaluate', 'build.frontend.evaluate']) add(action, 'INTERACT', 'Native Studio temporary evaluation / production Preview compiler',
        { workspace, entryPointId: id.optional() }, workspaceGuard, async (i, { before }) => {
            const r = await request('POST', projectPath(i.workspace) + '/frontend/evaluate', i, before);
            const d = r.data;
            const evidence = r.ok ? { evaluation: { binding: before.workspace, evaluatedChangesFingerprint: fingerprint(d.changes), validation: { status: d.validation?.status ?? 'unknown', contentHash: fingerprint(d.validation ?? null) },
                preview: d.preview ? { previewId: d.preview.previewId, packageVersionId: d.preview.packageVersionId, entryPointId: d.preview.entryPointId,
                    descriptorDigest: fingerprint(d.preview.descriptor) } : null }, after: { baseRevision: i.workspace.baseRevision, restoredBy: 'Native Studio evaluateWorkspace finally' } } : {};
            const result = output(r, evidence); if (d?.validation?.status !== 'passed') result.ok = false; return result;
        });
    add('build.change.apply', 'MUTATE', 'Native Studio executeWorkspace / ChangeSet', { workspace, evaluationReceiptId: z.string().uuid() },
        (i, c) => workspaceGuard(i, c, true), async (i, { before }) => {
            const r = await request('POST', projectPath(i.workspace) + '/workspaces/execute', i.workspace, before);
            const result = output(r, { after: r.data?.changeSet ?? null, changed: [{ kind: 'project', id: i.workspace.projectId }], recovery: 'Use Native Studio revision history; no physical history overwrite.' });
            if (!r.data?.changeSet?.resultingRevision || r.data?.changeSet?.validation?.status !== 'passed') result.ok = false; return result;
        });
    add('build.preview.create', 'INTERACT', 'Native Studio Preview', { ...projectInput, entryPointId: id.optional() }, projectGuard,
        (i, { before }) => write('POST', projectPath(i) + '/preview', { baseRevision: i.baseRevision, entryPointId: i.entryPointId }, before,
            data => ({ after: { previewId: data.preview.previewId, packageVersionId: data.preview.packageVersionId, entryPointId: data.preview.entryPointId }, recovery: 'build.preview.close' })));
    add('build.preview.close', 'INTERACT', 'Native Studio ephemeral Preview', { previewId: id, packageVersionId: id }, async i => {
        const r = await read('GET', `${studio}/previews/${i.previewId}/ui`); equal(r.data.packageVersionId, i.packageVersionId, 'Preview identity conflict.');
        return { target: { previewId: i.previewId }, serverBootId: r.serverBootId, packageVersionId: i.packageVersionId };
    }, (i, { before }) => write('DELETE', `${studio}/previews/${i.previewId}`, {}, before));
    add('build.simulate', 'INTERACT', 'Native Studio isolated recorded/mock scenario', { ...projectInput, scenario: json }, projectGuard,
        (i, { before }) => write('POST', projectPath(i) + '/simulate', { baseRevision: i.baseRevision, scenario: i.scenario }, before), ['temporary-isolated-simulation']);

    // Ordinary UI settings only. A path regex alone must never authorize Agent/Memory/connection policy edits.
    const settingPath = z.enum(['theme', 'font_scale', 'blur_strength', 'shadow_width', 'chat_display', 'waifuMode', 'sheld', 'fast_ui_mode']);
    add('settings.patch', 'MUTATE', 'SettingsRepo atomic JSON Patch test/replace', { path: settingPath, expected: z.union([z.string().max(500), z.number(), z.boolean(), z.null()]), value: z.union([z.string().max(500), z.number(), z.boolean(), z.null()]) },
        async i => { noSecrets(i); const r = await read('POST', '/api/settings/observe', { operation: 'get', path: i.path });
            if (!r.data.found) throw new Error('Setting must already exist.'); equal(r.data.value, i.expected, 'Settings value conflict.');
            return { target: { path: i.path }, serverBootId: r.serverBootId, value: i.expected }; },
        (i, { before }) => write('POST', '/api/settings/patch', { operations: [{ op: 'test', path: '/' + i.path, value: i.expected }, { op: 'replace', path: '/' + i.path, value: i.value }] }, before,
            () => ({ after: { path: i.path, value: i.value }, recovery: 'Guarded inverse patch against the new value.' })));
    // Prompt control updates already provide per-route expected-value concurrency inside the runtime write queue.
    add('runtime.parameters.update', 'MUTATE', 'Native Runtime Route prompt parameters', { runtimeRouteId: id, expected: json, parameters: json }, async i => {
        noSecrets(i); const r = await read('GET', generation + '/prompt-controls/' + i.runtimeRouteId);
        equal(r.data.route.promptParameters ?? {}, i.expected, 'Runtime prompt parameters conflict.');
        return { target: { runtimeRouteId: i.runtimeRouteId }, serverBootId: r.serverBootId, parameters: i.expected };
    }, (i, { before }) => write('PUT', generation + '/prompt-controls/' + i.runtimeRouteId, { expected: i.expected, parameters: i.parameters }, before));
    for (const [action, kind, key] of [['connection.update', 'connections', 'connectionProfileId'], ['model.update', 'models', 'modelProfileId'], ['route.update', 'routes', 'runtimeRouteId']]) {
        add(action, 'MUTATE', 'Native Generation configuration / atomic fingerprint guard', { resourceId: id, expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/), value: json }, async i => {
            noSecrets(i.value);
            if (i.value[key] !== i.resourceId) throw new Error('Configuration target mismatch.');
            const r = await read('GET', generation + '/configuration');
            const value = r.data[kind].find(row => row[key] === i.resourceId) ?? null;
            if (fingerprint(value) !== i.expectedFingerprint) throw new Error('Runtime configuration fingerprint conflict.');
            return { target: { resourceId: i.resourceId, kind }, serverBootId: r.serverBootId, expectedFingerprint: i.expectedFingerprint };
        }, (i, { before }) => write('PUT', generation + '/configuration/' + kind, i.value, before,
            data => ({ after: { resourceId: i.resourceId, fingerprint: fingerprint(data) } })));
    }
    for (const [action, kind, key] of [['library.world.revision.create', 'worlds', 'world'], ['library.knowledge.revision.create', 'knowledge', 'knowledgeBase']]) {
        add(action, 'MUTATE', 'Native Library immutable revision / optimistic root advance', { resourceId: id, baseRevisionId: id.nullable(), content: json }, async i => {
            noSecrets(i.content); const r = await read('GET', `${product}/${kind}/${i.resourceId}`);
            equal(r.data[key].currentRevisionId, i.baseRevisionId, 'Library base revision conflict.');
            return { target: { resourceId: i.resourceId, resourceType: kind }, serverBootId: r.serverBootId, baseRevisionId: i.baseRevisionId };
        }, (i, { before }) => write('POST', `${product}/${kind}/${i.resourceId}/revisions`, { baseRevisionId: i.baseRevisionId, content: i.content }, before,
            data => ({ after: data, recovery: 'Old immutable Library revisions remain; inspect references before changing consumers.' })));
    }
    return registry;
}

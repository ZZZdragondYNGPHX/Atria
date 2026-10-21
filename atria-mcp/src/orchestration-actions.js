import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';
import { jsonTextFragment } from './json-fragment.js';

const nativeId = prefix => z.string().regex(new RegExp('^' + prefix + '_[a-f0-9]{32}$'));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const token = z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/);
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const object = z.record(z.string(), z.json());
const cursor = z.string().min(1).max(16000).nullable().default(null);
const page = { cursor, limit: z.number().int().min(1).max(100).default(30) };
export const planRefSchema = z.strictObject({ planId: nativeId('oplan'), planRevisionId: nativeId('oprev'), definitionHash: hash });
export const sourceSelectorSchema = z.discriminatedUnion('domain', [
    z.strictObject({ domain: z.literal('rp_chat'), controlId: nativeId('rpctl') }),
    z.strictObject({ domain: z.literal('native_session'), sessionId: nativeId('ses'), entryPointId: nativeId('entry').nullable(),
        taskRef: z.strictObject({ taskId: token, variantId: token }).optional() }),
    z.strictObject({ domain: z.literal('project'), projectId: nativeId('project'), taskId: token.nullable() }),
]);
const host = { expectedHostBootId: z.string().min(1).max(256) };
const command = { commandId: nativeId('ocmd'), ...host };
const draft = { planId: nativeId('oplan'), expectedDraftVersion: counter, expectedDefinitionHash: hash };
const run = { runId: nativeId('orun') };
const effect = { ...run, effectId: nativeId('oeffect') };
const runGuard = { ...run, expectedEpoch: counter, expectedStateVersion: counter, expectedGraphRevision: counter };
const authoring = { definition: object, dependencyPins: z.array(z.strictObject({ pinId: token, port: z.enum(['context', 'model', 'tool', 'narrative', 'project', 'evaluation', 'plan']), resourceRef: object, integrity: hash })).max(1000), viewState: object };
const root = '/api/native/orchestration';
const outputPage = { outputOffset: z.number().int().min(0).max(4194304).default(0), outputLimit: z.number().int().min(100).max(64000).default(24000) };
const cleanInput = ({ outputOffset: _, outputLimit: __, expectedHostBootId: ___, commandId: ____, ...body }) => body;
function output(response, input = { outputOffset: 0, outputLimit: 24000 }) {
    const data = redact(response.data ?? null), serialized = JSON.stringify(data);
    const offset = input.outputOffset ?? 0, size = input.outputLimit ?? 24000;
    return { ...response, data: offset === 0 && serialized.length <= size ? data : jsonTextFragment(serialized, offset, size),
        page: { offset, totalChars: serialized.length, nextOffset: offset + size < serialized.length ? offset + size : null, contentHash: fingerprint(data) } };
}

// Only literal Native endpoints are registered below; no caller-selected path,
// effect implementation, private permit or browser Orchestrator is exposed.
export function registerOrchestrationActions(registry, browser, { request = requestAuthority, now = Date.now } = {}) {
    const call = (path, body, guards = {}, commandId = null) => request(browser, 'POST', root + path,
        { schemaVersion: 1, ...(commandId ? { commandId, expectedHostBootId: guards.hostBootId } : {}), body }, guards);
    const read = async (path, body) => {
        const r = await call(path, body);
        if (!r.ok || r.data?.schemaVersion !== 1 || !r.data.hostBootId) throw Error('Native orchestration unavailable: ' + r.status + ' ' + (r.data?.error ?? 'invalid response'));
        return r;
    };
    const identity = async expected => {
        const r = await read('/plans/list', { cursor: null, limit: 1, archived: false });
        if (!r.serverBootId || expected !== r.data.hostBootId) throw Error('Native Host fence changed; obtain a fresh snapshot.');
        return { serverBootId: r.serverBootId, hostBootId: r.data.hostBootId };
    };
    const add = (suffix, risk, shape, path, guardRead = null, effects = []) => {
        const action = 'orchestration.' + suffix;
        registry.register({ version: 1, id: action, domain: 'orchestration', title: action, risk,
            authority: 'Native Plan / Source Binding / Run / Effect authority', adapter: 'fixed-http', externalEffects: effects,
            guards: risk === 'READ' ? [] : ['server-boot', 'native-host-fence', 'exact-input-and-original-CAS'],
            approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Current Native V3 only; no legacy runner or automatic replay' } },
        z.strictObject({ ...(risk === 'READ' ? {} : command), ...shape, ...outputPage }).refine(i => JSON.stringify(i).length <= 1048576, 'Native input exceeds bound'), z.json(),
        async (i, c) => {
            if (risk !== 'READ') await c.track({ commandId: i.commandId, hostBootId: c.before.hostBootId,
                ...(i.runId ? { runId: i.runId } : {}), ...(i.effectId ? { effectId: i.effectId } : {}) });
            const { outputOffset: _offset, outputLimit: _limit, ...readBody } = i;
            const r = await call(path, risk === 'READ' ? readBody : cleanInput(i), risk === 'READ' ? {} : c.before, risk === 'READ' ? null : i.commandId);
            if (risk !== 'READ' && r.data?.outcome?.runId) await c.track({ runId: r.data.outcome.runId });
            return output(r, i);
        }, risk === 'READ' ? null : async i => {
            const frame = await identity(i.expectedHostBootId);
            const evidence = guardRead ? await read(guardRead.path, guardRead.body(i)) : null;
            if (evidence && (evidence.serverBootId !== frame.serverBootId || evidence.data.hostBootId !== frame.hostBootId)) throw Error('Authority changed during guard');
            return { ...frame, target: { ...(i.sourceSelector ?? {}), ...(i.planId ? { planId: i.planId } : {}), ...(i.runId ? { runId: i.runId } : {}), commandId: i.commandId },
                inputHash: fingerprint(cleanInput(i)), ...(evidence ? { authorityHash: fingerprint(evidence.data.outcome) } : {}) };
        }, risk === 'READ' ? null : i => ({ commandId: i.commandId, expectedHostBootId: i.expectedHostBootId, inputHash: fingerprint(cleanInput(i)),
            body: JSON.stringify(cleanInput(i)).length <= 6000 ? cleanInput(i) : { omitted: 'Inspect the exact authored input before authorizing this hash.' } }));
    };
    add('command.get', 'READ', { commandId: command.commandId }, '/commands/get');
    add('plan.list', 'READ', { ...page, archived: z.boolean().default(false) }, '/plans/list');
    add('plan.get', 'READ', { planId: nativeId('oplan') }, '/plans/get');
    add('plan.revisions', 'READ', { planId: nativeId('oplan'), ...page }, '/plans/revisions');
    add('plan.revision', 'READ', { planRef: planRefSchema }, '/plans/revision');
    add('plan.validate', 'READ', draft, '/plans/validate');
    const currentDraft = { path: '/plans/get', body: i => ({ planId: i.planId }) };
    add('plan.create', 'MUTATE', authoring, '/plans/create', null, ['persist-Plan-draft']);
    add('plan.save', 'MUTATE', { ...draft, ...authoring }, '/plans/save', currentDraft, ['persist-Plan-draft']);
    add('plan.publish', 'MUTATE', { ...draft, validationDigest: hash }, '/plans/publish', currentDraft, ['publish-immutable-Plan-revision', 'does-not-execute']);
    add('plan.fork', 'MUTATE', { sourcePlanId: nativeId('oplan'), mode: z.enum(['fork', 'derive']), title: z.string().trim().min(1).max(200),
        planRef: planRefSchema.optional(), expectedDraftVersion: counter.optional(), expectedDefinitionHash: hash.optional() }, '/plans/fork',
        { path: '/plans/get', body: i => ({ planId: i.sourcePlanId }) }, ['persist-independent-Plan-draft']);
    add('plan.archive', 'MUTATE', { ...draft, archived: z.boolean() }, '/plans/archive', currentDraft, ['change-Plan-archive-state']);
    add('plan.delete', 'DESTRUCTIVE', draft, '/plans/delete', currentDraft, ['delete-Plan-under-native-reference-protection']);
    add('dependency.inspect', 'READ', { pinId: token, port: authoring.dependencyPins.element.shape.port, resourceRef: object }, '/dependencies/inspect');
    add('binding.get', 'READ', { sourceSelector: sourceSelectorSchema }, '/bindings/get');
    add('binding.save', 'MUTATE', { sourceSelector: sourceSelectorSchema, planRef: planRefSchema, expectedVersion: counter.nullable() }, '/bindings/save',
        { path: '/bindings/get', body: i => ({ sourceSelector: i.sourceSelector }) }, ['select-exact-Plan-revision', 'does-not-execute']);
    add('run.list', 'READ', { sourceSelector: sourceSelectorSchema, ...page }, '/runs/list');
    add('run.observe', 'READ', { ...run, ...page }, '/runs/observe');
    add('run.details', 'READ', { ...run, collection: z.enum(['nodes', 'edges', 'attempts', 'effects', 'approvals', 'events']), ...page }, '/runs/details');
    add('run.diagnostics', 'READ', run, '/runs/diagnostics');
    const currentRun = { path: '/runs/diagnostics', body: i => ({ runId: i.runId }) };
    add('run.cancel', 'MUTATE', { ...runGuard, reasonCode: token }, '/runs/cancel', currentRun, ['invalidate-pending-approvals', 'preserve-dispatched-effects-and-fees']);
    add('run.recover', 'MUTATE', runGuard, '/runs/recover', currentRun, ['rebind-native-Host-fence', 'invalidate-approvals', 'does-not-resume']);
    add('run.reconcile', 'MUTATE', runGuard, '/runs/reconcile', currentRun, ['persist-reconciliation-request', 'observe-original-domain-receipt', 'no-resend']);
    add('tool.prepare', 'MUTATE', { planRef: planRefSchema }, '/tools/prepare', null, ['persist-Run-Attempt-Effect', 'local-compute-accounting']);
    add('tool.dispatch', 'MUTATE', effect, '/tools/dispatch', currentRun, ['execute-exact-original-Tool', 'possible-network-costs-and-declared-Tool-effects']);
    add('tool.observe', 'READ', effect, '/tools/observe');
    add('tool.consume', 'READ', effect, '/tools/consume');
    add('approval.launch', 'MUTATE', { ...run, approvalId: nativeId('oapproval') }, '/approvals/launch', currentRun, ['create-short-lived-loopback-Review-link', 'does-not-approve']);

    registerFormalCommit(registry, browser, { request, read, call, identity, now });
    const rpInput = z.strictObject({ controlId: nativeId('rpctl'), floor: counter, requestId: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
        routeRef: z.strictObject({ scope: z.literal('player'), runtimeRouteId: nativeId('route') }) });
    const rpCall = (suffix, body, guards = {}) => request(browser, 'POST', '/api/native/generation/rp/' + suffix, body, guards);
    const rpDescriptor = (id, risk, effects) => ({ version: 1, id, domain: 'orchestration', title: id, risk,
        authority: 'Original RpRunControl / NativeRpOrchestrationAuthority', adapter: 'fixed-http', externalEffects: effects,
        guards: risk === 'READ' ? [] : ['original-chat-source', 'Host-fence', 'exact-source-Plan-Route-and-budget'],
        approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Explicit current Native RP narration only; known original requests are observation-only' } });
    registry.register(rpDescriptor('orchestration.rp.source.bind', 'MUTATE', ['create-or-bind-RP-RunControl', 'persist-original-Chat-header']),
        z.strictObject({ ...host, locator: z.strictObject({ charDir: z.string().min(1).max(255).nullable(), name: z.string().min(1).max(255),
            isGroup: z.boolean(), groupId: z.string().min(1).max(255).nullable() }) }), z.json(), async (i, c) => output(await rpCall('source', i, c.before)),
        async i => ({ ...await identity(i.expectedHostBootId), target: { locator: i.locator } }));
    registry.register(rpDescriptor('orchestration.rp.preflight', 'READ', []), rpInput, z.json(), async i => output(await rpCall('preflight', i)));
    registry.register(rpDescriptor('orchestration.rp.start', 'MUTATE', ['explicit-paid-native-model-generation-and-declared-graph-work', 'original-RP-assistant-output', 'original-Run-compute-settlement']),
        z.strictObject({ ...host, input: rpInput, expectedPreflightFingerprint: hash }), z.json(),
        async (i, c) => {
            const response = await rpCall('start', i, c.before);
            if (response.ok && response.data.operationId) await c.track({ productOperationId: response.data.operationId, hostBootId: c.before.hostBootId });
            return output(response);
        }, async i => {
            const frame = await identity(i.expectedHostBootId), r = await rpCall('preflight', i.input);
            if (!r.ok || r.serverBootId !== frame.serverBootId || r.data.hostBootId !== frame.hostBootId || fingerprint(r.data) !== i.expectedPreflightFingerprint) throw Error('Native RP preflight changed');
            return { ...frame, target: { controlId: i.input.controlId, requestId: i.input.requestId }, review: r.data };
        });
    return registry;
}

function registerFormalCommit(registry, browser, { request, read, call, identity, now }) {
    const target = { projectId: nativeId('project'), taskId: token };
    const path = i => '/api/native/studio/projects/' + i.projectId + '/agent/tasks/' + i.taskId + '/commit';
    const fixed = (suffix, i, body, guards = {}) => request(browser, 'POST', path(i) + '/' + suffix, body, guards);
    const prepareShape = { commandId: command.commandId, planRef: planRefSchema, expectedSequence: counter, expectedReviewHash: hash, computeBudget: object };
    const prepareBody = i => Object.fromEntries(Object.keys(prepareShape).map(k => [k, i[k]]));
    const guard = async i => {
        const frame = await identity(i.expectedHostBootId);
        const preflight = await fixed('preflight', i, prepareBody(i));
        if (!preflight.ok || preflight.serverBootId !== frame.serverBootId || preflight.data.hostBootId !== frame.hostBootId) throw Error('Native formal commit preflight unavailable or stale: ' + preflight.status);
        return { ...frame, target: { projectId: i.projectId, taskId: i.taskId }, preflight: preflight.data };
    };
    const descriptor = (id, risk, effects) => ({ version: 1, id, domain: 'orchestration', title: id, risk,
        authority: 'Original NativeProjectCommitAuthority / isolated Review Origin / Studio commit Receipt', adapter: 'fixed-http', externalEffects: effects,
        guards: risk === 'READ' ? [] : ['exact-native-preflight', 'Host-fence', 'original-Review-required', 'single-dispatch-within-five-minute-MCP-authorization'],
        approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Narrow native formal_commit; direct Studio creation remains a separate explicit workflow' } });
    registry.register(descriptor('orchestration.project.commit.preflight', 'READ', []), z.strictObject({ ...target, ...prepareShape }), z.json(), async i => output(await fixed('preflight', i, prepareBody(i))));
    registry.register(descriptor('orchestration.project.commit.observe', 'READ', []), z.strictObject({ ...target, ...effect }), z.json(), async i => output(await fixed('observe', i, { runId: i.runId, effectId: i.effectId })));
    const continueCommit = async (i, c, refs) => {
        await c.track({ runId: refs.runId, effectId: refs.effectId, approvalId: refs.approvalId, state: 'waiting_native_approval' });
        if (refs.status !== 'waiting_approval') return { ok: false, partial: true, data: refs, receiptEvidence: { recovery: 'Observe exact native Run and commit; never prepare again with a new commandId.' } };
        const launched = await call('/approvals/launch', { runId: refs.runId, approvalId: refs.approvalId }, c.before, i.commandId);
        if (!launched.ok) return { ...output(launched), partial: true, receiptEvidence: { after: refs, recovery: 'Review channel unavailable; existing native Run is retained. Inspect it before taking further action.' } };
        c.publish({ state: 'waiting_native_approval', runId: refs.runId, effectId: refs.effectId, approvalId: refs.approvalId,
            review: launched.data.outcome, authorizationExpiresAt: c.authorizationExpiresAt });
        const decision = await c.suspend(async () => {
            const deadline = Math.min(c.authorizationExpiresAt, launched.data.outcome.expiresAt);
            while (now() < deadline) {
                c.assertContinuation();
                let approval, cursor = null;
                do {
                    c.assertContinuation();
                    const observed = await read('/runs/details', { runId: refs.runId, collection: 'approvals', cursor, limit: 100 });
                    if (observed.data.hostBootId !== c.before.hostBootId || observed.serverBootId !== c.before.serverBootId) throw Error('Host changed while awaiting Native Review');
                    approval = observed.data.outcome.items.find(row => row.approvalId === refs.approvalId);
                    cursor = observed.data.outcome.cursor;
                } while (!approval && cursor);
                if (!approval || approval.status !== 'pending') return approval?.status ?? 'missing';
                await delay(Math.min(1000, Math.max(1, deadline - now())), undefined, { signal: c.signal });
            }
            return 'expired';
        });
        c.assertContinuation();
        if (decision !== 'approved') return { ok: false, data: { ...refs, status: decision }, receiptEvidence: { after: { ...refs, status: decision }, recovery: 'No dispatch. Inspect original native state; fresh authorization is required to continue.' } };
        // Recheck immutable Plan + original source descriptor after reacquiring
        // the source lock. Native dispatch independently revalidates its grant,
        // approval, budget, epoch and original business writer.
        await identity(i.expectedHostBootId);
        const source = await read('/dependencies/inspect', { pinId: 'commit', port: 'project', resourceRef: { kind: 'native_project_commit', projectId: i.projectId, taskId: i.taskId } });
        if (source.data.outcome.integrity !== c.before.preflight.descriptorIntegrity) throw Error('Project source changed while awaiting Native Review');
        c.assertContinuation();
        await c.track({ state: 'running' });
        c.publish({ state: 'dispatching', runId: refs.runId, effectId: refs.effectId });
        const response = await fixed('dispatch', i, { runId: refs.runId, effectId: refs.effectId }, c.before);
        return { ...output(response), receiptEvidence: { after: { ...refs, commit: response.data }, recovery: 'Use original commit.observe for business completion, including committed_pending_output. Never resend an unknown dispatch.' } };
    };
    const workflowEffects = ['prepare-or-resume-original-Run-and-local-compute', 'launch-isolated-native-Review',
        'after-original-user-approval-automatically-dispatch-this-exact-Project-commit-once', 'publish-business-Receipt-and-settle-local-compute'];
    registry.register(descriptor('orchestration.project.commit', 'MUTATE', workflowEffects),
        z.strictObject({ ...target, ...prepareShape, ...host }), z.json(), async (i, c) => {
            await c.track({ commandId: i.commandId, hostBootId: c.before.hostBootId, domainTarget: { projectId: i.projectId, taskId: i.taskId } });
            const prepared = await fixed('prepare', i, prepareBody(i), c.before);
            if (!prepared.ok) return output(prepared);
            const refs = z.strictObject({ ...effect, approvalId: nativeId('oapproval'), status: z.string() }).parse(prepared.data);
            return continueCommit(i, c, refs);
        }, guard);
    registry.register(descriptor('orchestration.project.commit.resume', 'MUTATE', workflowEffects),
        z.strictObject({ ...target, ...effect, ...command }), z.json(), async (i, c) => {
            await c.track({ commandId: i.commandId, hostBootId: c.before.hostBootId, runId: i.runId, effectId: i.effectId, domainTarget: { projectId: i.projectId, taskId: i.taskId } });
            const resumed = await fixed('resume', i, { runId: i.runId, effectId: i.effectId }, c.before);
            if (!resumed.ok) return output(resumed);
            const refs = z.strictObject({ ...effect, approvalId: nativeId('oapproval'), status: z.string() }).parse(resumed.data);
            return continueCommit(i, c, refs);
        }, async i => {
            const frame = await identity(i.expectedHostBootId), observed = await fixed('observe', i, { runId: i.runId, effectId: i.effectId });
            if (!observed.ok || observed.serverBootId !== frame.serverBootId || observed.data.status !== 'ready') throw Error('Only original ready, unclaimed commit Effects can resume; observe unknown dispatch instead');
            const diagnostics = await read('/runs/diagnostics', { runId: i.runId });
            if (diagnostics.data.hostBootId !== frame.hostBootId || !diagnostics.data.outcome.controls.resume) throw Error('Native commit resume is not available; inspect current Run controls');
            const source = await read('/dependencies/inspect', { pinId: 'commit', port: 'project', resourceRef: { kind: 'native_project_commit', projectId: i.projectId, taskId: i.taskId } });
            return { ...frame, target: { projectId: i.projectId, taskId: i.taskId, runId: i.runId, effectId: i.effectId },
                preflight: { descriptorIntegrity: source.data.outcome.integrity }, controlsHash: fingerprint(diagnostics.data.outcome.controls) };
        });
}

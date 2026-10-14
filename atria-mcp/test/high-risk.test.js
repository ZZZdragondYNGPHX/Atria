import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { ActionRegistry, PolicyCeiling, RiskExecutor, ReceiptStore, fingerprint } from '../src/kernel.js';
import { PackageArtifacts, registerHighRiskActions } from '../src/high-risk.js';
import { registerAgentDelegation } from '../src/agent-delegation.js';
import { AtriaBrowser } from '../src/browser.js';
import { httpFixture } from './helpers.js';

function stageFor(artifacts, bytes, boot = randomUUID()) {
    return { artifactRef: { artifactId: randomUUID(), contentHash: createHash('sha256').update(bytes).digest('hex'), totalBytes: bytes.length,
        sourceRevision: 'r1', clientInstanceId: artifacts.clientInstanceId, serverBootId: boot }, owner: 'fixture-owner',
        source: { kind: 'studio-project', projectId: 'project', revision: 'r1' }, mediaType: 'application/octet-stream',
        expiresAt: Date.now() + 900000, receivedBytes: bytes.length, state: 'complete', maxChunkBytes: 1048576 };
}

function fixture() {
    const boot = randomUUID(), artifacts = new PackageArtifacts(), bytes = Buffer.from('fixture archive');
    const stage = { artifactRef: { artifactId: randomUUID(), contentHash: createHash('sha256').update(bytes).digest('hex'), totalBytes: bytes.length,
        sourceRevision: 'r1', clientInstanceId: artifacts.clientInstanceId, serverBootId: boot }, owner: 'fixture-owner',
        source: { kind: 'studio-project', projectId: 'project', revision: 'r1' }, mediaType: 'application/octet-stream',
        expiresAt: Date.now() + 900000, receivedBytes: bytes.length, state: 'complete', maxChunkBytes: 1048576 };
    const artifact = artifacts.put(bytes, { fixture: true }, stage);
    let base = null, safe = true, dependent = false, revision = 'r1', writes = 0, approvals = 0, uses = 1;
    const response = data => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }), body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ serverBootId: boot, highRiskGuards: 1 }),
        context: { request: { get: async () => response({ token: 'private' }), fetch: async (url, options) => {
            if (url.endsWith('/preflight')) return response({ packageId: 'pkg', packageVersionId: 'v2', packageContentHash: artifact.contentHash,
                permissions: [{ permission: 'web', required: true }], requiredPermissions: ['web'], capabilities: [], update: { previous: base ? { packageVersionId: base } : null, pinnedSessions: [] } });
            if (url.endsWith('/revision')) return response({ revision });
            if (options.method === 'DELETE') { writes++; return response({ deleted: true }); }
            if (url.endsWith('/delete-safety')) {
                assert.equal(options.data.resourceType, 'core.world'); assert.equal(options.data.resourceId, 'world');
                assert.equal(options.data.ref, undefined);
                return response({ safe, references: safe ? [] : ['consumer'] });
            }
            if (url.endsWith('/works/pkg')) return response({ package: { currentVersionId: 'v1' } });
            if (url.includes('/sessions?')) return response(dependent ? [{ sessionId: 'dependent' }] : []);
            if (url.endsWith('/install')) { assert.equal(options.data.baseVersionId, base); assert.deepEqual(options.data.artifactRef, stage.artifactRef); assert.equal(options.data.data, undefined); assert.equal(options.headers['x-atria-expected-server-boot-id'], boot); writes++; base = 'v2'; return response({ installed: true }); }
            throw Error(url);
        } } } };
    const registry = registerHighRiskActions(new ActionRegistry(), browser, {}, artifacts), receipts = new ReceiptStore();
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { receipts, approve: async () => { approvals++; return { action: 'accept', content: { authorize: true, uses } }; } });
    return { boot, artifacts, artifact, registry, receipts, executor, get writes() { return writes; }, get approvals() { return approvals; },
        set base(v) { base = v; }, set safe(v) { safe = v; }, set dependent(v) { dependent = v; }, set revision(v) { revision = v; }, set uses(v) { uses = v; } };
}

test('physical deletion is one-shot and owning safety blocks before approval', async () => {
    const f = fixture(), args = { action: 'build.project.delete', input: { projectId: 'project', baseRevision: 'r1' } };
    f.uses = 2; await assert.rejects(f.executor.execute('DESTRUCTIVE', args), /scope/); assert.equal(f.writes, 0);
    f.uses = 1; const result = await f.executor.execute('DESTRUCTIVE', args);
    assert.deepEqual(result.receipt.deleted, [{ kind: 'project', id: 'project' }]); assert.equal(result.lease.remaining, 0);
    await assert.rejects(f.executor.execute('DESTRUCTIVE', { ...args, leaseId: result.lease.leaseId }), /Lease/);
    f.safe = false; const approvals = f.approvals;
    await assert.rejects(f.executor.execute('DESTRUCTIVE', { action: 'library.revision.delete', input: { ref: { scope: 'library', resourceType: 'core.world', resourceId: 'world', revision: 'revision' } } }), /referenced/);
    f.dependent = true; await assert.rejects(f.executor.execute('DESTRUCTIVE', { action: 'work.delete', input: { packageId: 'pkg', baseVersionId: 'v1' } }), /dependent/);
    assert.equal(f.approvals, approvals);
    await assert.rejects(f.executor.execute('DESTRUCTIVE', { ...args, input: { ...args.input, force: true } }));
});

test('owned cleanup rejects forged, foreign, failed and wrong-boot/object receipts', async () => {
    const f = fixture(), input = { projectId: 'project', baseRevision: 'r1' };
    for (const evidence of [{ status: 'rejected' }, { provenance: { serverBootId: randomUUID() } }, { created: [{ kind: 'project', id: 'other' }] }]) {
        const receipt = f.receipts.put({ status: 'succeeded', provenance: { serverBootId: f.boot }, created: [{ kind: 'project', id: 'project', initialRevision: 'r1' }], ...evidence });
        await assert.rejects(f.executor.execute('DESTRUCTIVE', { action: 'build.project.delete.owned', input: { ...input, creatingReceiptId: receipt.receiptId } }), /creating receipt/);
    }
    await assert.rejects(f.executor.execute('DESTRUCTIVE', { action: 'build.project.delete.owned', input: { ...input, creatingReceiptId: randomUUID() } }), /creating receipt/);
    assert.equal(f.approvals, 0);
    const receipt = f.receipts.put({ status: 'succeeded', provenance: { serverBootId: f.boot }, created: [{ kind: 'project', id: 'project', initialRevision: 'r1' }] });
    assert.equal((await f.executor.execute('DESTRUCTIVE', { action: 'build.project.delete.owned', input: { ...input, creatingReceiptId: receipt.receiptId } })).receipt.status, 'succeeded');
});

test('Package handles and review bind bytes, base, permissions, preflight and instance', async () => {
    const f = fixture(), artifactId = f.artifact.artifactId;
    const preflight = await f.executor.execute('READ', { action: 'package.install.preflight', input: { artifactId } });
    const reviewInput = { artifactId, preflightHash: preflight.preflightHash, grantedPermissions: ['web'] };
    await assert.rejects(f.executor.execute('INTERACT', { action: 'package.install.review', input: { ...reviewInput, grantedPermissions: [] } }), /Permission/);
    const review = await f.executor.execute('INTERACT', { action: 'package.install.review', input: reviewInput });
    const install = { action: 'package.install', input: { artifactId, reviewReceiptId: review.receipt.receiptId } };
    await assert.rejects(f.executor.execute('MUTATE', { ...install, input: { ...install.input, reviewReceiptId: randomUUID() } }), /review/);
    f.base = 'changed'; await assert.rejects(f.executor.execute('MUTATE', install), /changed/); assert.equal(f.writes, 0);
    f.base = null; const installed = await f.executor.execute('MUTATE', install);
    assert.equal(installed.receipt.parentReceiptId, review.receipt.receiptId); assert.equal(installed.receipt.status, 'succeeded');
    assert.doesNotMatch(JSON.stringify(installed), /Zml4dHVyZSBhcmNoaXZl/);
    let now = Date.now(); const store = new PackageArtifacts({ now: () => now });
    const expiryBytes = Buffer.from('one');
    const a = store.put(expiryBytes, {}, { ...stageFor(store, expiryBytes), expiresAt: now + 100 }); now = a.expiresAt;
    assert.throws(() => store.get(a.artifactId), /expired/); assert.throws(() => f.artifacts.get(a.artifactId), /Unknown/);
});

test('Native package build uses fixed bounded binary chunks and rejects corrupt proofs', async () => {
    const artifacts = new PackageArtifacts(), boot = randomUUID(), bytes = Buffer.alloc(2 * 1024 * 1024 + 17, 0xa5), stage = stageFor(artifacts, bytes, boot);
    const requests = []; let corrupt = false;
    const response = (body, headers = {}, status = 200) => ({ ok: () => true, status: () => status,
        headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot, ...headers }),
        body: async () => Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {},
        runtimeIdentity: async () => ({ serverBootId: boot, highRiskGuards: 1 }), context: { request: {
            get: async () => response({ token: 'private' }), fetch: async (url, options) => {
                requests.push({ url, options }); const path = new URL(url);
                if (path.pathname.endsWith('/revision')) return response({ revision: 'r1' });
                if (path.pathname.endsWith('/build-artifact')) {
                    assert.deepEqual(options.data, { baseRevision: 'r1', clientInstanceId: artifacts.clientInstanceId });
                    return response({ artifact: stage, manifest: { name: 'large fixture' } });
                }
                assert.equal(path.pathname, '/api/native/product/artifacts/' + stage.artifactRef.artifactId + '/chunk');
                assert.equal(path.searchParams.get('contentHash'), stage.artifactRef.contentHash);
                assert.equal(path.searchParams.get('clientInstanceId'), artifacts.clientInstanceId);
                assert.equal(options.headers['x-atria-expected-server-boot-id'], boot);
                const offset = Number(path.searchParams.get('offset')), length = Number(path.searchParams.get('length'));
                assert.ok(length <= 1048576); const chunk = bytes.subarray(offset, offset + length);
                return response(chunk, { 'content-type': 'application/octet-stream', 'content-length': String(length),
                    'x-atria-chunk-sha256': corrupt ? '0'.repeat(64) : createHash('sha256').update(chunk).digest('hex'),
                    etag: '"' + stage.artifactRef.contentHash + '"', 'content-range': `bytes ${offset}-${offset + length - 1}/${bytes.length}` }, 206);
            },
        } } };
    const registry = registerHighRiskActions(new ActionRegistry(), browser, {}, artifacts);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => ({ action: 'accept', content: { authorize: true } }) });
    const input = { action: 'build.package.create', input: { projectId: 'project', baseRevision: 'r1' } };
    const result = await executor.execute('INTERACT', input);
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(result.result.artifact.size, bytes.length);
    assert.equal(requests.filter(item => new URL(item.url).pathname.endsWith('/chunk')).length, 3);
    assert.ok(JSON.stringify(result).length < 12000); assert.doesNotMatch(JSON.stringify(result), /"data":\[|paWlpaWl/);
    corrupt = true;
    const failed = await executor.execute('INTERACT', input);
    assert.notEqual(failed.receipt.status, 'succeeded');
    artifacts.clear();
});

test('delegated children cannot exceed ceiling, payload or once-only envelope and link to parent', async () => {
    const registry = new ActionRegistry(); let writes = 0, approvals = 0;
    const d = { version: 1, domain: 'fixture', title: 'fixture', risk: 'MUTATE', authority: 'fixture', adapter: 'test', externalEffects: [], guards: ['exact'], approval: 'trusted-approval-required', availability: { available: true, reason: '' } };
    const guard = () => ({ target: 'one', serverBootId: 'boot' });
    registry.register({ ...d, id: 'memory.node.edit' }, z.strictObject({ value: z.literal('approved') }), z.json(), () => { writes++; return { ok: true }; }, guard);
    registry.register({ ...d, id: 'agent.run.start' }, z.strictObject({ operations: z.array(z.strictObject({ action: z.string(), input: z.json() })) }), z.json(), async (_i, c) => {
        const child = await c.executeChild(0, { runId: 'run', stepId: 'step' });
        await assert.rejects(c.executeChild(0, {}), /spent/); await assert.rejects(c.executeChild(1, {}), /absent/);
        return { ok: true, child: child.receipt.receiptId };
    }, guard);
    const input = { operations: [{ action: 'memory.node.edit', input: { value: 'approved' } }] };
    const blocked = new RiskExecutor(registry, new PolicyCeiling(registry, ['agent.run.start']));
    await assert.rejects(blocked.execute('MUTATE', { action: 'agent.run.start', input }), /Ceiling/);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => { approvals++; return { action: 'accept', content: { authorize: true } }; } });
    const result = await executor.execute('MUTATE', { action: 'agent.run.start', input });
    assert.equal(writes, 1); assert.equal(approvals, 1); assert.equal(result.receipt.childReceiptIds.length, 1);
    assert.equal(executor.receipts.get(result.result.child).parentReceiptId, result.receipt.receiptId);
    assert.equal(fingerprint(input), fingerprint(structuredClone(input)));
});

test('installed Package export preserves exact immutable bytes and cannot accept another version/source proof', async () => {
    const artifacts = new PackageArtifacts(), boot = randomUUID(), bytes = Buffer.alloc(1048593, 0x17), stage = stageFor(artifacts, bytes, boot), requests = [];
    stage.source = { kind: 'installed-package', packageId: 'pkg', packageVersionId: 'pv1' }; stage.artifactRef.sourceRevision = 'pv1';
    const version = { packageId: 'pkg', packageVersionId: 'pv1', packageContentHash: stage.artifactRef.contentHash };
    const response = (body, headers = {}, status = 200) => ({ ok: () => status < 400, status: () => status,
        headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot, ...headers }), body: async () => Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ serverBootId: boot, highRiskGuards: 1 }),
        context: { request: { get: async () => response({ token: 'fixture' }), fetch: async (url, options) => {
            requests.push({ url, options }); const parsed = new URL(url);
            if (parsed.pathname.endsWith('/identity')) return response({ packageVersion: version });
            if (parsed.pathname.endsWith('/export-artifact')) { assert.deepEqual(options.data, { packageId: version.packageId, packageVersionId: version.packageVersionId, expectedContentHash: version.packageContentHash, clientInstanceId: artifacts.clientInstanceId }); return response(stage); }
            const offset = Number(parsed.searchParams.get('offset')), length = Number(parsed.searchParams.get('length')), chunk = bytes.subarray(offset, offset + length);
            return response(chunk, { 'content-type': 'application/octet-stream', 'content-length': String(length), 'x-atria-chunk-sha256': createHash('sha256').update(chunk).digest('hex'),
                etag: '"' + stage.artifactRef.contentHash + '"', 'content-range': `bytes ${offset}-${offset + length - 1}/${bytes.length}` }, 206);
        } } } };
    const registry = registerHighRiskActions(new ActionRegistry(), browser, {}, artifacts), executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()),
        { approve: async () => ({ action: 'accept', content: { authorize: true } }) });
    const input = { packageId: 'pkg', packageVersionId: 'pv1', expectedContentHash: stage.artifactRef.contentHash };
    const result = await executor.execute('INTERACT', { action: 'package.version.export', input });
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(result.result.artifact.contentHash, stage.artifactRef.contentHash);
    assert.equal(artifacts.get(result.result.artifact.artifactId).binding.sourceAuthority, 'native.asset');
    assert.equal(requests.filter(item => new URL(item.url).pathname.endsWith('/chunk')).length, 2);
    await assert.rejects(executor.execute('INTERACT', { action: 'package.version.export', input: { ...input, expectedContentHash: '0'.repeat(64) } }), /hash required/);
    stage.source.packageVersionId = 'other'; const changed = await executor.execute('INTERACT', { action: 'package.version.export', input });
    assert.equal(changed.receipt.status, 'indeterminate'); artifacts.clear();
});

test('real browser delegation bridge checks callback scope and links exact semantic child receipts', async t => {
    const runtime = { version: 1, serverBootId: randomUUID(), processStartedAt: Date.now(), appVersion: 'test',
        source: { algorithm: 'atria-source-v1', revision: null, branch: null, workspaceId: null, fingerprint: null, reasons: [] } };
    const http = await httpFixture({ runtime, script: `const detail={version:1,definition:{tools:['memory_node_edit','memory_node_delete','search_visit']},scope:{sessionId:'session',revisionId:'revision'}};
      globalThis.Atria={getContext:()=>({getCapabilityApi:()=>({inspectDelegatedRun:()=>detail,
        runDelegated:async(input,execute)=>{let denied=0;try{await execute({index:9,runId:input.runId})}catch{denied++}
          const child=await execute({index:0,runId:input.runId,stepId:'step',effectId:'effect'});
          try{await execute({index:0,runId:input.runId})}catch{denied++}
          return {status:'completed',toolCalls:[child],denied,modelCalls:[],memory:[],tokens:null,cost:null}}})})};` });
    t.after(http.close);
    const browser = new AtriaBrowser({ url: http.origin, timeout: 3000, maxResponseBytes: 1048576, channel: process.env.ATRIA_TEST_BROWSER_CHANNEL });
    t.after(() => browser.close()); await browser.open();
    const registry = new ActionRegistry(); let writes = 0, uncertain = false;
    registry.register({ version: 1, id: 'memory.node.edit', domain: 'memory', title: 'fixture edit', risk: 'MUTATE', authority: 'fixture', adapter: 'test', externalEffects: [], guards: ['exact'],
        approval: 'trusted-approval-required', availability: { available: true, reason: '' } }, z.strictObject({ value: z.literal('exact') }), z.json(), () => { writes++; if (uncertain) throw new Error('Transport lost after effect'); return { ok: true }; },
    () => ({ target: { sessionId: 'session' }, serverBootId: runtime.serverBootId }));
    registerAgentDelegation(registry, browser);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => ({ action: 'accept', content: { authorize: true } }) });
    const observed = await executor.execute('READ', { action: 'agent.delegation.inspect', input: { presetId: 'p', nodeId: 'n' } });
    const input = { presetId: 'p', nodeId: 'n', mode: 'delegated-node', presetHash: observed.presetHash, task: 'fixture', maxSteps: 2, contextBudget: 2000, timeoutMs: 1000,
        operations: [{ action: 'memory.node.edit', input: { value: 'exact' } }] };
    const result = await executor.execute('MUTATE', { action: 'agent.run.start', input });
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(writes, 1); assert.equal(result.result.evidence.denied, 2);
    assert.equal(result.receipt.childReceiptIds.length, 1);
    const child = executor.receipts.get(result.receipt.childReceiptIds[0]);
    assert.equal(child.parentReceiptId, result.receipt.receiptId); assert.equal(child.provenance.attribution.stepId, 'step');
    await assert.rejects(executor.execute('MUTATE', { action: 'agent.run.start', input: { ...input, operations: [{ action: 'memory.node.delete', input: {} }] } }));
    uncertain = true;
    const failed = await executor.execute('MUTATE', { action: 'agent.run.start', input });
    assert.equal(failed.receipt.status, 'indeterminate'); assert.equal(failed.receipt.childReceiptIds.length, 1);
});

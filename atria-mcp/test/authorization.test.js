import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ActionRegistry, PolicyCeiling, ReceiptStore, RiskExecutor, fingerprint } from '../src/kernel.js';
import { registerMutationActions } from '../src/mutations.js';
import { registerMemoryMutations } from '../src/memory-mutations.js';
import { AtriaBrowser } from '../src/browser.js';
import { httpFixture } from './helpers.js';
import { randomUUID } from 'node:crypto';

function fixture() {
    let now = 1000, revision = 'r1', executed = 0, approvals = 0, decision = { action: 'accept', content: { authorize: true, uses: 1 } };
    const registry = new ActionRegistry(), receipts = new ReceiptStore({ now: () => now });
    const descriptor = { version: 1, id: 'fixture.write', domain: 'fixture', title: 'Write', risk: 'MUTATE', authority: 'Fixture', adapter: 'test', externalEffects: [],
        guards: ['revision'], approval: 'trusted-approval-required', availability: { available: true, reason: '' } };
    const guard = i => { if (i.revision !== revision) throw Error('revision conflict'); return { target: i.target, revision, serverBootId: 'boot' }; };
    registry.register(descriptor, z.strictObject({ target: z.string(), revision: z.string(), value: z.string() }), z.json(), i => { executed++; return { ok: true, value: i.value, password: 'never-visible' }; }, guard);
    const ceiling = new PolicyCeiling(registry, registry.ids());
    let onApprove = () => {};
    const executor = new RiskExecutor(registry, ceiling, { receipts, now: () => now, approve: async () => { approvals++; await onApprove(); return decision; } });
    const args = { action: 'fixture.write', input: { target: 'one', revision: 'r1', value: 'data' } };
    return { registry, receipts, executor, ceiling, args, get executed() { return executed; }, get approvals() { return approvals; },
        set decision(d) { decision = d; }, set revision(r) { revision = r; }, set now(n) { now = n; }, set onApprove(fn) { onApprove = fn; } };
}
test('guards precede approval; default policy and absent/declined/cancelled trusted approval fail closed', async () => {
    const f = fixture();
    await assert.rejects(new RiskExecutor(f.registry, new PolicyCeiling(f.registry)).execute('MUTATE', f.args), /Ceiling/);
    await assert.rejects(new RiskExecutor(f.registry, f.ceiling).execute('MUTATE', f.args), /unavailable/);
    await assert.rejects(f.executor.execute('MUTATE', { ...f.args, input: { ...f.args.input, confirm: true } }));
    f.revision = 'r2'; await assert.rejects(f.executor.execute('MUTATE', f.args), /conflict/); assert.equal(f.approvals, 0); f.revision = 'r1';
    for (const decision of [{ action: 'decline' }, { action: 'cancel' }, { action: 'accept', content: { authorize: false } }, { action: 'accept', content: { authorize: true, uses: 21 } }]) {
        f.decision = decision; await assert.rejects(f.executor.execute('MUTATE', f.args));
    }
    assert.equal(f.executed, 0);
});
test('approval races and cancellation never execute; expired approval lease is rechecked', async () => {
    const f = fixture(); f.onApprove = () => { f.revision = 'r2'; };
    await assert.rejects(f.executor.execute('MUTATE', f.args), /conflict/); assert.equal(f.executed, 0);
    const g = fixture(), controller = new AbortController(); g.onApprove = () => controller.abort();
    await assert.rejects(g.executor.execute('MUTATE', g.args, { signal: controller.signal })); assert.equal(g.executed, 0);
});
test('server leases bind exact normalized payload, target, instance, expiry and maximum uses', async () => {
    const f = fixture(); f.decision = { action: 'accept', content: { authorize: true, uses: 2 } };
    const first = await f.executor.execute('MUTATE', f.args), leaseId = first.lease.leaseId;
    assert.equal(first.receipt.status, 'succeeded'); assert.equal(first.receipt.mcpInstanceId, f.receipts.instanceId);
    assert.doesNotMatch(JSON.stringify(first), /never-visible/);
    for (const patch of [{ target: 'two' }, { value: 'different' }]) await assert.rejects(f.executor.execute('MUTATE', { ...f.args, leaseId, input: { ...f.args.input, ...patch } }), /Lease/);
    const other = fixture(); await assert.rejects(other.executor.execute('MUTATE', { ...f.args, leaseId }), /Lease/);
    await f.executor.execute('MUTATE', { ...f.args, leaseId });
    await assert.rejects(f.executor.execute('MUTATE', { ...f.args, leaseId }), /Lease/);
    assert.equal(f.approvals, 1); assert.equal(f.executed, 2);
    const expiring = fixture(); expiring.decision = f.decision = { action: 'accept', content: { authorize: true, uses: 2 } };
    const granted = await expiring.executor.execute('MUTATE', expiring.args); expiring.now = granted.lease.expiresAt;
    await assert.rejects(expiring.executor.execute('MUTATE', { ...expiring.args, leaseId: granted.lease.leaseId }), /Lease/);
});
test('provenance review is double checked independently of target revision and receipt ownership cannot be authored', async () => {
    const f = fixture(); let epoch = 'old';
    const executor = new RiskExecutor(f.registry, f.ceiling, { receipts: f.receipts, provenance: async () => ({ serverBootId: 'boot', experience: { epoch } }),
        approve: async () => { epoch = 'new'; return { action: 'accept', content: { authorize: true } }; } });
    await assert.rejects(executor.execute('MUTATE', f.args), /Provenance changed/); assert.equal(f.executed, 0);
    const receipt = f.receipts.put({ created: [{ id: 'object', mcpInstanceId: 'forged', creatingReceiptId: 'forged' }] });
    assert.equal(receipt.created[0].mcpInstanceId, f.receipts.instanceId); assert.equal(receipt.created[0].creatingReceiptId, receipt.receiptId);
});
test('receipt failure is indeterminate, grants do not expand, concurrent executions cannot double spend', async () => {
    const f = fixture(); let release; f.onApprove = () => new Promise(resolve => { release = resolve; });
    const pending = f.executor.execute('MUTATE', f.args); await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(f.executor.execute('MUTATE', f.args), /busy/); release(); await pending;
    const original = f.registry.get('fixture.write');
    const { inputSchema: _, outputSchema: __, ...descriptor } = original.detail;
    f.registry.register({ ...descriptor, id: 'fixture.later' }, original.inputSchema, original.outputSchema, () => { throw Error('connection lost after write'); }, original.guard);
    assert.equal(f.ceiling.allows('fixture.later'), false);
    const uncertain = new RiskExecutor(f.registry, new PolicyCeiling(f.registry, f.registry.ids()), { approve: async () => ({ action: 'accept', content: { authorize: true } }) });
    const result = await uncertain.execute('MUTATE', { ...f.args, action: 'fixture.later' });
    assert.equal(result.receipt.status, 'indeterminate'); assert.match(result.error, /connection lost/);
});

test('Build evaluation receipt binds exact normalized operations, base, Preview and change fingerprints', async () => {
    let revision = 'r1', writes = 0, reviewCount = 0;
    const boot = '12345678-1234-4123-8123-123456789012';
    const response = data => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }), body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, runtimeIdentity: async () => ({ serverBootId: boot, mutationGuards: 1 }), start: async () => {},
        context: { request: { get: async () => response({ token: 'csrf-private' }), fetch: async (url, options) => {
            if (url.endsWith('/revision')) return response({ revision });
            if (url.endsWith('/inspect')) return response({ workspace: options.data, changes: [{ before: 'a', after: 'b' }] });
            if (url.endsWith('/evaluate')) { writes++; assert.equal(options.headers['x-atria-expected-server-boot-id'], boot); return response({ workspace: options.data.workspace, changes: [{ before: 'a', after: 'b' }], validation: { status: 'passed' }, preview: null }); }
            if (url.endsWith('/execute')) { writes++; return response({ changeSet: { resultingRevision: 'r2', validation: { status: 'passed' } } }); }
            throw Error(url);
        } } } };
    const registry = registerMutationActions(new ActionRegistry(), browser);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => { reviewCount++; return { action: 'accept', content: { authorize: true } }; } });
    const workspace = { projectId: 'project_x', workspaceId: 'workspace_x', baseRevision: 'r1', origin: { kind: 'plugin', id: 'atria-mcp' }, operations: [{ operationId: 'one', operationType: 'source.write', target: { path: 'a.txt' }, input: { content: 'b' }, origin: { kind: 'plugin', id: 'atria-mcp' } }] };
    const evaluated = await executor.execute('INTERACT', { action: 'build.frontend.evaluate', input: { workspace } });
    assert.equal(evaluated.receipt.status, 'succeeded');
    const apply = { action: 'build.change.apply', input: { workspace, evaluationReceiptId: evaluated.receipt.receiptId } };
    await assert.rejects(executor.execute('MUTATE', { ...apply, input: { ...apply.input, evaluationReceiptId: '00000000-0000-4000-8000-000000000000' } }), /receipt/);
    const changed = structuredClone(apply); changed.input.workspace.operations[0].input.content = 'evil';
    await assert.rejects(executor.execute('MUTATE', changed), /drift/); assert.equal(reviewCount, 1);
    revision = 'r2'; await assert.rejects(executor.execute('MUTATE', apply), /conflict/); revision = 'r1';
    assert.equal((await executor.execute('MUTATE', apply)).receipt.status, 'succeeded'); assert.equal(writes, 2);
    assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
});

test('Session invalid message/branch is rejected by pure guards before approval or mutation', async () => {
    let approvals = 0, mutations = 0;
    const serverBootId = randomUUID();
    const response = data => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': serverBootId }), body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ serverBootId, mutationGuards: 1 }),
        context: { request: { get: async () => response({ token: 'csrf-private' }), fetch: async (url, options) => {
            if (url.endsWith('/load')) return response({ session: { sessionId: 'session_x' }, revision: { revisionId: options.data.revisionId ?? 'r1', branchId: 'b1' }, timeline: [] });
            if (url.endsWith('/sessions/session_x')) return response({ branches: [] });
            mutations++; throw Error('must not write');
        } } } };
    const registry = registerMutationActions(new ActionRegistry(), browser), executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => { approvals++; } });
    await assert.rejects(executor.execute('MUTATE', { action: 'chat.branch.fork', input: { sessionId: 'session_x', expectedRevisionId: 'r1', revisionId: 'history', messageId: 'missing' } }), /Message/);
    await assert.rejects(executor.execute('MUTATE', { action: 'chat.branch.switch', input: { sessionId: 'session_x', expectedRevisionId: 'r1', branchId: 'missing' } }), /Branch/);
    assert.equal(approvals, 0); assert.equal(mutations, 0);
});

test('real browser fixed Memory writes require current boot and exact graph, reject stale/unknown dispatch', async t => {
    const runtime = { version: 1, serverBootId: randomUUID(), processStartedAt: Date.now(), appVersion: 'test', mutationGuards: 1,
        source: { algorithm: 'atria-source-v1', revision: null, branch: null, workspaceId: null, fingerprint: null, reasons: [] } };
    const http = await httpFixture({ runtime, script: `const nodes=[];
      globalThis.Atria={getContext:()=>({chatId:'chat',getCapabilityApi:name=>({
        'memory-graph':{openReadSession:()=>({getSchema:()=>({}),listNodes:()=>nodes,listEdges:()=>[]}),
          openGuardedSession:async(_context,expected)=>{if(JSON.stringify(expected.nodes)!==JSON.stringify(nodes))throw Error('stale');return {deleteNode:async(input)=>{const index=nodes.findIndex(n=>n.id===input.id);if(index<0)throw Error('missing');nodes.splice(index,1);return {ok:true}},deleteLinks:async()=>({removed:1}),createNode:async(input)=>{nodes.push({id:'n1',...input});return {id:'n1'}}}}},
        'game-runtime':{getPackageState:()=>({sessionId:'s1'}),getWorldBranchIdentity:()=>({branchId:'b1',revisionId:'r1'})}
      })[name]})};` }); t.after(http.close);
    const browser = new AtriaBrowser({ url: http.origin, timeout: 3000, maxResponseBytes: 1048576, channel: process.env.ATRIA_TEST_BROWSER_CHANNEL }); t.after(() => browser.close());
    await browser.open();
    const registry = registerMemoryMutations(new ActionRegistry(), browser);
    const links = registry.get('memory.relation.upsert').inputSchema;
    const linkInput = { graphHash: 'a'.repeat(64), target: { chatId: 'chat', sessionId: 's1', branch: null }, operation: { source: { id: 'a' }, links: [{ target: { id: 'b' }, relation: 'mentions', direction: 'outgoing' }] } };
    assert.equal(links.safeParse(linkInput).success, true);
    linkInput.operation.links[0].direction = 'out'; assert.equal(links.safeParse(linkInput).success, false);
    let approvals = 0;
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => { approvals++; return { action: 'accept', content: { authorize: true } }; } });
    const inspected = await executor.execute('READ', { action: 'memory.mutation.inspect' });
    const args = { action: 'memory.node.create', input: { target: inspected.target, graphHash: inspected.graphHash, operation: { type: 'event', title: 'test', fields: {} } } };
    const result = await executor.execute('MUTATE', args);
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(result.receipt.created[0].id, 'n1');
    await assert.rejects(executor.execute('MUTATE', args), /Stale Memory/); assert.equal(approvals, 1);
    await assert.rejects(executor.execute('MUTATE', { ...args, action: 'memory.delete' }), /Unknown/);
    const fresh = await executor.execute('READ', { action: 'memory.mutation.inspect' });
    const deleted = await executor.execute('DESTRUCTIVE', { action: 'memory.node.delete', input: { target: fresh.target, graphHash: fresh.graphHash, operation: { id: 'n1' } } });
    assert.equal(deleted.receipt.status, 'succeeded'); assert.equal(deleted.receipt.deleted[0].id, 'n1');
    const empty = await executor.execute('READ', { action: 'memory.mutation.inspect' });
    const relationDeleted = await executor.execute('DESTRUCTIVE', { action: 'memory.relation.delete', input: { target: empty.target, graphHash: empty.graphHash,
        operation: { source: { id: 'a' }, target: { id: 'b' }, relation: 'knows' } } });
    assert.equal(relationDeleted.receipt.status, 'succeeded');
    http.setRuntime({ ...runtime, serverBootId: randomUUID() });
    await assert.rejects(executor.execute('MUTATE', args), /Stale browser/);
});

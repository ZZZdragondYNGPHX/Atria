import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ActionRegistry, PolicyCeiling, RiskExecutor, fingerprint } from '../src/kernel.js';
import { registerCognitionActions } from '../src/cognition-actions.js';

function fixture() {
    const calls = [], boot = randomUUID(), scope = { domain: 'project', projectId: 'p' };
    let mode = 'review', prompts = 0, writes = 0;
    const doc = () => ({ sequence: 3, scope, policy: { mode, fingerprint: 'policy' }, jobs: [{ id: 'job', candidates: [{ candidateId: 'candidate', report: { exact: true } }] }], feedback: [{ id: 'feedback' }] });
    const preflight = () => { const view = { choices: [], configuration: { routes: [], connections: [], models: [] },
        state: { scope: doc(), owner: { sequence: 4, limits: { maxRequests: 1 } } }, experience: { document: doc(), validity: 'not_reconciled' } };
        return { ...view, observationFingerprint: fingerprint(view), validity: 'not_reconciled' }; };
    const response = data => ({ status: () => 200, ok: () => true, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }), body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost:8000', timeout: 100, maxResponseBytes: 1048576 }, start: async () => {},
        runtimeIdentity: async () => ({ serverBootId: boot, mutationGuards: 1 }), context: { request: {
            get: async () => response({ token: 'csrf' }), fetch: async (url, options) => {
                calls.push({ url, ...options });
                if (url.endsWith('/evolution/preflight')) return response(preflight());
                if (url.endsWith('/evolution/observe')) return response({ scope: doc(), validity: 'not_reconciled', owner: { limits: { maxRequests: 1 } } });
                if (url.endsWith('/experience/observe') || url.endsWith('/goals/snapshot') || url.endsWith('/evidence/snapshot')) return response({ document: doc(), validity: 'not_reconciled' });
                writes++; return response({ ok: true });
            },
        } } };
    const registry = registerCognitionActions(new ActionRegistry(), browser), executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), {
        approve: async () => { prompts++; return { action: 'accept', content: { authorize: true, uses: 1 } }; },
    });
    return { calls, registry, executor, scope, doc, preflight, setMode: value => { mode = value; }, get prompts() { return prompts; }, get writes() { return writes; } };
}

test('cognitive READ surfaces use persisted observation endpoints and never reconcile/wake', async () => {
    const f = fixture();
    for (const action of ['experience.observe', 'evolution.observe']) {
        const result = await f.executor.execute('READ', { action, input: { scope: f.scope, subject: 'p' } });
        assert.equal(result.data.validity, 'not_reconciled');
    }
    assert.equal(f.writes, 0); assert.equal(f.prompts, 0);
    for (const input of [{ scope: { ...f.scope, handle: 'foreign' }, subject: 'p' }, { scope: f.scope, subject: 'p', method: 'publish' }])
        await assert.rejects(f.executor.execute('READ', { action: 'evolution.observe', input }));
});

test('automatic Evolution policy requires its independent action and exact preflight, while mode is injected by trusted handler', async () => {
    const f = fixture(), input = { scope: f.scope, subject: 'p', expectedSequence: 3, target: { kind: 'project-strategy', taskId: 'task', field: 'maxRepairRounds' },
        routeId: 'route', price: null, expectedObservationFingerprint: f.preflight().observationFingerprint };
    await assert.rejects(f.executor.execute('MUTATE', { action: 'evolution.configure.review', input: { ...input, mode: 'auto' } }));
    await assert.rejects(f.executor.execute('MUTATE', { action: 'evolution.configure.auto', input: { ...input, expectedObservationFingerprint: 'a'.repeat(64) } }), /preflight/);
    assert.equal(f.prompts, 0); assert.equal(f.writes, 0);
    const result = await f.executor.execute('MUTATE', { action: 'evolution.configure.auto', input });
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(f.prompts, 1);
    const native = f.calls.find(c => c.url.endsWith('/evolution/controlled-configure'));
    assert.equal(native.data.input.mode, 'auto'); assert.equal(native.data.expectedObservationFingerprint, input.expectedObservationFingerprint);
    assert.equal(native.data.input.expectedObservationFingerprint, undefined);
});

test('explicit feedback is inserted only after trusted approval and model-supplied human/Host origins are rejected', async () => {
    const f = fixture(), input = { target: { kind: 'evidence', id: 'a'.repeat(64), integrity: fingerprint(f.doc()), scope: f.scope }, subject: 'p', expectedSequence: 3,
        feedback: { signal: 'correction', dimension: 'behavior', note: 'Reviewed correction' } };
    for (const field of [{ kind: 'explicit' }, { origin: 'user' }, { origin: 'host' }]) await assert.rejects(f.executor.execute('MUTATE',
        { action: 'experience.feedback.submit', input: { ...input, feedback: { ...input.feedback, ...field } } }));
    assert.equal(f.prompts, 0); assert.equal(f.writes, 0);
    const result = await f.executor.execute('MUTATE', { action: 'experience.feedback.submit', input });
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(f.prompts, 1);
    const native = f.calls.find(c => c.url.endsWith('/experience/controlled'));
    assert.equal(native.data.input.feedback.kind, 'explicit'); assert.equal(native.data.input.feedback.origin, undefined); assert.equal(native.data.expectedSubject, 'p');
});

test('cognitive mutations enforce exact sequence and separate reviewed publication from model booleans', async () => {
    const f = fixture(), input = { scope: f.scope, subject: 'p', expectedSequence: 3, jobId: 'job', candidateId: 'candidate', expectedReportHash: fingerprint({ exact: true }) };
    await assert.rejects(f.executor.execute('MUTATE', { action: 'evolution.publish', input: { ...input, review: true } }));
    await assert.rejects(f.executor.execute('MUTATE', { action: 'evolution.publish', input: { ...input, expectedSequence: 2 } }), /sequence/);
    f.setMode('auto');
    await assert.rejects(f.executor.execute('MUTATE', { action: 'evolution.publish', input }), /review mode/);
    assert.equal(f.writes, 0); assert.equal(f.prompts, 0);
    f.setMode('review');
    const result = await f.executor.execute('MUTATE', { action: 'evolution.publish', input });
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(f.prompts, 1); assert.equal(f.writes, 1);
    const native = f.calls.find(c => c.url.endsWith('/evolution/publish'));
    assert.equal(native.data.review, true); assert.equal(native.data.expectedSequence, undefined);
});

test('feedback deletion is one-shot DESTRUCTIVE and Goal resume cannot silently launch a background model', async () => {
    const f = fixture();
    assert.equal(f.registry.get('experience.feedback.delete').detail.risk, 'DESTRUCTIVE');
    await assert.rejects(f.executor.execute('INTERACT', { action: 'goal.control', input: { goalId: 'goal', expectedSequence: 3, action: 'resume' } }));
    await f.executor.execute('DESTRUCTIVE', { action: 'experience.feedback.delete', input: { scope: f.scope, subject: 'p', expectedSequence: 3, id: 'feedback' } });
    assert.equal(f.prompts, 1); assert.equal(f.writes, 1);
});

import path from 'node:path';
import storage from 'node-persist';
import request from 'supertest';
import express from 'express';
import { ReviewOrigin, originalReviewAccounts } from '../../src/native/orchestration/review-origin.js';
import { ReviewAuthority } from '../../src/native/orchestration/review-authority.js';
import { getPasswordHash, getPasswordSalt, toKey } from '../../src/users.js';
import { createNativeOrchestrationRouter } from '../../src/endpoints/native-orchestration.js';
import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { EffectController } from '../../src/native/orchestration/effect-controller.js';
import { effectDecision } from '../../src/native/orchestration/effect-contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';

const id = kind => createNativeId('orchestration' + kind);
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));

describe.each(harnesses)('$name isolated Review listener with original user passwords and controlled domain Effect', ({ make }) => {
    let h, runs, effects, review, root, effectId, approvalId, user, revoked, endpoint, now, launch, authHook, describeHook, accountHook;
    const current = () => runs.get(h.handle, root.runId);
    const row = type => h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, root.runId, type, type === 'effect' ? effectId : approvalId)));
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        await storage.init({ dir: path.join(h.dataRoot, 'review-test-accounts') });
        const salt = getPasswordSalt();
        user = { handle: h.handle, enabled: true, admin: false, salt, password: getPasswordHash('review-test-password', salt) };
        await storage.setItem(toKey(h.handle), user);
        now = Date.now(); revoked = false; endpoint = 'test-endpoint'; authHook = null; describeHook = null; accountHook = null;
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const authorize = async () => {}, assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx);
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter, validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hash([]) }) });
        const fixture = planFixture(), agentId = id('Node'), output = fixture.definition.nodes[0];
        output.inputs = [{ name: 'body', type: 'text.body', required: true }];
        fixture.definition.nodes.unshift({ nodeId: agentId, kind: 'agent', label: 'Test effect', inputs: [], outputs: [{ name: 'body', type: 'text.body', required: false }],
            dependencyPinIds: ['test.route'], capabilities: ['test.effect'], policy: { agentPinId: 'test.route' } });
        fixture.definition.edges = [{ edgeId: id('Edge'), from: { nodeId: agentId, port: 'body' }, to: { nodeId: output.nodeId, port: 'body' }, condition: 'always', maxVisits: 10, loopBack: false }];
        fixture.definition.entryNodeIds = [agentId]; fixture.definition.capabilityCeiling = ['test.effect']; fixture.definition.limits.maxSteps = 50;
        fixture.dependencyPins = [{ pinId: 'test.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: 'a'.repeat(64) }];
        const plan = await plans.create(h.handle, id('Command'), fixture);
        const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
        const report = await plans.validate(h.handle, expected);
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const source = { sourceAuthority: 'controlled-review-domain', sourceRef: { sourceId: 'test-source' } };
        runs = new RunRepository({ engine: h.engine, authorize, assertWriter, admit: async () => ({
            sourceBinding: { ...source, bindingDigest: hash(source) },
            budgetAuthorityRef: { authority: 'controlled-review-bank' },
        }) });
        root = await runs.start(h.handle, id('Command'), { planRef, sourceRequest: {}, retentionPolicyRef: { policyId: 'test-retention' } });
        const { attemptId } = await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId: agentId, inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: hash('test.effect'), budgetRef: root.budgetAuthorityRef });
        await new AttemptController({ runs, authorizeAttempt: async () => {} }).activate(h.handle, { ...runGuard(await current()), attemptId });
        const accounts = { authenticate: originalReviewAccounts.authenticate.bind(originalReviewAccounts), inspect: async handle => {
            const account = await originalReviewAccounts.inspect(handle);
            if (accountHook) await accountHook();
            return account;
        } };
        review = new ReviewOrigin({ authority: new ReviewAuthority({ accounts, now: () => now }), now: () => now });
        effects = new EffectController({ runs, authorizeEffect: async ({ proposal, intent }) => {
            if (authHook) await authHook();
            if (revoked) throw new Error('controlled_domain_revoked');
            if (intent) return { ...effectDecision(intent), endpointBindingDigest: hash(endpoint) };
            return { ...proposal, capability: 'test.effect', risk: 'R2', requiresApproval: true, endpointBindingDigest: hash(endpoint),
                grantDigest: hash('test.effect'), egressDigest: hash('test-egress'), budgetEnvelopeDigest: hash('test-bank'),
                dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        }, verifyBudgetAttempt: async () => {}, verifyObservation: async () => {}, verifyApproval: args => review.authority.verifyApproval(args) });
        const approvals = review.authority.connect({ runs, effects, describeReview: async () => {
            if (describeHook) await describeHook();
            return { title: 'Test action', input: '<script>test data</script>', impact: 'Controlled test only' };
        } });
        effectId = id('Effect'); approvalId = id('Approval');
        await effects.prepare(h.handle, { ...runGuard(await current()), effectId, nodeAttemptId: attemptId, proposal: {
            actionRef: { actionId: 'test.effect', version: '1' }, targetRef: { targetId: 'test-target' }, inputRef: { inputId: 'test-input' }, inputHash: hash('test-input'),
        } });
        await effects.ready(h.handle, { ...runGuard(await current()), effectId, budgetAttemptRef: { authority: 'controlled-review-bank', attemptId: 'test-attempt' } });
        await approvals.request(h.handle, { ...runGuard(await current()), effectId, approvalId, expiresAt: now + 10000 });
        launch = await review.launch(h.handle, { runId: root.runId, approvalId });
    });
    afterEach(async () => { await review?.close(); await h?.engine.close(); await h?.cleanup(); });
    async function browser() {
        const agent = request.agent(review.origin);
        const bootstrap = await agent.get(new URL(launch.url).pathname + new URL(launch.url).search).expect(200);
        const post = (name, body = {}, origin = review.origin) => agent.post('/review/' + name).set('Origin', origin)
            .set('X-Atria-Review-CSRF', bootstrap.body.csrfToken).send(body);
        return { agent, bootstrap, post };
    }
    async function login() {
        const client = await browser(); await client.post('reauthenticate', { password: 'review-test-password' }).expect(200); return client;
    }

    test('separate origin reauthenticates, binds exact approval and consumes it with one durable dispatch claim', async () => {
        const client = await login(), details = (await client.post('details').expect(200)).body.outcome;
        expect(details.description.input).toBe('<script>test data</script>');
        expect(client.bootstrap.headers['set-cookie'][0]).toMatch(/HttpOnly;.*SameSite=Strict/);
        expect(client.bootstrap.headers['cross-origin-opener-policy']).toBe('same-origin');
        expect(client.bootstrap.headers['content-security-policy']).toContain('frame-ancestors \'none\'');
        expect(client.bootstrap.body).not.toHaveProperty('nonce');
        const body = { bindingHash: details.bindingHash, nonce: details.nonce, decision: 'approve' };
        await client.post('decide', body).expect(200);
        expect((await row('approval')).doc.status).toBe('approved');
        expect((await effects.claim(h.handle, { ...runGuard(await current()), effectId })).claimed).toBe(true);
        expect((await row('approval')).doc.status).toBe('consumed');
        expect((await effects.claim(h.handle, { ...runGuard(await current()), effectId })).claimed).toBe(false);
        await client.post('decide', body).expect(403);
        expect(JSON.stringify((await row('approval')).doc)).not.toContain(details.nonce);
    });

    test('main-origin approval/nonce, cross-origin fetch/form, forged Host, ambient cookie and missing CSRF cannot authorize', async () => {
        const client = await browser();
        await client.post('reauthenticate', { password: 'review-test-password' }, 'http://127.0.0.1:8000').expect(403);
        await client.agent.post('/review/reauthenticate').set('Origin', review.origin).send({ password: 'review-test-password' }).expect(403);
        await request(review.origin).post('/review/reauthenticate').set('Origin', review.origin).set('Cookie', 'session=main-app-session').send({ password: 'review-test-password' }).expect(403);
        await client.agent.get('/review?launchRef=' + 'x'.repeat(43)).set('Host', 'evil.example').expect(403);
        await client.agent.post('/review/decide').set('Origin', 'null').type('form').send({ decision: 'approve' }).expect(403);
        await client.post('details').expect(403);
        const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle, enabled: true } }; next(); });
        app.use('/api/native/orchestration', createNativeOrchestrationRouter(() => ({ review, hostBootId: h.engine.nativeHostLifecycle.hostBootId })));
        await request(app).post('/api/native/orchestration/approvals/decide').send({ approved: true }).expect(404);
        const boot = h.engine.nativeHostLifecycle.hostBootId;
        const result = await request(app).post('/api/native/orchestration/approvals/launch').set('X-Atria-Host-Boot-Id', boot)
            .send({ schemaVersion: 1, commandId: id('Command'), expectedHostBootId: boot, body: { runId: root.runId, approvalId } }).expect(200);
        expect(result.body.outcome.url).toBe(launch.url);
        expect(JSON.stringify(result.body)).not.toContain('nonce');
    });

    test('unknown or stale launch refs allocate no Review session', async () => {
        const unknown = await request(review.origin).get('/review?launchRef=' + 'x'.repeat(43)).expect(404);
        expect(unknown.headers).not.toHaveProperty('set-cookie');
        now += 10001;
        const expired = await request(review.origin).get(new URL(launch.url).pathname + new URL(launch.url).search).expect(404);
        expect(expired.headers).not.toHaveProperty('set-cookie');
    });

    test('reopening one launch replaces its earlier cookie and CSRF pair', async () => {
        const first = await browser();
        const second = await browser();
        const stale = await first.post('reauthenticate', { password: 'review-test-password' }).expect(403);
        const current = await second.post('reauthenticate', { password: 'review-test-password' }).expect(200);
        expect(stale.headers).not.toHaveProperty('set-cookie');
        expect(current.body.outcome.authenticated).toBe(true);
    });

    test('wrong password is bounded, blank/OAuth-only and disabled accounts cannot authenticate', async () => {
        const client = await browser();
        await client.post('reauthenticate', { password: 'wrong' }).expect(403);
        user.password = ''; await storage.setItem(toKey(h.handle), user);
        await client.post('reauthenticate', { password: '' }).expect(403);
        user.enabled = false; await storage.setItem(toKey(h.handle), user);
        await client.post('reauthenticate', { password: 'review-test-password' }).expect(403);
        await client.post('reauthenticate', { password: 'wrong' }).expect(403);
        await client.post('reauthenticate', { password: 'wrong' }).expect(403);
        await client.post('reauthenticate', { password: 'wrong' }).expect(429);
        expect((await row('approval')).doc.status).toBe('pending');
    });

    test('original account changes invalidate authenticated details and approved dispatch without consuming approval', async () => {
        const client = await login(), details = (await client.post('details').expect(200)).body.outcome;
        user.admin = true; await storage.setItem(toKey(h.handle), user);
        await client.post('details').expect(403);
        await client.post('decide', { bindingHash: details.bindingHash, nonce: details.nonce, decision: 'approve' }).expect(403);
        await client.post('reauthenticate', { password: 'review-test-password' }).expect(200);
        const fresh = (await client.post('details').expect(200)).body.outcome;
        await client.post('decide', { bindingHash: fresh.bindingHash, nonce: fresh.nonce, decision: 'approve' }).expect(200);
        user.salt = getPasswordSalt(); user.password = getPasswordHash('changed-password', user.salt); await storage.setItem(toKey(h.handle), user);
        await expect(effects.claim(h.handle, { ...runGuard(await current()), effectId })).rejects.toMatchObject({ code: 'native_orchestration_review_unavailable' });
        expect((await row('approval')).doc.status).toBe('approved');
    });

    test('different owner, endpoint drift, nonce/binding substitution, revoked grant and expiry fail closed', async () => {
        await expect(review.launch('another-user', { runId: root.runId, approvalId })).rejects.toThrow();
        const client = await login(), details = (await client.post('details').expect(200)).body.outcome;
        await client.post('decide', { bindingHash: details.bindingHash, nonce: 'x'.repeat(43), decision: 'approve' }).expect(403);
        await client.post('decide', { bindingHash: 'a'.repeat(64), nonce: details.nonce, decision: 'approve' }).expect(403);
        endpoint = 'changed-endpoint'; await client.post('details').expect(403); endpoint = 'test-endpoint';
        revoked = true; await client.post('decide', { bindingHash: details.bindingHash, nonce: details.nonce, decision: 'approve' }).expect(403); revoked = false;
        now += 10001; await client.post('details').expect(403);
        expect((await row('approval')).doc.status).toBe('pending');
    });

    test('reject is durable and never refunds; cold listener has no private challenge or authentication', async () => {
        const client = await login(), details = (await client.post('details').expect(200)).body.outcome;
        const cold = new ReviewOrigin({ authority: new ReviewAuthority({ accounts: originalReviewAccounts }) });
        await expect(cold.launch(h.handle, { runId: root.runId, approvalId })).rejects.toThrow();
        await cold.close();
        await client.post('decide', { bindingHash: details.bindingHash, nonce: details.nonce, decision: 'reject' }).expect(200);
        expect((await row('approval')).doc.status).toBe('rejected'); expect((await row('effect')).doc.status).toBe('not_dispatched');
        expect((await current()).status).toBe('blocked');
    });

    const cancel = async () => runs.cancel(h.handle, id('Command'), { ...runGuard(await current()), reasonCode: 'review_test_cancel' });
    test('cancellation during the details authority await commits before withholding the nonce', async () => {
        const client = await login();
        describeHook = async () => { describeHook = null; await cancel(); };
        const result = await client.post('details').expect(403);
        expect(result.body).not.toHaveProperty('outcome');
        expect((await current()).cancelRequested).toBe(true);
        expect((await row('approval')).doc.status).toBe('invalidated');
    });

    test('cancellation in final decision verification survives without an ApprovalDecision or successful command', async () => {
        const client = await login(), details = (await client.post('details').expect(200)).body.outcome;
        let calls = 0;
        authHook = async () => { if (++calls === 2) { authHook = null; await cancel(); } };
        await client.post('decide', { bindingHash: details.bindingHash, nonce: details.nonce, decision: 'approve' }).expect(403);
        expect((await current()).cancelRequested).toBe(true);
        expect((await row('approval')).doc).toMatchObject({ status: 'invalidated', decisionRef: null });
    });

    test('cancellation at final account await cannot be rolled back to grant an approved dispatch', async () => {
        const client = await login(), details = (await client.post('details').expect(200)).body.outcome;
        await client.post('decide', { bindingHash: details.bindingHash, nonce: details.nonce, decision: 'approve' }).expect(200);
        accountHook = async () => { accountHook = null; await cancel(); };
        await expect(effects.claim(h.handle, { ...runGuard(await current()), effectId })).rejects.toMatchObject({ code: 'native_orchestration_effect_stale' });
        expect((await current()).cancelRequested).toBe(true);
        expect((await row('approval')).doc.status).toBe('invalidated');
        expect((await row('effect')).doc.dispatchToken).toBeNull();
    });

    test('unknown decision ACK retains the durable approval and never creates another decision or dispatch', async () => {
        const client = await login(), details = (await client.post('details').expect(200)).body.outcome;
        const original = h.engine.withTransaction.bind(h.engine);
        let unknown = true;
        h.engine.withTransaction = async (...args) => {
            const value = await original(...args);
            if (unknown && value?.outcome?.status === 'approved') { unknown = false; throw Object.assign(new Error('test ACK lost'), { code: 'storage_commit_unknown' }); }
            return value;
        };
        const decision = { bindingHash: details.bindingHash, nonce: details.nonce, decision: 'approve' };
        await client.post('decide', decision).expect(409);
        expect((await row('approval')).doc.status).toBe('approved');
        expect((await row('effect')).doc.dispatchToken).toBeNull();
        await client.post('decide', decision).expect(403);
        expect((await row('approval')).doc.status).toBe('approved');
    });
});

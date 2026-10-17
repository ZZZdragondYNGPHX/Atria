import { expect, test } from '@jest/globals';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { configureReview } from './helpers/rp-review-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { readAudienceSource } from '../../src/native/orchestration/audience-source-contracts.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { readAttempt, readAttemptInvalidation, controlRecordKey } from '../../src/native/orchestration/controller-common.js';

const approve = JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready' });
const rerun = JSON.stringify({ decision: 'rerun', reasonCode: 'agency_violation' });
async function setup(make, mode = 'approve', runSource = false) {
    const texts = mode === 'approve' ? ['DRAFT_A', approve, 'The NPC awaits your choice.']
        : ['DRAFT_A', mode === 'malformed' ? JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready', approval: true }) : rerun, 'DRAFT_B', approve, 'The revised NPC awaits your choice.'];
    return modelPortFixture(make, { configurePlan: async args => {
        await configureReview(args.plan, args);
        const { plan, h, core, base } = args;
        const sourceRef = { kind: 'native_information_context', sessionId: base.session.sessionId,
            ...(runSource ? { anchor: 'run_source' } : { branchId: base.revision.branchId, revisionId: base.revision.revisionId }), audience: { kind: 'narrator' } };
        const source = await readAudienceSource(h.handle, sourceRef, core);
        plan.dependencyPins.push({ pinId: 'session.audience', port: 'context', resourceRef: sourceRef, integrity: hash(source.descriptor) });
        for (const node of plan.definition.nodes.filter(node => ['agent', 'review'].includes(node.kind))) {
            node.policy.audiencePinId = 'session.audience'; node.dependencyPinIds.push('session.audience');
        }
        if (mode === 'unreadable') {
            const ref = { ...sourceRef, audience: { kind: 'actor', id: base.manifest.actors[1].actorId } };
            const permitted = await readAudienceSource(h.handle, ref, core), reviewer = plan.definition.nodes.find(node => node.kind === 'review');
            plan.dependencyPins.push({ pinId: 'review.audience', port: 'context', resourceRef: ref, integrity: hash(permitted.descriptor) });
            reviewer.policy.audiencePinId = 'review.audience'; reviewer.dependencyPinIds = reviewer.dependencyPinIds.map(pin => pin === 'session.audience' ? 'review.audience' : pin);
        }
        for (const pin of plan.dependencyPins.filter(pin => pin.port === 'model')) {
            const route = await args.seeded.persistence.getRuntimeRoute(h.handle, pin.resourceRef.runtimeRouteId);
            await args.seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { ...route.executionPolicy, computeBudget: {
                ...route.executionPolicy.computeBudget, maxRequests: mode === 'headroom' ? 4 : 6,
                localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 96, maxItems: 10000 } } } });
            pin.integrity = hash(await args.seeded.persistence.getRuntimeRoute(h.handle, pin.resourceRef.runtimeRouteId));
        }
        plan.definition.limits.maxSteps = 120; plan.definition.limits.deadlineMs = 300000;
    }, responseBody: async ({ index }) => ({ id: 'review-response-' + index, status: 'completed', output: [{ id: 'review-message-' + index, type: 'message', status: 'completed', role: 'assistant',
        content: [{ type: 'output_text', text: texts[index], annotations: [] }] }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } }) });
}

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s Game actual structured Review approves only advisory quality before the one original narration', async (_name, make) => {
    const f = await setup(make);
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(root.progress.reviews).toBe(1); expect(root.outputClaims).toHaveLength(1); expect(root.pendingApprovalRefs).toEqual([]);
        expect(f.requests).toHaveLength(3); expect(JSON.stringify(f.requests[1])).toContain('DRAFT_A'); expect(JSON.stringify(f.requests[1])).toContain('atria_graph_review');
        const output = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(output.published.reviewCompletions).toHaveLength(1); expect(output.published.reviewCompletions[0].review.decision).toBe('approve');
        expect(output.closure.effectIds).toHaveLength(4); expect(result.timeline.at(-1).content).toBe('The NPC awaits your choice.');
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        await f.cold();
        const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(output.receipt);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const key = controlRecordKey(f.h.handle, root.runId, 'receipt', output.published.reviewCompletions[0].receipt.receiptId), row = await tx.getResource(key);
            await putMutable(tx, key, { ...row.doc, responseText: rerun }, { expectedIntegrity: row.integrity });
        });
        await expect(f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).rejects.toThrow('Invalid Session Review completion facts');
        expect(f.requests).toHaveLength(3);
    } finally { await f.cleanup(); }
}, 120000);

test('Game Review uses original bounded local rerun, preserves paid history and sends only the fresh draft to Narrator', async () => {
    const f = await setup(makeTempFsEngineHarness, 'rerun');
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(root.progress.reviews).toBe(2); expect(f.requests).toHaveLength(5);
        expect(JSON.stringify(f.requests[2])).toContain('agency_violation'); expect(JSON.stringify(f.requests[2])).not.toContain('DRAFT_A');
        expect(JSON.stringify(f.requests[4])).toContain('DRAFT_B'); expect(JSON.stringify(f.requests[4])).not.toContain('DRAFT_A');
        const output = await f.h.engine.withTransaction(f.h.handle, async tx => {
            const old = (await readAttempt(tx, f.h.handle, root, root.attemptRefs[0])).doc;
            expect(await readAttemptInvalidation(tx, f.h.handle, root, old)).toBeTruthy(); return readSessionOutput(tx, f.h.handle, root);
        });
        expect(output.published.reviewCompletions.map(item => item.review.decision)).toEqual(['rerun', 'approve']);
        expect(output.closure.effectIds).toHaveLength(6); expect(root.outputClaims).toHaveLength(1);
        expect(result.timeline.at(-1).content).toBe('The revised NPC awaits your choice.');
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(item => item.status === 'settled')).toBe(true);
        expect(bank.localWork.map(item => item.kind)).toEqual(expect.arrayContaining(['graph_control_parse', 'graph_control_adopt']));
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
    } finally { await f.cleanup(); }
}, 180000);

test.each([['malformed', 2], ['headroom', 2], ['unreadable', 1]])('Game %s Review cannot approve an Effect, bypass remaining budget or publish narration', async (mode, sends) => {
    const f = await setup(makeTempFsEngineHarness, mode);
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(sends);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.outputClaims).toEqual([]); expect(root.pendingApprovalRefs).toEqual([]);
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline).toEqual(f.base.timeline);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(sends); expect(bank.attempts.every(item => item.status === 'settled')).toBe(true);
    } finally { await f.cleanup(); }
}, 120000);


test('Game Run-source Review keeps the captured policy and Source through real bounded rerun and durable final output', async () => {
    const f = await setup(makeTempFsEngineHarness, 'rerun', true);
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(f.requests).toHaveLength(5); expect(root.status).toBe('completed'); expect(root.progress.reviews).toBe(2);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.published.reviewCompletions.map(item => item.review.decision)).toEqual(['rerun', 'approve']);
        for (const item of [...proof.published.graphResults, ...proof.published.reviewCompletions]) {
            const capture = item.producer.inputRefs[0].audienceCapture;
            expect(capture.policyRef.anchor).toBe('run_source'); expect(capture.sourceRef).toMatchObject(root.sourceBinding.sourceRef);
        }
        expect(root.outputClaims).toHaveLength(1); expect(proof.closure.effectIds).toHaveLength(6);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state);
        expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        await f.cold();
        const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        expect(f.requests).toHaveLength(5);
    } finally { await f.cleanup(); }
}, 120000);

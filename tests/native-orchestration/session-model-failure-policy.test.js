import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { resolverTurnFixture } from './helpers/resolver-turn-fixture.js';
import { configureSessionOutput } from './helpers/session-output-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readSessionOutput, sessionOutputClosureId } from '../../src/native/orchestration/session-output-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { sendAttemptId } from '../../src/native/orchestration/budget-port.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { capabilityObservationProof, executionPathFingerprint } from '../../src/native/model-prompt-runtime/execution-evidence.js';

const configureFailure = ({ role = 'narrator', retry = false, pinned = true, maxRequests = 4, fallback = true } = {}) => async args => {
    const { plan, h, seeded } = args; configureSessionOutput(args);
    const nodeId = role === 'intent_resolver' ? args.resolverNodeId : args.narratorNodeId;
    const node = plan.definition.nodes.find(node => node.nodeId === nodeId), pin = plan.dependencyPins.find(pin => pin.pinId === node.policy.agentPinId);
    const primary = structuredClone(await seeded.persistence.getRuntimeRoute(h.handle, pin.resourceRef.runtimeRouteId));
    primary.policy.maxRetries = retry ? 1 : 0; primary.executionPolicy.reuse = 'exact'; primary.executionPolicy.computeBudget.maxRequests = maxRequests;
    if (!fallback) { await seeded.persistence.saveRuntimeRoute(h.handle, primary); pin.integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, primary.runtimeRouteId)); return; }
    const connection = { ...seeded.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: 'Session fallback connection' };
    await seeded.persistence.saveConnectionProfile(h.handle, connection);
    const model = { ...await seeded.persistence.getModelProfile(h.handle, seeded.model.modelProfileId), modelProfileId: createNativeId('modelProfile'),
        remoteModelId: 'session-fallback', connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
    await seeded.persistence.saveModelProfile(h.handle, model); primary.executionPolicy.allowedModelProfileIds.push(model.modelProfileId);
    const target = { ...structuredClone(primary), runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Owned Session fallback',
        modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef };
    await seeded.persistence.saveRuntimeRoute(h.handle, target);
    const stored = await seeded.persistence.getRuntimeRoute(h.handle, target.runtimeRouteId);
    primary.fallbackRouteRefs = [{ scope: 'player', runtimeRouteId: stored.runtimeRouteId }];
    if (pinned) {
        node.dependencyPinIds.push(role + '.fallback');
        plan.dependencyPins.push({ pinId: role + '.fallback', port: 'model', resourceRef: primary.fallbackRouteRefs[0], integrity: hash(stored) });
    }
    await seeded.persistence.saveRuntimeRoute(h.handle, primary);
    pin.integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, primary.runtimeRouteId));
};
const rootOf = f => f.authority.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const bankOf = async f => Object.values((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations)[0].compute;
const response = ({ index }, usage = true, reasoning = false) => ({ id: 'session-policy-response-' + index, status: 'completed',
    output: [...reasoning ? [{ type: 'reasoning', id: 'session-private-reasoning', encrypted_content: 'PRIVATE-SESSION-CONTINUITY' }] : [],
        { type: 'message', id: 'session-policy-message-' + index, role: 'assistant', content: [{ type: 'output_text', text: 'Synthetic native narrator response.' }] }],
    ...usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {} });
const configureContinuity = (mode = 'active_execution', verified = true) => async args => {
    await configureFailure({ fallback: false })(args);
    const { seeded, h, plan } = args, connection = await seeded.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
    const model = await seeded.persistence.getModelProfile(h.handle, seeded.model.modelProfileId), observedAt = Date.now() - 100;
    const decision = { capability: 'generation.continuation.active-execution', state: 'supported',
        provenance: [{ kind: 'provider-endpoint', source: 'Synthetic actual Session Responses protocol', observedAt }],
        ...verified ? { binding: { schemaVersion: 1, pathFingerprint: executionPathFingerprint({ handle: h.handle, connection, model }),
            observedAt, expiresAt: Date.now() + 60000, assurance: 'verified' } } : {} };
    await seeded.persistence.saveModelProfile(h.handle, { ...model, capabilities: [...model.capabilities ?? [], decision] }, verified
        ? { observationProof: capabilityObservationProof({ handle: h.handle, connection, model }, [decision]) } : {});
    const pin = plan.dependencyPins[0], route = await seeded.persistence.getRuntimeRoute(h.handle, pin.resourceRef.runtimeRouteId);
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { ...route.executionPolicy, continuity: mode } });
    pin.integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
};

describe.each(CONTRACT_HARNESSES)('$name original Session failure policy', ({ make }) => {
    test.each([false, true])('Narrator paid rejection follows its original bounded policy and closes all provider ordinals, retry=%s', async retry => {
        const f = await modelPortFixture(make, { configurePlan: configureFailure({ retry }), responseStatus: ordinal => ordinal === 1 ? 500 : 200 });
        try {
            const result = await f.start(), root = await rootOf(f), bank = await bankOf(f);
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.'); expect(root.status).toBe('completed');
            expect(f.requests.map(body => body.model)).toEqual(['p4-fixture', retry ? 'p4-fixture' : 'session-fallback']);
            expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            const effectId = bank.attempts[0].orchestration.effectId;
            expect(bank.attempts.map(row => row.attemptId)).toEqual([sendAttemptId(effectId, 0), sendAttemptId(effectId, 1)]);
            expect(bank.attempts.filter(row => row.generationQuotaRef)).toHaveLength(0);
            const output = await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
            expect(output.closure.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work')).toHaveLength(2);
            await f.authority.engine.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', sessionOutputClosureId(root.runId)), saved = await tx.getResource(key), doc = structuredClone(saved.doc);
                doc.budgetAttemptRefs = doc.budgetAttemptRefs.filter(ref => ref.attemptId !== sendAttemptId(effectId, 0));
                try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readSessionOutput(tx, f.h.handle, root)).rejects.toThrow(); }
                finally { await tx.putResource(key, saved); }
            });
            await f.cold(); expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 180000);

    test('intent resolver fallback keeps its fixed tools and private audience before one original Narrator and output', async () => {
        const f = await resolverTurnFixture(make, { configurePlan: configureFailure({ role: 'intent_resolver' }), responseStatus: ordinal => ordinal === 1 ? 500 : 200 });
        try {
            await f.start(); const root = await rootOf(f), bank = await bankOf(f);
            expect(root.status).toBe('completed'); expect(f.requests).toHaveLength(3);
            expect(f.requests[0].tools).toEqual(f.requests[1].tools); expect(f.requests[0].tools.length).toBeGreaterThan(0);
            expect(f.requests[1].model).toBe('session-fallback'); expect(f.requests[2].tools ?? []).toEqual([]);
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(bank.attempts.map(row => row.generationQuotaRef.role)).toEqual(['intent_resolver', 'intent_resolver', 'narrator']);
            const output = await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
            expect(output.closure.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work')).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 180000);

    test('an ambiguous transport keeps its original unknown cost without retry, fallback or warm/cold replay', async () => {
        const f = await modelPortFixture(make, { configurePlan: configureFailure({ retry: true }), responseStatus: () => null });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'generation_provider_submission_unknown' });
            const bank = await bankOf(f); expect(f.requests).toHaveLength(1); expect(bank.attempts.map(row => row.status)).toEqual(['unknown']);
            await expect(f.start()).rejects.toThrow(); expect(await bankOf(f)).toEqual(bank);
            await f.cold(); await expect(f.start()).rejects.toThrow(); expect(await bankOf(f)).toEqual(bank); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 180000);

    test('an explicit rejected send without reported usage keeps unknown spending even when fallback produces the legal single output', async () => {
        const f = await modelPortFixture(make, { configurePlan: configureFailure(), responseStatus: ordinal => ordinal === 1 ? 500 : 200,
            responseBody: args => response(args, args.index !== 0) });
        try {
            const result = await f.start(), bank = await bankOf(f), root = await rootOf(f);
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.'); expect(f.requests).toHaveLength(2);
            expect(bank.attempts.map(row => row.status)).toEqual(['unknown', 'settled']); expect(root.status).toBe('running'); expect(root.outputClaims).toEqual([]);
            await f.cold(); expect((await f.start()).revision).toEqual(result.revision); expect(await bankOf(f)).toEqual(bank); expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 180000);

    test.each(['source', 'fallback-config'])('%s changed after paid rejection prevents fallback and retains the first original fee', async change => {
        const f = await modelPortFixture(make, { configurePlan: configureFailure(), responseStatus: () => 500 });
        f.onResponse(async () => {
            if (change === 'source') await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Human source edit retained' });
            else {
                const primary = await f.seeded.persistence.getRuntimeRoute(f.h.handle, f.route.runtimeRouteId);
                const target = await f.seeded.persistence.getRuntimeRoute(f.h.handle, primary.fallbackRouteRefs[0].runtimeRouteId);
                const connection = await f.seeded.persistence.getConnectionProfile(f.h.handle, target.connectionProfileRef.connectionProfileId);
                await f.seeded.persistence.saveConnectionProfile(f.h.handle, { ...connection, endpoint: connection.endpoint + '/changed' });
            }
        });
        try {
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect((await rootOf(f)).outputClaims).toEqual([]);
        } finally { await f.cleanup(); }
    }, 180000);

    test('the original remaining bank rejects fallback without erasing the paid rejection', async () => {
        const f = await modelPortFixture(make, { configurePlan: configureFailure({ maxRequests: 1 }), responseStatus: () => 500 });
        try {
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            expect((await bankOf(f)).attempts).toEqual([expect.objectContaining({ status: 'settled', usage: expect.objectContaining({ totalTokens: 20 }) })]);
        } finally { await f.cleanup(); }
    }, 180000);

    test('an unowned fallback cannot publish a Session Model capability', async () => {
        await expect(modelPortFixture(make, { configurePlan: configureFailure({ pinned: false }) })).rejects.toMatchObject({
            code: 'native_orchestration_validation_stale', details: { report: { status: 'invalid',
                issues: expect.arrayContaining([expect.objectContaining({ code: 'native_orchestration_dependency_invalid' })]) } } });
    }, 180000);

    test('verified active-execution continuity and exact reuse keep original scope and report application cache unknown', async () => {
        const f = await modelPortFixture(make, { configurePlan: configureContinuity(), responseBody: args => response(args, true, true) });
        const generate = f.port.generate.bind(f.port); let generated;
        f.port.generate = async (...args) => { const result = await generate(...args); generated = result.generated; return result; };
        try {
            const result = await f.start(); expect((await rootOf(f)).status).toBe('completed'); expect(f.requests).toHaveLength(1);
            expect(generated.snapshot.diagnostics.executionPlan.policy).toMatchObject({ continuity: 'active_execution', reuse: 'exact' });
            expect(generated.snapshot.diagnostics.executionPlan.cache.applicationResult).toBe('unknown');
            expect(generated.response.observation).toMatchObject({ nativeEnvelope: 'completed', upstreamIdentity: 'unknown' });
            expect(JSON.stringify(result.timeline)).not.toContain('PRIVATE-SESSION-CONTINUITY');
            const records = await f.authority.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle }));
            expect(JSON.stringify(records)).not.toContain('PRIVATE-SESSION-CONTINUITY');
        } finally { await f.cleanup(); }
    }, 180000);

    test.each([['active_execution', false], ['task', true]])('unsupported or unverified %s continuity is rejected before any Session send', async (mode, verified) => {
        await expect(modelPortFixture(make, { configurePlan: configureContinuity(mode, verified) })).rejects.toMatchObject({
            code: 'native_orchestration_validation_stale', details: { report: { status: 'invalid',
                issues: expect.arrayContaining([expect.objectContaining({ code: 'native_orchestration_dependency_invalid' })]) } } });
    }, 180000);
});

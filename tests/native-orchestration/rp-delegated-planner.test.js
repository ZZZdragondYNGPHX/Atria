import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpDelegationFixture } from './helpers/rp-delegation-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readAttempt, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { inspectNativeRpDelegation } from '../../src/native/orchestration/native-rp-generation.js';

jest.setTimeout(120000);
const id = kind => createNativeId('orchestration' + kind);
const text = body => JSON.stringify(body.messages);
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));

async function setup(make, { maxRequests = 3, parentGrant = true, unknown = false, observeParent = () => {} } = {}) {
    let planner, plannerModelId, terminal, loop, round = 0;
    const f = await rpDelegationFixture(make, {
        usage: (_body, count) => !(unknown && count === 3),
        configureChildRoute: route => {
            route.executionPolicy.computeBudget.maxRequests = maxRequests;
            // Three real Model pipelines plus two paid parse/adopt pairs.
            // This authored child reservation stays below the original parent32.
            route.executionPolicy.computeBudget.localWork.maxJobs = 24;
        },
        configureChildPlan: async (plan, env) => {
            terminal = plan.definition.nodes[0]; const output = plan.definition.nodes[1];
            const base = await env.persistence.getRuntimeRoute(env.h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
            const connection = { ...env.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: 'Child Planner connection' };
            await env.persistence.saveConnectionProfile(env.h.handle, connection);
            const model = { ...env.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'rp-owned-child-planner',
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
            plannerModelId = model.remoteModelId; await env.persistence.saveModelProfile(env.h.handle, model);
            const route = { ...base, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Child Planner route',
                modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef,
                executionPolicy: { ...base.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await env.persistence.saveRuntimeRoute(env.h.handle, route);
            plan.dependencyPins.push({ pinId: 'rp.child.planner', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId },
                integrity: hash(await env.persistence.getRuntimeRoute(env.h.handle, route.runtimeRouteId)) });
            planner = { nodeId: id('Node'), kind: 'planner', label: 'Bounded isolated child Planner', inputs: [{ name: 'feedback', type: 'json', required: false }],
                outputs: [{ name: 'response', type: 'json', required: false }], dependencyPinIds: ['rp.child.planner'],
                capabilities: ['generation.send', 'graph.patch'], policy: { agentPinId: 'rp.child.planner' } };
            terminal.inputs = [{ name: 'control', type: 'json', required: true }]; terminal.label = 'Isolated child final task';
            loop = { edgeId: id('Edge'), from: { nodeId: planner.nodeId, port: 'response' }, to: { nodeId: planner.nodeId, port: 'feedback' },
                condition: 'always', maxVisits: 1, loopBack: true };
            plan.definition.nodes = [planner, terminal, output]; plan.definition.entryNodeIds = [planner.nodeId];
            plan.definition.edges = [{ edgeId: id('Edge'), from: { nodeId: planner.nodeId, port: 'response' }, to: { nodeId: terminal.nodeId, port: 'control' },
                condition: 'always', maxVisits: 1, loopBack: false }, loop, ...plan.definition.edges];
            plan.definition.capabilityCeiling = ['generation.send', 'graph.patch'];
            plan.definition.graphChangePolicy = { allowedOperations: ['requestReplan', 'requestFinalize'], allowedNodeKinds: [] };
        },
        configureParentPlan: (plan, env) => {
            observeParent(env);
            if (!parentGrant) return;
            plan.definition.nodes[0].capabilities.push('graph.patch'); plan.definition.capabilityCeiling = [...plan.definition.nodes[0].capabilities];
            plan.definition.graphChangePolicy = { allowedOperations: ['requestReplan', 'requestFinalize'], allowedNodeKinds: [] };
        },
        responsePayload: body => body.model === plannerModelId
            ? JSON.stringify({ operations: [{ op: ++round === 1 ? 'requestReplan' : 'requestFinalize' }] })
            : 'Original delegated child result and sole parent narration.',
    });
    return { ...f, planner, plannerModelId, terminal, loop };
}

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
describe.each(harnesses)('$name original delegated RP Planner control', ({ make }) => {
    test('published bounded child Planner returns through real TaskLocalOutput and sole parent Narrator', async () => {
        const f = await setup(make), original = ContextPort.prototype.compile; const stages = [];
        ContextPort.prototype.compile = async function (handle, request) {
            if (this.rpDelegationCapture) {
                const current = await inspectNativeRpDelegation(this.rpDelegationCapture, { host: f.host, handle });
                stages.push({ nodeId: current.context.task.nodeId, inputRefs: request.inputRefs, current });
            }
            return original.call(this, handle, request);
        };
        try {
            const result = await f.run();
            expect(result.delegation.status).toBe('returned'); expect(f.requests).toHaveLength(4);
            expect(f.requests.map(body => body.model)).toEqual([f.plannerModelId, f.plannerModelId, f.model.remoteModelId, f.model.remoteModelId]);
            expect(stages.map(stage => stage.nodeId)).toEqual([f.planner.nodeId, f.planner.nodeId, f.terminal.nodeId]);
            expect(stages.map(stage => stage.current.context.messages)).toEqual(Array.from({ length: 3 }, () => [{ role: 'user', content: 'Original RP input' }]));
            expect(stages.every(stage => hash(stage.inputRefs) === hash(stage.current.contextInputRefs))).toBe(true);
            expect(f.requests.slice(0, 3).map(text).every(body => body.includes('Original RP input') && !body.includes('Original RP context'))).toBe(true);
            expect(text(f.requests[2])).toContain('graph_planner_control'); expect(text(f.requests[2])).toContain('requestFinalize');
            const child = await f.authority.execution.runs.get(f.h.handle, result.delegation.childRunId);
            expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(2);
            expect(child.progress).toMatchObject({ attempts: 4, patches: 2, replans: 1, loopIterations: 1 });
            expect(child.progress.edgeVisitCounts[f.loop.edgeId]).toBe(1);
            expect(child.resultRefs).toEqual([result.delegation.resultRef]); expect(child.outputClaims).toHaveLength(1);
            const bank = await bankOf(f);
            expect(bank.attempts).toHaveLength(4); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(3);
            expect(bank.localWork.every(row => row.status === 'settled')).toBe(true);
            expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released' })]);
            const cold = await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child));
            expect(cold.publication.graphHistory).toMatchObject({ terminalNodeId: f.terminal.nodeId, loopIterations: 1, settled: true });
            expect(cold.publication.graphHistory.effects).toHaveLength(3);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const producer = (await readAttempt(tx, f.h.handle, child, child.attemptRefs[1])).doc;
                const key = controlRecordKey(f.h.handle, child.runId, 'attempt', producer.attemptId), stored = await tx.getResource(key);
                const changed = { ...stored.doc, inputRefs: [stored.doc.inputRefs[0], ...child.parentRef.inputRefs], inputDigest: hash([stored.doc.inputRefs[0], ...child.parentRef.inputRefs]) };
                await tx.putResource(key, { ...stored, doc: changed, integrity: hash(changed) });
                try { await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); }
                finally { await tx.putResource(key, stored); }
            });
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name);
            const historical = await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child));
            expect(historical.receipt).toEqual(cold.receipt);
        } finally { ContextPort.prototype.compile = original; await f.cleanup(); }
    });

    test('child reservation refuses replan capacity while retaining the first paid Model', async () => {
        const f = await setup(make, { maxRequests: 2 });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
            const child = (await rootsOf(f)).find(root => root.parentRef);
            expect(child.graphRevision).toBe(0); expect(child.resultRefs).toEqual([]); expect(child.outputClaims).toEqual([]);
            expect(child.status).toBe('blocked'); expect(child.pendingEffectRefs).toEqual([]);
            const patches = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord,
                handle: f.h.handle, runId: child.runId, recordType: 'patch' }));
            expect(patches.map(row => row.doc)).toEqual([expect.objectContaining({ accepted: false,
                issues: [{ code: 'native_orchestration_graph_budget_unavailable' }], appliedOperations: [] })]);
            const parent = (await rootsOf(f)).find(root => !root.parentRef);
            expect(parent.status).toBe('running');
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readAttempt(tx, f.h.handle, parent, child.parentRef.nodeAttemptId))).doc.status).toBe('waiting_child');
            expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'held' })]);
        } finally { await f.cleanup(); }
    });

    test('publication enforces child graph.patch as an explicit intersection of the original parent node grant', async () => {
        let observed, report, beforeCleanup;
        await expect(setup(make, { parentGrant: false, observeParent: env => {
            observed = env;
            const validate = env.plans.validate.bind(env.plans);
            env.plans.validate = async (...args) => {
                report = await validate(...args);
                beforeCleanup = { roots: await rootsOf(env), operations: (await env.control.status(env.h.handle, env.controlId)).operations };
                return report;
            };
        } })).rejects.toThrow('native_orchestration_child_authority_invalid');
        expect(report.status).toBe('invalid');
        expect(report.issues).toContainEqual(expect.objectContaining({ code: 'native_orchestration_child_authority_invalid', severity: 'blocking' }));
        expect(observed.requests).toEqual([]); expect(observed.effects).toEqual([]);
        expect(beforeCleanup).toEqual({ roots: [], operations: {} });
    });

    test('withdrawn original Source after an accepted child patch blocks the next Model without replay', async () => {
        const f = await setup(make), original = ContextPort.prototype.compile; let count = 0;
        ContextPort.prototype.compile = async function (handle, request) {
            const compiled = await original.call(this, handle, request);
            if (this.rpDelegationCapture && ++count === 2) {
                const chat = await f.chats.get(handle, f.locator.charDir, f.locator.name); chat.body[0].mes = 'Original Source withdrawn';
                await f.chats.save(handle, f.locator.charDir, f.locator.name, chat.header, chat.body, chat.integrity);
            }
            return compiled;
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            const child = (await rootsOf(f)).find(root => root.parentRef);
            expect(child.graphRevision).toBe(1); expect(child.outputClaims).toEqual([]); expect(child.resultRefs).toEqual([]);
            expect(child.status).toBe('reconciling'); expect(child.pendingEffectRefs).toHaveLength(1);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { ContextPort.prototype.compile = original; await f.cleanup(); }
    });

    test('paid unknown final child Model preserves the held reservation and never resumes or resends', async () => {
        const f = await setup(make, { unknown: true });
        try {
            const result = await f.run(); expect(result.status).toBe('pending_output'); expect(f.requests).toHaveLength(3);
            const child = await f.authority.execution.runs.get(f.h.handle, result.childRunId);
            expect(child.resultRefs).toHaveLength(1); expect(child.outputClaims).toEqual([]);
            expect(child.status).toBe('running'); expect(child.pendingEffectRefs).toEqual([]);
            const parent = await f.authority.execution.runs.get(f.h.handle, result.parentRunId);
            expect(parent.status).toBe('running');
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readAttempt(tx, f.h.handle, parent, result.parentAttemptId))).doc.status).toBe('waiting_child');
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(3);
            expect(bank.attempts.map(row => row.status)).toEqual(['settled', 'settled', 'unknown']);
            expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'held' })]);
            const replay = await f.run().then(value => ({ value }), error => ({ error }));
            expect(replay.error).toBeDefined(); expect(f.requests).toHaveLength(3); expect(await bankOf(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    });
});

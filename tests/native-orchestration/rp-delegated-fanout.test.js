import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { rpDelegationFixture } from './helpers/rp-delegation-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { ResultController } from '../../src/native/orchestration/result-controller.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readDelegatedRpSource } from '../../src/native/orchestration/delegated-source-contracts.js';
import { readFanoutFrame, readFanoutMembership } from '../../src/native/orchestration/fanout-controller.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { readAttempt, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { rpOperationInput } from '../../src/native/rp-run-control.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: 1, loopBack: false });
const text = body => JSON.stringify(body.messages);
const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const leftModel = 'rp-child-fanout-independent-A', rightModel = 'rp-child-fanout-independent-B', plannerModel = 'rp-child-fanout-independent-P';
const branchModel = body => [leftModel, rightModel].includes(body.model);

async function fixture({ usageUnknown = false, sourceWithdraw = false, scopePlanner = false, scopeReplan = false, childRequests = null } = {}) {
    let release, releasePublication, arrived = 0, plannerRound = 0, sharedPin, nodes, atBarrier, publicationBarrier = null;
    const publishReady = new Promise(resolve => { releasePublication = resolve; });
    let restorePublisher = () => {};
    const both = new Promise(resolve => { release = resolve; });
    const f = await rpDelegationFixture(makeTempSqliteEngineHarness, {
        configurePlan: async (plan, env) => {
            if (!scopePlanner) return;
            const route = { ...env.route, executionPolicy: { ...env.route.executionPolicy, computeBudget: { ...env.route.executionPolicy.computeBudget, maxRequests: 5 + Number(scopeReplan),
                localWork: { ...env.route.executionPolicy.computeBudget.localWork, maxJobs: scopeReplan ? 64 : env.route.executionPolicy.computeBudget.localWork.maxJobs } } } };
            await env.seeded.persistence.saveRuntimeRoute(env.h.handle, route); plan.dependencyPins[0].integrity = hash(route);
        },
        configureChildRoute: route => { route.executionPolicy.computeBudget = { ...route.executionPolicy.computeBudget, maxRequests: childRequests ?? (scopePlanner ? 4 + Number(scopeReplan) : 3),
            localWork: { maxJobs: scopeReplan ? 64 : 32, maxItems: 10000, maxInputBytes: 16777216 } }; },
        configureChildPlan: async (plan, env) => {
            const [terminal, output] = plan.definition.nodes, base = await env.persistence.getRuntimeRoute(env.h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
            const make = async (remoteModelId, label, kind = 'agent') => {
                const connection = { ...env.connection, connectionProfileId: createNativeId('connectionProfile') };
                const model = { ...env.model, modelProfileId: createNativeId('modelProfile'), remoteModelId,
                    connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
                const route = { ...base, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                    connectionProfileRef: model.connectionProfileRef, executionPolicy: { ...base.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
                await env.persistence.saveConnectionProfile(env.h.handle, connection); await env.persistence.saveModelProfile(env.h.handle, model); await env.persistence.saveRuntimeRoute(env.h.handle, route);
                const pinId = 'rp.child.' + label;
                plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) });
                return { nodeId: id('Node'), kind, label, inputs: [port('scope', 'task.result')], outputs: [port('response', kind === 'planner' ? 'json' : 'text', false)],
                    dependencyPinIds: [pinId], capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []], policy: { agentPinId: pinId } };
            };
            const left = await make(leftModel, 'left'), right = await make(rightModel, 'right');
            const fanout = { nodeId: id('Node'), kind: 'fanout', label: 'Original RP child scope freeze', inputs: [], outputs: [port('scope', 'task.result', false)],
                dependencyPinIds: [], capabilities: [], policy: { maxConcurrency: 2, failurePolicy: 'continue' } };
            const join = { nodeId: id('Node'), kind: 'join', label: 'Original RP child actual Join', inputs: [port('left', 'text'), port('right', 'text')], outputs: [port('joined', 'text', false)],
                dependencyPinIds: [], capabilities: [], policy: { strategy: 'all-success', quorum: 2, deadlineMs: 60000 } };
            const planner = scopePlanner ? await make(plannerModel, 'scopePlanner', 'planner') : null;
            terminal.inputs = [port('joined', 'text')];
            plan.definition.nodes = [fanout, left, right, join, terminal, output]; plan.definition.entryNodeIds = [fanout.nodeId];
            plan.definition.edges = [edge(fanout, left, 'scope'), edge(fanout, right, 'scope'), edge(left, join, 'left'), edge(right, join, 'right'), edge(join, terminal, 'joined'), edge(terminal, output, output.inputs[0].name)];
            Object.assign(plan.definition.limits, { maxNodes: 6, maxEdges: 6, maxAttempts: 6, maxEdgeVisits: 6, maxConcurrency: 2 });
            const chat = await env.chats.get(env.h.handle, env.locator.charDir, env.locator.name), source = rpOperationInput(chat.body[0], 0);
            const resourceRef = { kind: 'native_rp_message', controlId: env.controlId, messageId: source.messageId, variantId: source.variantId, contentHash: source.contentHash };
            sharedPin = { pinId: 'rp.child.exact-source', port: 'context', resourceRef, integrity: hash(await readDelegatedRpSource(env.h.handle, resourceRef, env.control)) };
            plan.dependencyPins.push(sharedPin);
            for (const node of [left, right, terminal]) node.dependencyPinIds.push(sharedPin.pinId);
            if (scopePlanner) {
                left.inputs = [port('control', 'json')]; planner.dependencyPinIds.push(sharedPin.pinId);
                plan.definition.nodes.splice(1, 0, planner);
                plan.definition.edges = [edge(fanout, planner, 'scope'), edge(planner, left, 'control'), ...plan.definition.edges.filter(item => !(item.from.nodeId === fanout.nodeId && item.to.nodeId === left.nodeId))];
                plan.definition.capabilityCeiling = ['generation.send', 'graph.patch'];
                plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize', ...scopeReplan ? ['requestReplan'] : []], allowedNodeKinds: [] };
                if (scopeReplan) {
                    planner.inputs.push(port('return', 'json', false));
                    plan.definition.edges.push({ ...edge(planner, planner, 'return'), loopBack: true });
                }
                Object.assign(plan.definition.limits, { maxNodes: 7, maxEdges: 7 + Number(scopeReplan), maxAttempts: 7 + Number(scopeReplan), maxEdgeVisits: 10 });
            }
            nodes = { fanout, left, right, join, terminal, output, planner };
        },
        configureParentPlan: plan => {
            plan.definition.nodes.find(node => node.kind === 'output').capabilities = ['chat.output'];
            plan.definition.capabilityCeiling = [...plan.definition.nodes[0].capabilities, 'chat.output'];
            Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
            plan.definition.limits.maxConcurrency = 2;
            if (scopeReplan) plan.definition.limits.maxSteps = 60;
            if (scopePlanner) {
                plan.definition.nodes[0].capabilities.push('graph.patch'); plan.definition.capabilityCeiling.push('graph.patch');
                plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize', ...scopeReplan ? ['requestReplan'] : []], allowedNodeKinds: [] };
            }
            plan.dependencyPins.push(sharedPin); plan.definition.nodes[0].dependencyPinIds.push(sharedPin.pinId);
        },
        usage: body => !(usageUnknown && body.model === rightModel),
        responsePayload: body => scopePlanner && body.model === plannerModel ? JSON.stringify({ operations: scopeReplan && ++plannerRound === 1 ? [{ op: 'requestReplan' }]
            : [{ op: 'setPendingPriority', nodeId: nodes.left.nodeId, priority: 7 }] }) : branchModel(body) ? body.model === leftModel ? 'RP_CHILD_CONCURRENT_A' : 'RP_CHILD_CONCURRENT_B' : 'RP_JOINED_CHILD_AND_PARENT',
    });
    f.onResponse(async body => {
        if (!(scopePlanner ? [plannerModel, rightModel].includes(body.model) : branchModel(body))) return;
        if (++arrived === 2) {
            try {
                const child = (await rootsOf(f)).find(root => root.parentRef);
                atBarrier = await f.h.engine.withTransaction(f.h.handle, async tx => {
                    const attempts = (await Promise.all(child.attemptRefs.map(ref => readAttempt(tx, f.h.handle, child, ref)))).map(row => row.doc);
                    const fanout = attempts.find(attempt => attempt.nodeId === nodes.fanout.nodeId);
                    const frame = await readFanoutFrame(tx, f.h.handle, child, fanout.attemptId);
                    const members = await Promise.all(frame.branches.map(branch => readAttempt(tx, f.h.handle, child, branch.entryAttemptId)));
                    const memberships = await Promise.all(frame.branches.map(branch => readFanoutMembership(tx, f.h.handle, child, frame, branch.entryAttemptId)));
                    const effects = await Promise.all(members.map(row => readEffect(tx, f.h.handle, child, row.doc.effectRefs[0])));
                    return { child, frame, attempts, members: members.map(row => row.doc), memberships, effects: effects.map(row => row.doc) };
                });
            } finally { release(); }
        }
        await both; // Both independent original Scheduler leaves reached actual HTTP before either response.
    });
    if (sourceWithdraw) {
        const original = ResultController.prototype.publishGraphModelResult, observed = new Set();
        ResultController.prototype.publishGraphModelResult = async function (handle, request) {
            const branch = f.effects.find(effect => effect.effectId === request.effectId && effect.proposal.inputRef.kind === 'native_rp_delegated_intent'
                && [nodes.left.nodeId, nodes.right.nodeId].includes(effect.proposal.inputRef.nodeId));
            if (this.host !== f.host || handle !== f.h.handle || !branch || branch.runId !== request.runId) return original.call(this, handle, request);
            observed.add(request.effectId);
            if (observed.size === 2) {
                try {
                    const child = await f.authority.execution.runs.get(handle, request.runId), bank = await bankOf(f);
                    const effects = f.effects.filter(effect => effect.runId === child.runId
                        && [nodes.left.nodeId, nodes.right.nodeId].includes(effect.proposal.inputRef.nodeId));
                    expect(effects).toHaveLength(2); expect([...observed].sort()).toEqual(effects.map(effect => effect.effectId).sort());
                    expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(row => row.status === 'settled' && row.reservationId === child.runId)).toBe(true);
                    expect(bank.attempts.map(row => row.orchestration.effectId).sort()).toEqual([...observed].sort());
                    expect(child.pendingEffectRefs).toEqual([]); expect(child.resultRefs).toEqual([]); expect(child.outputClaims).toEqual([]);
                    publicationBarrier = { effectIds: [...observed].sort(), feeAttemptIds: bank.attempts.map(row => row.attemptId).sort(), childRunId: child.runId };
                    const chat = await f.chats.get(handle, f.locator.charDir, f.locator.name);
                    chat.body[0].mes = 'Original RP advisory Source withdrawn after both real paid completions';
                    await f.chats.save(handle, f.locator.charDir, f.locator.name, chat.header, chat.body, null);
                } finally { releasePublication(); }
            }
            await publishReady; // Both original ModelPorts returned and settled; each original publisher must now reject the withdrawn Source freshly.
            return original.call(this, handle, request);
        };
        restorePublisher = () => { ResultController.prototype.publishGraphModelResult = original; };
    }
    return { ...f, nodes, scopePlanner, release: () => { release(); releasePublication(); },
        cleanup: async () => { restorePublisher(); await f.cleanup(); },
        get arrived() { return arrived; }, get atBarrier() { return atBarrier; }, get publicationBarrier() { return publicationBarrier; } };
}

function assertBarrier(f) {
    expect(f.arrived).toBe(2); expect(f.atBarrier.frame.maxConcurrency).toBe(2);
    expect(f.atBarrier.frame.sourceBindingDigest).toBe(f.atBarrier.child.sourceBinding.bindingDigest);
    expect(f.atBarrier.frame.parentBudgetRef).toEqual(f.atBarrier.child.budgetAuthorityRef);
    expect(f.atBarrier.frame.branches).toHaveLength(2); expect(f.atBarrier.memberships.every(Boolean)).toBe(true);
    expect(f.atBarrier.members.every(attempt => attempt.status === 'waiting_effect' && attempt.effectRefs.length === 1)).toBe(true);
    for (const attempt of f.atBarrier.members) {
        expect(attempt.effectiveGrantDigest).toBe(f.atBarrier.child.parentRef.effectiveGrantDigest);
        expect(attempt.budgetRef).toEqual(f.atBarrier.child.budgetAuthorityRef);
        expect(attempt.inputRefs).toEqual([attempt.inputRefs[0], ...f.atBarrier.child.parentRef.inputRefs]);
        expect(attempt.inputRefs[0].fanoutAttemptId).toBe(f.atBarrier.frame.fanoutAttemptId);
        const effect = f.atBarrier.effects.find(effect => effect.effectId === attempt.effectRefs[0]);
        expect(effect).toMatchObject({ status: 'dispatching', capability: 'generation.send', runId: f.atBarrier.child.runId,
            nodeAttemptId: attempt.attemptId, epoch: attempt.epoch, grantDigest: attempt.effectiveGrantDigest,
            sourceBindingDigest: f.atBarrier.child.sourceBinding.bindingDigest });
        expect(typeof effect.dispatchToken).toBe('string'); expect(effect.dispatchToken.length).toBeGreaterThan(0);
        expect(effect.inputRef).toEqual(attempt.inputRefs[0]);
    }
    expect(f.atBarrier.members.map(attempt => attempt.nodeId).sort()).toEqual([f.scopePlanner ? f.nodes.planner.nodeId : f.nodes.left.nodeId, f.nodes.right.nodeId].sort());
    expect(f.requests.slice(0, 2).map(body => body.model).sort()).toEqual([f.scopePlanner ? plannerModel : leftModel, rightModel].sort());
    for (const body of f.requests.slice(0, 2)) {
        expect(text(body)).toContain('Original RP input'); expect(text(body)).toContain('Authorized advisory source [rp0]');
        expect(text(body)).not.toContain('RP_CHILD_CONCURRENT_A'); expect(text(body)).not.toContain('RP_CHILD_CONCURRENT_B');
    }
}

function assertKnownSource(f, bank, child) {
    expect(f.publicationBarrier).toEqual({ effectIds: bank.attempts.map(row => row.orchestration.effectId).sort(),
        feeAttemptIds: bank.attempts.map(row => row.attemptId).sort(), childRunId: child.runId });
    expect(child.status).toBe('blocked'); expect(child.pendingEffectRefs).toEqual([]); expect(child.resultRefs).toEqual([]);
}
function assertKnownSourceFailure(failure) {
    expect(failure.costs.closed).toBe(true); expect(failure.reasonCode).toBe('native_orchestration_source_stale');
}

test('SQLite RP child declared Fanout reaches two independent real Models before original Join TaskLocal and sole parent Chat', async () => {
    const f = await fixture();
    try {
        const before = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
        expect(f.parentPlan.definition.limits.maxSteps).toBe(50); expect(f.childPlan.definition.limits.maxSteps).toBe(50);
        const result = await f.run(); assertBarrier(f); expect(f.requests).toHaveLength(4);
        const child = await f.authority.execution.runs.get(f.h.handle, result.delegation.childRunId), parent = await f.authority.execution.runs.get(f.h.handle, result.runId);
        expect(child.status).toBe('completed'); expect(parent.status).toBe('completed'); expect(result.output.runStatus).toBe('completed');
        expect(child.outputClaims).toHaveLength(1); expect(parent.outputClaims).toEqual([result.output.outputClaimRef]);
        expect(child.progress).toMatchObject({ attempts: 6, edgeVisits: 6, patches: 0, reviews: 0, delegates: 0, handoffs: 0, loopIterations: 0 });
        expect(child.graphRevision).toBe(0); expect(child.budgetAuthorityRef).toEqual(parent.budgetAuthorityRef);
        expect(text(f.requests[2])).toContain('RP_CHILD_CONCURRENT_A'); expect(text(f.requests[2])).toContain('RP_CHILD_CONCURRENT_B');
        expect(text(f.requests[3])).toContain('RP_JOINED_CHILD_AND_PARENT');
        const childEffects = f.effects.filter(effect => effect.proposal.inputRef.childRunId === child.runId); expect(childEffects).toHaveLength(3);
        for (const effect of childEffects) {
            expect(effect.proposal.inputRef.audience).toEqual({ kind: 'task', id: child.runId });
            expect(effect.proposal.inputRef.sourceRef).toEqual(child.sourceBinding.sourceRef);
        }
        for (const body of f.requests.slice(0, 3)) { expect(body.tools ?? []).toEqual([]); expect(text(body)).toContain('Authorized advisory source [rp0]'); expect(text(body)).toContain('Original RP input'); }
        const bank = await bankOf(f); expect(bank.limits.maxRequests).toBe(4); expect(bank.attempts).toHaveLength(4); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(3);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
        expect(chat.body).toHaveLength(3); expect(chat.body.slice(0, 2)).toEqual(before.body);
        expect(chat.body.at(-1)).toMatchObject({ mes: 'RP_JOINED_CHILD_AND_PARENT', is_user: false }); expect(chat.body.filter(message => message.mes === 'RP_JOINED_CHILD_AND_PARENT')).toHaveLength(1);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const local = await readTaskLocalOutput(tx, f.h.handle, child), history = local.publication.graphHistory, narration = await readRpOutput(tx, f.h.handle, parent);
            expect(history.effects).toHaveLength(3); expect(history.results).toHaveLength(2); expect(history.planners).toEqual([]); expect(history.reviews).toEqual([]); expect(history.judges).toEqual([]); expect(history.settled).toBe(true);
            expect(history.fanouts).toHaveLength(1); const [joined] = history.fanouts;
            expect(joined.frame).toEqual(f.atBarrier.frame); expect(joined.scopeAttempts).toHaveLength(2); expect(joined.providerEffects).toHaveLength(2);
            expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(2); expect(joined.joinReceipt.outcome).toBe('completed');
            expect(history.finalProducer.inputRefs[0].acceptedGraphResultRefs).toEqual(joined.joinReceipt.acceptedResultRefs);
            expect(history.finalProducer.inputRefs[0].acceptedControlRefs).toEqual([joined.controlRef]);
            expect(narration.domainReceipt.inputAnchor).toEqual(rpOperationInput(before.body[1], 1)); expect(narration.published.record.payload).toBe('RP_JOINED_CHILD_AND_PARENT');
            const key = controlRecordKey(f.h.handle, child.runId, 'join', joined.joinReceipt.joinId), saved = await tx.getResource(key), changed = { ...saved.doc, acceptedResultRefs: [] };
            try {
                await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) });
                await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); await expect(readRpOutput(tx, f.h.handle, parent)).rejects.toThrow();
            } finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).receipt).toEqual(local.receipt);
            expect((await readRpOutput(tx, f.h.handle, parent)).receipt).toEqual(narration.receipt);
        });
        await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name);
        expect((await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, parent))).published.record.payload).toBe('RP_JOINED_CHILD_AND_PARENT');
        expect(f.requests).toHaveLength(4);
    } finally { f.release(); await f.cleanup(); }
}, 180000);

for (const boundary of ['source', 'usage_unknown']) test('SQLite RP child Fanout preserves both original paid branch identities at ' + boundary + ' without parent Chat or replay', async () => {
    const unknown = boundary === 'usage_unknown', f = await fixture({ sourceWithdraw: !unknown, usageUnknown: unknown });
    try {
        const before = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
        await expect(f.run()).rejects.toThrow(); assertBarrier(f); expect(f.requests).toHaveLength(2);
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]);
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(row => row.reservationId === child.runId)).toBe(true);
        if (!unknown) assertKnownSource(f, bank, child);
        expect(bank.attempts.filter(row => row.status === 'settled')).toHaveLength(unknown ? 1 : 2); expect(bank.attempts.filter(row => row.status === 'unknown')).toHaveLength(Number(unknown));
        expect(new Set(bank.attempts.map(row => row.attemptId)).size).toBe(2);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'held', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            expect(await readTaskLocalOutput(tx, f.h.handle, child)).toBeNull(); expect(await readRpOutput(tx, f.h.handle, parent)).toBeNull();
            const records = (await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'receipt' })).map(row => row.doc);
            const failure = records.find(receipt => receipt.receiptKind === 'rp_graph_failure');
            expect(failure).toBeDefined();
            const unsettled = child.pendingEffectRefs.length > 0 || failure.effectIds.length > 0 && !failure.costs?.closed;
            expect(child.status).toBe(unsettled ? 'reconciling' : 'blocked'); expect(failure.status).toBe(child.status);
            if (!unknown) assertKnownSourceFailure(failure);
            expect(parent.status).toBe('running'); expect(parent.pendingEffectRefs).toEqual([]);
            const parentAttempt = (await readAttempt(tx, f.h.handle, parent, child.parentRef.nodeAttemptId)).doc;
            expect(parentAttempt.status).toBe('waiting_child'); expect(parentAttempt.effectRefs).toEqual([]);
            const effects = (await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'effect' })).map(row => row.doc);
            expect(effects).toHaveLength(2); expect(effects.every(effect => effect.sourceBindingDigest === child.sourceBinding.bindingDigest)).toBe(true);
            expect(effects.map(effect => effect.effectId).sort()).toEqual(bank.attempts.map(row => row.orchestration.effectId).sort());
        });
        const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name); expect(chat.body).toHaveLength(2); expect(chat.body[1]).toEqual(before.body[1]);
        expect(chat.body.some(message => message.mes === 'RP_JOINED_CHILD_AND_PARENT')).toBe(false);
        await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
    } finally { f.release(); await f.cleanup(); }
}, 120000);

test('SQLite RP child frozen scope Planner controls its reserved Agent before original Join TaskLocal and sole parent Chat', async () => {
    const f = await fixture({ scopePlanner: true });
    try {
        const before = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
        expect(f.parentPlan.definition.limits.maxSteps).toBe(50); expect(f.childPlan.definition.limits.maxSteps).toBe(50);
        expect(f.parentPlan.definition.limits.maxEdgeVisits).toBe(10); expect(f.childPlan.definition.limits.maxEdgeVisits).toBe(10);
        const result = await f.run(); assertBarrier(f); expect(f.requests).toHaveLength(5);
        expect(f.requests.slice(0, 2).map(body => body.model).sort()).toEqual([plannerModel, rightModel].sort());
        expect(f.requests.slice(2).map(body => body.model)).toEqual([leftModel, f.model.remoteModelId, f.model.remoteModelId]);
        const reservedBefore = f.atBarrier.attempts.find(attempt => attempt.nodeId === f.nodes.left.nodeId);
        expect(reservedBefore).toMatchObject({ status: 'reserved', inputState: 'reserved', inputRefs: null, inputDigest: null,
            effectiveGrantDigest: null, budgetRef: null, effectRefs: [], graphRevision: 0,
            reservationRef: { producerAttemptId: f.atBarrier.frame.fanoutAttemptId } });
        const child = await f.authority.execution.runs.get(f.h.handle, result.delegation.childRunId), parent = await f.authority.execution.runs.get(f.h.handle, result.runId);
        expect(child.status).toBe('completed'); expect(parent.status).toBe('completed'); expect(result.output.runStatus).toBe('completed');
        expect(child.outputClaims).toHaveLength(1); expect(parent.outputClaims).toEqual([result.output.outputClaimRef]);
        expect(child.graphRevision).toBe(1); expect(child.nodeControl[f.nodes.left.nodeId].priority).toBe(7);
        expect(child.progress).toMatchObject({ attempts: 7, edgeVisits: 7, patches: 1, reviews: 0, delegates: 0, handoffs: 0, loopIterations: 0 });
        expect(child.budgetAuthorityRef).toEqual(parent.budgetAuthorityRef);
        expect(text(f.requests[2])).toContain('setPendingPriority'); expect(text(f.requests[2])).not.toContain('RP_CHILD_CONCURRENT_B');
        expect(text(f.requests[3])).toContain('RP_CHILD_CONCURRENT_A'); expect(text(f.requests[3])).toContain('RP_CHILD_CONCURRENT_B');
        expect(text(f.requests[4])).toContain('RP_JOINED_CHILD_AND_PARENT');
        const childEffects = f.effects.filter(effect => effect.proposal.inputRef.childRunId === child.runId); expect(childEffects).toHaveLength(4);
        for (const effect of childEffects) {
            expect(effect.proposal.inputRef.audience).toEqual({ kind: 'task', id: child.runId }); expect(effect.proposal.inputRef.sourceRef).toEqual(child.sourceBinding.sourceRef);
        }
        for (const body of f.requests.slice(0, 4)) { expect(body.tools ?? []).toEqual([]); expect(text(body)).toContain('Authorized advisory source [rp0]'); expect(text(body)).toContain('Original RP input'); }
        const bank = await bankOf(f); expect(bank.limits.maxRequests).toBe(5); expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(4);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 4 }) })]);
        const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
        expect(chat.body).toHaveLength(3); expect(chat.body.slice(0, 2)).toEqual(before.body);
        expect(chat.body.at(-1)).toMatchObject({ mes: 'RP_JOINED_CHILD_AND_PARENT', is_user: false }); expect(chat.body.filter(message => message.mes === 'RP_JOINED_CHILD_AND_PARENT')).toHaveLength(1);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const local = await readTaskLocalOutput(tx, f.h.handle, child), history = local.publication.graphHistory, narration = await readRpOutput(tx, f.h.handle, parent);
            expect(history.effects).toHaveLength(4); expect(history.results).toHaveLength(2); expect(history.planners).toHaveLength(1);
            expect(history.reviews).toEqual([]); expect(history.judges).toEqual([]); expect(history.settled).toBe(true);
            expect(history.planners[0].patch.appliedOperations).toEqual([{ op: 'setPendingPriority', nodeId: f.nodes.left.nodeId, priority: 7 }]);
            expect(history.planners[0].producer.resultRefs).toEqual([]); expect(history.planners[0].controlRef.kind).toBe('graph_planner_control');
            expect(history.fanouts).toHaveLength(1); const [joined] = history.fanouts;
            expect(joined.frame).toEqual(f.atBarrier.frame); expect(joined.frame.graphRevision).toBe(0); expect(joined.scopeAttempts).toHaveLength(3); expect(joined.providerEffects).toHaveLength(3);
            expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(2); expect(joined.joinReceipt.outcome).toBe('completed');
            const reserved = joined.scopeAttempts.find(item => item.attempt.nodeId === f.nodes.left.nodeId).attempt;
            expect(reserved.reservationRef).toEqual(reservedBefore.reservationRef); expect(reserved.graphRevision).toBe(1); expect(reserved.inputState).toBe('prepared');
            expect(reserved.inputRefs[0].acceptedControlRefs).toEqual([history.planners[0].controlRef]);
            expect(history.finalProducer.inputRefs[0].acceptedGraphResultRefs).toEqual(joined.joinReceipt.acceptedResultRefs);
            expect(history.finalProducer.inputRefs[0].acceptedControlRefs).toEqual([joined.controlRef]);
            expect(narration.domainReceipt.inputAnchor).toEqual(rpOperationInput(before.body[1], 1)); expect(narration.published.record.payload).toBe('RP_JOINED_CHILD_AND_PARENT');
            const key = controlRecordKey(f.h.handle, child.runId, 'attempt', reserved.attemptId), saved = await tx.getResource(key);
            const changed = { ...saved.doc, reservationRef: { producerAttemptId: joined.producer.attemptId } };
            try {
                await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) });
                await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); await expect(readRpOutput(tx, f.h.handle, parent)).rejects.toThrow();
            } finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).receipt).toEqual(local.receipt);
            expect((await readRpOutput(tx, f.h.handle, parent)).receipt).toEqual(narration.receipt);
        });
        expect(f.requests).toHaveLength(5);
    } finally { f.release(); await f.cleanup(); }
}, 180000);

test('SQLite RP child branch-local replan retains frozen reservation and released parent-bank allocation through cold output', async () => {
    const f = await fixture({ scopePlanner: true, scopeReplan: true }); let cold;
    try {
        const result = await f.run(), roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('completed'); expect(parent.status).toBe('completed'); expect(result.output.runStatus).toBe('completed');
        expect(child.progress.loopIterations).toBe(1); expect(child.progress.attempts).toBe(8); expect(child.graphRevision).toBe(2);
        expect(f.requests).toHaveLength(6); expect(f.requests.filter(body => body.model === plannerModel)).toHaveLength(2);
        expect(f.requests.filter(body => body.model === leftModel)).toHaveLength(1); expect(f.requests.filter(body => body.model === rightModel)).toHaveLength(1);
        const reserved = f.atBarrier.attempts.find(attempt => attempt.nodeId === f.nodes.left.nodeId);
        expect(reserved.status).toBe('reserved');
        const proof = await f.h.engine.withTransaction(f.h.handle, async tx => {
            const local = await readTaskLocalOutput(tx, f.h.handle, child);
            const tails = local.publication.graphHistory.fanouts[0].scopeAttempts.filter(item => item.attempt.nodeId === f.nodes.left.nodeId);
            expect(tails).toHaveLength(1); expect(tails[0].attempt.attemptId).toBe(reserved.attemptId);
            expect(tails[0].attempt.reservationRef).toEqual(reserved.reservationRef);
            expect(local.publication.graphHistory.planners).toHaveLength(2);
            return readRpOutput(tx, f.h.handle, parent);
        });
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(6); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(5);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 5 }) })]);
        await f.h.engine.close(); cold = new f.h.engine.constructor({ directoriesByHandle: () => f.h.dirs });
        attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
        expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, parent))).receipt).toEqual(proof.receipt);
        expect(f.requests).toHaveLength(6);
    } finally { await cold?.close(); f.release(); await f.cleanup(); }
}, 180000);

test('RP child frozen scope Planner cannot increase the original held three-request allocation before any scope send', async () => {
    const f = await fixture({ scopePlanner: true, childRequests: 3 });
    try {
        let failure; try { await f.run(); } catch (error) { failure = error; }
        const causes = []; for (let error = failure; error; error = error.cause) causes.push(error.code ?? error.message);
        expect(causes).toContain('native_orchestration_graph_budget_unavailable'); expect(f.requests).toEqual([]);
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('blocked'); expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]); expect(child.pendingEffectRefs).toEqual([]);
        const bank = await bankOf(f); expect(bank.limits.maxRequests).toBe(5); expect(bank.attempts).toEqual([]);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'held', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body.map(message => message.mes)).toEqual(['Original RP context', 'Original RP input']);
        await expect(f.run()).rejects.toThrow(); expect(f.requests).toEqual([]); expect(await bankOf(f)).toEqual(bank);
    } finally { f.release(); await f.cleanup(); }
}, 90000);

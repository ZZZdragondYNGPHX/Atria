import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { controlCommandId, readAttempt, runGuard } from './controller-common.js';
import { AttemptController } from './attempt-controller.js';
import { TransitionController } from './transition-controller.js';
import { FanoutController, readFanoutFrame, readFanoutMembership } from './fanout-controller.js';
import { JoinController, joinIdForAttempt } from './join-controller.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readModelTerminalFact } from './model-port.js';
import { readEffect } from './effect-contracts.js';
import { inspectGraphReadiness } from './graph-work-readiness.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };

/** Controller/Scheduler orchestration only. All Model work still uses the
 * original captured child stage and its one already held Task-bank allocation. */
export async function runDelegatedFanout({ state, service, group, inherited, progress, engine, current, prepare, execute, runWorkers, readCompletion, resolveNode, resolveResources, requestsForNode, inspectClosure, replan, controlKind, reasonPrefix }) {
    const { handle, host } = state, runId = state.identity.childRunId, { runs, budgetPort } = service;
    inherited = [...inherited].sort((a, b) => a.edge.edgeId.localeCompare(b.edge.edgeId));
    const fresh = async () => { await current(); return runs.get(handle, runId); };
    const withAuthority = service.sourcePort.consumptionBoundary(handle, state.identity.sourceBinding, { engine });
    const control = async (node, bindings, fanoutAttemptId = null) => {
        const root = await fresh(), results = [...new Map(bindings.flatMap(item => [item.resultRef, ...item.evidenceRefs ?? []].filter(Boolean)).map(ref => [hash(ref), ref])).values()];
        const controls = [...new Map(bindings.filter(item => item.controlRef).map(item => [hash(item.controlRef), item.controlRef])).values()];
        const graphBindings = bindings.map(item => ({ edgeId: item.edge.edgeId, producerAttemptId: item.attemptId })).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        const input = { kind: controlKind, nodeId: node.nodeId, planRef: root.planRef, sourceRef: root.sourceBinding.sourceRef,
            acceptedGraphResultRefs: results, acceptedControlRefs: controls, graphBindings, ...(fanoutAttemptId ? { fanoutAttemptId } : {}) };
        const inputRefs = [input, ...root.parentRef.inputRefs, ...results, ...controls], admission = { inputRefs, inputDigest: hash(inputRefs),
            effectiveGrantDigest: root.parentRef.effectiveGrantDigest, budgetRef: root.budgetAuthorityRef };
        state.controlAdmission = admission;
        try {
            if (!graphBindings.length) return (await runs.beginAttempt(handle, controlCommandId(reasonPrefix + '.child.control', { runId, nodeId: node.nodeId, fanoutAttemptId, inputDigest: admission.inputDigest }),
                { ...runGuard(root), nodeId: node.nodeId, ...admission })).attemptId;
            return (await new TransitionController({ runs, authorizeTransition: async ({ target, producers }) => {
                await fresh(); if (target.nodeId !== node.nodeId || producers.some(item => !bindings.some(binding => binding.attemptId === item.attempt.attemptId && binding.edge.edgeId === item.edge.edgeId))) fail('native_orchestration_' + reasonPrefix + '_control_stale');
                return admission;
            } }).advance(handle, { ...runGuard(root), bindings: graphBindings, reservedAttemptId: null })).outcome.attemptId;
        } finally { state.controlAdmission = null; }
    };
    state.controlOnly = true;
    try {
        const fanoutAttemptId = await control(group.fanout, inherited);
        await new AttemptController({ runs, authorizeAttempt: async ({ attempt }) => {
            await fresh(); if (attempt.attemptId !== fanoutAttemptId) fail('native_orchestration_' + reasonPrefix + '_control_stale');
        } }).activate(handle, { ...runGuard(await fresh()), attemptId: fanoutAttemptId });
        const declared = [];
        for (const branch of group.branches) {
            const entry = await prepare({ node: branch.entry, bindings: inherited, fanoutAttemptId }), attempts = new Map([[branch.entry.nodeId, entry.attemptId]]);
            const models = new Map([[branch.entry.nodeId, entry.model]]);
            for (const nodeId of branch.scopeNodeIds.filter(id => id !== branch.entry.nodeId)) {
                const root = await fresh(), node = root.graph.nodes.find(node => node.nodeId === nodeId), model = await resolveNode(node);
                const reserved = await new AttemptController({ runs, authorizeAttempt: async () => {}, authorizeReservation: async ({ producer, target }) => {
                    await fresh(); if (producer.attemptId !== fanoutAttemptId || !branch.scopeNodeIds.includes(target.nodeId)) fail('native_orchestration_' + reasonPrefix + '_control_stale');
                } }).reserve(handle, { ...runGuard(root), producerAttemptId: fanoutAttemptId, nodeId });
                attempts.set(nodeId, reserved.outcome.attemptId); models.set(nodeId, model);
            }
            declared.push({ branch, entry, attempts, models });
        }
        const joinAttemptId = await control(group.join, [], fanoutAttemptId), branches = declared.map(item => ({ entryAttemptId: item.entry.attemptId,
            memberAttemptIds: [...item.attempts.values()].sort(), scopeNodeIds: item.branch.scopeNodeIds }));
        await new FanoutController({ runs, authorizeGroup: async ({ tx, root, producer, branches: actual }) => {
            await fresh();
            if (producer.attemptId !== fanoutAttemptId || !equal(actual.map(item => ({ entryAttemptId: item.entry.attemptId, memberAttemptIds: item.members.map(member => member.attemptId).sort(),
                scopeNodeIds: item.scopeNodeIds })).sort((a, b) => a.entryAttemptId.localeCompare(b.entryAttemptId)), [...branches].sort((a, b) => a.entryAttemptId.localeCompare(b.entryAttemptId)))) fail('native_orchestration_' + reasonPrefix + '_control_stale');
            const capacity = await budgetPort.observeCapacity(handle, { authorityRef: root.budgetAuthorityRef, reservationId: runId }, { tx });
            const requests = declared.reduce((sum, item) => sum + [...item.models.values()].reduce((count, model) => count + (requestsForNode ? requestsForNode(model) : 1), 0), 0) + 1;
            if (!capacity || capacity.overrun || capacity.remaining.requests < requests) fail('native_orchestration_graph_budget_unavailable');
        } }).freeze(handle, { ...runGuard(await fresh()), fanoutAttemptId, branches });
        const terminals = [...new Set(group.members.map(edge => declared.find(item => item.attempts.has(edge.from.nodeId)).attempts.get(edge.from.nodeId)))];
        const joins = new JoinController({ runs, authorizeMembership: async ({ tx, root, fanout, join, members }) => {
            await fresh(); const frame = await readFanoutFrame(tx, handle, root, fanoutAttemptId);
            if (!frame || fanout.attemptId !== fanoutAttemptId || join.attemptId !== joinAttemptId || !equal(members.map(item => item.attemptId).sort(), [...terminals].sort())) fail('native_orchestration_' + reasonPrefix + '_control_stale');
        }, verifyResults: async ({ tx, root, attempt, receipt }) => {
            await fresh(); if (!terminals.includes(attempt.attemptId) || receipt.resultRefs.length !== 1) return { valid: false };
            const fact = await readGraphNodeResult(tx, handle, root, receipt.resultRefs[0].resultId);
            return { valid: !!fact && fact.producer.attemptId === attempt.attemptId && fact.record.envelope.audienceConstraint.nodeIds.includes(group.join.nodeId) };
        } });
        const frozen = await joins.freeze(handle, { ...runGuard(await fresh()), fanoutAttemptId, nodeAttemptId: joinAttemptId, memberAttemptIds: terminals });
        const scopeCapture = declared[0].entry.projectCapture, root = await fresh();
        const workers = await Promise.all(declared.map(async item => ({ entryAttemptId: item.entry.attemptId, nodeIds: item.branch.scopeNodeIds,
            resources: [...new Set((await Promise.all([...item.models.values()].map(model => resolveResources
                ? resolveResources(model) : host.executionResources(handle, model.resolved.route)))).flat())],
            key: reasonPrefix + '-child-fanout:' + runId + ':' + item.entry.attemptId, fingerprint: hash({ runId, fanoutAttemptId, attempts: [...item.attempts] }),
            fresh: async permit => { state.controlPermit = permit; await fresh(); },
            run: async ({ permit, signal, controlPermit }) => {
                state.controlPermit = controlPermit; const pending = new Set(item.branch.scopeNodeIds), replacements = new Map(), retries = new Map();
                let forced = null;
                while (pending.size) {
                    signal.throwIfAborted(); const active = await fresh();
                    const ready = forced ?? (pending.has(item.branch.entry.nodeId) ? { node: item.branch.entry, edges: [] } : inspectGraphReadiness(active.graph, active.nodeControl,
                        Object.fromEntries([...progress].map(([id, fact]) => [id, fact.status ?? 'completed'])), { excludeNodeIds: active.graph.nodes.filter(node => !pending.has(node.nodeId)).map(node => node.nodeId) }).ready[0]);
                    if (!ready) fail('native_orchestration_graph_dependency_unavailable');
                    forced = null;
                    const bindings = [...ready.edges.map(edge => ({ edge, ...progress.get(edge.from.nodeId) })), ...ready.loopBindings ?? [], ...inherited].sort((a, b) => a.edge.edgeId.localeCompare(b.edge.edgeId));
                    try {
                        const replacement = replacements.get(ready.node.nodeId);
                        const prior = await engine.withTransaction(handle, tx => readAttempt(tx, handle, active,
                            replacement?.attemptId ?? item.attempts.get(ready.node.nodeId)));
                        const originalEntry = prior.doc.attemptId === item.entry.attemptId && prior.doc.status === 'pending';
                        if (replacement) item.attempts.set(ready.node.nodeId, replacement.attemptId);
                        const fact = await execute({ node: ready.node, bindings, fanoutAttemptId, permit, scopeCapture, signal, progress,
                            feedback: replacement?.feedback ?? null, rerun: replacement ?? null, retryToken: retries.get(ready.node.nodeId) ?? null,
                            preparedAttemptId: replacement?.attemptId ?? (originalEntry ? item.entry.attemptId : null),
                            reservedAttemptId: !replacement && prior.doc.status === 'reserved' ? prior.doc.attemptId : null });
                        item.attempts.set(ready.node.nodeId, fact.attemptId); replacements.delete(ready.node.nodeId);
                        progress.set(ready.node.nodeId, fact); pending.delete(ready.node.nodeId);
                        if (fact.requests?.replan) {
                            if (!replan || fact.requests.finalize) fail('native_orchestration_planner_replan_pending');
                            const latest = await fresh();
                            const next = await engine.withTransaction(handle, tx => replan({ tx, root: latest, completion: fact, progress, branch: item.branch }));
                            if (!next || !item.branch.scopeNodeIds.includes(next.target.nodeId)
                                || next.affectedNodeIds.some(id => !item.branch.scopeNodeIds.includes(id) || replacements.has(id)))
                                fail('native_orchestration_planner_replan_pending');
                            for (const id of next.affectedNodeIds) { progress.delete(id); pending.add(id); retries.set(id, fact.attemptId); }
                            forced = { node: latest.graph.nodes.find(node => node.nodeId === next.target.nodeId),
                                edges: latest.graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === next.target.nodeId
                                    && edge.from.nodeId !== group.fanout.nodeId), loopBindings: next.loopBindings };
                        }
                        if (fact.review?.decision === 'rerun') {
                            const actual = await fresh();
                            await engine.withTransaction(handle, async tx => {
                                for (const id of fact.review.invalidatedAttemptIds) {
                                    const attempt = (await readAttempt(tx, handle, actual, id)).doc;
                                    if (!item.branch.scopeNodeIds.includes(attempt.nodeId)) fail('native_orchestration_review_irreversible_dependency');
                                    progress.delete(attempt.nodeId); pending.add(attempt.nodeId); retries.set(attempt.nodeId, fact.attemptId);
                                }
                                for (const row of fact.review.replacements) {
                                    const attempt = (await readAttempt(tx, handle, actual, row.attemptId)).doc;
                                    const detail = fact.replacements?.find(spec => spec.attemptId === row.attemptId);
                                    replacements.set(attempt.nodeId, { ...detail, attemptId: row.attemptId,
                                        feedback: attempt.inputRefs[0].reviewFeedbackRef });
                                }
                            });
                            progress.delete(ready.node.nodeId); pending.add(ready.node.nodeId); retries.set(ready.node.nodeId, fact.attemptId);
                        }
                    } catch (error) {
                        const actual = await fresh(), record = await engine.withTransaction(handle, async tx => {
                            for (const id of [...actual.attemptRefs].reverse()) {
                                const record = await readAttempt(tx, handle, actual, id);
                                if (record.doc.nodeId === ready.node.nodeId && await readFanoutMembership(tx, handle, actual,
                                    await readFanoutFrame(tx, handle, actual, fanoutAttemptId), id)) {
                                    item.attempts.set(ready.node.nodeId, id); return record;
                                }
                            }
                            fail('native_orchestration_' + reasonPrefix + '_control_stale');
                        });
                        if (record.doc.effectRefs.length === 1) {
                            const terminal = await engine.withTransaction(handle, async tx => readModelTerminalFact(handle, tx, actual, (await readEffect(tx, handle, actual, record.doc.effectRefs[0])).doc));
                            if (terminal?.kind === 'rejected') await runs.withSourceControl(handle, runId, async () => new AttemptController({ runs, authorizeAttempt: async () => {}, verifySettlement: async ({ tx, root, attempt, resultRefs, receipts }) => {
                                await fresh();
                                const actual = await readModelTerminalFact(handle, tx, root, (await readEffect(tx, handle, root, record.doc.effectRefs[0])).doc);
                                if (attempt.attemptId !== record.doc.attemptId || !actual || !equal(actual, terminal) || resultRefs.length
                                        || !equal(receipts.map(receipt => receipt.receiptId), [terminal.receiptRef.receiptId])) fail('native_orchestration_' + reasonPrefix + '_control_stale');
                            } })
                                .settle(handle, { ...runGuard(await fresh()), attemptId: record.doc.attemptId, outcome: 'failed', resultRefs: [], effectReceiptRefs: [terminal.receiptRef.receiptId], reasonCode: 'generation_provider_rejected' }), { withAuthority });
                        }
                        throw error;
                    }
                }
            },
        })));
        const frameAttempts = root => engine.withTransaction(handle, async tx => {
            const frame = await readFanoutFrame(tx, handle, root, fanoutAttemptId), attempts = [];
            for (const id of root.attemptRefs) if (await readFanoutMembership(tx, handle, root, frame, id))
                attempts.push((await readAttempt(tx, handle, root, id)).doc);
            return attempts;
        });
        let decided;
        const cancelPending = async (attemptId, failedAttemptId, joinId) => runs.withSourceControl(handle, runId, async () => new AttemptController({ runs,
            authorizeAttempt: async () => {}, authorizePendingCancellation: async ({ tx, root, frame, attempt }) => {
                await fresh(); if (frame.fanoutAttemptId !== fanoutAttemptId || !declared.some(item => item.branch.scopeNodeIds.includes(attempt.nodeId))
                    || !await readFanoutMembership(tx, handle, root, frame, attempt.attemptId)) fail('native_orchestration_' + reasonPrefix + '_control_stale');
            } }).cancelPending(handle, { ...runGuard(await fresh()), fanoutAttemptId, failedAttemptId, joinId, attemptId }), { withAuthority });
        const work = await runWorkers(scopeCapture, { fanoutAttemptId, workers, maxConcurrency: Math.min(group.fanout.policy.maxConcurrency, root.limits.maxConcurrency),
            timeoutMs: Math.max(1, root.progress.deadlineAt - Date.now()), deadlineAt: frozen.outcome.joinBarrier.deadlineAt,
            until: async (_observed, permit) => {
                state.controlPermit = permit;
                try { decided = await runs.withSourceControl(handle, runId, async () => joins.settle(handle, { ...runGuard(await fresh()), joinId: joinIdForAttempt(joinAttemptId) }), { withAuthority }); return true; } catch (error) { if (error.code === 'native_orchestration_join_not_ready') return false; throw error; }
            }, onSettled: async (item, _observed, permit) => {
                state.controlPermit = permit; if (item.status !== 'rejected') return;
                const root = await fresh(), all = await frameAttempts(root), attempts = all.filter(attempt => declared[item.index].branch.scopeNodeIds.includes(attempt.nodeId));
                if (attempts.every(attempt => attempt.status === 'cancelled')) return;
                const failed = attempts.find(attempt => attempt.status === 'failed'); if (!failed) throw item.reason;
                if (group.fanout.policy.failurePolicy === 'fail_fast') for (const attempt of all)
                    if (['pending', 'reserved'].includes(attempt.status)) await cancelPending(attempt.attemptId, failed.attemptId, null);
            } });
        for (const index of work.cancelPending()) for (const attempt of await frameAttempts(await fresh()))
            if (declared[index].branch.scopeNodeIds.includes(attempt.nodeId) && ['pending', 'reserved'].includes(attempt.status))
                await cancelPending(attempt.attemptId, null, decided.outcome.joinReceipt.joinId);
        await work.wait(); state.controlPermit = null;
        const final = await fresh(), effectIds = [], attempts = [];
        await engine.withTransaction(handle, async tx => {
            for (const item of declared) for (const [nodeId, id] of item.attempts) {
                const actual = (await readAttempt(tx, handle, final, id)).doc;
                if (['failed', 'cancelled'].includes(actual.status)) progress.set(nodeId, { attemptId: id, status: actual.status });
            }
            const frame = await readFanoutFrame(tx, handle, final, fanoutAttemptId);
            for (const id of final.attemptRefs) {
                const actual = (await readAttempt(tx, handle, final, id)).doc;
                if (await readFanoutMembership(tx, handle, final, frame, id)) { attempts.push(actual); effectIds.push(...actual.effectRefs); }
            }
        });
        const costs = await engine.withTransaction(handle, async tx => inspectClosure
            ? inspectClosure({ tx, root: final, frame: await readFanoutFrame(tx, handle, final, fanoutAttemptId), attempts, effectIds })
            : effectIds.length ? budgetPort.observeEffectClosure(handle, { authorityRef: final.budgetAuthorityRef, effectIds }, { tx }) : { closed: true });
        if (!costs.closed) fail('native_orchestration_' + reasonPrefix + '_quality_unsettled');
        const outcome = decided.outcome.joinReceipt.outcome;
        await runs.withSourceControl(handle, runId, async () => new AttemptController({ runs, authorizeAttempt: async () => {}, verifySettlement: async ({ attempt, resultRefs, receipts }) => {
            await fresh(); if (attempt.attemptId !== fanoutAttemptId || resultRefs.length || receipts.length) fail('native_orchestration_' + reasonPrefix + '_control_stale');
        } }).settle(handle, { ...runGuard(await fresh()), attemptId: fanoutAttemptId, outcome, resultRefs: [], effectReceiptRefs: [], reasonCode: reasonPrefix + '_fanout_join_' + outcome }), { withAuthority });
        const saved = await engine.withTransaction(handle, async tx => readCompletion(tx, handle, await runs.get(handle, runId), joinAttemptId));
        if (!saved || !['completed', 'partial'].includes(outcome)) fail('native_orchestration_' + reasonPrefix + '_fanout_failed');
        progress.set(group.fanout.nodeId, { attemptId: fanoutAttemptId, status: outcome });
        progress.set(group.join.nodeId, { attemptId: joinAttemptId, status: outcome, controlRef: saved.controlRef, evidenceRefs: saved.joinReceipt.acceptedResultRefs });
    } finally { state.controlOnly = false; state.controlPermit = null; }
}

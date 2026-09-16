import { compilePreset } from './preset-compiler.js';
import { runEnginePlan } from './runtime-bridge.js';
import { initialPolicyState, createResult, planIdentity, assertCapability, effectiveCapabilities } from '../../../lib/orchestration-engine/index.js';
import { copy } from '../../../lib/agent-runtime/contracts.js';
import { guidanceOutput } from './output-adapter.js';
import { createFirstChunkBarrier } from '../dispatch-barrier.js';
import { resolveOrchestrationAgentApiPresetName, resolveOrchestrationAgentPromptPresetName } from '../agent-resolution.js';
import { appendRound, appendToSection, ensureSection, setSectionStatus, setRoundStatus, finishRun } from '../run-state/store.js';
import { throwIfAborted } from '../abort-utils.js';

/** Legacy authoring vocabulary -> durable dynamic policy; no generator or private promise pool. */
export async function runAgendaEngine({ context, payload, messages, profile, settings, runId: panelRunId, trace, customToolRegistry,
    activeOrchPresetName, onRuntimeEvent, runAgendaPlannerStep, runAgendaTextAgent, applyAgendaPlannerOps, normalizeAgendaDispatches, syncTrace, finalizeTrace }) {
    const plan = compilePreset(profile, { mode: 'agenda', settings });
    const runId = `${panelRunId}/engine`, fingerprint = planIdentity(plan);
    const planner = plan.nodes.find(node => node.nodeId === 'planner');
    const initial = { ...initialPolicyState(plan), agenda: { plannerRounds: 0,
        todos: [{ id: 'main', goal: 'Produce the best next-turn orchestration guidance for the current request.', status: 'todo' }], runs: [], finalGuidance: '' },
    finalizeReason: '', budgetReason: '', pending: null };
    const delegate = (state, kind, dispatches = []) => {
        state.pending = { kind, dispatches };
        const entries = kind === 'planner' ? [{ node: planner, dispatch: null }] : dispatches.map(dispatch => ({
            node: plan.nodes.find(node => node.metadata.legacyAgentId === dispatch.agent), dispatch,
        }));
        return { intent: { type: 'fanout', concurrency: Math.min(entries.length, plan.budgets.maxConcurrency), failurePolicy: 'fail_fast',
            branches: entries.map(({ node, dispatch }, index) => ({ id: `${kind}/${state.agenda.plannerRounds}/${index}`,
                toAgentId: node.agentId, task: dispatch?.taskBrief || 'Plan the next agenda step', reason: 'Engine delegate', contextPolicy: 'task_only',
                payload: { kind, nodeId: node.nodeId, agenda: copy(state.agenda), dispatch, finalizeReason: state.finalizeReason } })) }, policyState: state };
    };
    const policyController = { advance({ policyState, receipt }) {
        if (policyState.planFingerprint !== fingerprint) throw new Error('Plan fingerprint mismatch');
        const state = copy(policyState);
        state.events = [];
        if (state.pending) {
            if (!Array.isArray(receipt?.branches) || receipt.branches.some(branch => branch.status !== 'completed')) throw new Error('Agenda child failed');
            const kind = state.pending.kind;
            for (const [index, branch] of receipt.branches.entries()) {
                const nodeId = kind === 'planner' ? 'planner' : `worker:${state.pending.dispatches[index].agent}`;
                const node = plan.nodes.find(node => node.nodeId === nodeId);
                const attempt = (state.attempts[nodeId] || 0) + 1; state.attempts[nodeId] = attempt;
                const result = createResult({ runId, nodeId, agentId: node.agentId, attempt, value: branch.value,
                    provenance: [{ childRunId: branch.runId }] });
                state.results.push(result); state.resultRefs.push(result.resultId);
                state.events.push({ type: 'result.created', nodeId, resultId: result.resultId });
            }
            if (kind === 'planner') {
                assertCapability(plan, planner, 'graph.mutate');
                const step = receipt.branches[0].value;
                if (!step || typeof step !== 'object' || (step.todo_ops !== undefined && !Array.isArray(step.todo_ops))
                    || (step.dispatches !== undefined && !Array.isArray(step.dispatches))) throw new Error('Invalid Planner proposal');
                applyAgendaPlannerOps(state.agenda, step);
                const dispatches = normalizeAgendaDispatches(state.agenda, step, profile, settings);
                if (state.agenda.todos.length > plan.budgets.maxTasks) throw new Error('Task graph mutation budget exhausted');
                state.graphRevision++; state.taskGraph = copy(state.agenda.todos);
                state.events.push({ type: 'graph.mutated', graphRevision: state.graphRevision });
                const finalize = String(step.finalize || '').trim();
                if (finalize && dispatches.length) throw new Error('Agenda planner cannot dispatch agents and finalize in the same step.');
                if (!finalize && step.dispatches?.length && !dispatches.length) throw new Error('Agenda planner dispatched no valid agents. Check available agent ids and selected prior run ids.');
                if (finalize || !dispatches.length) state.finalizeReason = finalize || 'Planner produced no further dispatches.';
                else {
                    assertCapability(plan, planner, 'agent.delegate');
                    for (const dispatch of dispatches) {
                        const todo = state.agenda.todos.find(todo => todo.id === dispatch.todoId);
                        if (todo && todo.status !== 'done') todo.status = 'doing';
                    }
                    return delegate(state, 'workers', dispatches);
                }
            } else {
                state.agenda.runs.push(...receipt.branches.map(branch => branch.value));
                if (kind === 'final') {
                    const final = receipt.branches[0].value;
                    if (!final.outputText?.trim()) throw new Error('Agenda final agent returned empty guidance text.');
                    state.agenda.finalGuidance = final.outputText.trim();
                    const status = state.budgetReason ? 'budget_exhausted' : state.agenda.unfinishedTodoIds.length ? 'partial' : 'completed';
                    state.outputState = { kind: 'guidance', ownerNodeId: plan.output.ownerNodeId, status, value: state.agenda.finalGuidance,
                        reason: state.budgetReason, unresolvedTaskIds: state.agenda.unfinishedTodoIds, resultId: state.resultRefs.at(-1) };
                    return { intent: { type: 'complete', output: state.outputState }, policyState: state };
                }
                if (state.agenda.runs.length >= plan.scheduler.maxTotalRuns) {
                    state.budgetReason = 'maxTotalRuns'; state.finalizeReason = 'Reached maxTotalRuns limit. Finalizing with collected work.';
                }
            }
            state.pending = null;
        }
        if (!state.finalizeReason && state.agenda.plannerRounds >= plan.scheduler.maxPlannerRounds) {
            state.budgetReason = 'plannerMaxRounds'; state.finalizeReason = 'Reached plannerMaxRounds. Summarize collected work and disclose unresolved tasks.';
        }
        if (state.finalizeReason) {
            state.agenda.budgetReason = state.budgetReason;
            state.agenda.unfinishedTodoIds = state.agenda.todos.filter(todo => !['done', 'dropped'].includes(todo.status)).map(todo => todo.id);
            return delegate(state, 'final', [{ todoId: 'finalize', agent: profile.finalAgentId,
                taskBrief: 'Read the resolved todo state and all completed runs, then produce the final orchestration guidance text.', inputRunIds: state.agenda.runs.map(run => run.runId) }]);
        }
        state.agenda.plannerRounds++;
        return delegate(state, 'planner');
    } };
    const barriers = new Map();
    const execute = async request => {
        const { kind, agenda, dispatch, nodeId } = request.payload;
        syncTrace(agenda);
        const roundId = `engine-${kind}-${agenda.plannerRounds}-${request.id}`;
        appendRound({ runId: panelRunId, round: { id: roundId, label: kind === 'planner' ? 'Planner' : dispatch.agent } });
        const sectionId = ensureSection({ runId: panelRunId, roundId, section: { id: 'output', kind: 'text', title: kind } });
        try {
            let result;
            if (kind === 'planner') result = (await runAgendaPlannerStep(context, payload, messages, profile, agenda, request.signal,
                { engineNode: true, runtimeRunId: request.runId, parentRunId: request.parentRunId, onRuntimeEvent })).plannerStep;
            else {
                if (!barriers.has(agenda.plannerRounds)) barriers.set(agenda.plannerRounds, createFirstChunkBarrier());
                const config = profile.agents[dispatch.agent];
                const prompt = resolveOrchestrationAgentPromptPresetName(settings, config)?.name || '';
                const key = context.isStreamingPresetEnabled?.(prompt) ? resolveOrchestrationAgentApiPresetName(settings, config)?.name || '' : '';
                const slot = barriers.get(agenda.plannerRounds).acquire(key);
                try {
                    if (slot.role === 'follower') await slot.wait;
                    throwIfAborted(request.signal);
                    result = await runAgendaTextAgent(context, payload, messages, profile, agenda, dispatch, {
                        kind: kind === 'final' ? 'final' : 'agent', finalReason: request.payload.finalizeReason, customToolRegistry,
                        panelRunId, activeOrchPresetName, onRuntimeEvent, engineNode: true, runtimeRunId: request.runId, engineParentRunId: request.parentRunId,
                        engineCapabilities: effectiveCapabilities(plan, plan.nodes.find(node => node.nodeId === nodeId)),
                        onFirstChunk: slot.role === 'lead' ? slot.signalFirstChunk : null,
                    }, request.signal);
                } finally { slot.release(); }
                // Conversations may contain source-guarded Memory OS tool text; never checkpoint them.
                result = { ...result };
                delete result.conversation;
            }
            appendToSection({ runId: panelRunId, roundId, sectionId, delta: kind === 'planner' ? JSON.stringify(result) : result.outputText });
            setSectionStatus({ runId: panelRunId, roundId, sectionId, status: 'done' });
            setRoundStatus({ runId: panelRunId, roundId, status: 'done' });
            return result;
        } catch (error) { setRoundStatus({ runId: panelRunId, roundId, status: 'failed' }); throw error; }
    };
    try {
        const { state } = await runEnginePlan({ plan, runId, context, signal: payload.signal, panelRunId, onEvent: onRuntimeEvent,
            policyController, initialState: initial, branchPort: { execute, resume: execute } });
        if (state.status !== 'completed') throw new Error(state.error || `Engine ${state.status}`);
        const output = guidanceOutput({ plan, state, generation: state.generation });
        syncTrace(state.policyState.agenda);
        finalizeTrace(state.output.status, { capsuleText: state.output.value, note: state.policyState.finalizeReason });
        finishRun({ runId: panelRunId, status: state.output.status === 'completed' ? 'committed' : state.output.status, finalText: state.output.value });
        return { ...output, stageOutputs: [{ id: 'finalize', mode: 'serial', nodes: [{ node: profile.finalAgentId, output: state.output.value }] }],
            previousNodeOutputs: new Map([[profile.finalAgentId, state.output.value]]), runtimeTrace: trace, reviewRerunCount: 0, agendaState: state.policyState.agenda };
    } catch (error) {
        finalizeTrace('failed', { error: String(error.message) });
        finishRun({ runId: panelRunId, status: 'error', error: String(error.message) });
        throw error;
    }
}

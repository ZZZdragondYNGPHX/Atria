import { copy, TERMINAL, validateDecision, validatePorts } from './contracts.js';
import { initialState, transition } from './state.js';
import { createEventBus } from './events.js';
import { CheckpointPersistenceError } from './durable-checkpoint-store.js';
import { MemoryCheckpointStore } from './checkpoint-store.js';
import { compileContextAsync } from './context-compiler.js';
import { abortable } from './abort.js';

/** Serial headless driver. Host services enter only through injected ports. */
export class AgentRuntime {
    #runs = new Map();
    constructor({ registry, ports, store = new MemoryCheckpointStore(), countTokens, contextBudget = 4096, contextInput = {}, eventSink }) {
        validatePorts(ports);
        this.registry = registry;
        this.ports = ports;
        this.store = store;
        this.countTokens = countTokens;
        this.contextBudget = contextBudget;
        this.contextInput = contextInput;
        this.events = createEventBus(eventSink);
    }

    getState(runId) { return this.store.load(runId); }

    publish(state, type, details = {}) {
        const effectId = details.effectId ?? state.pendingEffect?.effectId ?? null;
        this.events.emit({ schemaVersion: 1, type, runId: state.runId, stepId: state.stepId,
            eventId: `${state.runId}/${state.generation}/${state.checkpointVersion}/${type}/${effectId || '-'}`,
            generation: state.generation, status: state.status, agentId: state.currentAgentId,
            version: state.checkpointVersion, effectId, toolName: state.pendingEffect?.toolName, ...details });
    }

    save(state) {
        const next = { ...state, checkpointVersion: state.checkpointVersion + 1 };
        this.store.save(next, state.checkpointVersion);
        return next;
    }

    startRun(command) {
        this.registry.get(command.agentId);
        if (this.store.load(command.runId)) throw new Error('Run ID already exists');
        const state = this.save(transition(initialState(command), { type: 'startRun' }));
        this.publish(state, 'run.started');
        return this.#drive(state);
    }

    cancelRun(runId) {
        let state = this.store.load(runId);
        if (!state) throw new Error('Unknown run');
        if (TERMINAL.includes(state.status)) return state;
        state = this.save(transition(state, { type: 'cancelRun' }));
        this.#runs.get(runId)?.abort();
        state = this.save(transition(state, { type: 'run.cancelled' }));
        this.publish(state, 'run.cancelled');
        return state;
    }

    appendUserInput(runId, input) {
        return this.#drive(this.save(transition(this.store.load(runId), { type: 'appendUserInput', input })));
    }

    cancelBranch(runId, branchId) {
        const pending = this.store.load(runId)?.pendingEffect;
        if (pending?.type !== 'parallel.fanout') return false;
        return this.ports.parallel?.cancelBranch(pending.effectId, branchId) || false;
    }

    resumeRun(runId) {
        let state = this.store.load(runId);
        if (!state) throw new Error('Unknown run');
        if (TERMINAL.includes(state.status) || state.status === 'waiting_user') return this.#finishRecovery(state);
        const restoredVersion = state.checkpointVersion;
        this.#runs.get(runId)?.abort();
        state = this.save({ ...state, generation: state.generation + 1 });
        // An unacknowledged write might already have happened. Never blindly replay it.
        const pending = state.pendingEffect;
        if (state.status === 'cancelling') return Promise.resolve(this.cancelRun(runId)).then(async result => {
            if (this.store.flush) await this.store.flush();
            return result;
        });
        if (state.legacyPolicy) {
            state = this.save(transition(state, { type: 'run.fail', error: 'Legacy policy continuation unavailable; cannot replay effects' }));
            this.publish(state, 'run.failed');
            return this.#finishRecovery(state);
        }
        if (['tool.execute', 'parallel.fanout'].includes(pending?.type) && !state.completedEffects[pending.effectId]) {
            state = this.save({ ...state, recoveryEffectId: pending.effectId });
        }
        this.publish(state, 'run.resumed', { restoredVersion });
        return this.#drive(state, true);
    }

    async #finishRecovery(state) {
        if (this.store.flush) await this.store.flush();
        return this.store.load(state.runId);
    }

    async #drive(initial, restoring = false) {
        let state = initial;
        const controller = new AbortController();
        this.#runs.set(state.runId, controller);
        let memory = null;
        let revalidate = restoring && state.memoryRefs.length > 0;
        const isCurrent = () => !controller.signal.aborted && this.store.load(state.runId)?.checkpointVersion === state.checkpointVersion;
        try {
            while (state.pendingEffect && isCurrent()) {
                if (this.store.flush) await this.store.flush();
                if (!isCurrent()) break;
                const effect = state.pendingEffect;
                const agent = this.registry.get(state.currentAgentId);
                if (revalidate) {
                    memory = await abortable(this.ports.memory.recall({ ...copy(effect), agent,
                        signal: controller.signal, query: state.task, agentId: agent.id }), controller.signal);
                    if (!isCurrent()) break;
                    if (typeof memory?.assertCurrent !== 'function') throw new TypeError('Memory guard required');
                    memory.assertCurrent();
                    // An old decision cannot authorize a write using removed/revised sources.
                    const references = new Set((memory.references || []).map(reference => JSON.stringify(reference)));
                    const freshModel = effect.type === 'model.request' && !state.completedEffects[effect.effectId];
                    if (!freshModel && state.memoryRefs.some(reference => !references.has(JSON.stringify(reference)))) {
                        throw new Error('Restored memory references changed; replan required');
                    }
                    revalidate = false;
                }
                memory?.assertCurrent();
                if (!state.completedEffects[effect.effectId]) {
                    this.publish(state, `${effect.type}.started`, { effectId: effect.effectId });
                    if (!isCurrent()) break;
                    const result = await abortable(this.#execute(effect, state, agent, controller.signal, memory), controller.signal,
                        () => this.publish(state, 'effect.stale', { effectId: effect.effectId }));
                    if (!isCurrent()) { this.publish(state, 'effect.stale', { effectId: effect.effectId }); break; }
                    if (effect.type === 'memory.recall') memory = result;
                    if (effect.type === 'model.request') state = { ...state, memoryRefs: result.memoryRefs };
                    const stored = effect.type === 'memory.recall' ? { references: copy(result.references || []) } : result;
                    state = this.save({ ...state, completedEffects: { ...state.completedEffects, [effect.effectId]: { result: stored, consumed: false } } });
                }
                if (this.store.flush) await this.store.flush();
                if (!isCurrent()) break;
                state = this.save(transition(state, { type: 'effect.consumed', effectId: effect.effectId }));
                if (effect.type === 'agent.handoff') memory = null;
                const routing = effect.type === 'agent.handoff' ? state.handoffStack.at(-1) : null;
                this.publish(state, `${effect.type}.completed`, { effectId: effect.effectId, stepId: effect.stepId, ...(routing ? {
                    reason: routing.reason, handoffId: routing.handoffId, fromAgentId: routing.fromAgentId, toAgentId: routing.toAgentId, contextPolicy: routing.contextPolicy,
                } : {}), ...(effect.type === 'memory.recall' ? { references: state.memoryRefs } : {}),
                ...(['tool.execute', 'model.request'].includes(effect.type) ? { toolName: effect.toolName, ok: state.completedEffects[effect.effectId].result?.ok } : {}) });
            }
            if (this.store.flush) await this.store.flush();
            if (isCurrent()) this.publish(state, `run.${state.status}`);
        } catch (error) {
            if (error instanceof CheckpointPersistenceError) throw error;
            if (isCurrent()) {
                this.publish(state, 'effect.failed', { failureKind: error?.name || 'Error' });
                state = this.save(transition(state, { type: 'run.fail', error: error instanceof Error ? error.message : 'Port failed' }));
                if (this.store.flush) await this.store.flush();
                this.publish(state, 'run.failed');
            }
        } finally {
            controller.abort();
            if (this.#runs.get(state.runId) === controller) this.#runs.delete(state.runId);
        }
        if (this.store.flush) await this.store.flush();
        return this.store.load(state.runId);
    }

    async #execute(effect, state, agent, signal, memory) {
        const request = { ...copy(effect), agent, signal, step: state.step, generation: state.generation };
        if (effect.type === 'policy.advance') {
            const result = await this.ports.policy.advance({ ...request, receipt: effect.receiptId ? copy(state.completedEffects[effect.receiptId].result) : null });
            if (!['complete', 'model', 'tool', 'handoff'].includes(result?.type)) throw new TypeError('Invalid policy intent');
            if (result.type === 'tool' && (typeof result.toolName !== 'string' || !result.toolName)) throw new TypeError('Invalid policy tool');
            return result.type === 'handoff' ? validateDecision(result, agent, this.registry) : copy(result);
        }
        if (effect.type === 'memory.recall') return this.ports.memory.recall({ ...request, query: state.task, agentId: agent.id });
        if (effect.type === 'parallel.fanout') {
            memory?.assertCurrent();
            const method = state.recoveryEffectId === effect.effectId ? 'resume' : 'run';
            if (typeof this.ports.parallel?.[method] !== 'function') throw new Error('Parallel continuation unavailable');
            const result = await this.ports.parallel[method]({ ...request,
                branches: effect.branches.map(branch => ({ ...branch, maxSteps: state.budget.maxSteps })), scratch: copy(state.scratch),
                assertCurrent: () => memory?.assertCurrent(),
                onEvent: event => this.publish(state, event.type, event) });
            if (typeof result?.ok !== 'boolean' || !Array.isArray(result.branches)) throw new TypeError('Invalid parallel result');
            return copy(result);
        }
        if (effect.type === 'parallel.join') {
            const result = state.completedEffects[effect.fanoutEffectId]?.result;
            if (!result?.ok) throw new Error(result?.branches?.find(branch => branch.status === 'failed')?.error || 'Parallel branch failed or cancelled');
            return copy(result);
        }
        if (effect.type === 'tool.execute') {
            if (state.recoveryEffectId === effect.effectId) {
                const resolution = await this.ports.tool.reconcile?.({ ...request, toolCallId: effect.effectId });
                if (signal.aborted) throw new Error('Cancelled during reconciliation');
                memory?.assertCurrent();
                if (resolution?.status === 'completed') {
                    if (typeof resolution.result?.ok !== 'boolean') throw new TypeError('Invalid reconciled tool result');
                    return copy(resolution.result);
                }
                if (resolution?.status !== 'retryable') throw new Error('Uncertain tool effect requires reconciliation');
            }
            memory?.assertCurrent();
            const result = await this.ports.tool.execute({ ...request, toolCallId: effect.effectId, context: { runId: state.runId, scratch: copy(state.scratch) } });
            if (typeof result?.ok !== 'boolean') throw new TypeError('Invalid tool result');
            return copy(result);
        }
        if (effect.type === 'agent.handoff' && state.handoffStack.length >= state.budget.maxSteps) throw new Error('Handoff budget exhausted');
        if (effect.type === 'agent.handoff') return { ...validateDecision(effect.handoff, agent, this.registry), handoffId: effect.effectId, fromAgentId: agent.id, createdAt: Date.now() };
        if (effect.type !== 'model.request') throw new Error('Unknown effect');
        // Restored model boundary must recall again; checkpoints contain references only.
        const recalled = memory || await this.ports.memory.recall({ ...request, query: state.task, agentId: agent.id });
        if (signal.aborted || this.store.load(state.runId)?.generation !== state.generation) throw new Error('Cancelled or superseded');
        if (typeof recalled?.assertCurrent !== 'function') throw new TypeError('Memory guard required');
        recalled.assertCurrent();
        const contextInput = typeof this.contextInput === 'function'
            ? await this.contextInput({ state: copy(state), agent, signal }) : this.contextInput;
        if (signal.aborted || this.store.load(state.runId)?.checkpointVersion !== state.checkpointVersion) throw new Error('Cancelled or superseded');
        const assertCurrent = () => {
            if (signal.aborted || this.store.load(state.runId)?.checkpointVersion !== state.checkpointVersion) throw new Error('Cancelled or superseded');
            recalled.assertCurrent();
        };
        const compiled = await compileContextAsync({ ...contextInput, agent, state, memory: recalled, countTokens: this.countTokens, budget: this.contextBudget, assertCurrent });
        assertCurrent();
        this.publish(state, 'context.compiled', { tokens: compiled.tokens, diagnostics: compiled.diagnostics, tokenCounting: contextInput?.tokenCounting || 'injected', budgetScope: contextInput?.budgetScope || 'compiled-context', modelProfile: contextInput?.modelProfile || agent.modelProfile || {} });
        recalled.assertCurrent();
        if (signal.aborted || this.store.load(state.runId)?.checkpointVersion !== state.checkpointVersion) throw new Error('Cancelled or superseded');
        const result = await this.ports.model.request({ ...request, messages: compiled.messages, tools: agent.tools });
        recalled.assertCurrent();
        return { ...(state.legacyPolicy ? copy(result) : validateDecision(result, agent, this.registry)), memoryRefs: copy(recalled.references || []) };
    }
}

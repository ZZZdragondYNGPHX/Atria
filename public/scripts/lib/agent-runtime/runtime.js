import { copy, TERMINAL, validateDecision, validatePorts } from './contracts.js';
import { initialState, transition } from './state.js';
import { createEventBus } from './events.js';
import { MemoryCheckpointStore } from './checkpoint-store.js';
import { compileContextAsync } from './context-compiler.js';
import { abortable } from './abort.js';

/** Serial headless driver. Host services enter only through injected ports. */
export class AgentRuntime {
    #runs = new Map();
    constructor({ registry, ports, store = new MemoryCheckpointStore(), countTokens, contextBudget = 4096, contextInput = {} }) {
        validatePorts(ports);
        this.registry = registry;
        this.ports = ports;
        this.store = store;
        this.countTokens = countTokens;
        this.contextBudget = contextBudget;
        this.contextInput = contextInput;
        this.events = createEventBus();
    }

    getState(runId) { return this.store.load(runId); }

    publish(state, type, details = {}) {
        this.events.emit({ type, runId: state.runId, stepId: state.stepId, version: state.checkpointVersion, ...details });
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

    resumeRun(runId) {
        let state = this.store.load(runId);
        if (!state) throw new Error('Unknown run');
        if (TERMINAL.includes(state.status) || state.status === 'waiting_user') return Promise.resolve(state);
        this.#runs.get(runId)?.abort();
        state = this.save({ ...state, generation: state.generation + 1 });
        // An unacknowledged write might already have happened. Never blindly replay it.
        const pending = state.pendingEffect;
        if (pending?.type === 'tool.execute' && !state.completedEffects[pending.effectId]) {
            state = this.save(transition(state, { type: 'run.fail', error: 'Uncertain tool effect requires reconciliation' }));
            this.publish(state, 'run.failed');
            return Promise.resolve(state);
        }
        this.publish(state, 'run.resumed');
        return this.#drive(state);
    }

    async #drive(initial) {
        let state = initial;
        const controller = new AbortController();
        this.#runs.set(state.runId, controller);
        let memory = null;
        const isCurrent = () => !controller.signal.aborted && this.store.load(state.runId)?.checkpointVersion === state.checkpointVersion;
        try {
            while (state.pendingEffect && isCurrent()) {
                const effect = state.pendingEffect;
                const agent = this.registry.get(state.currentAgentId);
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
                state = this.save(transition(state, { type: 'effect.consumed', effectId: effect.effectId }));
                this.publish(state, `${effect.type}.completed`, { effectId: effect.effectId });
            }
            if (isCurrent()) this.publish(state, `run.${state.status}`);
        } catch (error) {
            if (isCurrent()) {
                state = this.save(transition(state, { type: 'run.fail', error: error instanceof Error ? error.message : 'Port failed' }));
                this.publish(state, 'run.failed');
            }
        } finally {
            if (this.#runs.get(state.runId) === controller) this.#runs.delete(state.runId);
        }
        return this.store.load(state.runId);
    }

    async #execute(effect, state, agent, signal, memory) {
        const request = { ...copy(effect), agent, signal, step: state.step, generation: state.generation };
        if (effect.type === 'memory.recall') return this.ports.memory.recall({ ...request, query: state.task, agentId: agent.id });
        if (effect.type === 'tool.execute') {
            const result = await this.ports.tool.execute({ ...request, toolCallId: effect.effectId, context: { runId: state.runId, scratch: copy(state.scratch) } });
            if (typeof result?.ok !== 'boolean') throw new TypeError('Invalid tool result');
            return copy(result);
        }
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
        this.publish(state, 'context.compiled', { tokens: compiled.tokens, diagnostics: compiled.diagnostics, tokenCounting: contextInput?.tokenCounting || 'injected', budgetScope: contextInput?.budgetScope || 'compiled-context' });
        recalled.assertCurrent();
        if (signal.aborted || this.store.load(state.runId)?.checkpointVersion !== state.checkpointVersion) throw new Error('Cancelled or superseded');
        const result = await this.ports.model.request({ ...request, messages: compiled.messages, tools: agent.tools });
        recalled.assertCurrent();
        return { ...validateDecision(result, agent, this.registry), memoryRefs: copy(recalled.references || []) };
    }
}

import { copy, requireId } from './contracts.js';

/** Owns static copies; callers cannot write run scratch back into saved definitions. */
export class AgentRegistry {
    #agents = new Map();

    constructor(definitions) {
        for (const definition of definitions) {
            const id = requireId(definition.id, 'agent id');
            if (this.#agents.has(id)) throw new Error(`Duplicate agent: ${id}`);
            const agent = copy({ instructions: '', tools: [], handoffs: [], ...definition });
            if (!Array.isArray(agent.tools) || !Array.isArray(agent.handoffs)) throw new TypeError('Invalid agent capabilities');
            const contextPolicies = agent.policies?.handoffContextPolicies;
            if (contextPolicies !== undefined && (!Array.isArray(contextPolicies)
                || contextPolicies.some(policy => !['task_only', 'include_scratch'].includes(policy)))) {
                throw new TypeError('Invalid agent handoff context policies');
            }
            this.#agents.set(id, agent);
        }
        for (const agent of this.#agents.values()) for (const target of agent.handoffs) this.get(target);
    }

    get(id) {
        if (!this.#agents.has(id)) throw new Error(`Unknown agent: ${id}`);
        return copy(this.#agents.get(id));
    }
}

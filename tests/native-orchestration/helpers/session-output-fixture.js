import { modelPortFixture } from './model-port-fixture.js';

export function configureSessionOutput({ plan }, maxBytes = 65536) {
    plan.definition.nodes.find(node => node.kind === 'output').capabilities = ['chat.output'];
    plan.definition.capabilityCeiling = ['generation.send', 'chat.output'];
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes } });
}

export const sessionOutputFixture = (make, { maxBytes = 65536, ...options } = {}) => modelPortFixture(make, {
    ...options, configurePlan: args => configureSessionOutput(args, maxBytes),
});

import { projectReadFixture, configureProjectToolPlan } from './project-tool-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';

const plan = { summary: 'Prepare an original Project review', steps: [{ id: 'rename', title: 'Rename Project', impact: 'low' }] };
export const projectReviewFixture = async (make, { unpinned = false, invalid = false, outputContract = false } = {}) => {
    let original;
    return projectReadFixture(make, { maxModelRounds: 3, configurePlan: async args => {
        original = structuredClone(args.original); original.project.displayName = 'Proposed Native Project name';
        if (invalid) original.package.entryPoints = [];
        if (outputContract) Object.assign(args.plan.definition.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
        await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_project_save', ...unpinned ? [] : ['atri_agent_prepare_review']])(args);
        await args.seeded.persistence.saveModelProfile(args.h.handle, { ...args.seeded.model, limits: { ...args.seeded.model.limits, contextTokens: 65536 } });
        const { definition } = args.plan, node = definition.nodes[0];
        node.inputs.push({ name: 'continuation', type: 'json', required: false });
        definition.edges.push({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: node.nodeId, port: 'response' },
            to: { nodeId: node.nodeId, port: 'continuation' }, condition: 'always', maxVisits: 2, loopBack: true });
        definition.limits.maxLoopIterations = 2; definition.limits.maxEdgeVisits = Math.max(definition.limits.maxEdgeVisits, 3);
    }, responseBody: ({ index }) => ({ id: 'review-response-' + index, status: 'completed', output: [{ id: 'review-item-' + index,
        type: 'function_call', status: 'completed', call_id: 'review-call-' + index,
        name: ['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'][index],
        arguments: JSON.stringify(index === 0 ? plan : index === 1 ? { source: original, stepId: 'rename' } : {}) }],
    usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } }) });
};

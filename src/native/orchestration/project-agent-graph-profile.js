import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { projectToolCapability } from './project-tool-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_project_plan_unavailable'), { code: 'native_orchestration_project_plan_unavailable' }); };
const equal = (a, b) => hash(a) === hash(b);

/** Authored serial collaboration over one original Project Task. Continuing
 * tool rounds cross actual task nodes; no second Task, writer or paid bank.
 * A self-loop is permitted only on the final worker and remains bounded. */
export function projectAgentGraphProfile(plan, maxModelRounds) {
    const graph = plan.definition, agents = graph.nodes.filter(node => node.kind === 'agent');
    const output = graph.nodes.find(node => node.kind === 'output');
    if (!agents.length || !output || graph.nodes.length !== agents.length + 1 || graph.entryNodeIds.length !== 1
        || graph.graphChangePolicy.allowedOperations.length || graph.outputContract.allowPartial
        || !['result', 'project_review'].includes(graph.outputContract.kind)
        || output.capabilities.length || output.inputs.length !== 1 || output.inputs[0].type !== 'json'
        || !output.inputs[0].required || output.outputs.length || output.dependencyPinIds.length) fail();
    const ordered = [], transfers = [], visited = new Set();
    let node = agents.find(item => item.nodeId === graph.entryNodeIds[0]);
    while (node && !visited.has(node.nodeId)) {
        visited.add(node.nodeId); ordered.push(node);
        const forward = graph.edges.filter(edge => edge.from.nodeId === node.nodeId && !edge.loopBack);
        if (forward.length !== 1) fail();
        const edge = forward[0]; transfers.push(edge);
        if (!['always', 'success'].includes(edge.condition) || edge.maxVisits !== 1 || edge.from.port !== node.outputs[0]?.name) fail();
        if (edge.to.nodeId === output.nodeId) break;
        node = agents.find(item => item.nodeId === edge.to.nodeId);
    }
    const tail = ordered.at(-1), loops = graph.edges.filter(edge => edge.loopBack), loop = loops[0];
    if (ordered.length !== agents.length || transfers.at(-1)?.to.nodeId !== output.nodeId || loops.length > 1
        || graph.edges.length !== transfers.length + loops.length || !equal(graph.entryNodeIds, [ordered[0].nodeId])
        || maxModelRounds < ordered.length || maxModelRounds > ordered.length + (loop?.maxVisits ?? 0)
        || loop && (loop.from.nodeId !== tail.nodeId || loop.to.nodeId !== tail.nodeId || loop.condition !== 'always'
            || loop.from.port !== tail.outputs[0]?.name || loop.maxVisits > graph.limits.maxLoopIterations)) fail();
    const profiles = ordered.map((worker, index) => {
        const toolPins = plan.dependencyPins.filter(pin => pin.port === 'tool' && worker.dependencyPinIds.includes(pin.pinId));
        const modelPins = nodeModelRoutePins(worker, plan.dependencyPins);
        const capabilities = ['generation.send', ...['project.read', 'project.propose'].filter(capability => toolPins.some(pin => projectToolCapability(pin.resourceRef.name) === capability))];
        const incoming = index ? transfers[index - 1] : null, inputs = worker.inputs;
        if (!equal(worker.capabilities, capabilities) || worker.outputs.length !== 1 || worker.outputs[0].type !== 'json'
            || !modelPins.length || worker.dependencyPinIds.length !== modelPins.length + toolPins.length
            || inputs.length !== (incoming ? 1 : 0) + (worker === tail && loop ? 1 : 0)
            || incoming && !inputs.some(port => port.name === incoming.to.port && port.type === 'json' && port.required === !(worker === tail && loop))
            || worker === tail && loop && !inputs.some(port => port.name === loop.to.port && port.type === 'json' && !port.required)
            || index < ordered.length - 1 && toolPins.some(pin => pin.resourceRef.name === 'atri_agent_prepare_review')) fail();
        return { node: worker, toolPins, modelPins, incoming, loop: worker === tail ? loop : null };
    });
    const used = new Set(ordered.flatMap(worker => worker.dependencyPinIds));
    const ceiling = ['generation.send', ...['project.read', 'project.propose'].filter(capability => profiles.some(profile => profile.node.capabilities.includes(capability)))];
    if (!equal(graph.capabilityCeiling, ceiling) || plan.dependencyPins.some(pin => !used.has(pin.pinId))
        || transfers.at(-1).to.port !== output.inputs[0].name) fail();
    return { profiles, output, loop, transfers };
}

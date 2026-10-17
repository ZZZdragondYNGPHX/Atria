import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

const id = kind => createNativeId('orchestration' + kind);
export async function configurePlanner(plan, { h, seeded, route }) {
    const narrator = plan.definition.nodes[0], output = plan.definition.nodes[1], plannerId = id('Node');
    const plannerRoute = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Explicit Planner Route' };
    await seeded.persistence.saveRuntimeRoute(h.handle, plannerRoute);
    const persisted = await seeded.persistence.getRuntimeRoute(h.handle, plannerRoute.runtimeRouteId);
    plan.dependencyPins.push({ pinId: 'planner.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: persisted.runtimeRouteId }, integrity: hash(persisted) });
    const planner = { nodeId: plannerId, kind: 'planner', label: 'Bounded Planner', inputs: [], outputs: [{ name: 'patch', type: 'json', required: false }],
        dependencyPinIds: ['planner.route'], capabilities: ['generation.send', 'graph.patch'], policy: { agentPinId: 'planner.route' } };
    narrator.inputs = [{ name: 'plan', type: 'json', required: true }]; output.capabilities = ['chat.output'];
    plan.definition.nodes.unshift(planner); plan.definition.entryNodeIds = [plannerId]; plan.definition.capabilityCeiling = ['generation.send', 'graph.patch', 'chat.output'];
    plan.definition.edges.unshift({ edgeId: id('Edge'), from: { nodeId: plannerId, port: 'patch' }, to: { nodeId: narrator.nodeId, port: 'plan' }, condition: 'always', maxVisits: 1, loopBack: false });
    plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'markBlocked', 'requestFinalize'], allowedNodeKinds: [] };
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
    return narrator;
}

export async function configurePlannerLoop(plan, args, iterations = 2) {
    const narrator = await configurePlanner(plan, args), planner = plan.definition.nodes[0];
    planner.inputs = [{ name: 'feedback', type: 'json', required: false }];
    plan.definition.edges.push({ edgeId: id('Edge'), from: { nodeId: planner.nodeId, port: 'patch' }, to: { nodeId: planner.nodeId, port: 'feedback' },
        condition: 'always', maxVisits: iterations, loopBack: true });
    plan.definition.graphChangePolicy.allowedOperations.push('requestReplan');
    plan.definition.limits.maxReplans = iterations; plan.definition.limits.maxLoopIterations = iterations;
    return narrator;
}

export async function configurePlannerGraph(plan, args, { loop = false } = {}) {
    const narrator = loop ? await configurePlannerLoop(plan, args, 1) : await configurePlanner(plan, args);
    const planner = plan.definition.nodes[0], drafts = [];
    const transfer = plan.definition.edges.find(edge => edge.from.nodeId === planner.nodeId && edge.to.nodeId === narrator.nodeId);
    plan.definition.edges = plan.definition.edges.filter(edge => edge !== transfer);
    for (let index = 0; index < 2; index++) {
        const route = { ...args.route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Post-Planner draft ' + index };
        await args.seeded.persistence.saveRuntimeRoute(args.h.handle, route);
        const saved = await args.seeded.persistence.getRuntimeRoute(args.h.handle, route.runtimeRouteId), pinId = 'draft' + index + '.route';
        plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(saved) });
        const draft = { nodeId: id('Node'), kind: 'agent', label: 'Post-Planner draft ' + index, inputs: [{ name: 'plan', type: 'json', required: true }],
            outputs: [{ name: 'response', type: 'text', required: false }], dependencyPinIds: [pinId], capabilities: ['generation.send'], policy: { agentPinId: pinId } };
        drafts.push(draft);
        plan.definition.edges.push({ ...transfer, edgeId: id('Edge'), to: { nodeId: draft.nodeId, port: 'plan' } },
            { ...transfer, edgeId: id('Edge'), from: { nodeId: draft.nodeId, port: 'response' }, to: { nodeId: narrator.nodeId, port: 'draft' + index } });
    }
    narrator.inputs = drafts.map((_, index) => ({ name: 'draft' + index, type: 'text', required: true }));
    plan.definition.nodes.splice(1, 0, ...drafts);
    if (loop) {
        for (const pin of plan.dependencyPins) {
            const route = await args.seeded.persistence.getRuntimeRoute(args.h.handle, pin.resourceRef.runtimeRouteId);
            await args.seeded.persistence.saveRuntimeRoute(args.h.handle, { ...route, executionPolicy: { ...route.executionPolicy,
                computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 5 } } });
            pin.integrity = hash(await args.seeded.persistence.getRuntimeRoute(args.h.handle, pin.resourceRef.runtimeRouteId));
        }
    }
    return { planner, narrator, drafts };
}

export async function configurePlannerExpansion(plan, args, { loop = false, slots = 1 } = {}) {
    const narrator = loop ? await configurePlannerLoop(plan, args, 1) : await configurePlanner(plan, args);
    narrator.inputs.push(...Array.from({ length: slots }, (_, index) => ({ name: 'advisory' + index, type: 'text', required: false })));
    plan.definition.graphChangePolicy.allowedOperations.push('addNode', 'addEdge');
    plan.definition.graphChangePolicy.allowedNodeKinds = ['agent'];
    return narrator;
}

/** Read the template from the actual paid Model request, not a private scope. */
export function plannerTaskFromRequest(body) {
    const text = body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');
    const start = text.indexOf('{"kind":"native_rp_graph_planner"');
    if (start < 0) throw new Error('Original Planner task missing from HTTP');
    let depth = 0, quoted = false, escaped = false;
    for (let index = start; index < text.length; index++) {
        const char = text[index];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{') depth++;
        else if (char === '}' && --depth === 0) return JSON.parse(text.slice(start, index + 1));
    }
    throw new Error('Original Planner task JSON incomplete');
}

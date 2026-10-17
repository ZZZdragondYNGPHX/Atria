// Pure authoring contracts. No Browser runner, provider calls or authority state.
export const ORCHESTRATION_SCHEMA_VERSION = 1;
export const ORCHESTRATION_NODE_KINDS = Object.freeze(['agent', 'router', 'planner', 'effect', 'fanout', 'join', 'judge', 'review', 'wait', 'approval', 'output']);
export const ORCHESTRATION_PATCH_OPERATIONS = Object.freeze(['addNode', 'addEdge', 'setPendingPriority', 'cancelPending', 'markBlocked', 'requestFinalize', 'requestReplan']);
export const ORCHESTRATION_LIMIT_FIELDS = Object.freeze(['maxNodes', 'maxEdges', 'maxSteps', 'maxAttempts', 'maxPatches', 'maxReplans', 'maxReviews', 'maxDelegates', 'maxHandoffs', 'maxDepth', 'maxConcurrency', 'maxEdgeVisits', 'maxLoopIterations', 'deadlineMs']);

export function assertObject(value, fields, at) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') throw new TypeError(at + ' must be an object');
    for (const field of Object.keys(value)) if (!fields.includes(field)) throw new TypeError(at + '.' + field + ' is unknown');
    for (const field of fields) if (!Object.hasOwn(value, field)) throw new TypeError(at + '.' + field + ' is required');
    return value;
}

export function assertCounter(value, at, min = 0) {
    if (!Number.isSafeInteger(value) || value < min) throw new TypeError(at + ' must be a safe integer >= ' + min);
    return value;
}

export function assertToken(value, at) {
    if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(value)) throw new TypeError(at + ' must be a token');
    return value;
}

export function assertOrchestrationId(value, prefix, at) {
    if (typeof value !== 'string' || !new RegExp('^' + prefix + '_[a-f0-9]{32}$').test(value)) throw new TypeError(at + ' must be a Native ' + prefix + ' ID');
    return value;
}

export function assertDigest(value, at) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError(at + ' must be a SHA-256 digest');
    return value;
}

function member(value, choices, at) {
    if (!choices.includes(value)) throw new TypeError(at + ' has an unsupported value');
    return value;
}

function boolean(value, at) {
    if (typeof value !== 'boolean') throw new TypeError(at + ' must be boolean');
}

function array(value, at) {
    if (!Array.isArray(value)) throw new TypeError(at + ' must be an array');
    return value;
}

export function assertPlanRef(value) {
    assertObject(value, ['planId', 'planRevisionId', 'definitionHash'], 'planRef');
    assertOrchestrationId(value.planId, 'oplan', 'planRef.planId');
    assertOrchestrationId(value.planRevisionId, 'oprev', 'planRef.planRevisionId');
    assertDigest(value.definitionHash, 'planRef.definitionHash');
    return value;
}

export function assertSourceSelector(value) {
    const fields = { rp_chat: ['domain', 'controlId'], native_session: ['domain', 'sessionId', 'entryPointId', ...Object.hasOwn(value ?? {}, 'taskRef') ? ['taskRef'] : []], project: ['domain', 'projectId', 'taskId'] }[value?.domain];
    if (!fields) throw new TypeError('sourceSelector.domain is unsupported');
    assertObject(value, fields, 'sourceSelector');
    if (value.domain === 'rp_chat') assertOrchestrationId(value.controlId, 'rpctl', 'sourceSelector.controlId');
    if (value.domain === 'native_session') {
        assertOrchestrationId(value.sessionId, 'ses', 'sourceSelector.sessionId');
        if (value.entryPointId !== null) assertOrchestrationId(value.entryPointId, 'entry', 'sourceSelector.entryPointId');
        if (Object.hasOwn(value, 'taskRef')) assertSessionTaskRef(value.taskRef);
    }
    if (value.domain === 'project') {
        assertOrchestrationId(value.projectId, 'project', 'sourceSelector.projectId');
        if (value.taskId !== null) assertToken(value.taskId, 'sourceSelector.taskId');
    }
    return value;
}

export function assertSessionTaskRef(value) {
    assertObject(value, ['taskId', 'variantId'], 'Session Task reference');
    assertToken(value.taskId, 'taskRef.taskId'); assertToken(value.variantId, 'taskRef.variantId');
    return value;
}

// A projection of already validated Plan data, never a runtime grant.
export const nodeModelRoutePins = (node, pins) => node ? pins.filter(pin => pin.port === 'model' && pin.resourceRef.scope === 'player'
    && node.dependencyPinIds.includes(pin.pinId)) : [];

export function assertDependencyPins(pins) {
    const ids = new Set();
    for (const pin of array(pins, 'dependencyPins')) {
        assertObject(pin, ['pinId', 'port', 'resourceRef', 'integrity'], 'dependencyPin');
        assertToken(pin.pinId, 'dependencyPin.pinId');
        if (ids.has(pin.pinId)) throw new TypeError('duplicate dependencyPin.pinId');
        ids.add(pin.pinId);
        member(pin.port, ['context', 'model', 'tool', 'narrative', 'project', 'evaluation', 'plan'], 'dependencyPin.port');
        // Original resource authorities validate the exact reference union.
        // It must be pinned data, never executable code or a credential value.
        if (!pin.resourceRef || Object.prototype.toString.call(pin.resourceRef) !== '[object Object]') throw new TypeError('dependencyPin.resourceRef must be an original resource reference');
        assertDigest(pin.integrity, 'dependencyPin.integrity');
        if (pin.port === 'plan') assertPlanRef(pin.resourceRef);
    }
    return pins;
}

// An explicit payload bound, not a token estimate or a compute allowance.
// Existing profiles without payload production need not declare this policy.
export function assertResultPolicy(outputContract) {
    if (!['result', 'rp_narration', 'project_review'].includes(outputContract?.kind) || !Object.hasOwn(outputContract, 'resultPolicy'))
        throw Object.assign(new TypeError('native_orchestration_result_policy_unavailable'), { code: 'native_orchestration_result_policy_unavailable' });
    const policy = outputContract.resultPolicy;
    assertObject(policy, ['outputType', 'maxBytes'], 'resultPolicy');
    member(policy.outputType, outputContract.kind === 'rp_narration' ? ['text'] : outputContract.kind === 'project_review' ? ['json'] : ['text', 'json'], 'resultPolicy.outputType');
    assertCounter(policy.maxBytes, 'resultPolicy.maxBytes', 1);
    return policy;
}

export function assertPlanDefinition(value, pins, { draft = false } = {}) {
    assertObject(value, ['nodes', 'edges', 'entryNodeIds', 'capabilityCeiling', 'graphChangePolicy', 'limits', 'outputContract'], 'definition');
    assertObject(value.limits, ORCHESTRATION_LIMIT_FIELDS, 'limits');
    for (const field of ORCHESTRATION_LIMIT_FIELDS) assertCounter(value.limits[field], 'limits.' + field, ['maxNodes', 'maxSteps', 'maxAttempts', 'maxConcurrency', 'deadlineMs'].includes(field) ? 1 : 0);
    assertDependencyPins(pins);
    const pinIds = new Set(pins.map(pin => pin.pinId));
    const capabilities = new Set();
    for (const capability of array(value.capabilityCeiling, 'capabilityCeiling')) {
        assertToken(capability, 'capability');
        if (capabilities.has(capability)) throw new TypeError('duplicate capability');
        capabilities.add(capability);
    }
    assertObject(value.graphChangePolicy, ['allowedOperations', 'allowedNodeKinds'], 'graphChangePolicy');
    for (const op of array(value.graphChangePolicy.allowedOperations, 'allowedOperations')) member(op, ORCHESTRATION_PATCH_OPERATIONS, 'patch operation');
    for (const kind of array(value.graphChangePolicy.allowedNodeKinds, 'allowedNodeKinds')) member(kind, ORCHESTRATION_NODE_KINDS, 'node kind');
    const nodes = array(value.nodes, 'nodes'), edges = array(value.edges, 'edges');
    if (!draft && (!nodes.length || nodes.length > value.limits.maxNodes || edges.length > value.limits.maxEdges)) throw new TypeError('graph exceeds explicit node/edge limits');
    const byId = new Map();
    for (const node of nodes) {
        assertObject(node, ['nodeId', 'kind', 'label', 'inputs', 'outputs', 'dependencyPinIds', 'capabilities', 'policy'], 'node');
        assertOrchestrationId(node.nodeId, 'onode', 'node.nodeId');
        if (byId.has(node.nodeId)) throw new TypeError('duplicate node ID');
        member(node.kind, ORCHESTRATION_NODE_KINDS, 'node.kind');
        if (typeof node.label !== 'string' || node.label.length > 256) throw new TypeError('node.label must be <= 256 characters');
        for (const direction of ['inputs', 'outputs']) {
            const names = new Set();
            for (const port of array(node[direction], 'node.' + direction)) {
                assertObject(port, ['name', 'type', 'required'], 'port');
                assertToken(port.name, 'port.name'); assertToken(port.type, 'port.type'); boolean(port.required, 'port.required');
                if (names.has(port.name)) throw new TypeError('duplicate port');
                names.add(port.name);
            }
        }
        for (const pin of array(node.dependencyPinIds, 'node.dependencyPinIds')) {
            assertToken(pin, 'dependencyPinId');
            if (!draft && !pinIds.has(pin)) throw new TypeError('node references missing dependency pin');
        }
        for (const capability of array(node.capabilities, 'node.capabilities')) {
            assertToken(capability, 'capability');
            if (!draft && !capabilities.has(capability)) throw new TypeError('node exceeds capability ceiling');
        }
        if (['fanout', 'join'].includes(node.kind) && node.capabilities.length) throw new TypeError('deterministic fanout/join cannot execute effects');
        assertNodePolicy(node, draft, pins);
        byId.set(node.nodeId, node);
    }
    const edgeIds = new Set(), incoming = new Set(), adjacency = new Map(nodes.map(node => [node.nodeId, []]));
    for (const edge of edges) {
        assertObject(edge, ['edgeId', 'from', 'to', 'condition', 'maxVisits', 'loopBack'], 'edge');
        assertOrchestrationId(edge.edgeId, 'oedge', 'edge.edgeId');
        if (edgeIds.has(edge.edgeId)) throw new TypeError('duplicate edge ID');
        edgeIds.add(edge.edgeId);
        member(edge.condition, ['always', 'success', 'failure'], 'edge.condition');
        boolean(edge.loopBack, 'edge.loopBack');
        if (!draft && edge.loopBack && !value.limits.maxLoopIterations) throw new TypeError('loop-back edge requires an explicit loop iteration limit');
        assertCounter(edge.maxVisits, 'edge.maxVisits', 1);
        if (!draft && edge.maxVisits > value.limits.maxEdgeVisits) throw new TypeError('edge exceeds visit limit');
        for (const end of ['from', 'to']) {
            assertObject(edge[end], ['nodeId', 'port'], 'edge.' + end);
            assertOrchestrationId(edge[end].nodeId, 'onode', 'edge.' + end + '.nodeId');
            assertToken(edge[end].port, 'edge.' + end + '.port');
        }
        const from = byId.get(edge.from.nodeId)?.outputs.find(port => port.name === edge.from.port);
        const to = byId.get(edge.to.nodeId)?.inputs.find(port => port.name === edge.to.port);
        if (!draft && (!from || !to || from.type !== to.type)) throw Object.assign(new TypeError('edge has missing or incompatible typed ports'), { edgeId: edge.edgeId, fieldPath: 'edges' });
        if (!draft && incoming.has(edge.to.nodeId + ':' + edge.to.port) && byId.get(edge.to.nodeId)?.kind !== 'join') throw Object.assign(new TypeError('multiple producers require an explicit Join'), { edgeId: edge.edgeId, fieldPath: 'edges' });
        if (byId.has(edge.from.nodeId) && byId.has(edge.to.nodeId)) adjacency.get(edge.from.nodeId).push(edge.to.nodeId);
        incoming.add(edge.to.nodeId + ':' + edge.to.port);
    }
    const entryIds = array(value.entryNodeIds, 'entryNodeIds');
    for (const id of entryIds) assertOrchestrationId(id, 'onode', 'entryNodeId');
    if (!draft && (!entryIds.length || new Set(entryIds).size !== entryIds.length || entryIds.some(id => !byId.has(id)))) throw new TypeError('graph entry IDs are missing or duplicate');
    const seen = new Set(), pending = entryIds.filter(id => byId.has(id));
    while (pending.length) {
        const id = pending.pop();
        if (seen.has(id)) continue;
        seen.add(id); pending.push(...adjacency.get(id));
    }
    if (!draft && seen.size !== nodes.length) throw new TypeError('graph contains unreachable nodes');
    for (const node of nodes) for (const port of node.inputs) {
        if (!draft && port.required && !incoming.has(node.nodeId + ':' + port.name) && !entryIds.includes(node.nodeId)) throw Object.assign(new TypeError('required input is unconnected'), { nodeId: node.nodeId, fieldPath: 'inputs.' + port.name });
    }
    assertObject(value.outputContract, ['kind', 'ownerNodeId', 'slot', 'allowPartial',
        ...(Object.hasOwn(value.outputContract ?? {}, 'resultPolicy') ? ['resultPolicy'] : [])], 'outputContract');
    member(value.outputContract.kind, ['rp_narration', 'project_review', 'result'], 'outputContract.kind');
    if (Object.hasOwn(value.outputContract, 'resultPolicy')) assertResultPolicy(value.outputContract);
    assertToken(value.outputContract.slot, 'outputContract.slot'); boolean(value.outputContract.allowPartial, 'outputContract.allowPartial');
    if (value.outputContract.ownerNodeId !== null) assertOrchestrationId(value.outputContract.ownerNodeId, 'onode', 'outputContract.ownerNodeId');
    if (!draft && (byId.get(value.outputContract.ownerNodeId)?.kind !== 'output' || nodes.filter(node => node.kind === 'output').length !== 1)) throw new TypeError('graph must have exactly one output owner');
    // Every node needs an exit to the output. Bounded visits alone must not
    // admit a disconnected strongly connected component with no final result.
    const exits = new Set([value.outputContract.ownerNodeId]);
    for (let changed = true; changed;) {
        changed = false;
        for (const edge of edges) if (exits.has(edge.to.nodeId) && !exits.has(edge.from.nodeId)) { exits.add(edge.from.nodeId); changed = true; }
    }
    if (!draft && exits.size !== nodes.length) throw new TypeError('graph contains nodes without an output path');
    if (!draft) {
        if (!value.outputContract.allowPartial && nodes.some(node => node.kind === 'join' && node.policy.strategy === 'deadline')) throw new TypeError('deadline Join requires partial output permission');
        // Removing explicitly bounded loop-back edges must leave a DAG.
        // A nonzero limit alone cannot silently authorize every cycle edge.
        const forward = edges.filter(edge => !edge.loopBack);
        const nextIds = id => forward.filter(edge => edge.from.nodeId === id).map(edge => edge.to.nodeId);
        const degrees = new Map(nodes.map(node => [node.nodeId, 0]));
        for (const edge of forward) degrees.set(edge.to.nodeId, degrees.get(edge.to.nodeId) + 1);
        const pending = [...degrees].filter(([, degree]) => degree === 0).map(([id]) => id);
        let visited = 0;
        while (pending.length) {
            const id = pending.pop(); visited++;
            for (const next of nextIds(id)) { degrees.set(next, degrees.get(next) - 1); if (!degrees.get(next)) pending.push(next); }
        }
        if (visited !== nodes.length) throw new TypeError('cyclic graph requires explicit loop-back edges');
        for (const edge of edges.filter(edge => edge.loopBack)) {
            const seen = new Set(), pending = [edge.to.nodeId];
            while (pending.length) { const id = pending.pop(); if (seen.has(id)) continue; seen.add(id); pending.push(...nextIds(id)); }
            if (!seen.has(edge.from.nodeId)) throw new TypeError('loop-back edge must close a forward path');
        }
    }
    return value;
}

function assertNodePolicy(node, draft, pins) {
    const policy = node.policy;
    const fields = {
        agent: ['agentPinId'], planner: ['agentPinId'], judge: ['agentPinId'], review: ['agentPinId', 'maxRounds'],
        effect: ['actionPinId'], router: ['selection'], fanout: ['maxConcurrency', 'failurePolicy'],
        join: ['strategy', 'quorum', 'deadlineMs'], wait: ['timeoutMs'], approval: ['timeoutMs'], output: [],
    }[node.kind];
    if (node.capabilities.includes('agent.delegate')) {
        if (!['agent', 'planner', 'judge', 'review', 'router'].includes(node.kind)) throw new TypeError('Node cannot delegate');
        fields.push('allowedPlanPinIds');
    }
    if (Object.hasOwn(policy, 'audiencePinId')) {
        if (!['agent', 'planner', 'judge', 'review'].includes(node.kind)) throw new TypeError('Audience requires a model node');
        fields.push('audiencePinId');
    }
    assertObject(policy, fields, 'node.policy');
    if (fields.includes('audiencePinId')) {
        assertToken(policy.audiencePinId, 'node.policy.audiencePinId');
        if (!node.dependencyPinIds.includes(policy.audiencePinId)
            || pins.find(pin => pin.pinId === policy.audiencePinId)?.port !== 'context') throw new TypeError('Audience requires an exact Context dependency pin');
    }
    if (fields.includes('allowedPlanPinIds')) {
        const allowed = array(policy.allowedPlanPinIds, 'allowedPlanPinIds'), seen = new Set();
        for (const pinId of allowed) {
            assertToken(pinId, 'allowedPlanPinId');
            if (seen.has(pinId)) throw new TypeError('Duplicate allowed Plan pin');
            seen.add(pinId);
            if (!draft && (!node.dependencyPinIds.includes(pinId) || pins.find(pin => pin.pinId === pinId)?.port !== 'plan')) throw new TypeError('Delegation requires a declared exact Plan dependency pin');
        }
    }
    for (const field of ['agentPinId', 'actionPinId']) if (fields.includes(field)) {
        if (!(draft && policy[field] === null)) assertToken(policy[field], 'node.policy.' + field);
        if (!draft && !node.dependencyPinIds.includes(policy[field])) throw new TypeError('node policy requires an exact dependency pin');
    }
    for (const field of ['maxRounds', 'maxConcurrency', 'quorum', 'deadlineMs', 'timeoutMs']) if (fields.includes(field)) assertCounter(policy[field], 'node.policy.' + field, 1);
    if (node.kind === 'router') member(policy.selection, ['first_success', 'all_matching'], 'router.selection');
    if (node.kind === 'join') member(policy.strategy, ['all-success', 'all-settled', 'any-success', 'count-quorum', 'deadline'], 'join.strategy');
    if (node.kind === 'fanout') member(policy.failurePolicy, ['continue', 'fail_fast'], 'fanout.failurePolicy');
}

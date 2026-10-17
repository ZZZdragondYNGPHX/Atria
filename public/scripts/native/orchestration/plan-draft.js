// One local PlanDraft edit history shared by Canvas, List and Inspector.
// Only the shared contract module checks shape; the Native Host validates,
// hashes and publishes. Layout (viewState) never changes execution order.
import { assertPlanDefinition, ORCHESTRATION_LIMIT_FIELDS, ORCHESTRATION_NODE_KINDS } from '../../../shared/native-orchestration-contracts.js';

export const NODE_KINDS = ORCHESTRATION_NODE_KINDS;
export const LIMIT_FIELDS = ORCHESTRATION_LIMIT_FIELDS;
export const EXECUTABLE_KINDS = Object.freeze(['agent', 'planner', 'judge', 'review', 'router']);
const HISTORY_LIMIT = 200;

const randomHex = () => crypto.randomUUID().replaceAll('-', '');
export const newNodeId = () => 'onode_' + randomHex();
export const newEdgeId = () => 'oedge_' + randomHex();
const clone = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const port = (name, type, required) => ({ name, type, required });
export function defaultNodeShape(kind) {
    const text = [port('in', 'text', false)];
    const shapes = {
        agent: { inputs: text, outputs: [port('out', 'text', false)], policy: { agentPinId: null } },
        planner: { inputs: text, outputs: [port('plan', 'json', false)], policy: { agentPinId: null } },
        judge: { inputs: text, outputs: [port('verdict', 'json', false)], policy: { agentPinId: null } },
        review: { inputs: text, outputs: [port('out', 'text', false)], policy: { agentPinId: null, maxRounds: 1 } },
        router: { inputs: text, outputs: [port('out', 'text', false)], policy: { selection: 'first_success' } },
        effect: { inputs: [port('in', 'json', false)], outputs: [port('out', 'json', false)], policy: { actionPinId: null } },
        fanout: { inputs: text, outputs: [port('out', 'text', false)], policy: { maxConcurrency: 2, failurePolicy: 'continue' } },
        join: { inputs: [port('in', 'text', true)], outputs: [port('out', 'text', false)], policy: { strategy: 'all-success', quorum: 1, deadlineMs: 60000 } },
        wait: { inputs: text, outputs: [port('out', 'text', false)], policy: { timeoutMs: 300000 } },
        approval: { inputs: text, outputs: [port('out', 'text', false)], policy: { timeoutMs: 300000 } },
        output: { inputs: [port('in', 'text', true)], outputs: [], policy: {} },
    };
    if (!shapes[kind]) throw new TypeError('Unsupported node kind');
    return clone(shapes[kind]);
}

export function emptyDefinition() {
    const limits = Object.fromEntries(LIMIT_FIELDS.map(field => [field, 0]));
    Object.assign(limits, { maxNodes: 16, maxEdges: 32, maxSteps: 32, maxAttempts: 32, maxConcurrency: 1, maxEdgeVisits: 1, deadlineMs: 300000 });
    return { nodes: [], edges: [], entryNodeIds: [], capabilityCeiling: [], graphChangePolicy: { allowedOperations: [], allowedNodeKinds: [] },
        limits, outputContract: { kind: 'rp_narration', ownerNodeId: null, slot: 'narration', allowPartial: false } };
}

/** Starter: one agent feeding the single output. Still needs a pinned Model. */
export function starterDocument(title) {
    const draft = new PlanDraft({ definition: emptyDefinition(), dependencyPins: [], viewState: { title, positions: {} } });
    const agent = draft.addNode('agent', { label: 'Narrator', position: { x: 80, y: 120 } });
    // An entry agent reads its Source context, not an input port.
    draft.setPort(agent, 'inputs', 0, null);
    const output = draft.addNode('output', { label: 'Output', position: { x: 360, y: 120 } });
    draft.addEdge({ from: { nodeId: agent, port: 'out' }, to: { nodeId: output, port: 'in' } });
    return draft.document();
}

export function normalizeViewState(value) {
    const view = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const positions = view.positions && typeof view.positions === 'object' ? view.positions : {};
    return { ...view, title: typeof view.title === 'string' ? view.title : '', positions };
}

/** Structural pre-check from the shared contract; the Host report is authoritative. */
export function precheck(doc) {
    try {
        assertPlanDefinition(doc.definition, doc.dependencyPins);
        return null;
    } catch (error) {
        return { message: error.message, nodeId: error.nodeId ?? null, edgeId: error.edgeId ?? null, fieldPath: error.fieldPath ?? null };
    }
}

export function assertDraftShape(doc) {
    assertPlanDefinition(doc.definition, doc.dependencyPins, { draft: true });
}

/** Removal impact shown before deleting a Draft node; Run state is unaffected. */
export function nodeRemovalImpact(definition, nodeId) {
    return {
        edges: definition.edges.filter(edge => edge.from.nodeId === nodeId || edge.to.nodeId === nodeId).map(edge => edge.edgeId),
        entry: definition.entryNodeIds.includes(nodeId),
        output: definition.outputContract.ownerNodeId === nodeId,
    };
}

/** Same-type port pairs for keyboard/list connection paths. */
export function compatiblePorts(definition, fromNodeId, toNodeId) {
    const from = definition.nodes.find(node => node.nodeId === fromNodeId), to = definition.nodes.find(node => node.nodeId === toNodeId);
    if (!from || !to) return [];
    const pairs = [];
    for (const out of from.outputs) for (const input of to.inputs) if (out.type === input.type) pairs.push({ from: out.name, to: input.name });
    return pairs;
}

export function edgeTypeMismatch(definition, edge) {
    const from = definition.nodes.find(node => node.nodeId === edge.from.nodeId)?.outputs.find(item => item.name === edge.from.port);
    const to = definition.nodes.find(node => node.nodeId === edge.to.nodeId)?.inputs.find(item => item.name === edge.to.port);
    return !from || !to || from.type !== to.type;
}

/** Layered positions (forward edges only) for nodes without saved geometry. */
export function autoLayout(definition, positions = {}, { columnGap = 260, rowGap = 120, origin = { x: 60, y: 60 } } = {}) {
    const result = { ...positions };
    const depth = new Map();
    const forward = definition.edges.filter(edge => !edge.loopBack);
    const queue = definition.entryNodeIds.filter(id => definition.nodes.some(node => node.nodeId === id)).map(id => [id, 0]);
    if (!queue.length && definition.nodes[0]) queue.push([definition.nodes[0].nodeId, 0]);
    let guard = 0;
    while (queue.length && guard++ < 10000) {
        const [id, level] = queue.shift();
        if ((depth.get(id) ?? -1) >= level) continue;
        depth.set(id, level);
        for (const edge of forward) if (edge.from.nodeId === id && level < definition.nodes.length) queue.push([edge.to.nodeId, level + 1]);
    }
    const rows = new Map();
    for (const node of definition.nodes) {
        if (result[node.nodeId]) continue;
        const level = depth.get(node.nodeId) ?? (Math.max(-1, ...depth.values()) + 1);
        const row = rows.get(level) ?? 0;
        rows.set(level, row + 1);
        result[node.nodeId] = { x: origin.x + level * columnGap, y: origin.y + row * rowGap };
    }
    return result;
}

export class PlanDraft {
    #doc; #past = []; #future = []; #listeners = new Set(); #saved;

    constructor({ definition, dependencyPins, viewState }) {
        this.#doc = clone({ definition, dependencyPins, viewState: normalizeViewState(viewState) });
        this.#saved = clone(this.#doc);
    }

    document() { return clone(this.#doc); }
    get definition() { return this.#doc.definition; }
    get pins() { return this.#doc.dependencyPins; }
    get view() { return this.#doc.viewState; }
    canUndo() { return this.#past.length > 0; }
    canRedo() { return this.#future.length > 0; }
    isDirty() { return !same(this.#doc, this.#saved); }
    /** Semantic dirtiness excludes layout-only changes. */
    isSemanticDirty() { return !same([this.#doc.definition, this.#doc.dependencyPins], [this.#saved.definition, this.#saved.dependencyPins]); }
    subscribe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }

    /** After a Host receipt: the receipt document becomes the clean baseline. */
    markSaved(doc = this.#doc) { this.#saved = clone({ ...doc, viewState: normalizeViewState(doc.viewState) }); this.#emit('saved'); }
    /** Replace from Host (reload after conflict) while retaining history for comparison. */
    replace(doc, { keepHistory = false } = {}) {
        this.#doc = clone({ ...doc, viewState: normalizeViewState(doc.viewState) });
        this.#saved = clone(this.#doc);
        if (!keepHistory) { this.#past = []; this.#future = []; }
        this.#emit('replace');
    }

    #emit(reason) { for (const listener of this.#listeners) listener(reason); }

    /** Every edit goes through one transaction; failed shape checks roll back. */
    transact(reason, mutate) {
        const before = clone(this.#doc), next = clone(this.#doc);
        const result = mutate(next);
        assertDraftShape(next);
        if (same(before, next)) return result;
        this.#doc = next;
        this.#past.push(before);
        if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
        this.#future = [];
        this.#emit(reason);
        return result;
    }

    undo() { if (!this.#past.length) return false; this.#future.push(this.#doc); this.#doc = this.#past.pop(); this.#emit('undo'); return true; }
    redo() { if (!this.#future.length) return false; this.#past.push(this.#doc); this.#doc = this.#future.pop(); this.#emit('redo'); return true; }

    node(nodeId) { return this.#doc.definition.nodes.find(node => node.nodeId === nodeId) ?? null; }
    edge(edgeId) { return this.#doc.definition.edges.find(edge => edge.edgeId === edgeId) ?? null; }

    addNode(kind, { label = '', position = null } = {}) {
        return this.transact('node.add', doc => {
            const nodeId = newNodeId(), shape = defaultNodeShape(kind);
            doc.definition.nodes.push({ nodeId, kind, label: label || kind, inputs: shape.inputs, outputs: shape.outputs, dependencyPinIds: [], capabilities: [], policy: shape.policy });
            if (!doc.definition.entryNodeIds.length && kind !== 'output') doc.definition.entryNodeIds.push(nodeId);
            if (kind === 'output' && !doc.definition.outputContract.ownerNodeId) doc.definition.outputContract.ownerNodeId = nodeId;
            if (position) doc.viewState.positions[nodeId] = { x: Math.round(position.x), y: Math.round(position.y) };
            return nodeId;
        });
    }

    duplicateNode(nodeId) {
        return this.transact('node.duplicate', doc => {
            const original = doc.definition.nodes.find(node => node.nodeId === nodeId);
            if (!original) throw new TypeError('Missing node');
            const copy = { ...clone(original), nodeId: newNodeId(), label: (original.label + ' copy').slice(0, 256) };
            doc.definition.nodes.push(copy);
            const at = doc.viewState.positions[nodeId];
            if (at) doc.viewState.positions[copy.nodeId] = { x: at.x + 32, y: at.y + 48 };
            return copy.nodeId;
        });
    }

    removeNode(nodeId) {
        return this.transact('node.remove', doc => {
            const definition = doc.definition;
            definition.nodes = definition.nodes.filter(node => node.nodeId !== nodeId);
            definition.edges = definition.edges.filter(edge => edge.from.nodeId !== nodeId && edge.to.nodeId !== nodeId);
            definition.entryNodeIds = definition.entryNodeIds.filter(id => id !== nodeId);
            if (definition.outputContract.ownerNodeId === nodeId) definition.outputContract.ownerNodeId = null;
            delete doc.viewState.positions[nodeId];
        });
    }

    /** Reorder in the list; the order is presentation only, never execution order. */
    moveNodeInList(nodeId, delta) {
        return this.transact('node.reorder', doc => {
            const nodes = doc.definition.nodes, index = nodes.findIndex(node => node.nodeId === nodeId), target = index + delta;
            if (index < 0 || target < 0 || target >= nodes.length) return;
            const [node] = nodes.splice(index, 1);
            nodes.splice(target, 0, node);
        });
    }

    updateNode(nodeId, patch) {
        return this.transact('node.update', doc => {
            const node = doc.definition.nodes.find(item => item.nodeId === nodeId);
            if (!node) throw new TypeError('Missing node');
            const { policy, ...fields } = patch;
            Object.assign(node, clone(fields));
            if (policy) node.policy = { ...node.policy, ...clone(policy) };
            if (node.capabilities.includes('agent.delegate') && EXECUTABLE_KINDS.includes(node.kind) && !Array.isArray(node.policy.allowedPlanPinIds)) node.policy.allowedPlanPinIds = [];
            if (!node.capabilities.includes('agent.delegate')) delete node.policy.allowedPlanPinIds;
        });
    }

    setPort(nodeId, direction, index, value) {
        return this.transact('port.update', doc => {
            const node = doc.definition.nodes.find(item => item.nodeId === nodeId), ports = node[direction];
            const previous = ports[index];
            if (value === null) ports.splice(index, 1); else if (index === ports.length) ports.push(clone(value)); else ports[index] = clone(value);
            if (previous && (value === null || value.name !== previous.name)) {
                const end = direction === 'inputs' ? 'to' : 'from';
                if (value === null) doc.definition.edges = doc.definition.edges.filter(edge => !(edge[end].nodeId === nodeId && edge[end].port === previous.name));
                else for (const edge of doc.definition.edges) if (edge[end].nodeId === nodeId && edge[end].port === previous.name) edge[end].port = value.name;
            }
        });
    }

    addEdge({ from, to, condition = 'always', maxVisits = 1, loopBack = false }) {
        return this.transact('edge.add', doc => {
            const edgeId = newEdgeId();
            doc.definition.edges.push({ edgeId, from: clone(from), to: clone(to), condition, maxVisits, loopBack });
            return edgeId;
        });
    }

    updateEdge(edgeId, patch) {
        return this.transact('edge.update', doc => {
            const edge = doc.definition.edges.find(item => item.edgeId === edgeId);
            if (!edge) throw new TypeError('Missing edge');
            Object.assign(edge, clone(patch));
        });
    }

    removeEdge(edgeId) {
        return this.transact('edge.remove', doc => { doc.definition.edges = doc.definition.edges.filter(edge => edge.edgeId !== edgeId); });
    }

    setEntry(nodeId, entry) {
        return this.transact('entry.update', doc => {
            const ids = doc.definition.entryNodeIds.filter(id => id !== nodeId);
            if (entry) ids.push(nodeId);
            doc.definition.entryNodeIds = ids;
        });
    }

    setPlan(patch) {
        return this.transact('plan.update', doc => {
            for (const [field, value] of Object.entries(patch)) {
                if (field === 'title') doc.viewState.title = String(value).slice(0, 200);
                else if (field === 'limits') Object.assign(doc.definition.limits, clone(value));
                else if (field === 'outputContract') {
                    doc.definition.outputContract = { ...doc.definition.outputContract, ...clone(value) };
                    if (value.resultPolicy === null) delete doc.definition.outputContract.resultPolicy;
                } else if (field === 'graphChangePolicy') doc.definition.graphChangePolicy = { ...doc.definition.graphChangePolicy, ...clone(value) };
                else if (field === 'capabilityCeiling') doc.definition.capabilityCeiling = [...value];
                else throw new TypeError('Unsupported Plan field');
            }
        });
    }

    /** A pin is an exact original reference plus Host-computed integrity. */
    upsertPin(pin) {
        return this.transact('pin.update', doc => {
            const index = doc.dependencyPins.findIndex(item => item.pinId === pin.pinId);
            if (index < 0) doc.dependencyPins.push(clone(pin)); else doc.dependencyPins[index] = clone(pin);
        });
    }

    removePin(pinId) {
        return this.transact('pin.remove', doc => {
            doc.dependencyPins = doc.dependencyPins.filter(pin => pin.pinId !== pinId);
            for (const node of doc.definition.nodes) {
                node.dependencyPinIds = node.dependencyPinIds.filter(id => id !== pinId);
                for (const field of ['agentPinId', 'actionPinId']) if (node.policy[field] === pinId) node.policy[field] = null;
                if (Array.isArray(node.policy.allowedPlanPinIds)) node.policy.allowedPlanPinIds = node.policy.allowedPlanPinIds.filter(id => id !== pinId);
            }
        });
    }

    /** Layout only. Kept in history so Undo restores geometry too. */
    moveNode(nodeId, position) {
        return this.transact('layout', doc => { doc.viewState.positions[nodeId] = { x: Math.round(position.x), y: Math.round(position.y) }; });
    }

    layoutAll() {
        return this.transact('layout', doc => { doc.viewState.positions = autoLayout(doc.definition, {}); });
    }
}

/** Draft ↔ published comparison by stable IDs; never a merge. */
export function diffDefinitions(before, after) {
    const index = list => new Map(list.map(item => [item.nodeId ?? item.edgeId, item]));
    const compare = (a = [], b = []) => {
        const left = index(a), right = index(b), out = { added: [], removed: [], changed: [] };
        for (const [id, item] of right) if (!left.has(id)) out.added.push(item); else if (!same(left.get(id), item)) out.changed.push(item);
        for (const [id, item] of left) if (!right.has(id)) out.removed.push(item);
        return out;
    };
    const fields = ['entryNodeIds', 'capabilityCeiling', 'graphChangePolicy', 'limits', 'outputContract'].filter(field => !same(before?.definition?.[field], after?.definition?.[field]));
    if ((before?.viewState?.title ?? '') !== (after?.viewState?.title ?? '') && before && after) fields.push('title');
    return { nodes: compare(before?.definition?.nodes, after?.definition?.nodes), edges: compare(before?.definition?.edges, after?.definition?.edges),
        pins: compare((before?.dependencyPins ?? []).map(pin => ({ ...pin, nodeId: pin.pinId })), (after?.dependencyPins ?? []).map(pin => ({ ...pin, nodeId: pin.pinId }))), fields };
}

import { PlanDraft, starterDocument, precheck, nodeRemovalImpact, compatiblePorts, edgeTypeMismatch, autoLayout, diffDefinitions, emptyDefinition } from '../../public/scripts/native/orchestration/plan-draft.js';
import { assertPlanDefinition } from '../../public/shared/native-orchestration-contracts.js';

const draftFrom = doc => new PlanDraft(doc);

describe('orchestration PlanDraft (one edit history for canvas, list and inspector)', () => {
    test('starter document is a valid draft shape with one entry agent, one output owner and no entry input port', () => {
        const doc = starterDocument('Harbor');
        expect(() => assertPlanDefinition(doc.definition, doc.dependencyPins, { draft: true })).not.toThrow();
        const [agent, output] = doc.definition.nodes;
        expect(agent.kind).toBe('agent');
        expect(agent.inputs).toEqual([]);
        expect(doc.definition.entryNodeIds).toEqual([agent.nodeId]);
        expect(doc.definition.outputContract.ownerNodeId).toBe(output.nodeId);
        expect(doc.viewState.title).toBe('Harbor');
        // Only the Host decides validity; the local pre-check names the first structural gap.
        expect(precheck(doc)).toMatchObject({ message: expect.stringMatching(/agentPinId/) });
    });

    test('undo/redo and dirtiness cover semantic and layout edits; failed shape edits roll back', () => {
        const draft = draftFrom(starterDocument('T'));
        expect(draft.isDirty()).toBe(false);
        const [agent] = draft.definition.nodes;
        draft.moveNode(agent.nodeId, { x: 5, y: 7 });
        expect(draft.isDirty()).toBe(true);
        expect(draft.isSemanticDirty()).toBe(false);
        draft.updateNode(agent.nodeId, { label: 'Narrator 2' });
        expect(draft.isSemanticDirty()).toBe(true);
        expect(() => draft.updateNode(agent.nodeId, { label: 'x'.repeat(300) })).toThrow();
        expect(draft.node(agent.nodeId).label).toBe('Narrator 2');
        draft.undo();
        expect(draft.node(agent.nodeId).label).toBe('Narrator');
        draft.redo();
        expect(draft.node(agent.nodeId).label).toBe('Narrator 2');
        draft.markSaved();
        expect(draft.isDirty()).toBe(false);
        expect(draft.canUndo()).toBe(true);
    });

    test('removing a node reports and removes its edges, entry and output ownership; port renames follow edges', () => {
        const draft = draftFrom(starterDocument('T'));
        const [agent, output] = draft.definition.nodes;
        expect(nodeRemovalImpact(draft.definition, output.nodeId)).toEqual({ edges: [draft.definition.edges[0].edgeId], entry: false, output: true });
        draft.setPort(agent.nodeId, 'outputs', 0, { name: 'response', type: 'text', required: false });
        expect(draft.definition.edges[0].from.port).toBe('response');
        draft.removeNode(output.nodeId);
        expect(draft.definition.edges).toEqual([]);
        expect(draft.definition.outputContract.ownerNodeId).toBeNull();
        draft.undo();
        expect(draft.definition.outputContract.ownerNodeId).toBe(output.nodeId);
    });

    test('typed ports drive keyboard connections; mismatches are flagged, not hidden', () => {
        const draft = draftFrom(starterDocument('T'));
        const [agent, output] = draft.definition.nodes;
        expect(compatiblePorts(draft.definition, agent.nodeId, output.nodeId)).toEqual([{ from: 'out', to: 'in' }]);
        draft.setPort(output.nodeId, 'inputs', 0, { name: 'in', type: 'json', required: true });
        expect(compatiblePorts(draft.definition, agent.nodeId, output.nodeId)).toEqual([]);
        expect(edgeTypeMismatch(draft.definition, draft.definition.edges[0])).toBe(true);
    });

    test('pins are removed from every node policy that used them', () => {
        const draft = draftFrom(starterDocument('T'));
        const [agent] = draft.definition.nodes;
        draft.upsertPin({ pinId: 'route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: 'route_x' }, integrity: 'a'.repeat(64) });
        draft.updateNode(agent.nodeId, { dependencyPinIds: ['route'], policy: { agentPinId: 'route' } });
        draft.removePin('route');
        expect(draft.node(agent.nodeId)).toMatchObject({ dependencyPinIds: [], policy: { agentPinId: null } });
    });

    test('delegation allow-list appears only with the delegate capability', () => {
        const draft = draftFrom(starterDocument('T'));
        const [agent] = draft.definition.nodes;
        draft.setPlan({ capabilityCeiling: ['agent.delegate'] });
        draft.updateNode(agent.nodeId, { capabilities: ['agent.delegate'] });
        expect(draft.node(agent.nodeId).policy.allowedPlanPinIds).toEqual([]);
        draft.updateNode(agent.nodeId, { capabilities: [] });
        expect(draft.node(agent.nodeId).policy).not.toHaveProperty('allowedPlanPinIds');
    });

    test('auto layout places entry first and forward edges to the right; diff compares by stable IDs', () => {
        const doc = starterDocument('T');
        const [agent, output] = doc.definition.nodes;
        const positions = autoLayout(doc.definition, {});
        expect(positions[output.nodeId].x).toBeGreaterThan(positions[agent.nodeId].x);
        const next = structuredClone(doc);
        next.definition.nodes[0].label = 'Changed';
        const diff = diffDefinitions(doc, next);
        expect(diff.nodes.changed.map(node => node.nodeId)).toEqual([agent.nodeId]);
        expect(diffDefinitions(null, { definition: emptyDefinition(), dependencyPins: [] }).nodes.added).toEqual([]);
    });
});


test('Node Program selection is independent of the Route and participates in the shared draft history', () => {
    const draft = new PlanDraft(starterDocument('Independent Program')), node = draft.definition.nodes[0];
    draft.upsertPin({ pinId: 'my.program', port: 'model', resourceRef: { scope: 'library', resourceType: 'core.prompt-program', resourceId: 'pprog_' + 'a'.repeat(32), revision: 'r2' }, integrity: 'b'.repeat(64) });
    draft.updateNode(node.nodeId, { dependencyPinIds: ['my.program'], policy: { promptPinId: 'my.program' } });
    expect(draft.node(node.nodeId).policy).toEqual({ agentPinId: null, promptPinId: 'my.program' });
    draft.removePin('my.program'); expect(draft.node(node.nodeId).policy).toEqual({ agentPinId: null });
    draft.undo(); expect(draft.node(node.nodeId).policy.promptPinId).toBe('my.program');
    draft.redo(); expect(draft.node(node.nodeId).policy.promptPinId).toBeUndefined();
});

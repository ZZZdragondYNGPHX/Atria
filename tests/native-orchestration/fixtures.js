import { createNativeId } from '../../src/native/identity.js';
import { ORCHESTRATION_LIMIT_FIELDS } from '../../public/shared/native-orchestration-contracts.js';

export function planFixture() {
    const nodeId = createNativeId('orchestrationNode');
    return {
        definition: {
            nodes: [{ nodeId, kind: 'output', label: 'Result', inputs: [], outputs: [], dependencyPinIds: [], capabilities: [], policy: {} }],
            edges: [], entryNodeIds: [nodeId], capabilityCeiling: [], graphChangePolicy: { allowedOperations: [], allowedNodeKinds: [] },
            limits: Object.fromEntries(ORCHESTRATION_LIMIT_FIELDS.map(field => [field, field === 'deadlineMs' ? 60000 : 10])),
            outputContract: { kind: 'result', ownerNodeId: nodeId, slot: 'final', allowPartial: false },
        },
        dependencyPins: [], viewState: { positions: {} },
    };
}

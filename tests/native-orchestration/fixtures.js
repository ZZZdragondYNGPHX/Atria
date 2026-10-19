import { createNativeId } from '../../src/native/identity.js';
import { ORCHESTRATION_LIMIT_FIELDS } from '../../public/shared/native-orchestration-contracts.js';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash, randomUUID } from 'node:crypto';

// Pure-controller tests do not test first identity creation. Provision a fresh
// fixture identity whose one fixed port is available (Windows can reserve
// part of the frozen range). Never replace a persisted identity or retry the
// production Owner against another port. Storage foundation tests use real
// unprovisioned roots and retain their separate initialization/failure proof.
export async function prepareControllerOwnerRoot(root) {
    const file = path.join(root, 'native-host.identity');
    if (fs.existsSync(file)) throw new Error('Controller fixture must use a fresh private root');
    fs.mkdirSync(root, { recursive: true });
    for (let attempt = 0; attempt < 64; attempt++) {
        const instanceId = randomUUID(), port = 30000 + createHash('sha256').update(instanceId).digest().readUInt32BE(0) % 20000;
        const probe = net.createServer(socket => socket.destroy());
        let available = false;
        try { await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen({ host: '127.0.0.1', port, exclusive: true }, resolve); }); available = true; }
        catch (error) { if (!['EADDRINUSE', 'EACCES'].includes(error.code)) throw error; }
        finally { await new Promise(resolve => probe.close(resolve)); }
        if (!available) continue;
        fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, instanceId, guardAlgorithm: 1 }), { flag: 'wx' });
        return;
    }
    throw new Error('No local fixed guard port available for a new controller fixture');
}

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

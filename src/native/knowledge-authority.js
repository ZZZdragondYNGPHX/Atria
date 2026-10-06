import { assertJsonDeclaration } from '../../public/shared/native-values.js';

const proofs = new WeakMap();
export function prepareKnowledgeAdoption(core, owner, base, selection) {
    if (!selection) return null;
    const safe = assertJsonDeclaration(selection, 'Knowledge adoption', 131072);
    if (typeof safe.targetKey !== 'string' || safe.targetKey.length > 256 || safe.pendingState?.schemaVersion !== 1
        || !safe.pendingState.effects || typeof safe.pendingState.effects !== 'object' || Array.isArray(safe.pendingState.effects)) throw new TypeError('Knowledge selection invalid');
    if (safe.revisionId !== base.revision.revisionId || safe.branchId !== base.revision.branchId) throw new TypeError('Knowledge selection stale');
    const proof = Object.freeze({});
    proofs.set(proof, { core, owner, sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
        branchId: base.revision.branchId, targetKey: safe.targetKey, state: safe.pendingState });
    return proof;
}

export function adoptKnowledge(core, owner, base, states, proof) {
    if (!proof) return states;
    const prepared = proofs.get(proof);
    if (!prepared || prepared.core !== core || prepared.owner !== owner || prepared.sessionId !== base.session.sessionId
        || prepared.revisionId !== base.revision.revisionId || prepared.branchId !== base.revision.branchId) throw new TypeError('Knowledge adoption proof required');
    return { ...states, atri_knowledge_runtime: { schemaVersion: 1, targets: { ...states.atri_knowledge_runtime?.targets, [prepared.targetKey]: structuredClone(prepared.state) } } };
}

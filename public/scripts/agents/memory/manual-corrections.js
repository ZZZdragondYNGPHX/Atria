// SPDX-License-Identifier: AGPL-3.0-or-later
import { applyTemporalOperations, projectTemporalGraph } from './temporal-graph.js';

/** UI-only writer. It is deliberately absent from the extraction/orchestrator API. */
export function applyManualCorrection(ledger, command, chat, newId = () => crypto.randomUUID(), now = Date.now()) {
    if (!command || typeof command.reason !== 'string' || !command.reason.trim() || command.reason.length > 2000) throw new Error('请填写修正原因（最多 2000 字）');
    let state = structuredClone(ledger);
    const id = newId();
    state.corrections ||= {};
    state.corrections[id] = { id, scopeId: state.scopeId, actor: 'user', createdAt: now, command: structuredClone(command) };
    const proof = { manualId: id, id, scopeId: state.scopeId, episodeIds: [], evidence: [], createdAt: now };
    const own = (collection, key) => {
        const item = state[collection]?.[key];
        if (!item || item.scopeId !== state.scopeId) throw new Error('记录已不存在于当前作用域');
        return item;
    };
    const action = command.action;
    if (['reject_relation', 'reject_fact', 'reject_pending'].includes(action)) {
        own({ reject_relation: 'relations', reject_fact: 'facts', reject_pending: 'entityPending' }[action], command.targetId).manualDisabled = id;
    } else if (action === 'remove_alias') {
        const entity = own('entities', command.targetId);
        const view = projectTemporalGraph(state, chat).entities.find(item => item.id === entity.id);
        if (!view?.aliases.includes(command.name)) throw new Error('请选择当前别名');
        // Merged aliases belong to the original identity; split before removing them.
        const names = entity.names.filter(entry => entry.name === command.name);
        if (!names.length) throw new Error('此别名来自合并实体，请先拆分');
        names.forEach(entry => { entry.manualDisabled = id; });
    } else {
        const allowed = ['entity', 'rename', 'alias', 'merge_entity', 'split_entity', 'resolve_pending', 'resolve_conflict', 'relation', 'edit_relation'];
        if (!allowed.includes(action)) throw new Error('未知手工修正操作');
        const op = { ...command };
        if (action === 'relation' || action === 'edit_relation') {
            if (action === 'edit_relation') own('relations', command.relationId).manualDisabled = id;
            if (typeof command.text !== 'string' || !command.text.trim() || command.text.length > 2000) throw new Error('请填写关系事实（最多 2000 字）');
            const factId = newId();
            state.facts ||= {};
            state.facts[factId] = { id: factId, scopeId: state.scopeId, text: command.text.trim(), type: 'explicit', importance: 0.5,
                accessCount: 0, createdAt: now, updatedAt: now, supports: [{ ...proof, confidence: 0.95 }], supersededBy: [] };
            op.action = 'relation'; op.factId = factId;
            delete op.factIndex;
        }
        state = applyTemporalOperations(state, [op], proof, chat, [], newId, now, proof).state;
    }
    return { state, correctionId: id };
}

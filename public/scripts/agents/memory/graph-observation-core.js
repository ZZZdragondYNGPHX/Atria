// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared frozen graph data views, with source projection and schema supplied
// by the owning host. No browser globals, Provider calls or persistence.
import { compareNodesByTimeline } from './graph-ops.js';
import { isRecallDiagnosticNode } from './graph-mutation-core.js';
export const INTERNAL_EDGE_TYPES = Object.freeze(new Set(['contains', 'semantic_contains']));
export function iterateStoreNodes(store) {
    const nodes = store?.nodes;
    if (!nodes) return [];
    if (nodes instanceof Map) return Array.from(nodes.values());
    if (typeof nodes === 'object') return Object.values(nodes);
    return [];
}

export function lookupNodeById(store, id) {
    const key = String(id || '').trim();
    if (!key || !store?.nodes) return null;
    if (store.nodes instanceof Map) {
        return store.nodes.get(key) || null;
    }
    if (typeof store.nodes === 'object') {
        return store.nodes[key] || null;
    }
    return null;
}

export function normalizeStringArray(value) {
    if (!Array.isArray(value)) return null;
    const out = value.map(v => String(v || '').trim()).filter(Boolean);
    return out.length > 0 ? out : null;
}

export function freezeFieldsRecord(fields) {
    const out = {};
    if (fields && typeof fields === 'object') {
        for (const [key, value] of Object.entries(fields)) {
            // Mirror the storage shape (most values are strings; complex
            // values stay as-is but are still wrapped in a frozen container).
            out[String(key)] = value;
        }
    }
    return Object.freeze(out);
}

export function freezeNodeView(node) {
    if (!node || typeof node !== 'object') return null;
    // floorRange is the chat-floor anchor stamped by A3 extraction on
    // types whose schema sets `recordsFloorRange: true` (default: event).
    // We carry it through verbatim — the LLM-facing trimmers in
    // orchestrator-tools translate to chat[] coords before the LLM sees
    // it. Frozen here so downstream consumers can't mutate the range.
    const rawFloorRange = node.floorRange;
    const floorRangeView = (rawFloorRange
        && typeof rawFloorRange === 'object'
        && typeof rawFloorRange.start === 'number' && Number.isFinite(rawFloorRange.start)
        && typeof rawFloorRange.end === 'number' && Number.isFinite(rawFloorRange.end))
        ? Object.freeze({ start: rawFloorRange.start, end: rawFloorRange.end })
        : null;
    const out = {
        id: String(node.id || ''),
        type: String(node.type || ''),
        level: node.level === 'semantic' ? 'semantic' : 'episodic',
        title: String(node.title || ''),
        fields: freezeFieldsRecord(node.fields),
        seqTo: Number.isFinite(Number(node.seqTo)) ? Number(node.seqTo) : -1,
        parentId: String(node.parentId || ''),
        childrenIds: Object.freeze(
            (Array.isArray(node.childrenIds) ? node.childrenIds : [])
                .map(id => String(id || ''))
                .filter(Boolean),
        ),
        archived: Boolean(node.archived),
        semanticRollup: Boolean(node.semanticRollup),
        semanticDepth: Number.isFinite(Number(node.semanticDepth)) ? Number(node.semanticDepth) : 0,
    };
    if (floorRangeView) out.floorRange = floorRangeView;
    return Object.freeze(out);
}

export function freezeEdgeView(edge, { includeWeight = false } = {}) {
    if (!edge || typeof edge !== 'object') return null;
    const out = {
        from: String(edge.from || ''),
        to: String(edge.to || ''),
        type: String(edge.type || ''),
    };
    // Raw edges (listEdges) must NOT include `weight`; only projected edges
    // (projectEdges) carry it.
    if (includeWeight && typeof edge.weight === 'number' && Number.isFinite(edge.weight)) {
        out.weight = Number(edge.weight);
    }
    return Object.freeze(out);
}

export function freezeSchemaSpecView(spec) {
    const compressionMode = String(spec?.compression?.mode || spec?.compressionMode || 'none');
    return Object.freeze({
        // Schema items use `id` as the type identifier (e.g. 'event',
        // 'character_sheet'); view-side field name is `type`.
        type: String(spec?.id || spec?.type || ''),
        tableName: String(spec?.tableName || ''),
        tableColumns: Object.freeze((Array.isArray(spec?.tableColumns) ? spec.tableColumns : [])
            .map(c => String(c || ''))
            .filter(Boolean)),
        requiredColumns: Object.freeze((Array.isArray(spec?.requiredColumns) ? spec.requiredColumns : [])
            .map(c => String(c || ''))
            .filter(Boolean)),
        primaryKeyColumns: Object.freeze((Array.isArray(spec?.primaryKeyColumns) ? spec.primaryKeyColumns : [])
            .map(c => String(c || ''))
            .filter(Boolean)),
        forceUpdate: Boolean(spec?.forceUpdate),
        alwaysInject: Boolean(spec?.alwaysInject),
        editable: Boolean(spec?.editable),
        compressionMode,
    });
}

export function freezeSchemaView(types) {
    const list = Array.isArray(types) ? types : [];
    return Object.freeze({
        types: Object.freeze(list.map(freezeSchemaSpecView)),
    });
}
export function createMemoryGraphObservationCore({ resolveStore, resolveSchema }) {
    function listNodes(filter = {}) {
        const store = resolveStore();
        if (!store) return Object.freeze([]);

        const activeOnly = filter.activeOnly !== false;
        const typeFilter = normalizeStringArray(filter.types);
        const levelFilter = normalizeStringArray(filter.levels);
        const seqFrom = Number.isFinite(Number(filter?.seqRange?.from)) ? Number(filter.seqRange.from) : null;
        const seqTo = Number.isFinite(Number(filter?.seqRange?.to)) ? Number(filter.seqRange.to) : null;

        const typeSet = typeFilter ? new Set(typeFilter.map(t => t.toLowerCase())) : null;
        const levelSet = levelFilter ? new Set(levelFilter.map(l => l.toLowerCase())) : null;

        const matched = [];
        for (const node of iterateStoreNodes(store)) {
            if (!node || !node.id) continue;
            if (activeOnly) {
                if (node.archived) continue;
                if (isRecallDiagnosticNode(node)) continue;
            }
            if (typeSet && !typeSet.has(String(node.type || '').toLowerCase())) continue;
            if (levelSet) {
                const level = node.level === 'semantic' ? 'semantic' : 'episodic';
                if (!levelSet.has(level)) continue;
            }
            const nodeSeqTo = Number(node.seqTo ?? -1);
            if (seqFrom !== null && nodeSeqTo < seqFrom) continue;
            if (seqTo !== null && nodeSeqTo > seqTo) continue;
            matched.push(node);
        }
        matched.sort(compareNodesByTimeline);
        return Object.freeze(matched.map(freezeNodeView));
    }

    function getNode(id) {
        const store = resolveStore();
        if (!store) return null;
        const node = lookupNodeById(store, id);
        return node ? freezeNodeView(node) : null;
    }

    function listEdges(filter = {}) {
        const store = resolveStore();
        if (!store) return Object.freeze([]);

        const edges = Array.isArray(store.edges) ? store.edges : [];
        const fromFilter = filter.from !== undefined ? String(filter.from || '').trim() : null;
        const toFilter = filter.to !== undefined ? String(filter.to || '').trim() : null;
        const typeFilter = normalizeStringArray(filter.types);
        const typeSet = typeFilter ? new Set(typeFilter.map(t => t.toLowerCase())) : null;
        const excludeInternal = filter.excludeInternal === true;

        const out = [];
        for (const edge of edges) {
            if (!edge) continue;
            const edgeType = String(edge.type || '').toLowerCase();
            if (excludeInternal && INTERNAL_EDGE_TYPES.has(edgeType)) continue;
            if (typeSet && !typeSet.has(edgeType)) continue;
            if (fromFilter !== null && String(edge.from || '') !== fromFilter) continue;
            if (toFilter !== null && String(edge.to || '') !== toFilter) continue;
            out.push(freezeEdgeView(edge, { includeWeight: false }));
        }
        return Object.freeze(out);
    }
    function getSchema() { return freezeSchemaView(resolveSchema()); }
    return Object.freeze({ listNodes, getNode, listEdges, getSchema });
}

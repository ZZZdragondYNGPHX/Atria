// SPDX-License-Identifier: AGPL-3.0-or-later
// Canonical graph mutations extracted unchanged from main.js. Browser and
// Native hosts supply scope/persistence; this module owns no runtime store.
import { LEVEL, normalizeText, ensureNodeFieldsObject } from './primitives.js';
import { addEdge, removeEdge, dropNode } from './graph-ops.js';
export const SYMMETRIC_RELATIONS = new Set([
    'allied_with',
    'hostile_to',
    'family_of',
    'partner_of',
]);
export function createMemoryGraphMutationCore({ getSemanticTypeSpec = () => { throw new Error('Schema authority required for configured extraction'); },
    getSemanticLatestOnlyConfig = () => { throw new Error('Latest-only schema authority required'); },
    getTableCellValueFromNode = () => { throw new Error('Schema projection authority required'); } } = {}) {
    function toDisplayScalar(value) {
        if (value === null || value === undefined) {
            return '';
        }
        if (Array.isArray(value)) {
            return value.map(item => normalizeText(typeof item === 'string' ? item : JSON.stringify(item))).filter(Boolean).join(', ');
        }
        if (typeof value === 'object') {
            return normalizeText(JSON.stringify(value));
        }
        return normalizeText(String(value));
    }

    function getNodeSummary(node) {
        if (!node || typeof node !== 'object') {
            return '';
        }
        const fields = node.fields && typeof node.fields === 'object' && !Array.isArray(node.fields)
            ? node.fields
            : {};
        if (fields.summary !== undefined && fields.summary !== null) {
            return normalizeText(toDisplayScalar(fields.summary));
        }
        return '';
    }

    function setNodeSummary(node, summaryText) {
        if (!node || typeof node !== 'object') {
            return;
        }
        const fields = ensureNodeFieldsObject(node);
        const normalized = normalizeText(summaryText);
        if (normalized) {
            fields.summary = normalized;
        } else {
            delete fields.summary;
        }
        if (Object.prototype.hasOwnProperty.call(node, 'summary')) {
            delete node.summary;
        }
    }

    function nextNodeId(store) {
        store.nodeSeq = Number(store.nodeSeq || 0) + 1;
        return `n_${store.nodeSeq}`;
    }

    function createNode(store, node) {
        const id = nextNodeId(store);
        const seqToRaw = Number.isFinite(Number(node.seqTo))
            ? Number(node.seqTo)
            : Number.isFinite(Number(node.seq))
                ? Number(node.seq)
                : Number(store.seqCounter || 0);
        const seqTo = Number.isFinite(seqToRaw) ? Math.max(0, Math.floor(seqToRaw)) : Number(store.seqCounter || 0);
        store.seqCounter = Math.max(Number(store.seqCounter || 0), Number.isFinite(seqTo) ? seqTo : 0);
        store.nodes[id] = {
            id,
            type: String(node.type || 'unknown'),
            level: String(node.level || LEVEL.SEMANTIC),
            title: normalizeText(node.title || id),
            parentId: node.parentId ? String(node.parentId) : '',
            childrenIds: [],
            fields: node.fields && typeof node.fields === 'object' && !Array.isArray(node.fields) ? node.fields : {},
            semanticDepth: Number.isFinite(Number(node.semanticDepth)) ? Number(node.semanticDepth) : 0,
            semanticRollup: Boolean(node.semanticRollup),
            seqTo: Number.isFinite(seqTo) ? seqTo : undefined,
            archived: Boolean(node.archived),
        };
        setNodeSummary(store.nodes[id], node?.fields?.summary ?? '');

        const rawFloorRange = node?.floorRange;
        if (rawFloorRange && typeof rawFloorRange === 'object') {
            const rs = rawFloorRange.start;
            const re = rawFloorRange.end;
            if (typeof rs === 'number' && typeof re === 'number'
            && Number.isFinite(rs) && Number.isFinite(re)
            && rs >= 0 && re >= rs) {
                store.nodes[id].floorRange = {
                    start: Math.floor(rs),
                    end: Math.floor(re),
                };
            }
        }

        if (store.nodes[id].parentId && store.nodes[store.nodes[id].parentId]) {
            const parent = store.nodes[store.nodes[id].parentId];
            if (!parent.childrenIds.includes(id)) {
                parent.childrenIds.push(id);
            }
            addEdge(store, parent.id, id, 'contains');
        }

        return store.nodes[id];
    }

    function reparentNode(store, childId, parentId) {
        const child = store.nodes[childId];
        const parent = store.nodes[parentId];
        if (!child || !parent) {
            return;
        }

        const oldParentId = String(child.parentId || '');
        if (oldParentId && store.nodes[oldParentId]) {
            const oldParent = store.nodes[oldParentId];
            oldParent.childrenIds = (oldParent.childrenIds || []).filter(id => id !== childId);
        }

        child.parentId = parentId;
        if (!Array.isArray(parent.childrenIds)) {
            parent.childrenIds = [];
        }
        if (!parent.childrenIds.includes(childId)) {
            parent.childrenIds.push(childId);
        }
        addEdge(store, parentId, childId, 'contains');
    }

    function listNodesByLevel(store, level) {
        return Object.values(store.nodes)
            .filter(node => node.level === level)
            .sort((a, b) => {
                if (a.level === LEVEL.SEMANTIC && b.level === LEVEL.SEMANTIC) {
                    const depthDiff = Number(b.semanticDepth ?? 0) - Number(a.semanticDepth ?? 0);
                    if (depthDiff !== 0) return depthDiff;
                }
                const seqDiff = Number(a.seqTo ?? 0) - Number(b.seqTo ?? 0);
                if (seqDiff !== 0) return seqDiff;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
    }

    function archiveNode(store, oldId, replacementId = null) {
        const node = store.nodes[oldId];
        if (!node) {
            return;
        }
        node.archived = true;

        if (!replacementId || replacementId === oldId || !store.nodes[replacementId]) {
            return;
        }

        let finalTarget = replacementId;
        const visited = new Set([oldId]);
        while (!visited.has(finalTarget)) {
            visited.add(finalTarget);
            const next = store.nodes[finalTarget]?.supersededBy;
            if (!next || !store.nodes[next] || next === finalTarget) {
                break;
            }
            finalTarget = next;
        }
        node.supersededBy = finalTarget;

        if (!Array.isArray(store.edges)) {
            return;
        }
        const seen = new Set();
        const next = [];
        for (const edge of store.edges) {
            if (!edge) {
                continue;
            }
            const fromHit = edge.from === oldId;
            const toHit = edge.to === oldId;
            const newFrom = fromHit ? finalTarget : edge.from;
            const newTo = toHit ? finalTarget : edge.to;
            if (newFrom === newTo) {
                continue;
            }
            const key = `${newFrom}␟${edge.type}␟${newTo}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            if (fromHit || toHit) {
                next.push({ ...edge, from: newFrom, to: newTo });
            } else {
                next.push(edge);
            }
        }
        store.edges = next;
    }

    function upsertSemanticNode(store, item, settings = null, options = {}) {
        const type = String(item.type || 'semantic').toLowerCase();
        let title = normalizeText(item.title || '');
        const explicitNodeId = normalizeText(item?.nodeId || item?.node_id || '');
        const maxSeqLimit = Number.isFinite(Number(options?.maxSeq))
            ? Math.max(0, Math.floor(Number(options.maxSeq)))
            : null;
        const isNodeVisibleAtSeq = (node) => {
            if (!node || node.archived || node.level !== LEVEL.SEMANTIC) {
                return false;
            }
            if (maxSeqLimit === null) {
                return true;
            }
            const nodeSeq = Number(node?.seqTo ?? NaN);
            if (!Number.isFinite(nodeSeq)) {
                return true;
            }
            return nodeSeq <= maxSeqLimit;
        };
        const parseEventSummaryIndex = (value) => {
            const text = normalizeText(value || '');
            if (!text) {
                return null;
            }
            const match = text.match(/^(?:summary|摘要)\s*#?\s*(\d+)$/i);
            if (!match) {
                return null;
            }
            const num = Number(match[1]);
            return Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
        };
        const nextEventSummaryTitle = () => {
            let maxIndex = 0;
            for (const node of Object.values(store.nodes || {})) {
                if (!node || node.archived || node.level !== LEVEL.SEMANTIC) {
                    continue;
                }
                if (String(node.type || '').toLowerCase() !== 'event') {
                    continue;
                }
                const index = parseEventSummaryIndex(node.title);
                if (index && index > maxIndex) {
                    maxIndex = index;
                }
            }
            return `Summary ${maxIndex + 1}`;
        };
        const seqTo = Number.isFinite(Number(item.seqTo))
            ? Math.max(0, Math.floor(Number(item.seqTo)))
            : Math.max(0, Number(store.seqCounter || 0));
        const incomingFields = item?.fields && typeof item.fields === 'object' && !Array.isArray(item.fields)
            ? { ...item.fields }
            : {};
        const itemSummary = normalizeText(
            incomingFields.summary
        ?? '',
        );
        // floorRange is stamped only when the type opts in (schema flag) and the
        // caller supplied a valid lower bound; otherwise the field is omitted so
        // legacy callers and edits can't corrupt or shrink an existing range.
        const optsMinSeq = (typeof options?.minSeq === 'number' && Number.isFinite(options.minSeq))
            ? Math.max(0, Math.floor(options.minSeq))
            : null;
        const typeSchemaEntry = settings ? getSemanticTypeSpec(settings, type) : null;
        const shouldRecordFloorRange = Boolean(typeSchemaEntry?.recordsFloorRange);
        const computedFloorRange = (shouldRecordFloorRange && optsMinSeq !== null && optsMinSeq <= seqTo)
            ? { start: optsMinSeq, end: seqTo }
            : null;
        const latestOnlyConfig = settings ? getSemanticLatestOnlyConfig(settings, type) : { enabled: false, keyFields: [] };
        const latestOnlyKeyFields = Array.isArray(latestOnlyConfig.keyFields)
            ? latestOnlyConfig.keyFields.map(column => String(column || '').trim()).filter(Boolean)
            : [];
        const tokenizePrimaryKeyField = (nodeLike, key) => {
            const raw = toDisplayScalar(getTableCellValueFromNode(nodeLike, key));
            if (!raw) {
                return [];
            }
            return String(raw)
                .split(/[,，;；|]/g)
                .map(part => normalizeText(part).toLowerCase())
                .filter(Boolean);
        };
        const computeLatestOnlyMatchScore = (candidateNode) => {
            if (latestOnlyKeyFields.length === 0) {
                return 0;
            }
            const incomingNodeLike = { title, fields: incomingFields };
            let score = 0;
            for (const key of latestOnlyKeyFields) {
                const incomingTokens = tokenizePrimaryKeyField(incomingNodeLike, key);
                const candidateTokens = tokenizePrimaryKeyField(candidateNode, key);
                if (incomingTokens.length === 0 || candidateTokens.length === 0) {
                    continue;
                }
                const candidateSet = new Set(candidateTokens);
                if (incomingTokens.some(token => candidateSet.has(token))) {
                    score += 1;
                }
            }
            return score;
        };

        let target = null;
        if (explicitNodeId) {
            const explicitTarget = store?.nodes?.[explicitNodeId];
            if (
                isNodeVisibleAtSeq(explicitTarget)
            && String(explicitTarget.type || '').toLowerCase() === type
            ) {
                target = explicitTarget;
            }
        }

        if (type === 'event' && !target) {
            const generatedTitle = nextEventSummaryTitle();
            return createNode(store, {
                type,
                level: LEVEL.SEMANTIC,
                title: generatedTitle,
                fields: incomingFields,
                semanticDepth: 0,
                semanticRollup: false,
                seqTo,
                ...(computedFloorRange ? { floorRange: computedFloorRange } : {}),
            });
        }

        if (!title) {
            const derivedTitle = normalizeText(
                incomingFields?.name
            || incomingFields?.id
            || incomingFields?.key
            || incomingFields?.label
            || '',
            );
            title = derivedTitle || `${type}_${Math.max(1, seqTo || Number(store.seqCounter || 0) || 1)}`;
        }
        if (!target && latestOnlyConfig.enabled) {
            const candidates = Object.values(store.nodes)
                .filter(node => isNodeVisibleAtSeq(node))
                .filter(node => String(node.type || '').toLowerCase() === type)
                .map(node => ({ node, score: computeLatestOnlyMatchScore(node) }))
                .filter(entry => entry.score > 0)
                .sort((a, b) => {
                    if (a.score !== b.score) {
                        return b.score - a.score;
                    }
                    const aSeq = Number(a?.node?.seqTo ?? -1);
                    const bSeq = Number(b?.node?.seqTo ?? -1);
                    if (aSeq !== bSeq) {
                        return bSeq - aSeq;
                    }
                    return String(a?.node?.id || '').localeCompare(String(b?.node?.id || ''));
                });
            target = candidates[0]?.node || null;
            for (let i = 1; i < candidates.length; i++) {
                archiveNode(store, candidates[i]?.node?.id, target?.id);
            }
        } else if (!target) {
            const normalizedKey = `${type}::${title.toLowerCase()}`;
            target = Object.values(store.nodes).find(node => isNodeVisibleAtSeq(node) && `${node.type}::${node.title.toLowerCase()}` === normalizedKey);
        }

        if (!target) {
            target = createNode(store, {
                type,
                level: LEVEL.SEMANTIC,
                title,
                fields: incomingFields,
                semanticDepth: 0,
                semanticRollup: false,
                seqTo,
                ...(computedFloorRange ? { floorRange: computedFloorRange } : {}),
            });
        } else {
            setNodeSummary(target, itemSummary || getNodeSummary(target));
            if (!target.fields || typeof target.fields !== 'object' || Array.isArray(target.fields)) {
                target.fields = {};
            }
            if (!Number.isFinite(Number(target.semanticDepth))) {
                target.semanticDepth = 0;
            }
            if (target.semanticRollup === undefined) {
                target.semanticRollup = false;
            }
            if (incomingFields && typeof incomingFields === 'object') {
                Object.assign(target.fields, incomingFields);
            }
            target.seqTo = Math.max(Number(target.seqTo || 0), seqTo);
        }

        return target;
    }

    function resolveExtractNodeId(store, {
        nodeId = '',
        ref = '',
    } = {}, options = {}) {
        const normalizedNodeId = normalizeText(nodeId || '');
        if (normalizedNodeId) {
            const directNode = store?.nodes?.[normalizedNodeId];
            if (directNode && !directNode.archived && directNode.level === LEVEL.SEMANTIC) {
                return normalizedNodeId;
            }
        }
        const normalizedRef = normalizeText(ref || '');
        if (!normalizedRef) {
            return '';
        }
        const refIndex = options?.refIndex instanceof Map ? options.refIndex : null;
        if (!refIndex) {
            return '';
        }
        const refNodeId = normalizeText(refIndex.get(normalizedRef) || '');
        if (!refNodeId) {
            return '';
        }
        const mappedNode = store?.nodes?.[refNodeId];
        if (!mappedNode || mappedNode.archived || mappedNode.level !== LEVEL.SEMANTIC) {
            return '';
        }
        return refNodeId;
    }

    function applyExtractedLinks(store, sourceNode, rawLinks, options = {}) {
        if (!sourceNode || !Array.isArray(rawLinks) || rawLinks.length === 0) {
            return;
        }

        const rawSeqTo = options?.maxSeq;
        const seqTo = (rawSeqTo !== null && rawSeqTo !== undefined && Number.isFinite(Number(rawSeqTo)))
            ? Math.max(0, Math.floor(Number(rawSeqTo)))
            : undefined;
        const edgeOptions = seqTo !== undefined ? { seqTo } : undefined;

        for (const link of rawLinks) {
            const targetNodeId = resolveExtractNodeId(store, {
                nodeId: link?.targetNodeId || link?.target_node_id || '',
                ref: link?.targetRef || link?.target_ref || '',
            }, options);
            if (!targetNodeId) {
                continue;
            }
            const targetNode = store?.nodes?.[targetNodeId];
            if (!targetNode || targetNode.archived || targetNode.level !== LEVEL.SEMANTIC) {
                continue;
            }

            const relation = normalizeText(link?.relation || 'related') || 'related';
            const direction = String(link?.direction || 'bidirectional').toLowerCase();

            // Symmetric relations collapse to ONE canonical edge (sorted-id
            // from→to). Direction directive is ignored — "A allied_with B" and
            // "B allied_with A" are the same fact, stored once.
            if (SYMMETRIC_RELATIONS.has(relation)) {
                const [canonicalFrom, canonicalTo] = sourceNode.id < targetNode.id
                    ? [sourceNode.id, targetNode.id]
                    : [targetNode.id, sourceNode.id];
                addEdge(store, canonicalFrom, canonicalTo, relation, edgeOptions);
                continue;
            }

            if (direction === 'incoming') {
                addEdge(store, targetNode.id, sourceNode.id, relation, edgeOptions);
                continue;
            }
            if (direction === 'outgoing') {
                addEdge(store, sourceNode.id, targetNode.id, relation, edgeOptions);
                continue;
            }

            addEdge(store, sourceNode.id, targetNode.id, relation, edgeOptions);
            addEdge(store, targetNode.id, sourceNode.id, relation, edgeOptions);
        }
    }

    function getSemanticNodesForType(store, type) {
        const targetType = String(type || '').toLowerCase();
        return listNodesByLevel(store, LEVEL.SEMANTIC)
            .filter(node => !node.archived)
            .filter(node => String(node.type || '').toLowerCase() === targetType);
    }

    function getNextSemanticRollupOrdinal(store, type, depth) {
        const targetDepth = Math.max(1, Math.floor(Number(depth || 0)));
        const nodes = getSemanticNodesForType(store, type)
            .filter(node => !node.archived)
            .filter(node => Number(node?.semanticDepth ?? 0) === targetDepth);
        let maxOrdinal = 0;
        const suffixPattern = /#(\d+)\s*$/;
        for (const node of nodes) {
            const title = String(node?.title || '');
            const match = title.match(suffixPattern);
            if (!match) {
                continue;
            }
            const value = Number(match[1]);
            if (Number.isFinite(value) && value > maxOrdinal) {
                maxOrdinal = value;
            }
        }
        if (maxOrdinal > 0) {
            return maxOrdinal + 1;
        }
        return nodes.length + 1;
    }

    function createRollupWithChildren(store, { type, childIds, summary, fields = {}, label = '' } = {}) {
        if (!type || !Array.isArray(childIds) || childIds.length === 0) {
            const err = new Error('createRollupWithChildren requires type and non-empty childIds.');
            err.code = 'BAD_ARGS';
            throw err;
        }
        const children = childIds.map(id => store?.nodes?.[id]).filter(Boolean);
        if (children.length !== childIds.length) {
            const err = new Error('createRollupWithChildren: one or more childIds not in store.');
            err.code = 'CHILD_NOT_FOUND';
            throw err;
        }
        for (const child of children) {
            if (child.parentId) {
                const err = new Error(`createRollupWithChildren: child ${child.id} already has rollup parent ${child.parentId}.`);
                err.code = 'CHILD_HAS_PARENT';
                throw err;
            }
        }
        const childDepths = children.map(c => Number(c.semanticDepth || 0));
        const rollupDepth = Math.max(...childDepths) + 1;
        const ordinal = getNextSemanticRollupOrdinal(store, type, rollupDepth);
        const finalFields = { summary: String(summary || ''), ...fields };
        // Partial-coverage rollup: union the floorRange of children that have a
        // well-formed one, and skip the rest. Legacy children pre-dating the
        // floor-anchor schema flag don't veto the parent's anchor — they just
        // don't contribute to it. Strict typeof === 'number' guards mirror
        // createNode's own floorRange validation upstream.
        const childrenWithFloorRange = children.filter(c => c?.floorRange
        && typeof c.floorRange.start === 'number' && Number.isFinite(c.floorRange.start)
        && typeof c.floorRange.end === 'number' && Number.isFinite(c.floorRange.end));
        const rolledFloorRange = childrenWithFloorRange.length > 0
            ? {
                start: Math.min(...childrenWithFloorRange.map(c => c.floorRange.start)),
                end: Math.max(...childrenWithFloorRange.map(c => c.floorRange.end)),
            }
            : null;
        const parent = createNode(store, {
            type: String(type),
            level: LEVEL.SEMANTIC,
            title: `${String(label || type)} Summary L${rollupDepth} #${ordinal}`,
            fields: finalFields,
            archived: false,
            semanticRollup: true,
            semanticDepth: rollupDepth,
            seqTo: Math.max(...children.map(c => Number(c.seqTo ?? 0))),
            ...(rolledFloorRange ? { floorRange: rolledFloorRange } : {}),
        });
        for (const child of children) {
            reparentNode(store, child.id, parent.id);
            addEdge(store, parent.id, child.id, 'semantic_contains');
        }
        return parent;
    }

    function applyExtractionOpsImpl(store, operations, {
        maxSeq = 0,
        minSeq = null,
        context = null,
        settings = null,
    } = {}) {
        const applied = [];
        const rejected = [];
        if (!Array.isArray(operations) || operations.length === 0) {
            return { applied, rejected };
        }
        const extractionMaxSeq = Number.isFinite(Number(maxSeq))
            ? Math.max(0, Math.floor(Number(maxSeq)))
            : 0;
        // Strict typeof === 'number' parallel to createNode's floorRange validation
        // (see A2): `Number(null) === 0`, `Number('') === 0`, `Number(true) === 1`
        // — none of which mean "the caller gave me a real lower bound". Treat
        // anything that wasn't already typed `number` as absent.
        const extractionMinSeq = (typeof minSeq === 'number' && Number.isFinite(minSeq))
            ? Math.max(0, Math.floor(minSeq))
            : null;
        const extractionRefIndex = new Map();
        const pendingLinkJobs = [];

        for (const item of operations) {
            const op = String(item?.op || 'create').trim().toLowerCase();
            try {
                if (op === 'delete') {
                    const nodeId = String(item?.nodeId || '').trim();
                    if (!nodeId) {
                        rejected.push({ op: item, error: { code: 'VALIDATION_SKIP', message: 'delete requires nodeId.' } });
                        continue;
                    }
                    const targetNode = store?.nodes?.[nodeId];
                    if (!targetNode) {
                        rejected.push({ op: item, error: { code: 'NODE_NOT_FOUND', message: `delete: node ${nodeId} does not exist.` } });
                        continue;
                    }
                    dropNode(store, nodeId, true);
                    applied.push(item);
                    continue;
                }
                if (op === 'edit') {
                    const nodeId = String(item?.nodeId || '').trim();
                    if (!nodeId) {
                        rejected.push({ op: item, error: { code: 'VALIDATION_SKIP', message: 'edit requires nodeId.' } });
                        continue;
                    }
                    const targetNode = store?.nodes?.[nodeId];
                    if (!targetNode) {
                        rejected.push({ op: item, error: { code: 'NODE_NOT_FOUND', message: `edit: node ${nodeId} does not exist.` } });
                        continue;
                    }
                    if (targetNode.archived) {
                        rejected.push({ op: item, error: { code: 'NODE_ARCHIVED', message: `edit: node ${nodeId} is archived.` } });
                        continue;
                    }
                    if (targetNode.level !== LEVEL.SEMANTIC) {
                        rejected.push({ op: item, error: { code: 'NODE_NOT_SEMANTIC', message: `edit: node ${nodeId} is not a semantic node (level=${targetNode.level || 'unknown'}).` } });
                        continue;
                    }
                    // Type-match guard: only enforced when the op explicitly
                    // declares a type. The internal extraction pipeline always
                    // passes one (defensive cross-check against a misaddressed
                    // LLM op); the public write-api path does NOT — the caller
                    // already named the node by id, so re-asserting the type
                    // would just silently drop legitimate edits.
                    const claimedType = String(item?.type || '').trim().toLowerCase();
                    if (claimedType && String(targetNode.type || '').toLowerCase() !== claimedType) {
                        rejected.push({ op: item, error: { code: 'TYPE_MISMATCH', message: `edit: op type "${claimedType}" does not match node ${nodeId} type "${targetNode.type}".` } });
                        continue;
                    }
                    const setFields = item?.setFields && typeof item.setFields === 'object' && !Array.isArray(item.setFields)
                        ? item.setFields
                        : {};
                    const clearFields = Array.isArray(item?.clearFields)
                        ? item.clearFields.map(key => String(key || '').trim()).filter(Boolean)
                        : [];
                    if (!targetNode.fields || typeof targetNode.fields !== 'object' || Array.isArray(targetNode.fields)) {
                        targetNode.fields = {};
                    }
                    if (item?.hasTitlePatch) {
                        const patchedTitle = normalizeText(item?.title || '');
                        if (patchedTitle) {
                            targetNode.title = patchedTitle;
                        }
                    }
                    for (const [key, value] of Object.entries(setFields)) {
                        if (value === undefined || value === null) {
                            continue;
                        }
                        targetNode.fields[key] = value;
                    }
                    for (const key of clearFields) {
                        delete targetNode.fields[key];
                    }
                    targetNode.seqTo = Math.max(Number(targetNode.seqTo || 0), Number(extractionMaxSeq || 0));
                    applied.push(item);
                    continue;
                }
                if (op === 'link_upsert') {
                    pendingLinkJobs.push({
                        sourceNodeId: normalizeText(item?.sourceNodeId || ''),
                        sourceRef: normalizeText(item?.sourceRef || ''),
                        links: Array.isArray(item?.links) ? item.links : [],
                        raw: item,
                    });
                    continue;
                }
                if (op === 'link_delete') {
                    const sourceNodeId = String(item?.sourceNodeId || '').trim();
                    const targetNodeId = String(item?.targetNodeId || '').trim();
                    const relation = String(item?.relation || '').trim().toLowerCase();
                    const directionRaw = String(item?.direction || 'bidirectional').toLowerCase();
                    const direction = ['outgoing', 'incoming', 'bidirectional'].includes(directionRaw)
                        ? directionRaw
                        : 'bidirectional';
                    if (sourceNodeId && targetNodeId && relation) {
                        removeEdge(store, sourceNodeId, targetNodeId, relation, { direction });
                        applied.push(item);
                    } else {
                        rejected.push({ op: item, error: { code: 'VALIDATION_SKIP', message: 'link_delete requires sourceNodeId, targetNodeId, and relation.' } });
                    }
                    continue;
                }
                // op === 'create' (default)
                const type = String(item?.type || 'semantic').toLowerCase();
                const title = normalizeText(item?.title || '');
                if (!type) {
                    continue;
                }
                const targetNode = upsertSemanticNode(store, {
                    type,
                    nodeId: String(item?.nodeId || ''),
                    title,
                    fields: item?.fields && typeof item.fields === 'object' ? item.fields : {},
                    seqTo: extractionMaxSeq,
                }, settings, { maxSeq: extractionMaxSeq, minSeq: extractionMinSeq });
                if (targetNode) {
                    const ref = normalizeText(item?.ref || '');
                    if (ref) {
                        extractionRefIndex.set(ref, targetNode.id);
                    }
                    pendingLinkJobs.push({
                        sourceNodeId: targetNode.id,
                        sourceRef: '',
                        links: Array.isArray(item?.links) ? item.links : [],
                        raw: item,
                    });
                    applied.push(item);
                }
            } catch (err) {
                rejected.push({
                    op: item,
                    error: { code: err?.code || 'OP_FAILED', message: String(err?.message || err) },
                });
            }
        }

        for (const job of pendingLinkJobs) {
            try {
                const sourceNodeId = resolveExtractNodeId(store, {
                    nodeId: job?.sourceNodeId || '',
                    ref: job?.sourceRef || '',
                }, { refIndex: extractionRefIndex });
                if (!sourceNodeId) {
                    continue;
                }
                const sourceNode = store?.nodes?.[sourceNodeId];
                if (!sourceNode || sourceNode.archived || sourceNode.level !== LEVEL.SEMANTIC) {
                    continue;
                }
                applyExtractedLinks(
                    store,
                    sourceNode,
                    Array.isArray(job?.links) ? job.links : [],
                    { maxSeq: extractionMaxSeq, refIndex: extractionRefIndex },
                );
                // link_upsert ops surface as applied here; create ops were already counted above.
                if (job?.raw && String(job.raw.op || '').toLowerCase() === 'link_upsert') {
                    applied.push(job.raw);
                }
            } catch (err) {
                rejected.push({
                    op: job?.raw || { op: 'link_upsert', ...job },
                    error: { code: err?.code || 'OP_FAILED', message: String(err?.message || err) },
                });
            }
        }

        // `context` is accepted for future use (Task 19 write-api) but currently has
        // no in-loop consumers; reference it to keep static analysis honest.
        void context;

        return { applied, rejected };
    }

    function isRecallDiagnosticNode(node) {
        const type = String(node?.type || '').trim().toLowerCase();
        return type === 'recall' || type.startsWith('recall_');
    }
    return Object.freeze({ toDisplayScalar, getNodeSummary, setNodeSummary, nextNodeId, createNode, reparentNode, listNodesByLevel, archiveNode, upsertSemanticNode, resolveExtractNodeId, applyExtractedLinks, getSemanticNodesForType, getNextSemanticRollupOrdinal, createRollupWithChildren, applyExtractionOpsImpl, isRecallDiagnosticNode });
}
export const { applyExtractionOpsImpl, createRollupWithChildren, isRecallDiagnosticNode } = createMemoryGraphMutationCore();

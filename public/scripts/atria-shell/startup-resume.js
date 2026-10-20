/*
 * Device-local snapshot for the static startup cover (atria-entry-startup.js).
 * The cover runs before any module or account storage, so it can only read
 * plain localStorage. Keep the payload small and display-only.
 */
const RESUME_KEY = 'atria.startup.resume';
const APPEARANCE_KEY = 'atria.startup.appearance';
const APPEARANCE_ROLES = Object.freeze(['canvas', 'surface-1', 'surface-2', 'separator', 'text-primary', 'text-secondary', 'text-tertiary', 'accent', 'accent-text', 'info', 'committed', 'unknown']);

const MEMORY_GRAPH = 'atri_memory_graph';
const MEMORY_PROVENANCE = 'atri_memory_graph.provenance';
const MEMORY_META = 'atri_memory_graph__meta';
const MAX_STARS = 72;
const MAX_LINKS = 128;

let lastResume = '';
let lastAppearance = '';
let lastMemory = { revisionId: '', digest: null };

function write(key, value) {
    try {
        if (value === null) globalThis.localStorage?.removeItem(key);
        else globalThis.localStorage?.setItem(key, value);
    } catch { /* Startup falls back to the brand cover without device storage. */ }
}

function plain(value, max) {
    const text = String(value ?? '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[*_~`#>|]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

const objectValues = value => (value && typeof value === 'object' && !Array.isArray(value) ? Object.values(value) : []);
const unit = (value, fallback = .5) => (Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : fallback);

/**
 * Compress the branch's memory map into a display-only constellation:
 * stars (entities, facts, graph nodes), links between them, which ones the
 * last turn recalled, and the real totals. Order is chronological so the
 * cover can replay the branch's history as it ignites.
 * @param {Record<string, any>} states Session revision states.
 */
export function digestBranchMemory(states) {
    const provenance = states?.[MEMORY_PROVENANCE] || {};
    const graph = states?.[MEMORY_GRAPH] || {};
    const trace = Array.isArray(states?.[MEMORY_META]?.lastRecallTrace) ? states[MEMORY_META].lastRecallTrace : [];
    const recalled = new Set(trace.flatMap(entry => (Array.isArray(entry?.selected) ? entry.selected : []))
        .map(item => String(typeof item === 'object' ? item?.id ?? '' : item ?? '')).filter(Boolean));

    const entities = objectValues(provenance.entities).filter(entity => entity?.id && Array.isArray(entity.names));
    const facts = objectValues(provenance.facts).filter(fact => fact?.id && !(fact.supersededBy?.length));
    const relations = objectValues(provenance.relations).filter(relation => relation?.sourceEntityId && relation?.targetEntityId && !(relation.supersededBy?.length));
    const nodes = objectValues(graph.nodes).filter(node => node?.id && !node.archived);
    const edges = Array.isArray(graph.edges) ? graph.edges.filter(edge => edge?.from && edge?.to && edge.from !== edge.to) : [];
    const episodes = objectValues(provenance.episodes).length;

    const stars = [];
    const index = new Map();
    const degree = new Map();
    const bump = id => degree.set(id, (degree.get(id) || 0) + 1);
    for (const relation of relations) { bump('e:' + relation.sourceEntityId); bump('e:' + relation.targetEntityId); }
    for (const edge of edges) { bump('n:' + edge.from); bump('n:' + edge.to); }
    const relationRecalled = new Set(relations.filter(relation => recalled.has('relation:' + relation.id)).flatMap(relation => ['e:' + relation.sourceEntityId, 'e:' + relation.targetEntityId]));
    const candidates = [
        ...entities.map(entity => {
            const name = entity.names.filter(item => !item?.manualDisabled).find(item => item.kind === 'canonical')?.name || entity.displayName || entity.canonicalName || entity.names[0]?.name;
            return { key: 'e:' + entity.id, kind: 'entity', label: name, at: entity.createdAt, weight: .45 + Math.min(.55, (degree.get('e:' + entity.id) || 0) * .09), recalled: relationRecalled.has('e:' + entity.id) };
        }),
        ...facts.map(fact => ({ key: 'f:' + fact.id, kind: 'fact', label: fact.text, at: fact.createdAt, weight: unit(fact.importance) * .6 + unit(fact.confidence) * .25, recalled: recalled.has('fact:' + fact.id) })),
        ...nodes.map(node => ({ key: 'n:' + node.id, kind: node.level === 'semantic' ? 'node' : 'episode', label: node.title, at: node.seqTo, weight: .35 + Math.min(.6, (degree.get('n:' + node.id) || 0) * .08), recalled: recalled.has(node.id) || recalled.has('node:' + node.id) })),
    ];
    // Keep what matters most when the map is larger than the sky can hold.
    candidates.sort((a, b) => Number(b.recalled) - Number(a.recalled) || b.weight - a.weight);
    const kept = candidates.slice(0, MAX_STARS).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
    const labelled = new Set(kept.filter(star => star.kind === 'entity' || star.kind === 'node').sort((a, b) => b.weight - a.weight).slice(0, 6).map(star => star.key));
    for (const star of kept) {
        index.set(star.key, stars.length);
        stars.push({
            k: star.kind,
            w: Math.round(unit(star.weight) * 100) / 100,
            r: star.recalled ? 1 : 0,
            ...(labelled.has(star.key) && star.label ? { l: plain(star.label, 24) } : {}),
        });
    }

    const links = [];
    const link = (a, b, kind) => {
        if (links.length >= MAX_LINKS || !index.has(a) || !index.has(b) || a === b) return;
        links.push([index.get(a), index.get(b), kind]);
    };
    for (const relation of relations) {
        link('e:' + relation.sourceEntityId, 'e:' + relation.targetEntityId, 0);
        for (const support of relation.supports || []) {
            link('f:' + support?.factId, 'e:' + relation.sourceEntityId, 1);
            link('f:' + support?.factId, 'e:' + relation.targetEntityId, 1);
        }
    }
    for (const edge of edges) link('n:' + edge.from, 'n:' + edge.to, 0);
    for (const node of nodes) if (node.parentId) link('n:' + node.parentId, 'n:' + node.id, 1);

    const memories = entities.length + facts.length + nodes.length;
    // The ledger names what the last turn recalled, else what weighs most.
    const notable = candidates.filter(star => star.label && (star.kind === 'fact' || star.kind === 'node')).slice(0, 3).map(star => plain(star.label, 64));
    return {
        stars,
        links,
        notable,
        notableRecalled: candidates.some(star => star.recalled),
        totals: { memories, facts: facts.length, entities: entities.length, relations: relations.length, nodes: nodes.length, links: relations.length + edges.length, episodes, recalled: candidates.filter(star => star.recalled).length },
    };
}

function branchMemory(snapshot) {
    const revisionId = String(snapshot?.revision?.revisionId || '');
    if (revisionId && lastMemory.revisionId === revisionId) return lastMemory.digest;
    let digest = null;
    try { digest = digestBranchMemory(snapshot?.states); } catch { /* A malformed memory map leaves the sky ambient. */ }
    lastMemory = { revisionId, digest };
    return digest;
}

/**
 * Remember the story the next startup will reopen.
 * @param {object} input
 * @param {object} input.snapshot Native session snapshot.
 * @param {object[]} input.entries Presentation entries ending at the latest turn.
 * @param {number} input.total Total committed entries.
 * @param {(entry: object) => string} input.nameOf Display name for an entry.
 */
export function rememberStartupResume({ snapshot, entries, total, nameOf }) {
    const session = snapshot?.session;
    const manifest = snapshot?.manifest;
    if (!session?.sessionId || !manifest) return;
    const lines = (entries || [])
        .filter(entry => entry?.role === 'user' || entry?.role === 'assistant')
        .slice(-2)
        .map(entry => ({ who: plain(nameOf(entry), 60), role: entry.role, text: plain(entry.displayContent ?? entry.content, 320) }))
        .filter(line => line.text);
    const card = {
        v: 1,
        sessionId: String(session.sessionId),
        work: plain(manifest.name, 120),
        title: plain(session.displayTitle || manifest.name, 160),
        version: manifest.version ? 'v' + plain(manifest.version, 30) : '',
        cast: (manifest.actors || []).map(actor => plain(actor?.displayName, 40)).filter(Boolean).slice(0, 4),
        persona: plain(snapshot.states?.atri_player_persona?.solo?.snapshot?.name, 60),
        turn: Number.isFinite(total) ? total : 0,
        lines,
        memory: branchMemory(snapshot),
    };
    const signature = JSON.stringify(card);
    if (signature === lastResume) return;
    lastResume = signature;
    write(RESUME_KEY, JSON.stringify({ ...card, at: Date.now() }));
}

export function forgetStartupResume() {
    lastResume = '';
    write(RESUME_KEY, null);
}

/**
 * Remember the resolved appearance so the cover paints in the reader's theme.
 * @param {string} appearance 'light' | 'dark'
 * @param {CSSStyleDeclaration} computed Computed style of the document root.
 */
export function rememberStartupAppearance(appearance, computed) {
    const colors = {};
    for (const role of APPEARANCE_ROLES) {
        const value = computed?.getPropertyValue?.(`--atri-${role}`)?.trim();
        if (value) colors[role] = value;
    }
    const payload = JSON.stringify({ appearance: appearance === 'dark' ? 'dark' : 'light', colors });
    if (payload === lastAppearance) return;
    lastAppearance = payload;
    write(APPEARANCE_KEY, payload);
}

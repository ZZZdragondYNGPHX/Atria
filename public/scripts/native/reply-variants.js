import { el, action, disclosure, feedback, libraryError } from './library-ui.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';
import { nativeProductClient } from './product-client.js';

export const HISTORY_LIMIT = 20000;
const messageId = revision => revision?.timelineHead?.messageId || null;
const compare = key => (a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0) || a[key].localeCompare(b[key]);

function orderedGraph(items, key, parentKey, tolerant) {
    const byId = new Map();
    for (const item of items) {
        if (!item || typeof item[key] !== 'string' || !item[key] || byId.has(item[key])) throw new TypeError('Invalid history metadata');
        byId.set(item[key], { ...item, issues: [] });
    }
    const ordered = [], visited = new Set();
    for (const item of [...byId.values()].sort(compare(key))) {
        const path = [], active = new Set(); let cursor = item, issue = null;
        while (cursor && !visited.has(cursor[key])) {
            if (active.has(cursor[key])) { issue = 'cycle'; break; }
            active.add(cursor[key]); path.push(cursor);
            if (cursor[parentKey] && !byId.has(cursor[parentKey])) { issue = 'missing-parent'; break; }
            cursor = byId.get(cursor[parentKey]);
        }
        if (issue && !tolerant) throw new Error(issue === 'cycle' ? 'Session history contains a cycle' : 'Session history parent is unavailable');
        for (const node of path.reverse()) {
            node.issues = issue ? [issue] : [...(cursor?.issues || [])];
            node.ordinal = ordered.length + 1;
            node.depth = cursor && !node.issues.length ? cursor.depth + 1 : 0;
            visited.add(node[key]); ordered.push(node); cursor = node;
        }
    }
    return { ordered, byId };
}

/** Metadata only. Command ancestry and branch content ancestry are deliberately separate. */
export function buildBranchGraphModel(history, { tolerant = false } = {}) {
    if (!history || !Array.isArray(history.revisions) || !Array.isArray(history.branches)) throw new TypeError('Invalid history metadata');
    if (history.revisions.length + history.branches.length > HISTORY_LIMIT) throw new RangeError('History metadata limit reached');
    const { ordered, byId: revisions } = orderedGraph(history.revisions, 'revisionId', 'parentRevisionId', tolerant);
    const { ordered: branches, byId: branchById } = orderedGraph(history.branches, 'branchId', 'parentBranchId', tolerant);
    const previousByBranch = new Map(), births = new Map();
    const messages = new Map((history.messages || []).map(item => [item.messageId, item]));
    for (const branch of branches) {
        if (branch.headRevisionId && !revisions.has(branch.headRevisionId)) branch.issues.push('missing-head');
        if (branch.forkRevisionId && !revisions.has(branch.forkRevisionId)) branch.issues.push('missing-fork');
        branch.isCurrent = branch.branchId === history.activeBranchId;
        branch.isOrigin = !branch.parentBranchId;
    }
    for (const revision of ordered) {
        const branch = branchById.get(revision.branchId), parent = revisions.get(revision.parentRevisionId);
        if (!branch) revision.issues.push('missing-branch');
        else revision.issues.push(...branch.issues);
        const previous = previousByBranch.get(revision.branchId);
        // Fork/switch publications point at the *global* previous HEAD. Their
        // content instead comes from the fork point / this branch's prior head.
        revision.lineageParentId = parent?.branchId === revision.branchId ? parent.revisionId
            : previous?.revisionId || branch?.forkRevisionId || null;
        revision.edge = !previous && branch?.parentBranchId ? 'fork' : parent && parent.branchId !== revision.branchId ? 'switch' : 'revision';
        const lineageParent = revisions.get(revision.lineageParentId);
        if (lineageParent && lineageParent.ordinal >= revision.ordinal) revision.issues.push('cycle');
        if (lineageParent?.issues.length) revision.issues.push('broken-lineage');
        previousByBranch.set(revision.branchId, revision);
        const id = messageId(revision), metadata = messages.get(id);
        if (id && !births.has(id) && !revision.issues.length && (!metadata || metadata.branchId === revision.branchId)) {
            births.set(id, { sessionId: history.sessionId, messageId: id, revisionId: revision.revisionId,
                branchId: revision.branchId, variantId: revision.timelineHead.variantId,
                predecessorMessageId: messageId(lineageParent), ordinal: revision.ordinal, metadata });
        }
    }
    const model = { ...history, ordered, revisions, branches, branchById, messages, births };
    model.activeLineage = new Set(branchTimeline(model, history.activeBranchId).map(item => item.revisionId));
    for (const revision of ordered) {
        revision.isCurrent = revision.revisionId === history.headRevisionId;
        revision.isOrigin = births.get(messageId(revision))?.revisionId === revision.revisionId;
        revision.isDetached = !model.activeLineage.has(revision.revisionId);
    }
    model.issues = [...branches, ...ordered].filter(item => item.issues.length);
    return model;
}

/** Walk the logical branch timeline, never the cross-branch commit chain. */
export function branchTimeline(model, branchId) {
    const result = [], seen = new Set();
    let revision = model.revisions.get(model.branchById.get(branchId)?.headRevisionId);
    while (revision && !seen.has(revision.revisionId)) {
        seen.add(revision.revisionId); result.push(revision);
        if (revision.issues.length) break;
        revision = model.revisions.get(revision.lineageParentId);
    }
    return result;
}

/** Alternatives are distinct committed assistant messages at one exact predecessor, not Swipes. */
export function deriveReplyVariants(model, { messageId: id, revisionId = model.headRevisionId, branchId = model.activeBranchId } = {}) {
    const birth = model.births.get(id);
    const predecessor = model.messages.get(birth?.predecessorMessageId);
    // Older servers can still render the graph, but untyped heads must not be advertised as replies.
    const eligible = item => item.metadata?.role === 'assistant' && predecessor && birth.metadata.sequence === predecessor.sequence + 1
        && item.predecessorMessageId === birth?.predecessorMessageId
        && item.metadata.sequence === predecessor.sequence + 1;
    const candidates = birth?.metadata?.role === 'assistant'
        ? [...model.births.values()].filter(item => item.messageId === id || eligible(item)) : [];
    const currentMessages = new Set([...model.activeLineage].map(key => messageId(model.revisions.get(key))));
    const items = candidates.map((item, index) => ({ ...item, preview: item.metadata?.preview || '',
        isCurrent: currentMessages.has(item.messageId), isOrigin: index === 0,
        isDetached: !currentMessages.has(item.messageId),
        headRevisionId: model.branchById.get(item.branchId)?.headRevisionId || null,
    }));
    const index = items.findIndex(item => item.messageId === id);
    return { items, count: items.length, index, selected: items[index] || null,
        previous: items[index - 1] || null, next: index < 0 ? null : items[index + 1] || null,
        detached: revisionId !== model.headRevisionId || branchId !== model.activeBranchId,
    };
}

/**
 * A read-only product cache plus injected runtime commands, not a persistence authority.
 * Context: { sessionId, revisionId, branchId, tailMessageId, isHistory, busy, canWrite, canFork }.
 * Callbacks receive exact targets; switchBranch receives (branchId, target).
 * Host must invalidate after lifecycle commits. No callback ever selects a birth Variant.
 */
export function createReplyVariantFacade({ sessionId, loadHistory = id => nativeProductClient.getSessionHistory(id),
    getContext = () => ({}), onInspect, onSwitchBranch, onRetry, onFork, timeoutMs = 15000 } = {}) {
    let model = null, pending = null, version = 0, disposed = false, busy = false, contextRevision;
    const assertLive = () => { if (disposed) throw new Error('History view is closed.'); };
    const invalidate = () => { version++; model = null; pending = null; };
    const targetFor = target => {
        assertLive();
        const revision = model?.revisions.get(target?.revisionId);
        const branchId = target?.branchId || revision?.branchId;
        const branch = model?.branchById.get(branchId);
        if (!revision || revision.issues.length || !branch || branch.issues.length || revision.branchId !== branchId) throw new Error('History target is unavailable.');
        return { sessionId, revisionId: revision.revisionId, branchId, messageId: messageId(revision) };
    };
    const capabilities = target => {
        let exact; try { exact = targetFor(target); } catch { return {}; }
        const context = getContext() || {};
        const ready = !busy && !context.busy && (!context.sessionId || context.sessionId === sessionId);
        const current = context.revisionId === model.headRevisionId && context.branchId === model.activeBranchId && !context.isHistory;
        return { inspect: Boolean(onInspect && ready), switch: Boolean(onSwitchBranch && ready && (exact.branchId !== model.activeBranchId || context.isHistory)),
            fork: Boolean(onFork && ready && (context.canFork ?? context.canWrite)),
            retry: Boolean(onRetry && ready && current && context.canWrite && context.tailMessageId === exact.messageId
                && model.messages.get(exact.messageId)?.role === 'assistant' && model.activeLineage.has(model.births.get(exact.messageId)?.revisionId)) };
    };
    const run = async (kind, target, callback) => {
        const exact = targetFor(target);
        if (!capabilities(exact)[kind]) throw new Error('This history action is unavailable.');
        busy = true;
        try { return await callback(kind === 'retry' ? { ...exact, revisionId: model.headRevisionId, branchId: model.activeBranchId } : exact); } finally { busy = false; if (kind !== 'inspect') invalidate(); }
    };
    return {
        get model() { return model; },
        get busy() { return busy; },
        invalidate,
        dispose() { disposed = true; invalidate(); },
        async load({ refresh = false } = {}) {
            assertLive();
            const context = getContext() || {};
            if (context.sessionId && context.sessionId !== sessionId) throw new Error('History target is unavailable.');
            if (refresh || contextRevision !== context.revisionId) { invalidate(); contextRevision = context.revisionId; }
            if (model) return model;
            if (pending) return pending;
            const request = version;
            let timer;
            const task = Promise.race([
                Promise.resolve().then(() => loadHistory(sessionId)),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('History request timed out.')), timeoutMs); }),
            ]).then(history => {
                if (disposed || request !== version || getContext()?.revisionId !== contextRevision) throw new Error('History changed. Refresh to continue.');
                if (history.sessionId && history.sessionId !== sessionId) throw new Error('History target is unavailable.');
                model = buildBranchGraphModel(history, { tolerant: true }); return model;
            }).finally(() => { clearTimeout(timer); if (pending === task) pending = null; });
            pending = task; return task;
        },
        replies(target) { assertLive(); return model ? deriveReplyVariants(model, target) : { items: [], count: 0, index: -1, selected: null, previous: null, next: null }; },
        preview(target) { const exact = targetFor(target); return { ...exact, revision: model.revisions.get(exact.revisionId), branch: model.branchById.get(exact.branchId), message: model.messages.get(exact.messageId) || null }; },
        capabilities,
        inspect: target => run('inspect', target, exact => onInspect(exact)),
        switchBranch: target => run('switch', target, exact => onSwitchBranch(exact.branchId, exact)),
        retry: target => run('retry', target, exact => onRetry(exact)),
        fork: target => run('fork', target, exact => onFork(exact)),
    };
}

/**
 * Message-host adapter. A controller owns a per-session, on-demand metadata cache.
 * mount(element, { sessionId, branchId, viewRevisionId, messageId, variantId, role })
 * returns { dispose() }. invalidate(sessionId?) follows runtime lifecycle commits.
 * Previous/next only preview; explicit switch restores the complete branch via runtime.
 */
export function createReplyVariantController({ document: doc = globalThis.document, getContext, loadHistory,
    onInspect, onSwitchBranch, onRetry, onFork, onPreview } = {}) {
    const sessions = new Map(), mounts = new Set(); let disposed = false;
    const sessionFacade = sessionId => {
        if (!sessions.has(sessionId)) sessions.set(sessionId, createReplyVariantFacade({ sessionId, getContext, loadHistory, onInspect, onSwitchBranch, onRetry, onFork }));
        return sessions.get(sessionId);
    };
    const controller = {
        mount(element, anchor) {
            if (disposed || anchor?.role !== 'assistant' || !anchor?.sessionId || !anchor?.messageId) return { dispose() {} };
            const facade = sessionFacade(anchor.sessionId);
            const section = disclosure(doc, element, 'Reply variants'); section.dataset.atriaReplyVariants = anchor.messageId;
            const body = el(doc, 'div', 'atri-library-section', undefined, section); body.style.overflowWrap = 'anywhere';
            let selectedMessageId = anchor.messageId, request = 0, loading = false, closed = false, attempted = false;
            const draw = () => {
                const context = getContext?.() || {};
                const revisionId = context.sessionId === anchor.sessionId && context.branchId === anchor.branchId ? context.revisionId : anchor.viewRevisionId;
                const replies = facade.replies({ messageId: selectedMessageId, branchId: anchor.branchId, revisionId });
                body.replaceChildren();
                if (!replies.selected) { feedback(doc, body, tl('No reply alternatives available.')); return; }
                const selected = replies.selected;
                const navigation = el(doc, 'nav', 'atri-library-actions', undefined, body); navigation.setAttribute('aria-label', tl('Reply variants'));
                const choose = async candidate => {
                    selectedMessageId = candidate.messageId; draw();
                    body.querySelector('[data-atria-reply-preview]')?.focus();
                    if (onPreview) await onPreview(facade.preview(candidate));
                };
                action(doc, navigation, 'Previous reply', () => choose(replies.previous), { disabled: !replies.previous });
                const count = el(doc, 'span', 'atri-library-meta', fmt('Reply ${0} of ${1}', [replies.index + 1, replies.count]), navigation);
                count.setAttribute('role', 'status'); count.setAttribute('aria-atomic', 'true');
                action(doc, navigation, 'Next reply', () => choose(replies.next), { disabled: !replies.next });
                const branch = facade.model.branchById.get(selected.branchId);
                el(doc, 'p', 'atri-library-meta', branch.displayName || fmt('Branch ${0}', [branch.ordinal]), body);
                const markers = el(doc, 'div', 'atri-library-actions', undefined, body);
                if (selected.isCurrent) el(doc, 'span', 'atri-library-meta', tl('Current reply'), markers);
                if (selected.isOrigin) el(doc, 'span', 'atri-library-meta', tl('Original reply'), markers);
                if (selected.isDetached || replies.detached) el(doc, 'span', 'atri-library-meta', tl('Detached'), markers);
                const preview = el(doc, 'p', 'atri-library-meta', selected.preview || tl('No reply preview available.'), body);
                preview.dataset.atriaReplyPreview = selected.messageId; preview.tabIndex = -1;
                const commands = el(doc, 'div', 'atri-library-actions', undefined, body);
                const capabilities = facade.capabilities(selected);
                const execute = method => async () => {
                    try {
                        await facade[method](selected);
                        if (method !== 'inspect') await controller.invalidate(anchor.sessionId);
                    } catch (error) {
                        if (method !== 'inspect') await controller.invalidate(anchor.sessionId);
                        if (!closed) feedback(doc, body, libraryError(error), true);
                    }
                };
                if (onInspect) action(doc, commands, 'Inspect revision', execute('inspect'), { disabled: !capabilities.inspect });
                if (onSwitchBranch) action(doc, commands, 'Switch branch', execute('switchBranch'), { disabled: !capabilities.switch });
                if (onRetry) action(doc, commands, 'Retry reply', execute('retry'), { disabled: !capabilities.retry || replies.detached || selectedMessageId !== anchor.messageId });
                if (onFork) action(doc, commands, 'Fork from revision', execute('fork'), { disabled: !capabilities.fork });
                el(doc, 'p', 'atri-library-meta', tl('Switching restores the branch head, including its narrative and state. Preview does not switch branches.'), body);
            };
            const load = async () => {
                if (closed || disposed || loading || !section.open) return;
                const generation = ++request; loading = true; body.replaceChildren(); body.setAttribute('aria-busy', 'true');
                feedback(doc, body, tl('Loading history…'));
                try {
                    await facade.load();
                    if (!closed && generation === request) draw();
                } catch {
                    if (!closed && generation === request) {
                        body.replaceChildren(); feedback(doc, body, tl('History could not be loaded. Your active branch is unchanged.'), true);
                        action(doc, body, 'Try again', load);
                    }
                } finally { if (generation === request) { loading = false; body.removeAttribute('aria-busy'); } }
            };
            const toggle = () => {
                if (!section.open) attempted = false;
                else if (!attempted) { attempted = true; void load(); }
            };
            section.addEventListener('toggle', toggle);
            const mount = { sessionId: anchor.sessionId, refresh() { request++; loading = false; return load(); }, dispose() {
                closed = true; request++; section.removeEventListener('toggle', toggle); section.remove(); mounts.delete(mount);
            } };
            mounts.add(mount); return { dispose: () => mount.dispose() };
        },
        async invalidate(sessionId) {
            for (const [id, facade] of sessions) if (!sessionId || id === sessionId) facade.invalidate();
            await Promise.all([...mounts].filter(mount => !sessionId || mount.sessionId === sessionId).map(mount => mount.refresh()));
        },
        dispose() { disposed = true; for (const mount of [...mounts]) mount.dispose(); for (const facade of sessions.values()) facade.dispose(); sessions.clear(); },
    };
    return controller;
}

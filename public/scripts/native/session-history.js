import { nativeProductClient as client } from './product-client.js';
import { el, action, disclosure, feedback } from './library-ui.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';

export function buildSessionHistoryModel(history) {
    const source = [...history.revisions].sort((a, b) => a.createdAt - b.createdAt || a.revisionId.localeCompare(b.revisionId));
    const byId = new Map(source.map(item => [item.revisionId, item])), ordered = [], visited = new Set();
    for (const revision of source) {
        const path = [], active = new Set(); let current = revision;
        while (current && !visited.has(current.revisionId)) {
            if (active.has(current.revisionId)) throw new Error('Session history contains a cycle');
            active.add(current.revisionId); path.push(current);
            if (current.parentRevisionId && !byId.has(current.parentRevisionId)) throw new Error('Session history parent is unavailable');
            current = byId.get(current.parentRevisionId);
        }
        for (const item of path.reverse()) { visited.add(item.revisionId); ordered.push({ ...item, ordinal: ordered.length + 1 }); }
    }
    const revisions = new Map(ordered.map(item => [item.revisionId, item]));
    const branches = [...history.branches].sort((a, b) => Number(Boolean(a.parentBranchId)) - Number(Boolean(b.parentBranchId)) || a.createdAt - b.createdAt || a.branchId.localeCompare(b.branchId));
    return { ...history, ordered, revisions, branches: branches.map((item, index) => ({ ...item, ordinal: index + 1 })) };
}

export function mountSessionHistory({ document: doc, root, sessionId, onInspect }) {
    const section = disclosure(doc, root, 'Branches & revisions'); section.dataset.atriaSessionHistory = 'true';
    const body = el(doc, 'div', 'atri-library-section', undefined, section); let loaded = false, loading = false;
    const load = async () => {
        if (loading) return; loading = true; body.replaceChildren(); feedback(doc, body, tl('Loading history…'));
        try {
            const model = buildSessionHistoryModel(await client.getSessionHistory(sessionId)); body.replaceChildren(); loaded = true;
            const branchName = id => {
                const item = model.branches.find(branch => branch.branchId === id);
                return item?.displayName || (item && !item.parentBranchId ? tl('Main branch') : fmt('Branch ${0}', [item?.ordinal || '—']));
            };
            const revisionName = id => id ? fmt('Revision ${0}', [model.revisions.get(id)?.ordinal || '—']) : tl('Beginning');
            el(doc, 'p', '', tl('Inspecting a revision is read-only. It does not switch the active branch.'), body);
            el(doc, 'h4', '', tl('Branches'), body);
            for (const branch of model.branches) {
                const row = el(doc, 'article', 'atri-library-version', undefined, body); row.dataset.atriaHistoryBranch = branch.branchId;
                el(doc, 'h5', '', branchName(branch.branchId), row);
                if (branch.branchId === model.activeBranchId) el(doc, 'span', 'atri-library-meta', tl('Current branch'), row);
                el(doc, 'p', '', branch.parentBranchId ? fmt('Forked from ${0} at ${1}', [branchName(branch.parentBranchId), revisionName(branch.forkRevisionId)]) : tl('Original story branch'), row);
                el(doc, 'p', 'atri-library-meta', fmt('Branch head: ${0}', [revisionName(branch.headRevisionId)]), row);
                disclosure(doc, row, 'Exact branch details', branch);
            }
            el(doc, 'h4', '', tl('Revisions'), body);
            const list = el(doc, 'div', 'atri-library-grouped-list', undefined, body); const reverse = [...model.ordered].reverse(); let shown = 0;
            const renderMore = () => {
                for (const revision of reverse.slice(shown, shown + 50)) {
                    const row = el(doc, 'article', 'atri-library-version', undefined, list); row.dataset.atriaHistoryRevision = revision.revisionId;
                    el(doc, 'h5', '', revisionName(revision.revisionId), row);
                    if (revision.revisionId === model.headRevisionId) el(doc, 'span', 'atri-library-meta', tl('Current revision'), row);
                    el(doc, 'p', '', branchName(revision.branchId), row);
                    el(doc, 'p', 'atri-library-meta', new Date(revision.createdAt).toLocaleString(), row);
                    el(doc, 'p', '', fmt('Previous revision: ${0}', [revisionName(revision.parentRevisionId)]), row);
                    if (onInspect) action(doc, row, 'Inspect revision', () => onInspect(revision.revisionId));
                    disclosure(doc, row, 'Exact revision details', revision);
                }
                shown += 50; more.hidden = shown >= reverse.length;
            };
            const more = action(doc, body, 'Show earlier revisions', renderMore); renderMore();
            if (!reverse.length) el(doc, 'p', '', tl('No committed revisions.'), list);
            disclosure(doc, body, 'Raw history details', { branches: model.branches, revisions: model.ordered });
        } catch {
            body.replaceChildren(); feedback(doc, body, tl('History could not be loaded. Your active branch is unchanged.'), true); action(doc, body, 'Try again', load);
        } finally { loading = false; }
    };
    section.addEventListener('toggle', () => { if (section.open && !loaded) void load(); });
    return section;
}

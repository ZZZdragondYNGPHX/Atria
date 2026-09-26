import { el, action, disclosure, feedback, field, libraryError } from './library-ui.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';
import { buildBranchGraphModel, branchTimeline, createReplyVariantFacade } from './reply-variants.js';

export function buildSessionHistoryModel(history, options) {
    return buildBranchGraphModel(history, options);
}

/** Returns the existing details element; atriaHistory exposes refresh/dispose/facade for hosts. */
export function mountSessionHistory({ document: doc, root, sessionId, onInspect, onPreview,
    onSwitchBranch, onRetry, onFork, getContext, loadHistory } = {}) {
    const section = disclosure(doc, root, 'Branches & revisions'); section.dataset.atriaSessionHistory = 'true';
    const body = el(doc, 'div', 'atri-library-section', undefined, section); body.style.overflowWrap = 'anywhere';
    const facade = createReplyVariantFacade({ sessionId, loadHistory, getContext,
        onInspect: onInspect ? target => onInspect(target.revisionId) : undefined, onSwitchBranch, onRetry, onFork });
    let loaded = false, loading = false, disposed = false, attempted = false, selectedBranch = null, selectedRevision = null;
    const load = async (refresh = false) => {
        if (loading || disposed) return;
        loading = true; body.replaceChildren(); body.setAttribute('aria-busy', 'true'); feedback(doc, body, tl('Loading history…'));
        try {
            const model = await facade.load({ refresh });
            if (disposed) return;
            loaded = true; body.replaceChildren(); render(model);
        } catch {
            if (disposed) return;
            loaded = false; body.replaceChildren(); feedback(doc, body, tl('History could not be loaded. Your active branch is unchanged.'), true);
            action(doc, body, 'Try again', () => load(true));
        } finally { loading = false; body.removeAttribute('aria-busy'); }
    };
    const render = model => {
        const branchName = id => {
            const item = model.branchById.get(id);
            return item?.displayName || (item && !item.parentBranchId ? tl('Main branch') : fmt('Branch ${0}', [item?.ordinal || '—']));
        };
        const revisionName = id => id ? fmt('Revision ${0}', [model.revisions.get(id)?.ordinal || '—']) : tl('Beginning');
        const pageAction = (parent, label, handler) => {
            const button = el(doc, 'button', 'atri-library-button', tl(label), parent); button.type = 'button';
            button.addEventListener('click', () => { if (!button.disabled) handler(); }); return button;
        };
        const marker = (parent, label) => el(doc, 'span', 'atri-library-meta', tl(label), parent);
        const markers = (parent, revision) => {
            if (revision.isCurrent) { marker(parent, 'Current revision'); parent.setAttribute('aria-current', 'true'); }
            if (revision.isOrigin && model.messages.get(revision.timelineHead?.messageId)?.role === 'assistant') marker(parent, 'Reply origin');
            if (revision.isDetached) marker(parent, 'Detached');
            if (revision.issues.length) marker(parent, 'Incomplete history');
        };
        el(doc, 'h4', '', tl('Branch graph'), body);
        el(doc, 'p', 'atri-library-meta', fmt('${0} branches · ${1} revisions', [model.branches.length, model.ordered.length]), body);
        el(doc, 'p', '', tl('Inspecting a revision is read-only. It does not switch the active branch.'), body);
        if (model.issues.length) feedback(doc, body, tl('Some history links are unavailable. Only intact revisions can be opened.'), true);
        const toolbar = el(doc, 'div', 'atri-library-actions', undefined, body);
        action(doc, toolbar, 'Refresh history', () => load(true));
        const search = field(doc, body, 'Find branch', '', 'search');
        const branchList = el(doc, 'div', 'atri-library-grouped-list', undefined, body);
        const branchPages = el(doc, 'nav', 'atri-library-actions', undefined, body); branchPages.setAttribute('aria-label', tl('Branch pages'));
        let branchPage = 0;
        const renderBranches = () => {
            const query = search.value.trim().toLocaleLowerCase();
            const branches = model.branches.filter(branch => branchName(branch.branchId).toLocaleLowerCase().includes(query));
            branchPage = Math.min(branchPage, Math.max(0, Math.ceil(branches.length / 25) - 1));
            branchList.replaceChildren();
            for (const branch of branches.slice(branchPage * 25, (branchPage + 1) * 25)) {
                const row = el(doc, 'article', 'atri-library-version', undefined, branchList); row.dataset.atriaHistoryBranch = branch.branchId;
                row.dataset.depth = String(branch.depth);
                const name = el(doc, 'h5', '', '', row);
                if (branch.depth) el(doc, 'span', '', '↳ '.repeat(Math.min(branch.depth, 4)), name).setAttribute('aria-hidden', 'true');
                name.append(doc.createTextNode(branchName(branch.branchId)));
                if (branch.isCurrent) marker(row, 'Current branch');
                if (branch.isOrigin) marker(row, 'Original story branch');
                if (branch.issues.length) marker(row, 'Incomplete history');
                el(doc, 'p', 'atri-library-meta', branch.parentBranchId ? fmt('Forked from ${0} at ${1}', [branchName(branch.parentBranchId), revisionName(branch.forkRevisionId)]) : tl('Beginning'), row);
                el(doc, 'p', 'atri-library-meta', fmt('Branch head: ${0}', [revisionName(branch.headRevisionId)]), row);
                action(doc, row, 'Explore branch', () => { selectedBranch = branch.branchId; revisionEnd = 50; renderTimeline(); });
                disclosure(doc, row, 'Exact branch details', branch);
            }
            if (!branches.length) el(doc, 'p', '', tl('No matching branches.'), branchList);
            previousBranches.disabled = branchPage === 0; nextBranches.disabled = (branchPage + 1) * 25 >= branches.length;
            branchCount.textContent = fmt('${0}–${1} of ${2}', [branches.length ? branchPage * 25 + 1 : 0, Math.min((branchPage + 1) * 25, branches.length), branches.length]);
        };
        const previousBranches = pageAction(branchPages, 'Previous branches', () => { branchPage--; renderBranches(); });
        const branchCount = el(doc, 'span', 'atri-library-meta', '', branchPages); branchCount.setAttribute('role', 'status'); branchCount.setAttribute('aria-atomic', 'true');
        const nextBranches = pageAction(branchPages, 'Next branches', () => { branchPage++; renderBranches(); });
        search.addEventListener('input', () => { branchPage = 0; renderBranches(); });

        const preview = el(doc, 'section', 'atri-library-section', undefined, body); preview.dataset.atriaHistoryPreview = 'true'; preview.setAttribute('aria-label', tl('Revision preview'));
        const showPreview = async (target, focus = false) => {
            const value = facade.preview(target); selectedRevision = value.revisionId;
            preview.replaceChildren();
            const heading = el(doc, 'h4', '', fmt('Preview: ${0}', [revisionName(value.revisionId)]), preview); heading.tabIndex = -1;
            el(doc, 'p', 'atri-library-meta', branchName(value.branchId), preview); markers(el(doc, 'div', 'atri-library-actions', undefined, preview), value.revision);
            el(doc, 'p', '', value.message?.preview || tl('No reply preview available.'), preview);
            const replies = facade.replies(value);
            const navigation = el(doc, 'nav', 'atri-library-actions', undefined, preview); navigation.setAttribute('aria-label', tl('Reply variants'));
            action(doc, navigation, 'Previous reply', () => showPreview(replies.previous, true), { disabled: !replies.previous });
            const count = el(doc, 'span', 'atri-library-meta', fmt('Reply ${0} of ${1}', [replies.index + 1, replies.count]), navigation);
            count.setAttribute('role', 'status'); count.setAttribute('aria-atomic', 'true');
            action(doc, navigation, 'Next reply', () => showPreview(replies.next, true), { disabled: !replies.next });
            navigation.hidden = !replies.count;
            const commands = el(doc, 'div', 'atri-library-actions', undefined, preview);
            const permissions = facade.capabilities(value);
            if (onInspect) action(doc, commands, 'Inspect revision', () => facade.inspect(value), { disabled: !permissions.inspect });
            const mutate = method => async () => {
                let error;
                try { await facade[method](value); } catch (failure) { error = failure; }
                await load(true);
                if (error) feedback(doc, body, libraryError(error), true);
            };
            if (onSwitchBranch) action(doc, commands, 'Switch branch', mutate('switchBranch'), { disabled: !permissions.switch });
            if (onRetry) action(doc, commands, 'Retry reply', mutate('retry'), { disabled: !permissions.retry });
            if (onFork) action(doc, commands, 'Fork from revision', mutate('fork'), { disabled: !permissions.fork });
            el(doc, 'p', 'atri-library-meta', tl('Switching restores the branch head, including its narrative and state. Preview does not switch branches.'), preview);
            if (focus) heading.focus();
            if (onPreview) await onPreview(value);
        };

        const timelineHeading = el(doc, 'h4', '', tl('Revisions'), body);
        const timelineTools = el(doc, 'div', 'atri-library-actions', undefined, body);
        action(doc, timelineTools, 'All branches', () => { selectedBranch = null; revisionEnd = 50; renderTimeline(); });
        action(doc, timelineTools, 'Current branch', () => { selectedBranch = model.activeBranchId; revisionEnd = 50; renderTimeline(); });
        const list = el(doc, 'div', 'atri-library-grouped-list', undefined, body);
        const revisionPages = el(doc, 'nav', 'atri-library-actions', undefined, body); revisionPages.setAttribute('aria-label', tl('Revision pages'));
        let revisionEnd = 50;
        const renderTimeline = () => {
            if (!model.branchById.has(selectedBranch)) selectedBranch = null;
            const revisions = selectedBranch ? branchTimeline(model, selectedBranch) : [...model.ordered].reverse();
            timelineHeading.textContent = selectedBranch ? fmt('Timeline: ${0}', [branchName(selectedBranch)]) : tl('Revisions');
            revisionEnd = Math.min(revisionEnd, revisions.length);
            const start = Math.max(0, revisionEnd - 100);
            list.replaceChildren();
            for (const revision of revisions.slice(start, revisionEnd)) {
                const row = el(doc, 'article', 'atri-library-version', undefined, list); row.dataset.atriaHistoryRevision = revision.revisionId;
                el(doc, 'h5', '', revisionName(revision.revisionId), row); markers(row, revision);
                el(doc, 'p', '', branchName(revision.branchId), row);
                if (Number.isFinite(revision.createdAt)) el(doc, 'p', 'atri-library-meta', new Date(revision.createdAt).toLocaleString(), row);
                el(doc, 'p', 'atri-library-meta', fmt('Previous revision: ${0}', [revisionName(revision.lineageParentId)]), row);
                if (revision.edge === 'fork') marker(row, 'Branch fork');
                if (revision.edge === 'switch') marker(row, 'Branch switch');
                // Keep the existing single-argument inspect integration intact.
                if (onInspect) action(doc, row, 'Inspect revision', () => facade.inspect(revision), { disabled: Boolean(revision.issues.length) });
                action(doc, row, 'Preview revision', () => showPreview(revision, true), { disabled: Boolean(revision.issues.length) });
                disclosure(doc, row, 'Exact revision details', revision);
            }
            if (!revisions.length) el(doc, 'p', '', tl('No committed revisions.'), list);
            newer.disabled = start === 0; more.hidden = revisionEnd >= revisions.length;
            revisionCount.textContent = fmt('${0}–${1} of ${2}', [revisions.length ? start + 1 : 0, revisionEnd, revisions.length]);
        };
        const newer = pageAction(revisionPages, 'Show newer revisions', () => { revisionEnd = Math.max(50, revisionEnd - 50); renderTimeline(); });
        const revisionCount = el(doc, 'span', 'atri-library-meta', '', revisionPages); revisionCount.setAttribute('role', 'status'); revisionCount.setAttribute('aria-atomic', 'true');
        const more = pageAction(revisionPages, 'Show earlier revisions', () => { revisionEnd += 50; renderTimeline(); });
        renderBranches(); renderTimeline();
        const initial = model.revisions.get(selectedRevision || model.headRevisionId);
        if (initial && !initial.issues.length) void showPreview(initial).catch(() => feedback(doc, preview, tl('History target is unavailable.'), true));
    };
    const toggle = () => {
        if (!section.open) attempted = false;
        else if (!loaded && !attempted) { attempted = true; void load(); }
    };
    section.addEventListener('toggle', toggle);
    section.atriaHistory = { facade, refresh: () => load(true), dispose() { disposed = true; facade.dispose(); section.removeEventListener('toggle', toggle); } };
    return section;
}

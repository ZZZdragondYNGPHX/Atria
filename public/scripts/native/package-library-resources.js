import { nativeStudioClient as client } from './studio-client.js';
import { resourceReferenceForNode } from './studio-authoring.js';
import { resourceBundleExport } from './resource-bundle-controls.js';
import { renderResourceReferenceRows } from './resource-reference-rows.js';
import { el, action, disclosure, heading, feedback, worldParameterSummary } from './library-ui.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { mountKnowledgeEntryBrowser } from './knowledge-entry-browser.js';
import { nativeProductClient } from './product-client.js';
import { mountLibraryRevisionEditor } from './library-revision-editor.js';

const sameOriginal = (a, b) => Boolean(a && b) && a.resourceId === b.resourceId && a.packageVersionId === b.packageVersionId;

// Installed originals are one group of the list. Rows open like any other row;
// the exact revision is shown on the original's own page.
export async function mountPackageLibraryList({ document: doc, root, knowledge, host, selected = null }) {
    const section = el(doc, 'section', 'atri-library-section', undefined, root); section.dataset.atriaPackageResources = 'true';
    el(doc, 'h3', 'atri-library-group-title', tl('Installed Work originals'), section);
    const load = async () => {
        section.querySelector('[data-atria-package-resource-rows]')?.remove();
        const rows = el(doc, 'div', 'atri-library-grouped-list', undefined, section); rows.dataset.atriaPackageResourceRows = 'true';
        try {
            let nodes = await client.queryResources({ resourceType: knowledge ? 'core.knowledge' : 'core.world', ownership: 'package' });
            if (knowledge) {
                const works = await nativeProductClient.listWorks();
                nodes = nodes.filter(node => works.some(work => work.package.packageId === node.metadata?.packageId && work.package.currentVersionId === node.metadata.packageVersionId));
            }
            if (!nodes.length) el(doc, 'p', 'atri-library-meta', tl('No installed Work resources of this type.'), rows);
            for (const node of nodes) {
                const ref = resourceReferenceForNode(node);
                const open = () => host.openLibraryResource(ref, node.displayName);
                const row = el(doc, 'article', 'atri-library-row', undefined, rows);
                row.dataset.atriaPackageOriginalRow = ref.resourceId;
                row.prepend(createAtriaIcon(doc, knowledge ? 'book' : 'globe', { size: 16 }));
                if (sameOriginal(ref, selected)) row.setAttribute('aria-current', 'true');
                row.addEventListener('click', event => { if (!event.target.closest('button')) open(); });
                const content = el(doc, 'div', 'atri-library-row-content', undefined, row);
                el(doc, 'h3', '', node.displayName, content);
                el(doc, 'p', 'atri-library-meta', [node.metadata?.packageName, tl(knowledge ? 'Editable original' : 'Read-only original')].filter(Boolean).join(' · '), content);
                action(doc, row, 'Open', open);
            }
        } catch {
            feedback(doc, rows, tl('Installed Work resources could not be loaded.'), true);
            action(doc, rows, 'Try again', load);
        }
    };
    await load();
}

// One way out of a read-only original (K09): review what will be copied, then copy
// it into the Library as independent resources and open the copy.
function copyToLibrary(doc, parent, reviewRoot, ref, host, displayName) {
    const panel = el(doc, 'div', 'atri-library-copy-review', undefined, reviewRoot); panel.dataset.atriaPackageForkReview = 'true';
    const button = action(doc, parent, 'Copy to Library', async () => {
        // The trigger steps aside while its review is open, and returns whenever a retry is needed.
        panel.replaceChildren(); button.hidden = true;
        let bundle, plan;
        try { bundle = await client.exportResourceBundle(ref); plan = await client.preflightResourceBundle(bundle); } catch (error) { button.hidden = false; throw error; }
        el(doc, 'p', '', fmt('${0} exact resources will be copied into Library.', [plan.resources.length]), panel);
        disclosure(doc, panel, 'Exact dependency closure', plan.resources.map(item => ({ source: item.source, destination: item.ref })));
        if (!plan.canImport) { button.hidden = false; feedback(doc, panel, tl('The fork destination conflicts with existing content. Review the fork again to choose fresh identities.'), true); return; }
        const controls = el(doc, 'div', 'atri-library-actions', undefined, panel);
        action(doc, controls, 'Create copy', async () => {
            try {
                const result = await client.importResourceBundle(bundle, plan.token); void host.refreshSearch?.();
                panel.replaceChildren(); feedback(doc, panel, tl('Created independent Library resource.'));
                if (result.root.resourceType === 'core.knowledge') host.openLibraryKnowledge?.(result.root.resourceId, displayName);
                else host.openLibraryWorld?.(result.root.resourceId, displayName);
            } catch (error) {
                controls.remove(); button.hidden = false;
                feedback(doc, panel, tl('Import was interrupted. Completed dependency copies are kept. Retry this review to resume with the same identities.'), true);
                disclosure(doc, panel, 'Details', { code: error.code, ...error.details });
            }
        }, { primary: true });
        action(doc, controls, 'Cancel', () => { panel.replaceChildren(); button.hidden = false; button.focus(); });
        panel.querySelector('.atri-library-button--primary')?.focus();
    }, { primary: true, disabled: !ref.revision });
    return button;
}

export async function mountPackageLibraryOriginal({ document: doc, root, ref, host }) {
    const knowledge = ref.resourceType === 'core.knowledge';
    const detail = knowledge ? await nativeProductClient.getPackageKnowledge(ref.packageId, ref.resourceId) : await client.getPackageLibraryResource(ref);
    const { snapshot, origin } = detail;
    if (knowledge) ref = { ...ref, packageVersionId: detail.packageVersionId, revision: snapshot.revision.knowledgeRevisionId };
    const resource = knowledge ? snapshot.knowledgeBase : snapshot.world;
    root.dataset.atriaPackageOriginal = ref.resourceId;
    const hero = heading(doc, root, resource.displayName, [origin?.displayName, origin?.version].filter(Boolean).join(' · ') || tl('Installed Work'), true);
    action(doc, hero, 'Close details', () => host.openLibrarySection?.(knowledge ? 'knowledge' : 'worlds')).classList.add('atri-library-detail-close');
    // Status 09 (history · original): why it is read-only and the single way to change it.
    const banner = el(doc, 'section', 'atri-library-banner', undefined, root); banner.dataset.tone = 'history';
    banner.append(createAtriaIcon(doc, knowledge ? 'book' : 'lock', { size: 18 }));
    const copy = el(doc, 'div', 'atri-library-banner__body', undefined, banner);
    el(doc, 'strong', '', tl(knowledge ? 'Editable Knowledge original' : 'Read-only original from an installed Work'), copy);
    el(doc, 'p', '', tl(knowledge ? 'Edit Knowledge directly. Changing a World or its Knowledge bindings requires an editable World copy.' : 'The Work keeps using this exact original. Copy it to your Library to make changes of your own.'), copy);
    const bannerActions = el(doc, 'div', 'atri-library-actions', undefined, banner);
    copyToLibrary(doc, bannerActions, banner, ref, host, resource.displayName);
    const secondary = el(doc, 'div', 'atri-library-actions', undefined, root);
    action(doc, secondary, 'Open Work', () => host.openLibraryWork(ref.packageId));
    resourceBundleExport(doc, secondary, ref, resource.displayName);
    if (knowledge) {
        const reload = async () => { root.replaceChildren(); await mountPackageLibraryOriginal({ document: doc, root, ref, host }); };
        const edit = (initialEntryId, entryEnabled, entryAction) => {
            root.replaceChildren();
            mountLibraryRevisionEditor({ document: doc, root, knowledge: true, detail: { ...snapshot, selectedRevision: snapshot.revision }, initialEntryId, entryEnabled, entryAction, onClose: reload, onSaved: async () => {
                const { nativeSessionRuntime } = await import('./session-runtime.js');
                if (nativeSessionRuntime.snapshot?.session.packageId === ref.packageId) await nativeSessionRuntime.reload();
                void host.refreshSearch?.(); await reload();
            }, saveRevision: async input => {
                const { nativeSessionRuntime } = await import('./session-runtime.js');
                if (nativeSessionRuntime.snapshot?.session.packageId === ref.packageId && (nativeSessionRuntime.generation || nativeSessionRuntime.host?.isGenerating?.())) throw new Error(tl('Stop generation before changing resource choices.'));
                return nativeProductClient.editPackageKnowledge(ref.packageId, ref.resourceId, { ...input, packageVersionId: detail.packageVersionId });
            } });
        };
        const entries = el(doc, 'section', 'atri-library-section', undefined, root);
        el(doc, 'h3', '', tl('Entries'), entries);
        const entryActions = el(doc, 'div', 'atri-library-actions', undefined, entries);
        action(doc, entryActions, 'Add entry', () => edit(undefined, undefined, 'add'), { primary: true });
        action(doc, entryActions, 'Edit Knowledge', () => edit());
        mountKnowledgeEntryBrowser({ document: doc, root: entries, entries: snapshot.entries, onEdit: entry => edit(entry.knowledgeEntryId), onToggle: (entry, enabled) => edit(entry.knowledgeEntryId, enabled), onDelete: entry => edit(entry.knowledgeEntryId, undefined, 'delete') });
    } else {
        worldParameterSummary(doc, root, snapshot.revision);
    }
    const usedBy = disclosure(doc, root, 'Used By');
    action(doc, usedBy, 'Load references', async () => {
        usedBy.querySelector('[data-atria-package-used-by]')?.remove();
        const rows = el(doc, 'div', '', undefined, usedBy); rows.dataset.atriaPackageUsedBy = 'true';
        renderResourceReferenceRows({ document: doc, root: rows, references: await client.getResourceReferences(ref, { reverse: true }), host });
    });
    disclosure(doc, root, 'Origin / exact revision', { ...ref, ...origin });
}

import { nativeStudioClient as client } from './studio-client.js';
import { resourceReferenceForNode } from './studio-authoring.js';
import { resourceBundleExport, resourceLibraryCopy } from './resource-bundle-controls.js';
import { renderResourceReferenceRows } from './resource-reference-rows.js';
import { el, action, disclosure, heading, feedback, worldParameterSummary } from './library-ui.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';
import { mountKnowledgeEntryBrowser } from './knowledge-entry-browser.js';
import { nativeProductClient } from './product-client.js';
import { mountLibraryRevisionEditor } from './library-revision-editor.js';

export async function mountPackageLibraryList({ document: doc, root, knowledge, host }) {
    const section = el(doc, 'section', 'atri-library-section', undefined, root); section.dataset.atriaPackageResources = 'true';
    el(doc, 'h3', '', tl('Installed Work originals'), section);
    const load = async () => {
        section.querySelector('[data-atria-package-resource-rows]')?.remove();
        const rows = el(doc, 'div', 'atri-library-grouped-list', undefined, section); rows.dataset.atriaPackageResourceRows = 'true';
        try {
            let nodes = await client.queryResources({ resourceType: knowledge ? 'core.knowledge' : 'core.world', ownership: 'package' });
            if (knowledge) {
                const works = await nativeProductClient.listWorks();
                nodes = nodes.filter(node => works.some(work => work.package.packageId === node.metadata?.packageId && work.package.currentVersionId === node.metadata.packageVersionId));
            }
            if (!nodes.length) el(doc, 'p', '', tl('No installed Work resources of this type.'), rows);
            for (const node of nodes) {
                const row = el(doc, 'article', 'atri-library-row', undefined, rows), content = el(doc, 'div', 'atri-library-row-content', undefined, row);
                el(doc, 'h4', '', node.displayName, content);
                el(doc, 'p', 'atri-library-meta', [node.metadata?.packageName, node.metadata?.packageVersion, tl(knowledge ? 'Editable Knowledge original' : 'Read-only original')].filter(Boolean).join(' · '), content);
                disclosure(doc, content, 'Exact revision details', resourceReferenceForNode(node));
                action(doc, row, 'Browse original', () => host.openLibraryResource(resourceReferenceForNode(node), node.displayName));
            }
        } catch {
            feedback(doc, rows, tl('Installed Work resources could not be loaded.'), true);
            action(doc, rows, 'Try again', load);
        }
    };
    await load();
}

export async function mountPackageLibraryOriginal({ document: doc, root, ref, host }) {
    const knowledge = ref.resourceType === 'core.knowledge';
    const detail = knowledge ? await nativeProductClient.getPackageKnowledge(ref.packageId, ref.resourceId) : await client.getPackageLibraryResource(ref);
    const { snapshot, origin } = detail;
    if (knowledge) ref = { ...ref, packageVersionId: detail.packageVersionId, revision: snapshot.revision.knowledgeRevisionId };
    const resource = knowledge ? snapshot.knowledgeBase : snapshot.world;
    root.dataset.atriaPackageOriginal = ref.resourceId;
    heading(doc, root, resource.displayName, tl(knowledge ? 'Editable Knowledge original' : 'Installed Work · Read-only original'), true);
    el(doc, 'p', '', tl(knowledge ? 'Edit Knowledge directly. Changing a World or its Knowledge bindings requires an editable World copy.' : 'This exact Package revision is immutable. Create an independent Library copy to author changes.'), root);
    el(doc, 'p', 'atri-library-meta', [origin?.displayName, origin?.version].filter(Boolean).join(' · '), root);
    disclosure(doc, root, 'Origin / exact revision', { ...ref, ...origin });
    action(doc, root, 'Open Work', () => host.openLibraryWork(ref.packageId));
    resourceLibraryCopy(doc, root, ref, host);
    resourceBundleExport(doc, root, ref, resource.displayName);
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
        action(doc, root, 'Edit Knowledge', () => edit());
        action(doc, root, 'Add entry', () => edit(undefined, undefined, 'add'));
        const entries = el(doc, 'section', 'atri-library-section', undefined, root);
        el(doc, 'h3', '', tl('Entries'), entries);
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
    const fork = disclosure(doc, root, 'Fork to Library');
    el(doc, 'p', '', tl('The exact dependency closure will also become independent Library copies.'), fork);
    action(doc, fork, 'Review fork', async () => {
        fork.querySelector('[data-atria-package-fork-review]')?.remove();
        const bundle = await client.exportResourceBundle(ref), plan = await client.preflightResourceBundle(bundle);
        const review = el(doc, 'section', 'atri-library-section', undefined, fork); review.dataset.atriaPackageForkReview = 'true';
        el(doc, 'p', '', fmt('${0} exact resources will be copied into Library.', [plan.resources.length]), review);
        disclosure(doc, review, 'Exact dependency closure', plan.resources.map(item => ({ source: item.source, destination: item.ref })));
        if (!plan.canImport) { feedback(doc, review, tl('The fork destination conflicts with existing content. Review the fork again to choose fresh identities.'), true); return; }
        action(doc, review, 'Create fork', async () => {
            try {
                const result = await client.importResourceBundle(bundle, plan.token); review.replaceChildren(); void host.refreshSearch?.();
                feedback(doc, review, tl('Created independent Library resource.'));
                action(doc, review, 'Open imported resource', () => knowledge ? host.openLibraryKnowledge(result.root.resourceId, resource.displayName) : host.openLibraryWorld(result.root.resourceId, resource.displayName));
            } catch (error) {
                feedback(doc, review, tl('Import was interrupted. Completed dependency copies are kept. Retry this review to resume with the same identities.'), true);
                disclosure(doc, review, 'Details', { code: error.code, ...error.details });
            }
        }, { primary: true });
    });
}

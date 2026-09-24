import { nativeStudioClient as client } from './studio-client.js';
import { el, action, disclosure, field, feedback } from './library-ui.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';

export function resourceBundleExport(doc, parent, ref, name = '') {
    return action(doc, parent, 'Export Resource Bundle', async () => {
        const bundle = await client.exportResourceBundle(ref);
        const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
        const link = el(doc, 'a'); link.href = url;
        link.download = (name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 80) || 'resource') + '.atriabundle';
        doc.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, { disabled: !ref.revision });
}

export function mountResourceBundleImport({ document: doc, root, host, onReload }) {
    const section = disclosure(doc, root, 'Import Resource Bundle'); section.dataset.atriaResourceBundle = 'true';
    el(doc, 'p', '', tl('Review the exact resource and its dependencies before creating independent Library copies. Originals remain unchanged.'), section);
    const file = field(doc, section, 'Resource Bundle file', '', 'file'); file.accept = '.atriabundle,.json,application/json';
    const choose = action(doc, section, 'Choose Resource Bundle', () => file.click());
    const filename = el(doc, 'p', 'atri-library-meta', '', section);
    const review = el(doc, 'div', 'atri-library-section', undefined, section);
    let sequence = 0;
    file.addEventListener('change', async () => {
        const current = ++sequence, selected = file.files?.[0]; review.replaceChildren(); filename.textContent = selected?.name || ''; if (!selected) return;
        try {
            if (selected.size > 32 * 1024 * 1024) throw new Error(tl('Resource Bundle must be smaller than 32 MB.'));
            const bundle = JSON.parse(await selected.text());
            const plan = await client.preflightResourceBundle(bundle); if (current !== sequence) return;
            el(doc, 'h4', '', tl('Review Resource Bundle'), review);
            el(doc, 'p', '', fmt('${0} exact resources will be copied into Library.', [plan.resources.length]), review);
            if (plan.existingOrigins.length) el(doc, 'p', '', tl('Some originals already exist here. Import creates independent identities without replacing them.'), review);
            const list = el(doc, 'ul', '', undefined, review);
            for (const item of plan.resources) {
                const data = item.data;
                const row = el(doc, 'li', '', data.displayName || data.world?.displayName || data.knowledgeBase?.displayName || data.ref?.logicalName || tl('Dependency'), list);
                disclosure(doc, row, 'Origin / exact revision', { source: item.source, destination: item.ref, status: item.status });
            }
            if (!plan.canImport) {
                feedback(doc, review, tl('The import destination conflicts with existing content. Select the file again to review new identities.'), true);
                disclosure(doc, review, 'Conflict details', plan.conflicts); return;
            }
            const confirm = action(doc, review, 'Import into Library', async () => {
                file.disabled = true; choose.disabled = true;
                try {
                    const result = await client.importResourceBundle(bundle, plan.token);
                    review.replaceChildren(); file.value = ''; filename.textContent = ''; void host?.refreshSearch?.();
                    feedback(doc, review, tl('Resource Bundle imported into Library.'));
                    action(doc, review, 'Open imported resource', () => {
                        const ref = result.root;
                        if (ref.resourceType === 'core.world') host.openLibraryWorld(ref.resourceId);
                        else if (ref.resourceType === 'core.knowledge') host.openLibraryKnowledge(ref.resourceId);
                        else host.openLibraryResource(ref);
                    });
                    if (onReload) action(doc, review, 'Reload resources', onReload);
                } catch (error) {
                    const interrupted = error.code === 'native_resource_bundle_interrupted';
                    feedback(doc, review, tl(interrupted ? 'Import was interrupted. Completed dependency copies are kept. Retry this review to resume with the same identities.' : 'Import could not finish. Your originals are unchanged. Retry or select the file again to review.'), true);
                    review.querySelector('[data-atria-bundle-error]')?.remove();
                    const details = disclosure(doc, review, 'Details', { code: error.code, ...error.details }); details.dataset.atriaBundleError = 'true';
                    confirm.textContent = tl('Retry import');
                } finally { file.disabled = false; choose.disabled = false; }
            }, { primary: true });
        } catch (error) {
            if (current !== sequence) return;
            feedback(doc, review, tl('This Resource Bundle could not be reviewed. Check its format, exact dependencies and integrity.'), true);
            disclosure(doc, review, 'Details', error.message);
        }
    });
    return section;
}

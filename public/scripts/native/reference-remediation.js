import { nativeStudioClient } from './studio-client.js';
import { nativeProductClient } from './product-client.js';
import { renderResourceReferenceRows } from './resource-reference-rows.js';
import { el, action, disclosure, feedback } from './library-ui.js';
import { sanitizeProductDetails } from './product-error-details.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

function flatten(details) {
    return [details?.references, details?.usedBy, details?.blockers].flatMap(items => Array.isArray(items) ? items : []).flatMap(item => item?.reference ? [item.reference] : [item]);
}
function findNode(nodes, item) {
    if (item.node) return item.node;
    if (item.from) return nodes.find(node => node.key === item.from);
    const type = item.resourceType || (item.projectId ? 'core.project' : item.worldId || item.worldRevisionId ? 'core.world' : item.knowledgeBindingId ? 'core.knowledge-binding' : item.knowledgeBaseId ? 'core.knowledge' : item.packageId ? 'core.package' : null);
    const id = item.resourceId || item.projectId || item.worldId || item.knowledgeBindingId || item.knowledgeBaseId || item.packageId;
    const revision = item.revision || item.worldRevisionId || item.knowledgeRevisionId || item.packageVersionId;
    return nodes.find(node => (!type || node.resourceType === type) && (!id || node.resourceId === id) && (!revision || node.revision === revision) && (id || revision));
}

export async function renderReferenceRemediation({ document: doc, root, error, host = globalThis.Atria?.shell?.getWorkspaceHost?.() }) {
    root.querySelector(':scope > [data-atria-reference-remediation]')?.remove();
    const section = el(doc, 'section', 'atri-library-section', undefined, root); section.dataset.atriaReferenceRemediation = 'true';
    el(doc, 'h4', '', tl('Resolve references'), section);
    el(doc, 'p', '', tl('Open each owner and remove or replace the reference before retrying. Existing content has been kept.'), section);
    const entries = flatten(error.details), runtime = entries.filter(item => ['routes', 'models', 'connections'].includes(item?.section) && typeof item.id === 'string');
    for (const item of runtime) {
        const row = el(doc, 'article', 'atri-library-version', undefined, section);
        el(doc, 'h5', '', item.displayName || tl('Runtime resource'), row);
        el(doc, 'p', '', tl('Edit this Runtime resource to select a replacement or remove its reference.'), row);
        action(doc, row, 'Edit reference owner', () => host?.openRuntimeSection(item.section, item.id));
    }
    const rows = el(doc, 'div', '', undefined, section);
    const load = async () => {
        rows.replaceChildren();
        const remaining = entries.filter(item => !runtime.includes(item));
        if (!remaining.length && runtime.length) return;
        const results = await Promise.allSettled([
            nativeStudioClient.getResourceGraph(), remaining.some(item => item?.sessionId) ? nativeProductClient.listSessions() : Promise.resolve([]),
        ]);
        const nodes = results[0].status === 'fulfilled' ? results[0].value.nodes || [] : [];
        const sessions = results[1].status === 'fulfilled' ? results[1].value : [];
        const seen = new Set(); let rendered = 0;
        for (const item of remaining) {
            if (!item || typeof item !== 'object') continue;
            const key = JSON.stringify(item); if (seen.has(key)) continue; seen.add(key);
            if (item.sessionId) {
                const session = sessions.find(value => value.sessionId === item.sessionId), row = el(doc, 'article', 'atri-library-version', undefined, rows);
                el(doc, 'h5', '', session?.displayTitle || tl('Dependent Session'), row);
                el(doc, 'p', '', tl('Export progress you want to keep, then manage this Session in My Games. Deleting it is a separate confirmation.'), row);
                const packageId = session?.packageId || error.details?.packageId;
                if (packageId) action(doc, row, 'Manage Session in Library', () => {
                    const current = [...doc.querySelectorAll('[data-atria-session-id]')].find(node => node.dataset.atriaSessionId === item.sessionId);
                    if (current) { current.querySelector('details')?.setAttribute('open', ''); current.scrollIntoView?.({ block: 'start' }); current.tabIndex = -1; current.focus(); } else host?.openLibraryWork(packageId);
                });
                else action(doc, row, 'Open My Games', () => host?.openLibrarySection('works'));
                disclosure(doc, row, 'Exact reference', item); rendered++; continue;
            }
            const node = findNode(nodes, item);
            if (node) {
                const row = el(doc, 'div', '', undefined, rows);
                renderResourceReferenceRows({ document: doc, root: row, references: [{ node, edge: typeof item.edge === 'object' ? item.edge : { kind: item.edge || item.kind || 'references-exact' } }], host });
                const scope = String(node.scope || '').split('/')[0];
                el(doc, 'p', '', tl(scope === 'project' ? 'In Build, remove or replace the exact reference through Review and Apply.'
                    : scope === 'package' ? 'Installed originals are read-only. Fork for editing or manage the owning Work.'
                        : node.resourceType === 'core.world' ? 'Review World composition and revision history. Publish a replacement before deleting an unused earlier revision.'
                            : 'Review the resource bindings and dependencies. Exact revisions are never silently retargeted.'), row); rendered++;
            } else if (item.projectId) {
                action(doc, rows, 'Open reference owner in Build', () => host?.openBuild(item.projectId)); rendered++;
            }
        }
        if (!rendered && !runtime.length) {
            el(doc, 'p', '', tl('Open Library or Build to inspect the exact reference details below.'), rows);
            action(doc, rows, 'Open Library', () => host?.openLibrarySection('worlds'));
        }
        if (results.some(result => result.status === 'rejected')) {
            feedback(doc, rows, tl('Some reference names could not be loaded. Retry to resolve their owners.'), true);
            action(doc, rows, 'Retry reference lookup', load);
        }
    };
    await load(); disclosure(doc, section, 'Reference details', sanitizeProductDetails(error.details) || {});
    return section;
}

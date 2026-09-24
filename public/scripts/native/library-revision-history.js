import { resourceBundleExport } from './resource-bundle-controls.js';
import { nativeProductClient as client } from './product-client.js';
import { nativeStudioClient } from './studio-client.js';
import { createStudioNativeId } from './studio-authoring.js';
import { mountLibraryRevisionEditor } from './library-revision-editor.js';
import { el, action, disclosure, field, feedback } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function compareLibraryContent(before, after, knowledge = false) {
    const changes = [];
    function visit(left, right, path) {
        if (same(left, right)) return;
        if (object(left) && object(right)) {
            for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) visit(left[key], right[key], path ? path + '.' + key : key);
        } else changes.push({ path, before: left, after: right, kind: left === undefined ? 'Added' : right === undefined ? 'Removed' : 'Changed' });
    }
    if (knowledge) {
        const left = new Map((before.entries || []).map(item => [item.knowledgeEntryId, item]));
        const right = new Map((after.entries || []).map(item => [item.knowledgeEntryId, item]));
        for (const id of new Set([...left.keys(), ...right.keys()])) {
            const entry = right.get(id) || left.get(id); const name = entry.metadata?.title || entry.content?.slice(0, 60) || id;
            visit(left.get(id), right.get(id), tl('Knowledge entry') + ': ' + name);
        }
        visit([...left.keys()], [...right.keys()], 'Entry order'); visit(before.metadata, after.metadata, 'metadata');
    } else {
        for (const key of ['baseline', 'schema', 'metadata']) visit(before[key], after[key], key);
        for (const key of ['knowledgeBindingIds', 'assetIds']) {
            const left = new Set(before[key] || []), right = new Set(after[key] || []);
            for (const id of new Set([...left, ...right])) if (left.has(id) !== right.has(id)) changes.push({ path: key, before: left.has(id) ? id : undefined, after: right.has(id) ? id : undefined, kind: right.has(id) ? 'Added dependency' : 'Removed dependency' });
            if (left.size === right.size && [...left].every(id => right.has(id))) visit(before[key] || [], after[key] || [], key + ' order');
        }
    }
    return changes;
}

export function mountLibraryRevisionHistory({ document: doc, root, detail, knowledge, host, onReload }) {
    const resource = knowledge ? detail.knowledgeBase : detail.world;
    const resourceId = resource.knowledgeBaseId || resource.worldId;
    const kind = knowledge ? 'knowledge' : 'world';
    const section = el(doc, 'section', 'atri-library-section', undefined, root);
    section.dataset[knowledge ? 'atriaKnowledgeRevisionHistory' : 'atriaWorldRevisionHistory'] = 'true';
    el(doc, 'h3', '', tl('Revision history'), section);
    const workspace = el(doc, 'section', 'atri-library-section', undefined, section);
    workspace.hidden = true;
    for (const revision of [...detail.revisions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))) {
        const id = revision.worldRevisionId || revision.knowledgeRevisionId;
        const row = el(doc, 'article', 'atri-library-version', undefined, section); row.dataset.atriaRevisionId = id;
        el(doc, 'strong', '', tl(id === resource.currentRevisionId ? 'Current revision' : 'Earlier revision'), row);
        el(doc, 'span', 'atri-library-meta', revision.createdAt ? new Date(revision.createdAt).toLocaleString() : '—', row);
        disclosure(doc, row, 'Exact revision details', revision);
        resourceBundleExport(doc, row, { scope: 'library', resourceType: knowledge ? 'core.knowledge' : 'core.world', resourceId, revision: id }, resource.displayName);
        action(doc, row, 'Inspect revision', async () => {
            const selected = knowledge ? await client.getKnowledge(resourceId, id) : { ...detail, currentRevision: revision };
            const current = knowledge ? await client.getKnowledge(resourceId, resource.currentRevisionId) : detail;
            const names = knowledge ? new Map() : new Map((await nativeStudioClient.listLibraryResources()).map(item => [item.resourceId, item.displayName]));
            const content = item => knowledge ? { entries: item.entries, metadata: item.selectedRevision?.metadata || {} } : item.currentRevision || {};
            workspace.replaceChildren();
            workspace.hidden = false;
            el(doc, 'h4', '', tl('Changes from current revision'), workspace);
            el(doc, 'p', 'atri-library-meta', `${resource.currentRevisionId || '—'} → ${id}`, workspace);
            const changes = compareLibraryContent(content(current), content(selected), knowledge);
            if (!changes.length) el(doc, 'p', '', tl('No content changes'), workspace);
            for (const change of changes) {
                const row = el(doc, 'div', 'atri-library-version', undefined, workspace);
                const dependency = change.kind.endsWith('dependency') ? names.get(change.after || change.before) : null;
                el(doc, 'h4', '', tl(change.kind) + ' · ' + (dependency || tl(change.path)), row);
                disclosure(doc, row, 'Before', change.before === undefined ? '—' : change.before);
                disclosure(doc, row, 'After', change.after === undefined ? '—' : change.after);
            }
            action(doc, workspace, 'Create revision from this', () => {
                root.replaceChildren();
                mountLibraryRevisionEditor({ document: doc, root, detail: selected, knowledge, onClose: onReload, onSaved: onReload });
            });
            const promote = disclosure(doc, workspace, 'Make current revision');
            el(doc, 'p', '', tl('Only the Library head changes. Existing exact references keep their versions.'), promote);
            action(doc, promote, 'Confirm current revision', async () => {
                await client.promoteLibraryRevision(kind, resourceId, { revisionId: id, baseRevisionId: resource.currentRevisionId });
                promote.replaceChildren(); await onReload();
            }, { disabled: id === resource.currentRevisionId });
            const fork = disclosure(doc, workspace, 'Fork into Library');
            el(doc, 'p', '', tl('Create an independent resource from this exact revision. World dependency bindings remain shared.'), fork);
            const name = field(doc, fork, 'New resource name', resource.displayName + ' · ' + tl('Fork')); name.required = true;
            const forkResourceId = createStudioNativeId(knowledge ? 'kb' : 'world');
            action(doc, fork, 'Review fork', () => {
                if (!name.value.trim()) { name.reportValidity(); return; }
                const displayName = name.value.trim();
                const review = disclosure(doc, fork, 'Fork destination', { displayName, sourceRevision: id }); review.open = true;
                action(doc, review, 'Create fork', async () => {
                    const saved = await client.forkLibraryRevision(kind, resourceId, { revisionId: id, displayName, forkResourceId });
                    review.replaceChildren(); feedback(doc, review, tl('Saved'));
                    if (knowledge) host.openLibraryKnowledge(saved.knowledgeBaseId, displayName); else host.openLibraryWorld(saved.worldId, displayName);
                }, { primary: true });
            });
            workspace.scrollIntoView?.({ block: 'nearest' });
        });
    }
}

import { nativeProductClient as client } from './product-client.js';
import { createStudioNativeId } from './studio-authoring.js';
import { knowledgeFormControls } from './knowledge-form-controls.js';
import { normalizeKnowledgeDelivery } from './knowledge-contracts.js';
import { el, action, disclosure, feedback, confirmLibraryAction } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function mountKnowledgeBindingManager({ document: doc, root, detail, host }) {
    const list = el(doc, 'div', '', undefined, root);
    const workspace = el(doc, 'div', '', undefined, root);
    async function reload() {
        detail = await client.getKnowledge(detail.knowledgeBase.knowledgeBaseId);
        renderList();
    }
    function renderList() {
        list.replaceChildren();
        action(doc, list, 'Create binding', () => edit(), { disabled: !detail.revisions.length });
        if (!detail.revisions.length) el(doc, 'p', 'atri-library-meta', tl('Create a Knowledge revision before creating a binding.'), list);
        for (const item of detail.bindings) {
            const row = el(doc, 'article', 'atri-library-version', undefined, list);
            el(doc, 'h4', '', item.binding.metadata?.displayName || detail.knowledgeBase.displayName, row);
            el(doc, 'p', 'atri-library-meta', `${tl(item.binding.enabled ? 'Enabled' : 'Disabled')} · ${item.binding.mode}`, row);
            el(doc, 'p', 'atri-library-meta', item.binding.source.knowledgeRevisionId, row);
            action(doc, row, 'Manage binding', async () => edit(await client.getKnowledgeBinding(item.binding.knowledgeBindingId)));
        }
    }
    async function edit(existing) {
        const bases = await client.listKnowledge();
        const worlds = await client.listWorlds();
        let selectedBase = existing ? await client.getKnowledge(existing.binding.source.knowledgeBaseId) : detail;
        const draft = structuredClone(existing?.binding || { knowledgeBindingId: createStudioNativeId('kbind'), source: { kind: 'library', knowledgeBaseId: detail.knowledgeBase.knowledgeBaseId, knowledgeRevisionId: '' }, enabled: true, mode: 'augment', priority: 0, metadata: {} });
        workspace.replaceChildren(); list.hidden = true;
        const form = el(doc, 'section', 'atri-knowledge-fields', undefined, workspace);
        const status = el(doc, 'div', '', undefined, workspace);
        const { input, checkbox, renderTargets } = knowledgeFormControls(doc, render);
        const close = () => { workspace.replaceChildren(); list.hidden = false; };
        function render() {
            form.replaceChildren();
            el(doc, 'h4', '', tl(existing ? 'Edit binding' : 'Create binding'), form);
            input(form, 'Binding name', draft.metadata.displayName || '', value => { draft.metadata.displayName = value; });
            el(doc, 'p', 'atri-library-meta', tl('Source: Library'), form);
            const baseSelect = input(form, 'Knowledge Base', draft.source.knowledgeBaseId, async value => {
                draft.source.knowledgeBaseId = value; draft.source.knowledgeRevisionId = ''; baseSelect.disabled = true;
                try { selectedBase = await client.getKnowledge(value); render(); } catch (error) { selectedBase = { revisions: [] }; render(); feedback(doc, status, error.message, true); }
            }, 'text', bases.map(item => [item.knowledgeBase.knowledgeBaseId, item.knowledgeBase.displayName]));
            input(form, 'Exact Knowledge revision', draft.source.knowledgeRevisionId, value => { draft.source.knowledgeRevisionId = value; }, 'text', [['', 'Choose a revision'], ...selectedBase.revisions.map(revision => [revision.knowledgeRevisionId, new Date(revision.createdAt).toLocaleString() + ' · ' + revision.knowledgeRevisionId])]);
            checkbox(form, 'Enabled', draft.enabled, value => { draft.enabled = value; });
            input(form, 'Binding mode', draft.mode, value => { draft.mode = value; }, 'text', ['augment', 'override']);
            input(form, 'Priority', draft.priority ?? 0, value => { draft.priority = value === '' ? NaN : Number(value); }, 'number').step = 'any';
            renderTargets(form, draft);
            if (existing) usedBy(form, existing);
            action(doc, form, 'Cancel', close);
            action(doc, form, 'Review binding', () => {
                if (!draft.source.knowledgeRevisionId) throw new Error(tl('Choose a revision'));
                normalizeKnowledgeDelivery({ target: draft.target, visibility: draft.visibility, priority: draft.priority });
                form.hidden = true; status.replaceChildren();
                const review = el(doc, 'section', '', undefined, status);
                el(doc, 'p', '', tl('Binding changes affect future resolutions. Installed works and sessions keep their snapshots.'), review);
                const data = disclosure(doc, review, 'Review binding', draft); data.open = true;
                action(doc, review, 'Back to editing', () => { status.replaceChildren(); form.hidden = false; });
                action(doc, review, 'Save binding', async () => {
                    review.inert = true;
                    try {
                        await client.saveKnowledgeBinding(draft.knowledgeBindingId, { binding: draft, expectedIntegrity: existing?.integrity ?? null });
                        review.replaceChildren(); close(); await reload();
                    } finally { review.inert = false; }
                }, { primary: true });
            }, { primary: true });
            if (existing) {
                const attachments = disclosure(doc, form, 'Attach / detach Worlds');
                el(doc, 'p', 'atri-library-meta', tl('Each attachment change creates a World revision. Historical references remain protected.'), attachments);
                for (const { world, currentRevision } of worlds) {
                    const attached = currentRevision?.knowledgeBindingIds.includes(draft.knowledgeBindingId) || false;
                    const row = el(doc, 'div', 'atri-library-version', undefined, attachments);
                    el(doc, 'h4', '', world.displayName, row);
                    action(doc, row, attached ? 'Detach binding' : 'Attach binding', async () => {
                        const review = disclosure(doc, row, 'Review World revision', { world: world.displayName, baseRevision: world.currentRevisionId, action: tl(attached ? 'Detach binding' : 'Attach binding') }); review.open = true;
                        action(doc, review, 'Save World revision', async () => {
                            await client.attachKnowledgeBinding(draft.knowledgeBindingId, world.worldId, { baseRevisionId: world.currentRevisionId, attached: !attached });
                            review.replaceChildren(); await edit(await client.getKnowledgeBinding(draft.knowledgeBindingId)); await reload();
                        });
                    });
                }
                action(doc, form, 'Delete binding', async () => {
                    if (!await confirmLibraryAction('Delete this Library binding?')) return;
                    await client.deleteKnowledgeBinding(draft.knowledgeBindingId, existing.integrity); close(); await reload();
                }, { danger: true, disabled: existing.references.length > 0 });
            }
        }
        render();
    }
    function usedBy(parent, existing) {
        const refs = disclosure(doc, parent, 'Used By'); refs.open = true;
        if (!existing.references.length) el(doc, 'p', '', tl('No references'), refs);
        else el(doc, 'p', '', tl('Referenced bindings cannot be deleted. Historical World revisions also protect their bindings.'), refs);
        for (const reference of existing.references) {
            const row = el(doc, 'div', 'atri-library-version', undefined, refs);
            el(doc, 'p', '', reference.displayName || reference.projectId || reference.worldId, row);
            if (reference.kind === 'world-revision') {
                el(doc, 'p', 'atri-library-meta', `${tl(reference.current ? 'Current revision' : 'Historical revision')} · ${reference.worldRevisionId}`, row);
                action(doc, row, 'Open World', () => host.openLibraryWorld(reference.worldId, reference.displayName));
            } else if (reference.kind === 'studio-project') action(doc, row, 'Open in Build', () => host.openBuild(reference.projectId, reference.displayName));
        }
    }
    renderList();
}

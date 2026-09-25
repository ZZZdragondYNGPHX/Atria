import { mountWorldEditor } from './world-editor.js';
import { mountKnowledgeEditor } from './knowledge-editor.js';
import { createStudioNativeId } from './studio-authoring.js';
import { nativeProductClient as client } from './product-client.js';
import { el, action, heading, disclosure, feedback, libraryError } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function mountLibraryRevisionEditor({ document: doc, root, detail, knowledge, initialEntryId, entryEnabled, entryAction, browseState, onClose, onSaved }) {
    const resource = knowledge ? detail.knowledgeBase : detail.world;
    const revision = knowledge ? detail.selectedRevision : detail.currentRevision;
    const baseRevisionId = resource.currentRevisionId;
    const value = knowledge ? { entries: revision ? structuredClone(detail.entries) : entryAction === 'add' ? [] : [{ knowledgeEntryId: createStudioNativeId('kentry'), content: '' }], metadata: structuredClone(revision?.metadata || {}) }
        : { schema: structuredClone(revision?.schema || {}), baseline: structuredClone(revision?.baseline || {}), knowledgeBindingIds: [...(revision?.knowledgeBindingIds || [])], assetIds: [...(revision?.assetIds || [])], metadata: structuredClone(revision?.metadata || {}) };
    if (knowledge && typeof entryEnabled === 'boolean') value.entries.find(entry => entry.knowledgeEntryId === initialEntryId).enabled = entryEnabled;
    if (knowledge && entryAction === 'add') {
        initialEntryId = createStudioNativeId('kentry');
        value.entries.push({ knowledgeEntryId: initialEntryId, content: '', metadata: { title: tl('Knowledge entry') } });
    }
    const section = el(doc, 'section', 'atri-library-section atri-library-revision-editor', undefined, root);
    heading(doc, section, resource.displayName, tl('Create an immutable revision. Existing exact references keep their original revision.'), true);
    disclosure(doc, section, 'Editing base revision', { resourceId: resource.knowledgeBaseId || resource.worldId, revisionId: baseRevisionId });
    const close = action(doc, section, 'Back to resource', onClose);
    const editor = el(doc, 'div', '', undefined, section);
    const review = el(doc, 'section', 'atri-library-section', undefined, section); review.hidden = true;
    const mountEditor = knowledge ? mountKnowledgeEditor : mountWorldEditor;
    mountEditor({ document: doc, root: editor, value, initialEntryId, initialAction: entryAction, openEntry: entryEnabled === undefined, browseState, label: knowledge ? 'Knowledge revision JSON' : 'World revision JSON',
        onReview: (draft, { dependencies = [] } = {}) => {
            editor.hidden = true; review.hidden = false; review.replaceChildren();
            el(doc, 'h3', '', tl('Review revision'), review);
            el(doc, 'p', '', tl('Saving creates a new revision and moves the Library head. It does not update existing bindings, Projects or Sessions.'), review);
            for (const item of dependencies) {
                const row = el(doc, 'div', 'atri-library-version', undefined, review);
                el(doc, 'h4', '', item.name, row); el(doc, 'p', 'atri-library-meta', item.exact || tl('Project-owned source'), row);
            }
            const content = disclosure(doc, review, 'Revision content', draft); content.open = true;
            const back = action(doc, review, 'Back to editing', () => { review.hidden = true; editor.hidden = false; editor.querySelector('button')?.focus(); });
            const save = action(doc, review, 'Save immutable revision', async () => {
                close.disabled = back.disabled = true;
                try {
                    const input = { baseRevisionId, content: draft };
                    const saved = await (knowledge ? client.commitKnowledgeRevision(resource.knowledgeBaseId, input) : client.commitWorldRevision(resource.worldId, input));
                    save.remove(); back.remove();
                    await onSaved(saved);
                } catch (error) { feedback(doc, review, libraryError(error), true); } finally { close.disabled = back.disabled = false; }
            }, { primary: true });
            save.focus();
        },
    });
}

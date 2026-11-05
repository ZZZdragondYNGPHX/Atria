import { removeKnowledgeEntryFromDraft } from './knowledge-contracts.js';
import { confirmAtriaDraftLeave } from '../atria-shell/workspace-leave-guard.js';
import { mountWorldEditor } from './world-editor.js';
import { mountKnowledgeEditor } from './knowledge-editor.js';
import { createStudioNativeId } from './studio-authoring.js';
import { nativeProductClient as client } from './product-client.js';
import { el, action, heading, disclosure, feedback, libraryError } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function mountLibraryRevisionEditor({ document: doc, root, detail, knowledge, initialEntryId, entryEnabled, entryAction, browseState, onClose, onSaved, saveRevision, dependentWorlds = [] }) {
    const resource = knowledge ? detail.knowledgeBase : detail.world;
    const revision = knowledge ? detail.selectedRevision : detail.currentRevision;
    const baseRevisionId = resource.currentRevisionId;
    const value = knowledge ? { entries: revision ? structuredClone(detail.entries) : entryAction === 'add' ? [] : [{ knowledgeEntryId: createStudioNativeId('kentry'), content: '' }], metadata: structuredClone(revision?.metadata || {}) }
        : { knowledgeBindingIds: [...(revision?.knowledgeBindingIds || [])], assetIds: [...(revision?.assetIds || [])], metadata: structuredClone(revision?.metadata || {}) };
    if (!knowledge) for (const key of ['body', 'context', 'annotations', 'delivery', 'subjects', 'schema', 'baseline', 'knowledgeBindings']) if (revision?.[key] !== undefined) value[key] = structuredClone(revision[key]);
    if (knowledge && typeof entryEnabled === 'boolean') value.entries.find(entry => entry.knowledgeEntryId === initialEntryId).enabled = entryEnabled;
    if (knowledge && entryAction === 'add') {
        initialEntryId = createStudioNativeId('kentry');
        value.entries.push({ knowledgeEntryId: initialEntryId, content: '', metadata: { title: tl('Knowledge entry') } });
    }
    const section = el(doc, 'section', 'atri-library-section atri-library-revision-editor', undefined, root);
    heading(doc, section, resource.displayName, tl(saveRevision ? 'Edit this Work source. Existing stories keep their resources until you choose an update.' : 'Create an immutable revision. Existing exact references keep their original revision.'), true);
    if (dependentWorlds.length) {
        const affected = disclosure(doc, section, 'Dependent Worlds');
        for (const world of dependentWorlds) el(doc, 'p', '', world.displayName, affected);
    }
    disclosure(doc, section, 'Editing base revision', { resourceId: resource.knowledgeBaseId || resource.worldId, revisionId: baseRevisionId });
    const close = action(doc, section, 'Back to resource', () => { if (confirmAtriaDraftLeave(doc, section)) return onClose(); });
    const editor = el(doc, 'div', '', undefined, section);
    const status = el(doc, 'div', '', undefined, section);
    const mountEditor = knowledge ? mountKnowledgeEditor : mountWorldEditor;
    const save = async draft => {
        close.disabled = true; status.replaceChildren();
        try {
            const input = { baseRevisionId, content: draft };
            const saved = await (saveRevision ? saveRevision(input) : knowledge ? client.commitKnowledgeRevision(resource.knowledgeBaseId, input) : client.commitWorldRevision(resource.worldId, input));
            section.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
            editor.inert = true;
            feedback(doc, status, tl('Saved immutable Library revision.'));
            try { await onSaved(saved); } catch (error) {
                feedback(doc, status, tl('Saved. The view could not be refreshed.') + ' ' + libraryError(error), true);
                action(doc, status, 'Try again', () => onSaved(saved));
            }
        } finally { close.disabled = false; }
    };
    if (knowledge && (entryAction === 'delete' || typeof entryEnabled === 'boolean')) {
        if (entryAction === 'delete') removeKnowledgeEntryFromDraft(value, initialEntryId);
        const run = () => save(value).catch(error => { feedback(doc, status, libraryError(error), true); action(doc, status, 'Try again', run); });
        void run();
    } else mountEditor({ document: doc, root: editor, value, worldId: resource.worldId, initialEntryId, initialAction: entryAction, openEntry: entryEnabled === undefined, browseState, label: knowledge ? 'Knowledge revision JSON' : 'World revision JSON', onReview: save });
}

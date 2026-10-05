import { formatShellText as formatProductText } from '../atria-shell/localization.js';
import { knowledgeFormControls } from './knowledge-form-controls.js';
import { mountKnowledgeEntryBrowser } from './knowledge-entry-browser.js';
import { createStudioNativeId } from './studio-authoring.js';
import { KNOWLEDGE_DELIVERY_POSITIONS, KNOWLEDGE_CONDITION_LOGIC, KNOWLEDGE_CONDITION_OPERATORS, validateKnowledgeEditorValue } from './knowledge-contracts.js';
import { el, action, disclosure, feedback, confirmLibraryAction } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

const clone = value => structuredClone(value);
const entryName = (entry, index) => entry.metadata?.title || entry.metadata?.label || entry.content?.split('\n')[0].slice(0, 60) || tl('Knowledge entry') + ' ' + (index + 1);
const lines = value => value.split('\n').filter(item => item.length > 0);
// An absent section becomes part of the draft only after an explicit field edit.
function sectionDraft(entry, key) {
    if (entry[key] !== undefined) return entry[key];
    return new Proxy({}, {
        get(target, name) { return (entry[key] || target)[name]; },
        set(target, name, value) { const section = entry[key] || target; section[name] = value; entry[key] = section; return true; },
        deleteProperty(target, name) { delete (entry[key] || target)[name]; return true; },
    });
}

/** Edits one detached revision draft; only onReview can hand it to an owner. */
export function mountKnowledgeEditor({ document: doc, root, value, initialEntryId, initialAction, openEntry = true, browseState = {}, label = 'Knowledge revision JSON', onReview, confirmDelete = confirmLibraryAction, validate = () => {}, isCurrent = () => true }) {
    let draft = clone(value), disposed = false, submitting = false, generation = 0;
    let selected = Math.max(0, draft.entries.findIndex(entry => entry.knowledgeEntryId === initialEntryId)); let editing = Boolean(initialEntryId) && openEntry; let entryFields; let browser;
    let advanced = false; let source = ''; let openSections = new Set(['Discovery', 'Delivery', 'Lifecycle']);
    const shell = el(doc, 'section', 'atri-knowledge-editor', undefined, root);
    const initialDraft = JSON.stringify(draft);
    const current = () => !disposed && root.contains(shell) && isCurrent();
    const trackDraft = () => queueMicrotask(() => { shell.dataset.atriaDraftDirty = String(JSON.stringify(draft) !== initialDraft || (advanced && source !== JSON.stringify(draft, null, 2))); });
    for (const event of ['input', 'change', 'click']) shell.addEventListener(event, trackDraft);
    const controls = el(doc, 'div', 'atri-library-actions', undefined, shell);
    const fields = el(doc, 'div', 'atri-knowledge-fields', undefined, shell);
    const status = el(doc, 'div', '', undefined, shell);
    function showError(error) { status.replaceChildren(); feedback(doc, status, error.message, true); }
    function rememberSections() { openSections = new Set([...fields.querySelectorAll('details[open][data-section]')].map(item => item.dataset.section)); }
    function changeView() { rememberSections(); render(); }
    function syncEntryIds() { if (draft.revision) draft.revision.entryIds = draft.entries.map(entry => entry.knowledgeEntryId); }
    function group(name) {
        const node = disclosure(doc, entryFields, name); node.dataset.section = name; node.open = openSections.has(name);
        return el(doc, 'div', 'atri-knowledge-parameter-fields', undefined, node);
    }
    const { input, checkbox, numeric, renderTargets: targets } = knowledgeFormControls(doc, changeView);
    const renderTargets = (parent, entry) => targets(parent, sectionDraft(entry, 'delivery'));
    function updateTitle(select, entry) { select.options[selected].textContent = entryName(entry, selected) + ' · ' + entry.knowledgeEntryId; browser.refresh(); }
    async function deleteSelectedEntry() {
        const entry = draft.entries[selected];
        const owners = draft.entries.filter(other => other.knowledgeEntryId !== entry.knowledgeEntryId && ['requiredEntryIds', 'relatedEntryIds'].some(key => other.relations?.[key]?.includes(entry.knowledgeEntryId)));
        if (owners.length) { showError(new Error(tl('Remove references from these entries before deleting:') + ' ' + owners.map(item => entryName(item, draft.entries.indexOf(item))).join(', '))); return; }
        const sequence = generation;
        if (!await confirmDelete('Remove this entry from the draft revision?') || !current() || sequence !== generation || draft.entries[selected] !== entry || submitting) return;
        draft.entries.splice(selected, 1); syncEntryIds(); selected = Math.max(0, selected - 1); changeView();
    }
    function renderConditions(parent, entry) {
        const applicability = sectionDraft(entry, 'applicability');
        const conditions = applicability.stateConditions || [];
        input(parent, 'Condition matching', applicability.stateConditionsLogic || 'all', value => { applicability.stateConditionsLogic = value; }, 'text', KNOWLEDGE_CONDITION_LOGIC);
        const activate = checkbox(parent, 'Activate from matching state without keywords', applicability.stateActivation === true, value => { applicability.stateActivation = value; }); activate.disabled = !conditions.length;
        conditions.forEach((condition, index) => {
            const row = el(doc, 'div', 'atri-knowledge-rule', undefined, parent);
            el(doc, 'h4', '', tl('State condition') + ' ' + (index + 1), row);
            input(row, formatProductText('State provider ${0}', [index + 1]), condition.providerId, value => { condition.providerId = value; });
            input(row, formatProductText('State path segments ${0}', [index + 1]), Array.isArray(condition.path) ? condition.path.join('\n') : '', value => { condition.path = lines(value); }, 'textarea');
            el(doc, 'p', 'atri-library-meta', tl('Enter one exact state path segment per line.'), row);
            input(row, formatProductText('Comparison ${0}', [index + 1]), condition.operator || 'eq', value => { condition.operator = value; }, 'text', KNOWLEDGE_CONDITION_OPERATORS);
            const type = condition.value === null ? 'null' : typeof condition.value;
            input(row, formatProductText('Value type ${0}', [index + 1]), type, value => { condition.value = ({ string: '', number: 0, boolean: false, null: null })[value]; changeView(); }, 'text', ['string', 'number', 'boolean', 'null']);
            if (type === 'boolean') checkbox(row, formatProductText('Expected value ${0}', [index + 1]), condition.value, value => { condition.value = value; });
            else if (type !== 'null') {
                const node = input(row, formatProductText('Expected value ${0}', [index + 1]), condition.value, value => { condition.value = type === 'number' ? (value === '' ? undefined : Number(value)) : value; }, type === 'number' ? 'number' : 'text');
                if (type === 'number') { node.required = true; node.step = 'any'; }
            }
            action(doc, row, 'Remove condition', () => { conditions.splice(index, 1); if (!conditions.length) applicability.stateActivation = false; changeView(); });
        });
        action(doc, parent, 'Add state condition', () => { applicability.stateConditions = conditions; conditions.push({ providerId: 'atri_variables', path: [], operator: 'eq', value: '' }); changeView(); }, { disabled: conditions.length >= 32 });
    }
    function renderRelations(parent, entry) {
        const relations = sectionDraft(entry, 'relations');
        for (const [key, caption] of [['requiredEntryIds', 'Required entries'], ['relatedEntryIds', 'Related entries']]) {
            el(doc, 'h4', '', tl(caption), parent);
            for (const [index, other] of draft.entries.entries()) {
                if (other.knowledgeEntryId === entry.knowledgeEntryId) continue;
                checkbox(parent, entryName(other, index), relations[key]?.includes(other.knowledgeEntryId) || false, checked => {
                    const values = new Set(relations[key] || []); if (checked) values.add(other.knowledgeEntryId); else values.delete(other.knowledgeEntryId); relations[key] = [...values];
                });
            }
            for (const missing of (relations[key] || []).filter(id => !draft.entries.some(item => item.knowledgeEntryId === id))) {
                checkbox(parent, tl('Unavailable entry') + ' · ' + missing, true, () => { relations[key] = relations[key].filter(id => id !== missing); changeView(); });
            }
        }
        input(parent, 'Exclusive group', relations.exclusiveGroup || '', value => { if (value) relations.exclusiveGroup = value; else delete relations.exclusiveGroup; });
    }
    function render() {
        generation++;
        trackDraft();
        controls.replaceChildren(); fields.replaceChildren(); status.replaceChildren();
        action(doc, controls, advanced ? 'Fields' : 'Source', () => {
            try {
                if (advanced) { const parsed = JSON.parse(source); validateKnowledgeEditorValue(parsed, { complete: true }); validate(parsed); const id = draft.entries[selected]?.knowledgeEntryId; draft = parsed; selected = Math.max(0, draft.entries.findIndex(entry => entry.knowledgeEntryId === id)); } else { rememberSections(); source = JSON.stringify(draft, null, 2); }
                advanced = !advanced; render();
            } catch (error) { showError(error); }
        });
        if (advanced) input(fields, label, source, value => { source = value; }, 'textarea');
        else {
            if (draft.knowledgeBase) {
                const identity = disclosure(doc, fields, 'Knowledge identity'); identity.open = true;
                el(doc, 'p', 'atri-library-meta', draft.knowledgeBase.knowledgeBaseId, identity);
                input(identity, 'Knowledge name', draft.knowledgeBase.displayName, value => { draft.knowledgeBase.displayName = value; });
                el(doc, 'p', 'atri-library-meta', tl('Project edits do not publish Library revisions or change existing Sessions.'), identity);
            }
            action(doc, controls, 'Add entry', () => { draft.entries.push({ knowledgeEntryId: createStudioNativeId('kentry'), content: '', metadata: { title: tl('Knowledge entry') + ' ' + (draft.entries.length + 1) } }); syncEntryIds(); selected = draft.entries.length - 1; editing = true; changeView(); fields.querySelector('[aria-label="' + tl('Entry title') + '"]')?.focus(); });
            browser = mountKnowledgeEntryBrowser({ document: doc, root: fields, entries: draft.entries, state: browseState,
                onEdit: (entry, index) => { selected = index; editing = true; changeView(); entryFields.querySelector('summary')?.focus(); },
                onToggle: (entry, enabled) => { entry.enabled = enabled; browser.refresh(); },
            });
            if (!draft.entries.length) el(doc, 'p', 'atri-library-meta', tl('No entries. Add an entry to begin this revision.'), fields);
            else {
                selected = Math.min(selected, draft.entries.length - 1); const entry = draft.entries[selected];
                entryFields = disclosure(doc, fields, 'Edit entry'); entryFields.open = editing;
                entryFields.addEventListener('toggle', () => { if (entryFields.isConnected) editing = entryFields.open; });
                const select = input(entryFields, 'Selected entry', entry.knowledgeEntryId, value => { selected = draft.entries.findIndex(item => item.knowledgeEntryId === value); changeView(); }, 'text', draft.entries.map((item, index) => [item.knowledgeEntryId, entryName(item, index) + ' · ' + item.knowledgeEntryId, true]));
                const tools = el(doc, 'div', 'atri-library-actions', undefined, entryFields);
                action(doc, tools, 'Back to entries', () => { editing = false; entryFields.open = false; browser.focus(entry.knowledgeEntryId); });
                for (const [caption, offset] of [['Move entry up', -1], ['Move entry down', 1]]) action(doc, tools, caption, () => { const next = selected + offset; [draft.entries[selected], draft.entries[next]] = [draft.entries[next], draft.entries[selected]]; syncEntryIds(); selected = next; changeView(); }, { disabled: selected + offset < 0 || selected + offset >= draft.entries.length });
                action(doc, tools, 'Delete entry', () => deleteSelectedEntry(), { danger: true });
                checkbox(entryFields, 'Enabled', entry.enabled !== false, enabled => { entry.enabled = enabled; browser.refresh(); });
                input(entryFields, 'Entry title', entry.metadata?.title || entry.metadata?.label || '', value => { (entry.metadata ||= {}).title = value; updateTitle(select, entry); });
                input(entryFields, 'Entry content', entry.content, value => { entry.content = value; updateTitle(select, entry); }, 'textarea');
                const discovery = group('Discovery'); const discoveryValue = sectionDraft(entry, 'discovery');
                for (const [key, caption] of [['keywords', 'Keywords'], ['aliases', 'Aliases'], ['regex', 'Regular expressions']]) input(discovery, caption, (discoveryValue[key] || []).join('\n'), value => { discoveryValue[key] = lines(value); }, 'textarea');
                el(doc, 'p', 'atri-library-meta', tl('Enter one discovery term per line. No terms means always eligible after applicability checks.'), discovery);
                el(doc, 'p', 'atri-library-meta', tl('Regular expressions accept a pattern or /pattern/imsu flags.'), discovery);
                renderConditions(group('Applicability'), entry);
                const lifecycle = group('Lifecycle'); const lifecycleValue = sectionDraft(entry, 'lifecycle');
                numeric(lifecycle, 'Activation probability (%)', lifecycleValue.probability ?? 100, value => { lifecycleValue.probability = value; }, 100, 'any');
                for (const [key, caption] of [['sticky', 'Sticky turns'], ['cooldown', 'Cooldown turns'], ['delay', 'Delay turns']]) numeric(lifecycle, caption, lifecycleValue[key] ?? 0, value => { lifecycleValue[key] = value; });
                renderRelations(group('Relations'), entry);
                const delivery = group('Delivery'); const deliveryValue = sectionDraft(entry, 'delivery');
                input(delivery, 'Delivery position', deliveryValue.position || 'before', value => { deliveryValue.position = value; }, 'text', KNOWLEDGE_DELIVERY_POSITIONS);
                const priority = input(delivery, 'Delivery priority', deliveryValue.priority ?? 100, value => { deliveryValue.priority = value === '' ? null : Number(value); }, 'number'); priority.required = true; priority.step = 'any';
                renderTargets(delivery, entry);
                input(delivery, 'Budget priority', entry.metadata?.budgetTier || 'normal', value => { (entry.metadata ||= {}).budgetTier = value; }, 'text', ['critical', 'scene', 'normal', 'optional']);
                input(delivery, 'Compact content', entry.metadata?.compactContent || '', value => { (entry.metadata ||= {}).compactContent = value; }, 'textarea');
                disclosure(doc, entryFields, 'Exact entry identity', { knowledgeEntryId: entry.knowledgeEntryId });
            }
        }
        action(doc, controls, 'Review Changes', async () => {
            if (submitting || !current()) return;
            try {
                const next = advanced ? JSON.parse(source) : clone(draft);
                const invalid = [...fields.querySelectorAll('input,select,textarea')].find(node => !node.checkValidity());
                if (invalid) { for (let parent = invalid.parentElement; parent && parent !== fields; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true; invalid.reportValidity(); return; }
                validateKnowledgeEditorValue(next, { complete: true });
                if (!advanced && next.revision) next.revision.entryIds = next.entries.map(entry => entry.knowledgeEntryId);
                validate(next);
                submitting = true; shell.inert = true; await onReview(clone(next));
            } catch (error) { if (current()) showError(error); } finally { submitting = false; shell.inert = false; }
        }, { primary: true });
    }
    render();
    if (initialAction === 'delete') queueMicrotask(() => { void deleteSelectedEntry().catch(showError); });
    return { getDraft: () => clone(draft), getSource: () => advanced ? source : JSON.stringify(draft, null, 2), dispose: () => { disposed = true; generation++; } };
}

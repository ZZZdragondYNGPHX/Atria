import { mountPromptQuality } from './prompt-quality.js';
import { confirmAtriaDraftLeave } from '../atria-shell/workspace-leave-guard.js';
import { mountStudioRuntimeEditor } from './studio-runtime-editor.js';
import { formatShellText as formatProductText } from '../atria-shell/localization.js';
import { referenceRemediation, confirmLibraryAction } from './library-ui.js';
import { resourceBundleExport, mountResourceBundleImport } from './resource-bundle-controls.js';
import { mountPromptCondition, mountPromptParameters, mountPromptDerive } from './prompt-semantics.js';
import { renderResourceReferenceRows } from './resource-reference-rows.js';
import { formatShellText, translateShellText } from '../atria-shell/localization.js';
import { createStudioNativeId } from './studio-authoring.js';
import { runtimeRequest } from './runtime-client.js';
import { nativeStudioClient } from './studio-client.js';
import { promptStageEntries, promptStageModuleRefs, promptProgramResourceRefs, mapPromptStageRefs } from '../../shared/prompt-module-order.js';
import { NATIVE_GENERATION_DEFAULTS as generationDefaults } from '../../shared/native-generation-defaults.js';
import { mountPromptUpgrade } from './prompt-upgrade.js';
import { mountPromptSamplePreview } from './prompt-sample-preview.js';

export const PROMPT_TYPES = Object.freeze({
    'core.prompt-program': ['Prompt Programs', 'promptProgramId', 'pprog'],
    'core.prompt-module': ['Prompt Modules', 'promptModuleId', 'pmod'],
    'core.generation-profile': ['Generation Profiles', 'generationProfileId', 'genprof'],
});
const clone = value => JSON.parse(JSON.stringify(value));
export const exactKey = ref => JSON.stringify(ref, Object.keys(ref).sort());
const CONTEXT_SOURCES = [['context.fact', 'Facts'], ['context.history', 'History'], ['context.input', 'Input'], ['context.player-persona', 'Player persona'], ['context.directive', 'Host instructions']];

export function newPromptResource(type) {
    const [, id, prefix] = PROMPT_TYPES[type];
    return { schemaVersion: 1, [id]: createStudioNativeId(prefix), revision: createStudioNativeId('rev'), displayName: 'Untitled',
        ...(type === 'core.prompt-module' ? { target: 'system.foundation', stages: ['stage.main'], body: '' } : {}),
        ...(type === 'core.prompt-program' ? { stages: [{ stageId: 'stage.main', moduleRefs: [] }], responseDirective: {} } : {}),
        ...(type === 'core.generation-profile' ? { output: { maxTokens: generationDefaults.outputTokens }, streaming: { enabled: generationDefaults.streaming } } : {}),
    };
}
export function resourceRef(type, resource, scope) {
    return { resourceType: type, resourceId: resource[PROMPT_TYPES[type][1]], revision: resource.revision, ...scope };
}
function element(doc, tag, text, parent) {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = tag === 'pre' ? text : translateShellText(text);
    parent?.append(node);
    return node;
}
function action(doc, parent, label, handler) {
    const button = element(doc, 'button', label, parent); button.type = 'button'; button.className = 'atria-studio-action';
    button.addEventListener('click', handler); return button;
}
function input(doc, parent, label, value, multiline = false) {
    const wrapper = element(doc, 'label', label, parent);
    const node = element(doc, multiline ? 'textarea' : 'input', undefined, wrapper);
    node.setAttribute('aria-label', translateShellText(label)); if (!multiline) node.type = 'text'; node.value = value ?? ''; return node;
}
function select(doc, parent, label, options, value = '') {
    const wrapper = element(doc, 'label', label, parent); const node = element(doc, 'select', undefined, wrapper);
    node.setAttribute('aria-label', translateShellText(label));
    for (const [key, name, literal] of options) { const option = element(doc, 'option', undefined, node); option.textContent = literal ? name : translateShellText(name); option.value = key; }
    if (value && !options.some(([key]) => key === value)) { const option = element(doc, 'option', undefined, node); option.textContent = String(value) + ' (' + translateShellText('retained') + ')'; option.value = value; }
    node.value = value; return node;
}
function error(doc, parent, value) {
    const node = element(doc, 'p', value?.message || String(value), parent); node.setAttribute('role', 'alert'); node.tabIndex = -1; node.focus();
    if (value?.promptSection?.isConnected) {
        for (let el = value.promptSection; el; el = el.parentElement) if (el.tagName === 'DETAILS') el.open = true;
        (value.promptSection.querySelector(':invalid') || value.promptSection.querySelector('input, select, textarea, summary'))?.focus();
    }
    void referenceRemediation(doc, parent, value);
}

function generationFields(doc, fields, draft, isTracking = () => false) {
    const numeric = (label, value, min, max, integer = false) => {
        const field = input(doc, fields, label, value); field.type = 'number'; field.min = min; field.step = integer ? '1' : 'any';
        if (max !== undefined) field.max = max;
        return field;
    };
    const max = numeric('Maximum output tokens', draft.output?.maxTokens || generationDefaults.outputTokens, 1, undefined, true); max.required = true;
    let maxEdited = false; max.addEventListener('input', () => { maxEdited = true; });
    const temperature = numeric('Temperature', draft.sampling?.temperature ?? '', 0);
    const topP = numeric('Top P (optional)', draft.sampling?.topP ?? '', 0, 1);
    const stream = select(doc, fields, 'Streaming', [['', 'Default'], ['true', 'Enabled'], ['false', 'Disabled']], draft.streaming?.enabled === undefined ? '' : String(draft.streaming.enabled));
    const stop = input(doc, fields, 'Stop sequences (JSON array)', JSON.stringify(draft.stop?.sequences || []));
    const tools = select(doc, fields, 'Tool choice', [['', 'Host default'], ['auto', 'Auto'], ['none', 'None'], ['required', 'Required'], ['tool', 'Named tool']], draft.toolChoice?.value || '');
    const toolName = input(doc, fields, 'Tool name', draft.toolChoice?.name || '');
    const updateTool = () => { toolName.parentElement.hidden = tools.value !== 'tool'; }; tools.addEventListener('change', updateTool); updateTool();
    element(doc, 'p', 'Use only controls supported by the selected route. OpenAI uses effort and cache key; Anthropic uses thinking mode and ephemeral cache; Gemini uses thinking budget or level. Unsupported combinations fail preview.', fields);
    const definitions = [
        ['reasoning', 'mode', 'Thinking mode (Anthropic)', [['adaptive', 'Adaptive'], ['enabled', 'Token budget'], ['disabled', 'Disabled']]],
        ['reasoning', 'effort', 'Reasoning effort (OpenAI / Anthropic adaptive)', ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(item => [item, item])],
        ['reasoning', 'level', 'Thinking level (Gemini)', ['minimal', 'low', 'medium', 'high'].map(item => [item, item])],
        ['cache', 'key', 'Cache key (OpenAI)'],
        ['cache', 'retention', 'Cache retention (OpenAI)', [['in_memory', 'In memory'], ['24h', '24 hours']]],
        ['cache', 'mode', 'Cache mode (Anthropic)', [['ephemeral', 'Ephemeral']]],
        ['cache', 'ttl', 'Cache lifetime (Anthropic)', [['5m', '5 minutes'], ['1h', '1 hour']]],
    ];
    const controls = definitions.map(([section, key, label, choices]) => ({ section, key,
        field: choices ? select(doc, fields, label, [['', 'Default'], ...choices], draft[section]?.[key] || '') : input(doc, fields, label, draft[section]?.[key] || '') }));
    const budget = numeric('Thinking budget tokens (Anthropic / Gemini)', draft.reasoning?.budgetTokens ?? '', -1, undefined, true);
    return () => {
        for (const field of [max, temperature, topP, budget]) if (!field.checkValidity()) { if (!isTracking()) { field.reportValidity(); field.focus(); } throw new Error(translateShellText('Check the numeric limits.')); }
        let sequences;
        try { sequences = JSON.parse(stop.value); if (!Array.isArray(sequences) || sequences.some(item => typeof item !== 'string')) throw new Error(); } catch { if (!isTracking()) stop.focus(); throw new Error(translateShellText('Enter a JSON array of text strings.')); }
        const result = { output: { ...draft.output, maxTokens: Number(max.value) }, sampling: { ...draft.sampling }, streaming: { ...draft.streaming },
            stop: { ...draft.stop, sequences }, reasoning: { ...draft.reasoning }, cache: { ...draft.cache }, toolChoice: tools.value ? { ...draft.toolChoice, value: tools.value } : {} };
        if (draft.output?.maxTokens === undefined && !maxEdited && Number(max.value) === generationDefaults.outputTokens) delete result.output.maxTokens;
        if (draft.stop?.sequences === undefined && !sequences.length) delete result.stop.sequences;
        if (stream.value === '') delete result.streaming.enabled;
        else if (['true', 'false'].includes(stream.value)) result.streaming.enabled = stream.value === 'true';
        else throw new Error(translateShellText('Choose a supported streaming option.'));
        if (tools.value === 'tool') result.toolChoice.name = toolName.value; else delete result.toolChoice.name;
        for (const [key, field] of [['temperature', temperature], ['topP', topP]]) { if (field.value === '') delete result.sampling[key]; else result.sampling[key] = Number(field.value); }
        if (budget.value === '') delete result.reasoning.budgetTokens; else result.reasoning.budgetTokens = Number(budget.value);
        for (const { section, key, field } of controls) { if (field.value) result[section][key] = field.value; else delete result[section][key]; }
        for (const key of Object.keys(result)) if (draft[key] === undefined && !Object.keys(result[key]).length) delete result[key];
        return result;
    };
}

// Copies the exact dependency closure. Package originals never receive writes.
export function forkPromptClosure(entries, selected, { derive = false, scope = { scope: 'library' }, copyLibrary = false, retainedRefs = [] } = {}) {
    const output = []; const cache = new Map(); const active = new Set();
    const logicalKey = ref => exactKey({ ...ref, revision: '' });
    const identities = new Map(), retained = new Set(retainedRefs.map(exactKey));
    const visit = entry => {
        const key = exactKey(entry.ref);
        if (active.has(key)) throw new Error('Prompt dependency cycle');
        if (cache.has(key)) return cache.get(key);
        active.add(key);
        const type = entry.ref.resourceType; const [, id, prefix] = PROMPT_TYPES[type];
        const resource = clone(entry.resource);
        if (!identities.has(logicalKey(entry.ref))) identities.set(logicalKey(entry.ref), createStudioNativeId(prefix));
        resource[id] = identities.get(logicalKey(entry.ref)); resource.revision = createStudioNativeId('rev');
        const mapped = resourceRef(type, resource, scope); cache.set(key, mapped);
        resource.provenance = [...(resource.provenance || []), { source: 'atria.fork', ref: JSON.stringify({ source: entry.ref, baseRef: mapped }) }];
        const dependency = ref => {
            if (retained.has(exactKey(ref)) || ref.scope === 'library' && !copyLibrary) return clone(ref);
            const found = entries.find(item => exactKey(item.ref) === exactKey(ref));
            if (!found) throw new Error(formatProductText('Missing exact dependency: ${0}@${1}', [ref.resourceId, ref.revision]));
            return visit(found);
        };
        if (type === 'core.prompt-program') {
            if (resource.parentRef) resource.parentRef = dependency(resource.parentRef);
            resource.stages = resource.stages.map(stage => mapPromptStageRefs(stage, dependency));
            (resource.derive || []).forEach(op => {
                const previous = op.replacementRef;
                if (previous) op.replacementRef = dependency(previous);
                if (op.entry?.kind === 'module') op.entry.moduleRef = dependency(op.entry.moduleRef);
                const original = entries.find(item => item.ref.resourceType === 'core.prompt-module' && item.ref.resourceId === op.moduleId && cache.has(exactKey(item.ref)) && item.ref.scope === entry.ref.scope
                    && (entry.ref.scope !== 'package' || item.ref.packageVersionId === entry.ref.packageVersionId)
                    && (entry.ref.scope !== 'project' || item.ref.projectId === entry.ref.projectId));
                if (original) op.moduleId = dependency(original.ref).resourceId;
            });
        }
        output.push({ ref: mapped, resource }); active.delete(key); return mapped;
    };
    let ref;
    if (derive && selected.ref.resourceType === 'core.prompt-program') {
        const parent = selected.ref.scope === 'library' ? selected.ref : visit(selected);
        const resource = newPromptResource('core.prompt-program'); resource.displayName = selected.resource.displayName + ' Derivative';
        resource.parentRef = parent;
        // A neutral ordered stage preserves inherited stages without redeclaring their conditions.
        resource.stages = [{ stageId: 'stage.derived_' + createStudioNativeId('step').slice(5), moduleRefs: [] }];
        resource.provenance = [{ source: 'atria.derive', ref: exactKey(selected.ref) }];
        ref = resourceRef('core.prompt-program', resource, scope); output.push({ ref, resource });
    } else { ref = visit(selected); output.at(-1).resource.displayName += ' Fork'; }
    return { entries: output, ref };
}

export function mountPromptEditor({ document: doc, parent, entry, entries, onSave, onBack, librarySurface = false, presetSurface = false, foldState = new Map(), workbench = null }) {
    let draft = clone(entry.resource); let advanced = false; let submitted = false; let submitting = false;
    const initialDraft = JSON.stringify(draft);
    let renderVersion = 0; let jsonBuffer = null; let readActive = () => draft; let rawActive = () => jsonBuffer; let lastEdit = null;
    let upgradeDependencies = [];
    const history = [{ draft: clone(draft), jsonBuffer, dependencies: [] }]; const future = [];
    const textSelections = new Map();
    const sampleState = {}, upgradeState = {}, qualityState = {};
    let refreshFacts = () => {};
    const root = element(doc, 'section', undefined, parent); root.className = 'atri-prompt-editor';
    root.dataset.atriPromptEditor = 'true';
    if (librarySurface) root.dataset.atriLibraryEditor = 'true';
    const rememberFolds = () => { for (const node of root.querySelectorAll('[data-prompt-fold]')) foldState.set(node.dataset.promptFold, node.open); };
    const jsonValue = text => {
        const value = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(translateShellText('Enter a resource JSON object.'));
        if (JSON.stringify(value.provenance || []) !== JSON.stringify(draft.provenance || [])) throw new Error(translateShellText('System provenance is read-only.'));
        return value;
    };
    const isDirty = () => {
        if (JSON.stringify(draft) !== initialDraft) return true;
        if (jsonBuffer === null) return false;
        try { return JSON.stringify(jsonValue(jsonBuffer)) !== initialDraft; } catch { return true; }
    };
    const capture = (typingTarget = null) => {
        if (submitted || submitting) return;
        if (advanced) jsonBuffer = rawActive();
        try { draft = clone(readActive()); if (!advanced && jsonBuffer !== null) { jsonValue(jsonBuffer); jsonBuffer = null; } } catch { /* Keep invalid input in its current view. */ }
        const next = { draft: clone(draft), jsonBuffer, dependencies: clone(upgradeDependencies) };
        const comparable = state => {
            let invalid = state.jsonBuffer;
            if (invalid !== null) { try { jsonValue(invalid); invalid = null; } catch { /* Invalid JSON remains an editable history state. */ } }
            return JSON.stringify({ draft: state.draft, invalid });
        };
        const time = Date.now();
        if (comparable(next) !== comparable(history.at(-1))) {
            if (typingTarget && lastEdit?.target === typingTarget && time - lastEdit.time < 500 && history.length > 1) history[history.length - 1] = next;
            else history.push(next);
            future.length = 0;
        } else history[history.length - 1] = next;
        lastEdit = typingTarget ? { target: typingTarget, time } : null;
        root.dataset.atriaDraftDirty = String(isDirty());
        if (sampleState.result) sampleState.refresh?.();
    };
    const restore = state => {
        const active = doc.activeElement; const label = active?.getAttribute('aria-label');
        const selection = typeof active?.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd, active.scrollTop] : null;
        draft = clone(state.draft); jsonBuffer = state.jsonBuffer; upgradeDependencies = clone(state.dependencies ?? []); render();
        const control = [...root.querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === label);
        control?.focus({ preventScroll: true });
        if (selection && control?.setSelectionRange) { control.setSelectionRange(selection[0], selection[1]); control.scrollTop = selection[2]; }
        root.dataset.atriaDraftDirty = String(isDirty());
    };
    const undo = () => { if (submitting || submitted) return; capture(); if (history.length > 1) { future.push(history.pop()); restore(history.at(-1)); } };
    const redo = () => { if (submitting || submitted) return; if (future.length) { const next = future.pop(); history.push(next); restore(next); } };
    root.addEventListener('keydown', event => {
        if (event.isComposing || submitting || submitted || !(event.metaKey || event.ctrlKey)) return;
        if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); } else if (event.key.toLowerCase() === 'y' && !event.shiftKey) { event.preventDefault(); redo(); }
    });
    const guarded = (read, section) => () => { try { return read(); } catch (error) { error.promptSection ||= section; throw error; } };
    function fold(parent, key, label, describe = () => '') {
        const section = element(doc, 'details', undefined, parent); section.className = 'atri-prompt-fold'; section.dataset.promptFold = key;
        section.open = foldState.get(key) || false;
        const summary = element(doc, 'summary', undefined, section); element(doc, 'span', label, summary);
        const hint = element(doc, 'small', undefined, summary);
        const update = () => { hint.textContent = describe(); };
        for (const event of ['input', 'change', 'click']) section.addEventListener(event, () => queueMicrotask(update));
        queueMicrotask(update);
        return section;
    }
    // Tokens and Used by, in the Details panel. Counts come only from a preview run (the
    // route's own tokenizer); nothing is estimated here.
    function mountInspectorFacts() {
        const side = root.querySelector(':scope > .atri-prompt-editor__inspector');
        const section = label => {
            const box = element(doc, 'section', undefined, side); box.className = 'atri-prompt-inspector-section';
            element(doc, 'h4', label, box); return box;
        };
        const tokens = section('Tokens');
        const tokenText = element(doc, 'p', undefined, tokens);
        action(doc, tokens, 'Open preview', () => root.querySelector('[data-editor-view="preview"]')?.click());
        const usedBy = section('Used by');
        const id = entry.ref.resourceId;
        if (entry.ref.resourceType === 'core.prompt-module') {
            const lines = new Set();
            for (const item of [...entries, ...upgradeDependencies].filter(candidate => candidate.ref.resourceType === 'core.prompt-program')) {
                (item.resource.stages || []).forEach((stage, index) => {
                    if (promptStageModuleRefs(stage).some(ref => ref.resourceId === id)) lines.add(item.resource.displayName + ' · ' + formatShellText('Stage ${0}', [index + 1], undefined, 'atria.product.stageIndex'));
                });
            }
            if (!lines.size) element(doc, 'p', 'Not placed in a stage of this preset yet.', usedBy);
            else { const list = element(doc, 'ul', undefined, usedBy); for (const line of lines) { const row = element(doc, 'li', undefined, list); row.textContent = line; } }
        } else element(doc, 'p', entry.ref.resourceType === 'core.prompt-program' ? 'This preset’s program: the outline shows its stages and text blocks in order.' : 'Applies whenever this preset generates.', usedBy);
        return () => {
            if (!tokenText.isConnected) return;
            const result = sampleState.result; const count = result?.candidate?.effective?.inputTokens;
            let current = false; try { current = sampleState.resultIdentity === JSON.stringify(readActive()); } catch { /* Mid-edit JSON. */ }
            tokenText.textContent = Number.isFinite(count)
                ? formatShellText(current ? 'Input tokens in the last preview: ${0}' : 'An earlier preview counted ${0} input tokens. Preview again for the current text.', [count])
                : translateShellText('Not counted yet. A preview counts input tokens with the selected route’s tokenizer.');
        };
    }
    function render() {
        const availableEntries = [...entries, ...upgradeDependencies];
        const version = ++renderVersion;
        rememberFolds();
        for (const node of root.querySelectorAll('textarea')) textSelections.set(node.getAttribute('aria-label'), [node.selectionStart, node.selectionEnd, node.scrollTop]);
        root.replaceChildren();
        // Workbench layout (blueprint §6.4): the writing in a main column, everything about the
        // resource in a Details panel beside it. Both stay inside root, so draft tracking, fold
        // memory and the saving lock cover them. Elsewhere both names are root itself.
        const main = workbench ? element(doc, 'div', undefined, root) : root;
        const side = workbench ? element(doc, 'aside', undefined, root) : root;
        if (workbench) {
            root.dataset.layout = 'workbench'; root.dataset.inspectorOpen = String(workbench.inspectorOpen);
            main.className = 'atri-prompt-editor__main';
            side.className = 'atri-prompt-editor__inspector'; side.setAttribute('aria-label', translateShellText('Details'));
        }
        const title = element(doc, 'h3', undefined, main); title.textContent = draft.displayName; title.tabIndex = -1;
        element(doc, 'p', presetSurface ? 'Save changes to this preset. Other presets and pinned sessions stay unchanged.' : librarySurface ? 'Save a new revision. Existing references keep their exact version.' : 'New exact revision · existing references stay pinned. Review changes before committing in Studio.', main);
        const toolbar = element(doc, 'div', undefined, main); toolbar.className = 'atri-prompt-actions';
        // Hosts with their own navigation (the preset outline) pass no onBack: one way back per screen.
        if (onBack) action(doc, toolbar, 'Back to resources', () => { if (confirmAtriaDraftLeave(doc, root)) return onBack(); });
        const status = element(doc, 'div', undefined, main);
        // Write | Preview: the sample preview gets the main column instead of a fold at the end.
        let writeArea = main, previewArea = null;
        const setView = id => {
            if (!workbench) return;
            workbench.view = id; writeArea.hidden = id !== 'write'; previewArea.hidden = id !== 'preview';
            for (const button of toolbar.querySelectorAll('[data-editor-view]')) button.setAttribute('aria-pressed', String(button.dataset.editorView === id));
            const details = previewArea.querySelector('details');
            if (id === 'preview' && details && !details.open) details.open = true;
        };
        if (workbench) {
            const views = element(doc, 'div', undefined, toolbar); views.className = 'atria-segmented atri-prompt-views';
            views.setAttribute('role', 'group'); views.setAttribute('aria-label', translateShellText('Editor view'));
            for (const [id, label] of [['write', 'Write'], ['preview', 'Preview']]) {
                const button = action(doc, views, label, () => setView(id)); button.className = 'atria-segmented__item'; button.dataset.editorView = id;
                button.setAttribute('aria-pressed', String(workbench.view === id));
            }
        }
        const undoButton = action(doc, toolbar, 'Undo', undo); undoButton.disabled = history.length < 2;
        const redoButton = action(doc, toolbar, 'Redo', redo); redoButton.disabled = !future.length;
        if (librarySurface) status.className = 'atri-prompt-editor-status';
        let read; let tracking = false;
        const trackDraft = event => queueMicrotask(() => {
            if (!root.isConnected || version !== renderVersion) return;
            try { tracking = true; capture(event.type === 'input' ? event.target : null); read(); root.dataset.atriaDraftDirty = String(!submitted && isDirty()); refreshFacts(); } catch { root.dataset.atriaDraftDirty = 'true'; } finally { tracking = false; }
            undoButton.disabled = history.length < 2 || submitting || submitted; redoButton.disabled = !future.length || submitting || submitted;
        });
        root.oninput = trackDraft; root.onchange = trackDraft; root.onclick = trackDraft;
        action(doc, toolbar, advanced ? 'Simple editor' : 'Advanced editor', () => {
            if (submitting) return;
            capture();
            try { draft = read(); advanced = !advanced; render(); } catch (e) {
                if (advanced) { advanced = false; render(); } else { status.replaceChildren(); error(doc, status, e); }
            }
        });
        if (workbench) {
            const details = action(doc, toolbar, 'Details', () => {
                workbench.inspectorOpen = !workbench.inspectorOpen;
                root.dataset.inspectorOpen = String(workbench.inspectorOpen); details.setAttribute('aria-expanded', String(workbench.inspectorOpen));
            });
            details.setAttribute('aria-expanded', String(workbench.inspectorOpen)); details.classList.add('atri-prompt-details-toggle');
            writeArea = element(doc, 'div', undefined, main); writeArea.className = 'atri-prompt-write';
            previewArea = element(doc, 'div', undefined, main); previewArea.className = 'atri-prompt-preview-area';
        }
        if (advanced) {
            const json = input(doc, writeArea, 'Resource JSON — conditions, parameters, provenance', jsonBuffer ?? JSON.stringify(draft, null, 2), true);
            json.className = 'atri-prompt-json'; read = () => jsonValue(json.value); rawActive = () => json.value;
        } else {
            const prompt = ['core.prompt-module', 'core.prompt-program'].includes(entry.ref.resourceType);
            const identityBox = prompt ? fold(side, 'identity', 'Identity', () => name.value) : side;
            const identity = librarySurface ? element(doc, 'div', undefined, identityBox) : identityBox;
            if (librarySurface) identity.className = 'atri-prompt-identity';
            const name = input(doc, identity, 'Display name', draft.displayName);
            if (librarySurface) name.addEventListener('input', () => { title.textContent = name.value || translateShellText('Untitled'); });
            const revision = input(doc, identity, 'Exact revision', draft.revision);
            let fields = element(doc, 'div', undefined, writeArea);
            if (librarySurface) fields.className = 'atri-prompt-fields';
            let specific = () => ({});
            const sections = fields;
            if (entry.ref.resourceType === 'core.prompt-module') {
                fields = fold(workbench ? side : sections, 'module', 'Module settings', () => target.value);
                const target = select(doc, fields, 'Semantic target', ['system.foundation', 'system.character', 'system.world', 'system.style', 'system.response', 'context.before_history', 'context.after_history', 'context.before_input', 'context.after_input', 'response.prefill', 'response.post_history', 'agent.task', 'agent.evidence', 'agent.constraints'].map(v => [v, v]), draft.target);
                const stages = input(doc, fields, 'Stages (comma separated)', draft.stages.join(', '));
                const body = input(doc, sections, 'Prompt body', draft.body, true); body.className = 'atri-prompt-body';
                const originalBody = draft.body.replace(/\r\n?/g, '\n');
                const textMode = select(doc, fields, 'Text mode', [['template', 'Template variables'], ['literal', 'Literal text']], draft.textMode || 'template');
                const expression = select(doc, fields, 'Expression scope', [['', 'Unspecified'], ['global', 'Global'], ['scene', 'Scene'], ['narrator', 'Narrator'], ['actor', 'Actor']], draft.expression?.layer || '');
                const actor = input(doc, fields, 'Expression actor ID', draft.expression?.actorId || '');
                const showActor = () => { actor.parentElement.hidden = expression.value !== 'actor'; }; expression.addEventListener('change', showActor); showActor();
                specific = () => {
                    const result = { target: target.value, stages: stages.value.split(',').map(v => v.trim()).filter(Boolean), body: body.value === originalBody ? draft.body : body.value };
                    if (draft.textMode !== undefined || textMode.value !== 'template') result.textMode = textMode.value;
                    result.expression = expression.value ? { layer: expression.value, ...(expression.value === 'actor' ? { actorId: actor.value } : {}) } : undefined;
                    return result;
                };
            } else if (entry.ref.resourceType === 'core.prompt-program') {
                const stages = clone(draft.stages); const stageConditions = new Map(); const anchorConditions = new Map();
                const modules = new Map(availableEntries.filter(item => item.ref.resourceType === 'core.prompt-module').map(item => [exactKey(item.ref), item.resource]));
                const syncConditions = () => { for (const [anchor, read] of anchorConditions) anchor.condition = read(); for (const [stage, read] of stageConditions) if (stages.includes(stage)) { const condition = read(); if (stage.condition !== undefined || condition !== null) stage.condition = condition; } };
                const treeBox = fold(fields, 'stages', 'Stage / module tree', () => formatShellText('${0} stages · ${1} modules', [stages.length, stages.reduce((count, stage) => count + promptStageModuleRefs(stage).length, 0)]));
                if (!foldState.has('stages')) treeBox.open = true;
                const tree = element(doc, 'section', undefined, treeBox); tree.className = 'atri-prompt-stages';
                const stageKeys = new WeakMap(stages.map(stage => [stage, 'stage:' + stage.stageId]));
                const renderStages = (focusIndex, anchor = null) => {
                    try { syncConditions(); } catch (e) { status.replaceChildren(); error(doc, status, e); return; }
                    const anchorTop = anchor?.getBoundingClientRect().top;
                    const scroll = [];
                    if (anchor) for (let node = anchor.parentElement; node; node = node.parentElement) scroll.push([node, node.scrollTop, node.scrollLeft]);
                    rememberFolds();
                    stageConditions.clear(); anchorConditions.clear(); tree.replaceChildren();
                    stages.forEach((stage, index) => {
                        if (!stageKeys.has(stage)) stageKeys.set(stage, 'stage:' + stage.stageId);
                        const stageBox = fold(tree, stageKeys.get(stage), formatShellText('Stage ${0}', [index + 1], undefined, 'atria.product.stageIndex'), () => formatShellText('${0} modules', [promptStageModuleRefs(stage).length]));
                        if (!foldState.has(stageKeys.get(stage))) stageBox.open = true;
                        const row = element(doc, 'fieldset', undefined, stageBox);
                        // The stage ID and exact module choice are expert controls; new writing is added from the outline.
                        const advanced = fold(row, stageKeys.get(stage) + ':advanced', 'Advanced', () => stage.stageId);
                        const id = input(doc, advanced, formatShellText('Stage ID ${0}', [index + 1], undefined, 'atria.product.stageIdIndex'), stage.stageId);
                        id.addEventListener('input', () => {
                            stage.stageId = id.value;
                            const key = 'stage:' + stage.stageId; stageKeys.set(stage, key);
                            stageBox.dataset.promptFold = key; conditionBox.dataset.promptFold = key + ':condition'; advanced.dataset.promptFold = key + ':advanced';
                        });
                        const conditionBox = fold(row, stageKeys.get(stage) + ':condition', 'Condition', () => conditionBox.querySelector('select')?.value ? translateShellText('Configured') : translateShellText('Always'));
                        stageConditions.set(stage, guarded(mountPromptCondition(doc, conditionBox, stage.condition), conditionBox));
                        const ordered = promptStageEntries(stage);
                        const storeEntries = next => {
                            if (stage.entries || next.some(item => item.kind === 'anchor')) { stage.entries = next; delete stage.moduleRefs; } else stage.moduleRefs = next.map(item => item.moduleRef);
                        };
                        const entryTarget = item => item.kind === 'anchor' ? item.target : modules.get(exactKey(item.moduleRef))?.target;
                        for (const [entryIndex, item] of ordered.entries()) {
                            const line = element(doc, 'div', undefined, row); line.className = 'atri-prompt-order-entry';
                            line.dataset.promptEntry = item.entryId;
                            if (item.kind === 'module') {
                                const ref = item.moduleRef; const module = availableEntries.find(entry => exactKey(entry.ref) === exactKey(ref));
                                // The exact revision stays available on hover; the row reads as the module's name.
                                const name = element(doc, 'span', module?.resource.displayName || ref.resourceId, line); name.title = [module?.resource.target, ref.revision].filter(Boolean).join(' · ');
                            } else {
                                const settings = fold(line, 'anchor-settings:' + stage.stageId + ':' + item.entryId, 'Context sources', () => item.accepts.map(kind => translateShellText(CONTEXT_SOURCES.find(([value]) => value === kind)?.[1] || kind)).join(', '));
                                const target = select(doc, settings, 'Anchor position', ['system.foundation', 'system.character', 'system.world', 'system.style', 'system.response', 'agent.task', 'agent.evidence', 'agent.constraints', 'context.before_history', 'context.after_history', 'context.before_input', 'context.after_input', 'response.post_history'].map(target => [target, target]), item.target);
                                target.addEventListener('change', () => { item.target = target.value; });
                                const accepts = element(doc, 'fieldset', undefined, settings); element(doc, 'legend', 'Context sources', accepts);
                                for (const [kind, label] of CONTEXT_SOURCES) {
                                    const check = input(doc, accepts, label, ''); check.type = 'checkbox'; check.checked = item.accepts.includes(kind);
                                    check.addEventListener('change', () => { item.accepts = check.checked ? [...item.accepts, kind] : item.accepts.filter(value => value !== kind); });
                                }
                                const required = input(doc, settings, 'Require matching context', ''); required.type = 'checkbox'; required.checked = Boolean(item.required);
                                required.addEventListener('change', () => { item.required = required.checked; });
                                const conditions = fold(settings, 'anchor:' + stage.stageId + ':' + item.entryId, 'Condition');
                                anchorConditions.set(item, guarded(mountPromptCondition(doc, conditions, item.condition), conditions));
                            }
                            const move = direction => {
                                let sibling = entryIndex + direction;
                                while (sibling >= 0 && sibling < ordered.length && entryTarget(ordered[sibling]) !== entryTarget(item)) sibling += direction;
                                if (sibling < 0 || sibling >= ordered.length) return;
                                [ordered[entryIndex], ordered[sibling]] = [ordered[sibling], ordered[entryIndex]];
                                storeEntries(ordered); renderStages(index);
                                const node = [...tree.querySelectorAll('[data-prompt-entry]')].find(node => node.dataset.promptEntry === item.entryId); node?.querySelector('button')?.focus();
                            };
                            action(doc, line, 'Move entry up', () => move(-1)).disabled = !ordered.slice(0, entryIndex).some(sibling => entryTarget(sibling) === entryTarget(item));
                            action(doc, line, 'Move entry down', () => move(1)).disabled = !ordered.slice(entryIndex + 1).some(sibling => entryTarget(sibling) === entryTarget(item));
                            action(doc, line, item.kind === 'module' ? 'Remove module' : 'Remove anchor', () => {
                                syncConditions(); anchorConditions.delete(item); storeEntries(ordered.filter(entry => entry !== item)); renderStages(index);
                            });
                        }
                        action(doc, row, 'Add context anchor', () => {
                            syncConditions();
                            storeEntries([...promptStageEntries(stage), { entryId: createStudioNativeId('step'), kind: 'anchor', target: 'context.before_history', accepts: ['context.fact'], required: false }]);
                            renderStages(index);
                        });
                        const choices = availableEntries.filter(item => item.ref.resourceType === 'core.prompt-module' && (entry.ref.scope !== 'library' || item.ref.scope === 'library') && item.ref.scope !== 'package');
                        const picker = select(doc, advanced, formatShellText('Module for stage ${0}', [index + 1], undefined, 'atria.product.stageModuleIndex'), [['', 'Choose exact module…'], ...choices.map(item => [exactKey(item.ref), item.resource.displayName + ' · ' + item.ref.revision + ' · ' + item.ref.scope, true])]);
                        picker.dataset.atriStageModulePicker = 'true';
                        action(doc, advanced, 'Add module', () => {
                            if (!picker.value || promptStageModuleRefs(stage).some(v => exactKey(v) === picker.value)) return;
                            if (stage.entries) stage.entries.push({ entryId: createStudioNativeId('step'), kind: 'module', moduleRef: JSON.parse(picker.value) }); else stage.moduleRefs.push(JSON.parse(picker.value)); renderStages(index, picker);
                        });
                        action(doc, row, 'Move stage up', () => { if (index) { [stages[index - 1], stages[index]] = [stages[index], stages[index - 1]]; renderStages(index - 1); } });
                        action(doc, row, 'Move stage down', () => { if (index < stages.length - 1) { [stages[index + 1], stages[index]] = [stages[index], stages[index + 1]]; renderStages(index + 1); } });
                        action(doc, row, 'Remove stage', () => { if (stages.length > 1) { stages.splice(index, 1); renderStages(Math.min(index, stages.length - 1)); } });
                    });
                    const focusedStage = tree.querySelectorAll(':scope > details')[focusIndex];
                    if (anchor) {
                        const picker = focusedStage?.querySelector('[data-atri-stage-module-picker]');
                        picker?.focus({ preventScroll: true });
                        for (const [node, top, left] of scroll) if (node.isConnected) { node.scrollTop = top; node.scrollLeft = left; }
                        // New rows appear above the picker. Keep that control at
                        // its previous viewport position for repeated additions.
                        if (picker) for (const [node] of scroll) {
                            if (node.isConnected && node.scrollHeight > node.clientHeight) node.scrollTop += picker.getBoundingClientRect().top - anchorTop;
                        }
                    } else if (focusIndex !== undefined && focusedStage) { treeBox.open = true; focusedStage.open = true; focusedStage.querySelector(':scope > summary')?.focus(); }
                };
                action(doc, treeBox, 'Add stage', () => { let index = stages.length + 1; while (stages.some(stage => stage.stageId === 'stage.step' + index)) index++; stages.push({ stageId: 'stage.step' + index, moduleRefs: [] }); renderStages(stages.length - 1); }); renderStages();
                const directiveBox = fold(fields, 'response', 'Response Directive', () => directive.value.trim() ? translateShellText('Configured') : translateShellText('Not configured'));
                const directive = input(doc, directiveBox, 'Response Directive', draft.responseDirective?.body || '', true);
                specific = () => { syncConditions(); const responseDirective = { ...draft.responseDirective, body: directive.value }; if (draft.responseDirective?.body === undefined && !directive.value) delete responseDirective.body; return { stages, responseDirective }; };
            } else specific = generationFields(doc, fields, draft, () => tracking);
            // Parameters, condition and derive describe the resource: in the workbench they sit in Details.
            fields = workbench ? side : sections;
            const parameterBox = prompt ? fold(fields, 'parameters', 'Typed parameters', () => formatShellText('${0} parameters', [parameterBox.querySelectorAll('.atri-prompt-parameters > fieldset').length])) : null;
            const readParameters = prompt ? guarded(mountPromptParameters(doc, parameterBox, draft.parameters), parameterBox) : null;
            const conditionBox = entry.ref.resourceType === 'core.prompt-module' ? fold(fields, 'condition', 'Condition', () => conditionBox.querySelector('select')?.value ? translateShellText('Configured') : translateShellText('Always')) : null;
            const readCondition = conditionBox ? guarded(mountPromptCondition(doc, conditionBox, draft.condition), conditionBox) : null;
            const deriveBox = entry.ref.resourceType === 'core.prompt-program' ? fold(fields, 'derive', 'Derive operations', () => formatShellText('${0} operations', [deriveBox.querySelectorAll('.atri-prompt-derive > fieldset').length])) : null;
            const readDerive = deriveBox ? guarded(mountPromptDerive(doc, deriveBox, draft, availableEntries, entry.ref, () => specific().stages), deriveBox) : null;
            for (const box of [parameterBox, conditionBox, deriveBox]) box?.querySelector('h4, legend')?.remove();
            read = () => {
                const value = { ...draft, displayName: name.value, revision: revision.value, ...specific(),
                    ...(readParameters ? { parameters: readParameters() } : {}), ...(readCondition ? { condition: readCondition() } : {}), ...(readDerive ? readDerive() : {}),
                };
                for (const key of ['parameters', 'condition', 'parentRef', 'derive', 'responseDirective']) if (draft[key] === undefined && (value[key] == null || typeof value[key] === 'object' && !Object.keys(value[key]).length)) delete value[key];
                return value;
            };
            const provenance = fold(side, 'provenance', 'System provenance (read-only)');
            element(doc, 'pre', JSON.stringify(draft.provenance || [], null, 2), provenance);
        }
        const renderTokens = workbench ? mountInspectorFacts() : () => {};
        mountPromptSamplePreview({ document: doc, parent: previewArea || root, entry, entries: availableEntries, readDependencies: () => upgradeDependencies, state: sampleState, readDraft: () => { if (jsonBuffer !== null) jsonValue(jsonBuffer); return readActive(); } });
        if (workbench) {
            // The token readout follows each preview run.
            const refreshPreview = sampleState.refresh;
            sampleState.refresh = () => { refreshPreview?.(); renderTokens(); };
            setView(workbench.view);
        }
        mountPromptQuality({ document: doc, parent: side, state: qualityState });
        mountPromptUpgrade({ document: doc, parent: side, entry, resource: draft, state: upgradeState,
            readDraft: () => { if (jsonBuffer !== null) jsonValue(jsonBuffer); return readActive(); }, applyDraft: (resource, { resources }) => {
                capture();
                if (presetSurface && entry.ref.resourceType === 'core.prompt-program') {
                    const selected = { resource, ref: resourceRef(entry.ref.resourceType, resource, { scope: 'library' }) };
                    const copies = forkPromptClosure([...resources, ...upgradeDependencies], selected, { copyLibrary: true, retainedRefs: [...entries, ...upgradeDependencies].map(item => item.ref) });
                    const root = copies.entries.find(item => exactKey(item.ref) === exactKey(copies.ref));
                    resource = { ...root.resource, displayName: resource.displayName, promptProgramId: resource.promptProgramId, revision: resource.revision, provenance: resource.provenance };
                    upgradeDependencies.push(...copies.entries.filter(item => item !== root));
                }
                const pending = new Map(upgradeDependencies.map(item => [exactKey(item.ref), item])), used = new Set();
                const visit = resource => {
                    if (!resource.promptProgramId) return;
                    for (const ref of promptProgramResourceRefs(resource)) {
                        const key = exactKey(ref); if (!pending.has(key) || used.has(key)) continue;
                        used.add(key); visit(pending.get(key).resource);
                    }
                };
                visit(resource); upgradeDependencies = upgradeDependencies.filter(item => used.has(exactKey(item.ref)));
                draft = clone(resource); jsonBuffer = null; lastEdit = null; future.length = 0;
                history.push({ draft: clone(draft), jsonBuffer, dependencies: clone(upgradeDependencies) }); render(); root.dataset.atriaDraftDirty = String(isDirty());
            } });
        const save = action(doc, main, librarySurface ? 'Save revision' : 'Review / save revision', async () => {
            if (save.disabled || submitting || submitted || !root.isConnected) return; submitting = true; save.disabled = true; save.setAttribute('aria-busy', 'true'); status.replaceChildren();
            try {
                rememberFolds(); const value = read(); if (!advanced && jsonBuffer !== null) jsonValue(jsonBuffer);
                root.inert = true;
                if (upgradeDependencies.length) await onSave(value, { dependencies: upgradeDependencies }); else await onSave(value); element(doc, 'p', librarySurface ? 'Saved immutable Library revision.' : 'Revision submitted. Studio changes require human Review / Apply.', status); submitted = true; root.dataset.atriaDraftDirty = 'false';
                root.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
            } catch (e) { if (root.isConnected) error(doc, status, e); } finally { submitting = false; root.inert = false; save.disabled = submitted; save.removeAttribute('aria-busy'); }
        });
        if (librarySurface) save.classList.add('atri-library-button', 'atri-library-button--primary');
        save.disabled = submitted;
        readActive = read;
        refreshFacts = renderTokens; renderTokens();
        if (!advanced && jsonBuffer !== null) { try { jsonValue(jsonBuffer); } catch { element(doc, 'p', 'JSON contains an unfinished edit. Open Advanced editor to correct it before saving.', status).setAttribute('role', 'alert'); } }
        title.focus();
        for (const node of root.querySelectorAll('textarea')) {
            const selection = textSelections.get(node.getAttribute('aria-label'));
            if (selection) { node.setSelectionRange(selection[0], selection[1]); node.scrollTop = selection[2]; }
        }
    }
    render(); return root;
}

export function mountPromptLibrary({ document: doc, body, route, host }) {
    let disposed = false; let sequence = 0; let visibility = 'active';
    const type = { 'prompt-programs': 'core.prompt-program', 'prompt-modules': 'core.prompt-module', 'generation-profiles': 'core.generation-profile' }[route.child?.id?.split(':')[0]] || 'core.prompt-program';
    let selectedRef;
    function selectRoute(nextRoute) {
        selectedRef = null;
        try { selectedRef = JSON.parse(decodeURIComponent((nextRoute.child?.id || '').split(':').slice(1).join(':'))); } catch { /* Section route, not an exact resource link. */ }
    }
    selectRoute(route);
    async function render() {
        const token = ++sequence; body.replaceChildren(); element(doc, 'p', 'Loading exact resources…', body);
        try {
            const entries = await runtimeRequest('/resources'); if (disposed || token !== sequence) return;
            body.replaceChildren(); const root = element(doc, 'section', undefined, body); root.className = 'atri-prompt-library'; root.dataset.atriPromptLibrary = type;
            const header = element(doc, 'header', undefined, root); header.className = 'atri-library-heading';
            element(doc, 'h2', PROMPT_TYPES[type][0], header);
            element(doc, 'p', 'Exact revisions from Library, Projects and installed Packages. Package originals are read-only.', header);
            mountResourceBundleImport({ document: doc, root, host, onReload: render });
            const editor = (entry, fresh = false) => {
                root.replaceChildren(); const next = clone(entry);
                if (!fresh) next.resource.revision = createStudioNativeId('rev');
                mountPromptEditor({ document: doc, parent: root, entry: next, entries, librarySurface: true, onBack: render, onSave: async resource => {
                    try { await runtimeRequest('/resources', { method: 'POST', body: { resourceType: type, resource } }); } catch (cause) {
                        throw new Error(translateShellText('Could not save this revision. Check its fields and use an unused revision ID. Your edits are still here.') + ' (' + cause.message + ')');
                    }
                    root.replaceChildren(); void host.refreshSearch?.();
                    element(doc, 'p', 'Saved immutable Library revision.', root).setAttribute('role', 'status');
                    action(doc, root, 'Review pinned consumers', async () => {
                        const rows = element(doc, 'section', undefined, root);
                        element(doc, 'p', 'Saving keeps consumer versions pinned. Open each owner to adopt this revision through its existing controls.', rows);
                        renderResourceReferenceRows({ document: doc, root: rows, references: await runtimeRequest('/resources/used-by', { method: 'POST', body: entry.ref }), host });
                    });
                    action(doc, root, 'Back to resources', render).focus();
                } });
            };
            const tools = element(doc, 'div', undefined, root); tools.className = 'atri-prompt-library-tools';
            const filter = input(doc, tools, 'Filter resources', ''); filter.type = 'search';
            const scope = select(doc, tools, 'Resource origin', [['all', 'All origins'], ['library', 'Library'], ['project', 'Build'], ['package', 'Installed works']]); scope.value = 'all';
            const lifecycle = select(doc, tools, 'Visibility', [['active', 'Active'], ['archived', 'Archived']], visibility);
            action(doc, tools, 'New resource', () => { const resource = newPromptResource(type); editor({ resource, ref: resourceRef(type, resource, { scope: 'library' }) }, true); });
            const list = element(doc, 'div', undefined, root); list.className = 'atri-prompt-library-list';
            const renderList = () => {
                list.replaceChildren(); const matching = entries.filter(item => item.ref.resourceType === type && (scope.value === 'all' || item.ref.scope === scope.value)
                    && (Boolean(item.archived) === (visibility === 'archived') || (selectedRef && exactKey(selectedRef) === exactKey(item.ref))) && (item.resource.displayName + item.ref.resourceId).toLowerCase().includes(filter.value.toLowerCase()));
                if (!matching.length) element(doc, 'p', entries.some(item => item.ref.resourceType === type) ? 'No matching resources' : 'No resources yet. Create one or open Build to author project assets.', list);
                for (const entry of matching) {
                    const row = element(doc, 'article', undefined, list); row.className = 'atri-prompt-resource'; row.dataset.atriResourceKey = exactKey(entry.ref); row.tabIndex = -1;
                    element(doc, 'h3', undefined, row).textContent = entry.resource.displayName;
                    element(doc, 'p', entry.ref.scope + ' · ' + entry.ref.revision + (entry.ref.scope === 'package' ? ' · ' + translateShellText('Read-only original') : ''), row);
                    resourceBundleExport(doc, row, entry.ref, entry.resource.displayName);
                    const details = element(doc, 'details', undefined, row); element(doc, 'summary', 'Origin / Derived From / exact content', details);
                    element(doc, 'pre', JSON.stringify({ origin: entry.ref, derivedFrom: entry.resource.parentRef || entry.resource.provenance || [], resource: entry.resource }, null, 2), details);
                    action(doc, row, 'Used By', async () => {
                        try {
                            const refs = entry.ref.scope === 'library' ? await runtimeRequest('/resources/used-by', { method: 'POST', body: entry.ref }) : await nativeStudioClient.getResourceReferences(entry.ref, { reverse: true });
                            row.querySelector('[data-atria-used-by]')?.remove(); const result = element(doc, 'div', undefined, row); result.dataset.atriaUsedBy = 'true'; renderResourceReferenceRows({ document: doc, root: result, references: refs, host });
                        } catch (e) { error(doc, row, e); }
                    });
                    if (entry.presetOwner) action(doc, row, 'Open preset', () => host.openPromptPreset(entry.presetOwner));
                    if (entry.ref.scope === 'library' && !entry.presetOwner) {
                        action(doc, row, 'New revision', () => editor(entry));
                        const archive = action(doc, row, entry.archived ? 'Restore from archive' : 'Archive', async () => {
                            if (archive.disabled) return; archive.disabled = true;
                            try { await runtimeRequest('/resources/archive', { method: 'POST', body: { ref: entry.ref, archived: !entry.archived } }); await render(); } catch (cause) { if (!disposed) { error(doc, row, cause); archive.disabled = false; } }
                        });
                        element(doc, 'small', 'Archiving hides all revisions from active lists. Existing exact references remain available.', row);
                        if (type !== 'core.generation-profile') action(doc, row, 'Delete resource', async () => {
                            if (!await confirmLibraryAction('Delete this Prompt resource and all its revisions? This cannot be undone.')) return;
                            try {
                                await runtimeRequest('/resources/delete', { method: 'POST', body: entry.ref });
                                selectedRef = null; void host.refreshSearch?.(); await render();
                            } catch (cause) {
                                if (cause.code === 'native_resource_referenced') {
                                    row.querySelector('[data-atria-used-by]')?.remove();
                                    const result = element(doc, 'div', undefined, row); result.dataset.atriaUsedBy = 'true';
                                    element(doc, 'p', 'Resolve references before deleting', result);
                                    renderResourceReferenceRows({ document: doc, root: result, references: cause.details.references, host });
                                } else error(doc, row, cause);
                            }
                        }).classList.add('atri-library-danger');
                    }
                    if (entry.ref.scope === 'project') action(doc, row, 'Open in Build', () => host.openBuild(entry.ref.projectId));
                    for (const derive of type === 'core.prompt-program' ? [false, true] : [false]) {
                        const fork = action(doc, row, derive ? 'Derive to Library' : 'Fork to Library', async () => {
                            fork.disabled = true;
                            try {
                                const plan = forkPromptClosure(entries, entry, { derive });
                                for (const item of plan.entries) await runtimeRequest('/resources', { method: 'POST', body: { resourceType: item.ref.resourceType, resource: item.resource } });
                                row.replaceChildren(); void host.refreshSearch?.(); element(doc, 'p', 'Created independent Library resource.', row); action(doc, row, 'Reload resources', render);
                            } catch (e) { error(doc, row, e); fork.disabled = false; }
                        });
                    }
                }
            }; filter.addEventListener('input', renderList); scope.addEventListener('change', renderList);
            lifecycle.addEventListener('change', () => { visibility = lifecycle.value; selectedRef = null; renderList(); }); renderList();
            if (selectedRef) {
                const match = [...list.children].find(node => node.dataset.atriResourceKey === exactKey(selectedRef));
                if (match) { match.dataset.selected = 'true'; match.focus(); match.scrollIntoView?.({ block: 'start' }); } else error(doc, root, 'The requested exact revision is unavailable. References never follow latest.');
            }
        } catch (e) { if (!disposed && token === sequence) { body.replaceChildren(); error(doc, body, e); action(doc, body, 'Retry resources', render); } }
    }
    void render(); return { updateRoute(nextRoute) { selectRoute(nextRoute); void render(); }, dispose() { disposed = true; sequence++; } };
}

export async function mountStudioPromptTools({ document: doc, body, state, stageProject, host, runtimeDesign = false }) {
    if (runtimeDesign) mountStudioRuntimeEditor({ document: doc, root: body, value: state.source.package.runtime?.experienceContract,
        onPreview: input => nativeStudioClient.previewProcessing(state.projectId, { ...input, baseRevision: state.revision.revision }),
        onReview: async value => {
            const source = clone(state.source); source.package.runtime ||= {}; source.package.runtime.experienceContract = value;
            if (!await stageProject(source, 'Update Package Runtime')) throw new Error('ChangeSet could not be prepared. Check Problems / Changes; edits remain here.');
        } });
    element(doc, 'h3', runtimeDesign ? 'Runtime Design' : 'Prompt Authoring', body);
    element(doc, 'p', 'Project edits enter an A1 ChangeSet. Review and Apply Changes to commit; exact references never follow latest.', body);
    const loading = element(doc, 'p', 'Loading exact resources…', body);
    try {
        const all = await runtimeRequest('/resources'); if (!body.isConnected) return; loading.remove();
        const entries = all.filter(item => item.ref.scope !== 'project' || item.ref.projectId === state.projectId);
        const status = element(doc, 'div', undefined, body);
        const stage = async (resources, label) => {
            const source = clone(state.source); source.resources ||= [];
            for (const item of resources) {
                if (source.resources.some(old => old.resourceType === item.ref.resourceType && old.resource[PROMPT_TYPES[item.ref.resourceType][1]] === item.ref.resourceId && old.resource.revision === item.ref.revision)) throw new Error('Use a new exact revision; the existing revision stays pinned.');
                source.resources.push({ resourceType: item.ref.resourceType, resource: item.resource });
            }
            if (!await stageProject(source, label)) throw new Error('ChangeSet could not be prepared. Check Problems / Changes; edits remain here.');
        };
        if (runtimeDesign) {
            const intent = clone(state.source.package.runtime?.modelPrompt || { schemaVersion: 1, roles: [] });
            const json = input(doc, body, 'Runtime requirements JSON', JSON.stringify(intent, null, 2), true);
            element(doc, 'p', 'Only author requirements and recommended exact Prompt / Generation references are packaged. Connections, Models and Secrets belong to the player.', body);
            const role = input(doc, body, 'Runtime role', 'role.narrator');
            const required = input(doc, body, 'Required capabilities (comma separated)', '');
            const choices = type => [['', 'No recommendation'], ...entries.filter(item => item.ref.resourceType === type && item.ref.scope !== 'package').map(item => [exactKey(item.ref), item.resource.displayName + ' · ' + item.ref.revision + ' · ' + item.ref.scope, true])];
            const prompt = select(doc, body, 'Recommended Prompt', choices('core.prompt-program'));
            const generation = select(doc, body, 'Recommended Generation', choices('core.generation-profile'));
            const loadRole = () => {
                try {
                    const current = JSON.parse(json.value).roles.find(item => item.role === role.value);
                    required.value = (current?.requiredCapabilities || []).join(', ');
                    prompt.value = current?.promptProgramRef ? exactKey(current.promptProgramRef) : '';
                    generation.value = current?.generationProfileRef ? exactKey(current.generationProfileRef) : '';
                } catch (e) { error(doc, status, e); }
            };
            role.addEventListener('change', loadRole); loadRole();
            action(doc, body, 'Set role recommendation', () => {
                try {
                    const value = JSON.parse(json.value); const previous = value.roles.find(item => item.role === role.value); value.roles = value.roles.filter(item => item.role !== role.value);
                    value.roles.push({ role: role.value, requiredCapabilities: required.value.split(',').map(v => v.trim()).filter(Boolean), optionalCapabilities: previous?.optionalCapabilities || [],
                        ...(prompt.value ? { promptProgramRef: JSON.parse(prompt.value) } : {}), ...(generation.value ? { generationProfileRef: JSON.parse(generation.value) } : {}) });
                    json.value = JSON.stringify(value, null, 2);
                } catch (e) { error(doc, status, e); }
            });
            action(doc, body, 'Review runtime requirements', async () => {
                try {
                    const source = clone(state.source); source.package.runtime ||= {}; source.package.runtime.modelPrompt = JSON.parse(json.value);
                    if (!await stageProject(source, 'Update runtime requirements and recommendations')) throw new Error('ChangeSet could not be prepared. Check Problems / Changes.');
                } catch (e) { error(doc, status, e); }
            });
            action(doc, body, 'Inspect exact build closure', async () => {
                try {
                    const result = await nativeStudioClient.resolveResourceClosure(state.projectId);
                    element(doc, 'pre', JSON.stringify(result.closure.resources, null, 2), status);
                } catch (e) { error(doc, status, e); }
            });
        } else {
            const type = select(doc, body, 'Resource kind', Object.entries(PROMPT_TYPES).map(([key, value]) => [key, value[0]]), 'core.prompt-program');
            const workspace = element(doc, 'section', undefined, body); workspace.className = 'atri-prompt-workspace';
            const edit = (entry, fresh = false) => {
                workspace.replaceChildren(); const next = clone(entry);
                if (!fresh) next.resource.revision = createStudioNativeId('rev');
                mountPromptEditor({ document: doc, parent: workspace, entry: next, entries, onBack: () => workspace.replaceChildren(), onSave: resource => stage([
                    { resource, ref: resourceRef(next.ref.resourceType, resource, { scope: 'project', projectId: state.projectId }) },
                ], formatProductText('Author ${0}', [resource.displayName])) });
            };
            action(doc, body, 'New project resource', () => { const resource = newPromptResource(type.value); edit({ resource, ref: resourceRef(type.value, resource, { scope: 'project', projectId: state.projectId }) }, true); });
            const list = element(doc, 'div', undefined, body);
            const renderList = () => {
                list.replaceChildren(); const matching = entries.filter(item => item.ref.resourceType === type.value);
                if (!matching.length) element(doc, 'p', 'No resources of this kind yet.', list);
                for (const entry of matching) {
                    const row = element(doc, 'article', undefined, list); row.className = 'atri-prompt-resource';
                    element(doc, 'h4', undefined, row).textContent = entry.resource.displayName; element(doc, 'p', entry.ref.scope + ' · ' + entry.ref.revision + (entry.ref.scope === 'package' ? ' · ' + translateShellText('Read-only original — Fork to author') : ''), row);
                    if (entry.ref.scope === 'project') action(doc, row, 'Edit project resource', () => edit(entry));
                    else if (entry.ref.scope === 'library') action(doc, row, 'Review Attach exact', async () => {
                        try {
                            const source = clone(state.source); source.dependencies ||= {}; source.dependencies.resources ||= [];
                            if (!source.dependencies.resources.some(ref => exactKey(ref) === exactKey(entry.ref))) source.dependencies.resources.push(entry.ref);
                            if (!await stageProject(source, formatProductText('Attach ${0}@${1}', [entry.resource.displayName, entry.ref.revision]))) throw new Error('ChangeSet could not be prepared. Check Problems / Changes.');
                        } catch (e) { error(doc, status, e); }
                    });
                    for (const derive of entry.ref.resourceType === 'core.prompt-program' ? [false, true] : [false]) action(doc, row, derive ? 'Review Derive' : 'Review Fork', async () => {
                        try {
                            const plan = forkPromptClosure(entries, entry, { derive, scope: { scope: 'project', projectId: state.projectId } });
                            await stage(plan.entries, (derive ? 'Derive ' : 'Fork ') + entry.resource.displayName);
                        } catch (e) { error(doc, status, e); }
                    });
                    resourceBundleExport(doc, row, entry.ref, entry.resource.displayName);
                    const details = element(doc, 'details', undefined, row); element(doc, 'summary', 'Inspector — origin / derived from / provenance', details);
                    element(doc, 'pre', JSON.stringify({ origin: entry.ref, derivedFrom: entry.resource.parentRef, provenance: entry.resource.provenance, conditions: entry.resource.condition, parameters: entry.resource.parameters }, null, 2), details);
                    action(doc, details, 'Used By', async () => { try { const rows = element(doc, 'div', undefined, details); renderResourceReferenceRows({ document: doc, root: rows, references: await nativeStudioClient.getResourceReferences(entry.ref, { reverse: true }), host }); } catch (e) { error(doc, status, e); } });
                }
            }; type.addEventListener('change', renderList); renderList();
        }
        const preview = element(doc, 'details', undefined, body); element(doc, 'summary', 'Compile preview — committed exact resources', preview);
        element(doc, 'p', 'Apply your reviewed changes first. Preview uses this committed Project revision and sends no model request.', preview);
        const config = await runtimeRequest(); if (!body.isConnected) return;
        const routes = select(doc, preview, 'Preview route', [['', 'Choose player route…'], ...config.routes.map(item => [item.runtimeRouteId, item.displayName, true])]);
        const prompt = select(doc, preview, 'Preview Prompt exact revision', [['', 'Use route Prompt'], ...entries.filter(item => item.ref.resourceType === 'core.prompt-program' && item.ref.scope !== 'package').map(item => [exactKey(item.ref), item.resource.displayName + ' · ' + item.ref.revision + ' · ' + item.ref.scope, true])]);
        const result = element(doc, 'div', undefined, preview);
        const compile = action(doc, preview, 'Compile committed Prompt', async () => {
            compile.disabled = true; result.replaceChildren();
            try {
                const route = config.routes.find(item => item.runtimeRouteId === routes.value); if (!route) throw new Error('Choose a configured route.');
                const output = await runtimeRequest('/preview', { method: 'POST', body: { requestId: createStudioNativeId('preview'), role: route.role.slice(5), projectId: state.projectId, revision: state.revision.revision,
                    routeRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, ...(prompt.value ? { previewRefs: { promptProgramRef: JSON.parse(prompt.value) } } : {}) } });
                element(doc, 'p', 'Compiled — no request sent', result); element(doc, 'pre', JSON.stringify(output, null, 2), result);
            } catch (e) { error(doc, result, e); } finally { compile.disabled = false; }
        });
    } catch (e) { loading.remove(); error(doc, body, e); action(doc, body, 'Retry resources', () => { body.replaceChildren(); void mountStudioPromptTools({ document: doc, body, state, stageProject, host, runtimeDesign }); }); }
}

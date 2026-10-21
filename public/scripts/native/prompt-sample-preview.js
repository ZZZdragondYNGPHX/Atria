import { runtimeRequest } from './runtime-client.js';
import { createStudioNativeId } from './studio-authoring.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';

const key = ref => JSON.stringify(ref, Object.keys(ref).sort());
// A route whose Program or Generation profile belongs to an installed Work resolves only
// inside that Work's stories, so a draft preview here cannot use it.
const PACKAGE_BOUND = 'Your model routes use an installed Work’s prompt resources, which can be previewed only inside that Work. Connect a model in Runtime to get a route of your own.';
const packageBound = route => [route.promptProgramRef, route.generationProfileRef].some(ref => ref?.scope === 'package');
const idFields = { 'core.prompt-module': 'promptModuleId', 'core.prompt-program': 'promptProgramId', 'core.generation-profile': 'generationProfileId' };

export function mountPromptSamplePreview({ document: doc, parent, entry, entries = [], readDependencies = () => [], readDraft, state }) {
    const el = (tag, text, parent) => { const node = doc.createElement(tag); if (text !== undefined) node.textContent = tl(text); parent?.append(node); return node; };
    const root = el('details', undefined, parent); root.className = 'atri-prompt-preview'; root.open = state.open ?? false;
    el('summary', 'Sample preview and trial', root); root.addEventListener('toggle', () => { state.open = root.open; if (root.open && !config) void load(); });
    const controls = el('div', undefined, root); controls.className = 'atri-prompt-sample-fields';
    const field = (label, initial = '', multiline = false) => {
        const wrap = el('label', label, controls); const input = el(multiline ? 'textarea' : 'input', undefined, wrap);
        input.value = initial; input.setAttribute('aria-label', tl(label)); return input;
    };
    const select = label => { const wrap = el('label', label, controls); const node = el('select', undefined, wrap); node.setAttribute('aria-label', tl(label)); return node; };
    const route = select('Sample model route'), baseline = select('Baseline program'), baselineResource = select('Baseline revision');
    const input = field('Sample input', state.input ?? '', true);
    const materials = field('Sample scene and materials', state.materials ?? '', true);
    const persona = field('Sample player persona', state.persona ?? '', true);
    const history = field('Sample history (JSON)', state.history ?? '[]', true);
    const parameters = field('Sample parameters (JSON)', state.parameters ?? '{}', true);
    const requests = field('Trial request budget', state.maxRequests ?? 1); requests.type = 'number'; requests.min = '1'; requests.max = '32';
    const tokens = field('Trial token budget', state.maxTokens ?? ''); tokens.type = 'number'; tokens.min = '1';
    const remember = () => Object.assign(state, { input: input.value, materials: materials.value, persona: persona.value, history: history.value,
        parameters: parameters.value, maxRequests: requests.value, maxTokens: tokens.value, routeId: route.value, baseline: baseline.value, baselineResource: baselineResource.value });
    controls.addEventListener('input', remember); controls.addEventListener('change', remember);
    el('p', 'Preview sends nothing. Trial uses the selected model and budget; its output stays in this workspace.', root);
    const actions = el('div', undefined, root); actions.className = 'atri-prompt-actions';
    const button = (label, handler, parent = actions) => { const node = el('button', label, parent); node.type = 'button'; node.className = 'atri-library-button'; node.addEventListener('click', handler); return node; };
    const status = el('p', undefined, root); status.setAttribute('role', 'status');
    const output = el('section', undefined, root); output.className = 'atri-prompt-preview-result';
    let config = null; let catalog = []; let loading = false;
    const sequence = () => state.sequence = (state.sequence ?? 0) + 1;
    function renderResult() {
        output.replaceChildren();
        const result = state.result; if (!result) return;
        let current = false; try { current = state.resultIdentity === JSON.stringify(readDraft()); } catch { /* The draft is being edited. */ }
        if (!current) el('p', 'This result reflects an earlier draft. Preview or try the current text again.', output);
        if (result.trial) {
            el('h4', result.trial.status === 'completed' ? 'Sample response' : 'Trial failed', output);
            el('pre', undefined, output).textContent = result.response?.text ?? result.trial.errorCode ?? '';
            const details = el('details', undefined, output); el('summary', 'Usage and trial details', details);
            el('pre', undefined, details).textContent = JSON.stringify(result.routing?.compute ?? {}, null, 2); return;
        }
        const tabs = el('div', undefined, output); tabs.className = 'atri-prompt-actions';
        for (const [layer, label] of [['authored', 'Authored'], ['effective', 'Effective'], ['wire', 'Provider Wire']]) {
            const tab = button(label, () => { state.layer = layer; renderResult(); }, tabs); tab.setAttribute('aria-pressed', String((state.layer ?? 'effective') === layer));
        }
        const layer = state.layer ?? 'effective';
        el('p', undefined, output).textContent = fmt('${0} changes', [result.diff[layer].length]);
        if (layer === 'effective') {
            const effective = result.candidate.effective;
            el('p', undefined, output).textContent = fmt('Input tokens: ${0}', [effective.inputTokens]);
            el('pre', undefined, output).textContent = effective.promptIr.semanticBlocks.map(block => block.message.role + ':\n' + (block.message.content ?? '')).join('\n\n');
            const details = el('details', undefined, output); el('summary', 'Compilation and sources', details);
            el('pre', undefined, details).textContent = JSON.stringify(effective.compilation, null, 2);
        } else el('pre', undefined, output).textContent = JSON.stringify(result.candidate[layer], null, 2);
        const before = el('details', undefined, output); el('summary', 'Baseline and differences', before);
        el('pre', undefined, before).textContent = JSON.stringify({ baseline: result.baseline[layer], changes: result.diff[layer] }, null, 2);
    }
    const candidateRef = resource => ({ ...entry.ref, resourceId: resource[idFields[entry.ref.resourceType]], revision: resource.revision });
    async function run(trial) {
        if (!config || state.controller) return;
        remember(); const generation = sequence(); state.controller = new AbortController();
        preview.disabled = trialButton.disabled = true; stop.disabled = false;
        state.notice = tl(trial ? 'Running sample…' : 'Preparing preview…'); state.refresh();
        try {
            const resource = readDraft(); const identity = JSON.stringify(resource);
            const sampleParameters = JSON.parse(parameters.value);
            const selected = config.routes.find(item => item.runtimeRouteId === route.value);
            if (!selected) throw new Error(tl('Choose a sample model route.'));
            const currentRef = candidateRef(resource); const original = catalog.find(item => key(item.ref) === key(currentRef));
            const drafts = [{ ref: currentRef, resource, expectedFingerprint: original?.fingerprint ?? null }];
            drafts.push(...readDependencies().map(item => ({ ref: item.ref, resource: item.resource, expectedFingerprint: null })));
            const baselineDrafts = [];
            const previousRef = baselineResource.value ? JSON.parse(baselineResource.value) : entry.ref;
            const previous = catalog.find(item => key(item.ref) === key(previousRef));
            const baseResource = previous?.resource ?? { ...entry.resource, revision: 'sample-baseline' };
            const baseRef = previous?.ref ?? candidateRef(baseResource);
            if (!previous) baselineDrafts.push({ ref: baseRef, resource: baseResource, expectedFingerprint: null });
            const refs = {};
            const baselineRefs = { promptProgramRef: baseline.value ? JSON.parse(baseline.value) : selected.promptProgramRef };
            if (entry.ref.resourceType === 'core.prompt-program') refs.promptProgramRef = currentRef;
            else if (entry.ref.resourceType === 'core.generation-profile') refs.generationProfileRef = currentRef;
            else {
                state.wrapperId ??= createStudioNativeId('pprog');
                const wrap = (module, moduleRef, revision) => {
                    const config = Object.fromEntries(Object.entries(sampleParameters).filter(([key]) => Object.hasOwn(module.parameters ?? {}, key)));
                    return { schemaVersion: 1, promptProgramId: state.wrapperId, revision, displayName: 'Module sample', parameters: module.parameters ?? {},
                        stages: [{ stageId: module.stages[0], moduleRefs: [moduleRef], contextConsumers: ['player_persona'] }],
                        derive: Object.keys(config).length ? [{ op: 'configure', stageId: module.stages[0], entryId: moduleRef.resourceId, config }] : [] };
                };
                const wrapper = wrap(resource, currentRef, 'sample');
                const ref = { scope: 'library', resourceType: 'core.prompt-program', resourceId: wrapper.promptProgramId, revision: wrapper.revision };
                refs.promptProgramRef = ref; drafts.push({ ref, resource: wrapper, expectedFingerprint: null });
                if (!baseline.value) {
                    const baselineWrapper = wrap(baseResource, baseRef, 'sample-baseline');
                    const baselineRef = { ...ref, revision: baselineWrapper.revision };
                    baselineRefs.promptProgramRef = baselineRef;
                    baselineDrafts.push({ ref: baselineRef, resource: baselineWrapper, expectedFingerprint: null });
                }
            }
            if (entry.ref.resourceType === 'core.prompt-program' && !baseline.value) baselineRefs.promptProgramRef = baseRef;
            if (entry.ref.resourceType === 'core.generation-profile') baselineRefs.generationProfileRef = baseRef;
            const sample = { input: input.value, materials: materials.value ? [materials.value] : [], persona: persona.value, history: JSON.parse(history.value) };
            const request = { ...(entry.ref.scope === 'project' ? { resourceProjectId: entry.ref.projectId } : {}), requestId: createStudioNativeId('preview'), role: selected.role.slice(5), routeRef: { scope: 'player', runtimeRouteId: selected.runtimeRouteId }, sample,
                prompt: { parameters: sampleParameters } };
            const body = trial ? { request, refs, drafts, limits: { maxRequests: Number(requests.value), maxTokens: Number(tokens.value) }, send: true }
                : { request, drafts, baselineDrafts: baseline.value && entry.ref.resourceType !== 'core.generation-profile' ? [] : baselineDrafts, baselineRefs, candidateRefs: refs };
            const result = await runtimeRequest(trial ? '/authoring/try' : '/preview/draft', { method: 'POST', body, signal: state.controller.signal });
            if (state.sequence !== generation) return;
            if (!trial && JSON.stringify(readDraft()) !== identity) { state.notice = tl('The draft changed. Preview again to see the current text.'); return; }
            state.result = result; state.resultIdentity = identity; state.notice = tl(trial ? 'Trial finished.' : 'Preview ready. No model request sent.');
        } catch (error) {
            if (state.sequence === generation) state.notice = error.name === 'AbortError' ? tl('Stopped. Provider usage may be unavailable.')
                : error.code === 'native_generation_resource_owner' ? tl(PACKAGE_BOUND) : error.message;
        } finally { state.controller = null; state.refresh(); }
    }
    const preview = button('Preview sample', () => run(false));
    const trialButton = button('Try sample (uses model)', () => run(true));
    const stop = button('Stop sample', () => state.controller?.abort()); stop.disabled = !state.controller;
    state.refresh = () => {
        if (!root.isConnected) return;
        status.textContent = state.notice ?? '';
        preview.disabled = trialButton.disabled = Boolean(state.controller) || ![...route.options].some(option => !option.disabled);
        stop.disabled = !state.controller; renderResult();
    };
    preview.disabled = trialButton.disabled = true;
    async function load() {
        if (loading) return; loading = true;
        status.textContent = tl('Loading sample routes…');
        try {
            const [configuration, resources] = await Promise.all([runtimeRequest(), runtimeRequest('/resources')]);
            if (!root.isConnected) return;
            config = configuration; catalog = [...resources, ...entries.filter(item => item.ref.scope === 'project' && !resources.some(saved => key(saved.ref) === key(item.ref)))];
            route.replaceChildren(); baseline.replaceChildren(); baselineResource.replaceChildren();
            for (const item of config.routes.filter(item => item.scope === 'player' && item.role !== 'role.illustration_prompt')) {
                const option = el('option', undefined, route); option.value = item.runtimeRouteId;
                option.disabled = packageBound(item);
                option.textContent = option.disabled ? item.displayName + ' — ' + tl('uses an installed Work’s resources') : item.displayName;
            }
            for (const [ref, title] of [[null, tl('Current resource')], ...catalog.filter(item => item.ref.resourceType === 'core.prompt-program' && item.ref.scope === 'library').map(item => [item.ref, item.resource.displayName + ' · ' + item.ref.revision])]) {
                const option = el('option', undefined, baseline); option.textContent = title; option.value = ref ? JSON.stringify(ref) : '';
            }
            for (const [ref, title] of [[null, tl('Current resource')], ...catalog.filter(item => item.ref.resourceType === entry.ref.resourceType && item.ref.resourceId === entry.ref.resourceId && item.ref.scope === entry.ref.scope).map(item => [item.ref, item.ref.revision])]) {
                const option = el('option', undefined, baselineResource); option.textContent = title; option.value = ref ? JSON.stringify(ref) : '';
            }
            const usable = [...route.options].filter(option => !option.disabled);
            if (usable.some(option => option.value === state.routeId)) route.value = state.routeId;
            else if (usable.length) route.value = usable[0].value;
            if ([...baseline.options].some(option => option.value === state.baseline)) baseline.value = state.baseline;
            if ([...baselineResource.options].some(option => option.value === state.baselineResource)) baselineResource.value = state.baselineResource;
            if (!tokens.value) { const selected = config.routes.find(item => item.runtimeRouteId === route.value); tokens.value = selected?.executionPolicy?.computeBudget?.maxTokens ?? config.models.find(item => item.modelProfileId === selected?.modelProfileRef.modelProfileId)?.limits.contextTokens ?? ''; }
            if (!state.controller) state.notice = tl(usable.length ? 'Ready for a sample.' : route.options.length ? PACKAGE_BOUND : 'Create a model route in Runtime to preview or try this sample.');
            state.refresh();
        } catch (error) { status.textContent = error.message; status.setAttribute('role', 'alert'); button('Retry sample routes', load); } finally { loading = false; }
    }
    renderResult(); if (root.open) void load();
    return root;
}

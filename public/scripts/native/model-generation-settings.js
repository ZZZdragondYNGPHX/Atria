import { generationFields } from './prompt-authoring.js';
import { createStudioNativeId } from './studio-authoring.js';
import { runtimeRequest } from './runtime-client.js';
import { confirmAtriaDraftLeave } from '../atria-shell/workspace-leave-guard.js';
import { translateShellText as t, formatShellText as fmt } from '../atria-shell/localization.js';
import { NATIVE_GENERATION_DEFAULTS as defaults } from '../../shared/native-generation-defaults.js';

const TYPE = 'core.generation-profile';
const key = ref => JSON.stringify([ref.scope, ref.resourceId, ref.revision, ref.projectId, ref.packageVersionId]);
const reference = resource => ({ scope: 'library', resourceType: TYPE, resourceId: resource.generationProfileId, revision: resource.revision });

// Publish through the existing resource/preset authorities. Model records never
// acquire a second set of sampling or reasoning values.
export async function publishModelGeneration(entry, resource, { request = runtimeRequest, signal, onCommitted } = {}) {
    if (entry.ref.scope !== 'library') throw new Error(t('Edit this configuration in its original workspace.'));
    if (!entry.presetOwner) {
        const saved = await request('/resources/revision', { method: 'POST', signal,
            body: { resourceType: TYPE, resource, expectedCurrentRevision: entry.fresh ? null : entry.ref.revision }, onCommitted });
        return { ...entry, fresh: false, ref: reference(saved), resource: saved };
    }
    const preset = await request('/presets/' + encodeURIComponent(entry.presetOwner), { signal });
    const index = preset.entries.findIndex(item => item.resourceType === TYPE && item.resource.generationProfileId === entry.ref.resourceId);
    if (index < 0 || preset.entries[index].resource.revision !== entry.ref.revision) throw new Error(t('This configuration has a newer revision. Reload before editing.'));
    const next = structuredClone(preset);
    next.entries[index].resource = resource;
    await request('/presets/' + encodeURIComponent(preset.presetId), { method: 'PUT', signal,
        body: { preset: next, expectedRevision: preset.revision }, onCommitted });
    const saved = await request('/presets/' + encodeURIComponent(preset.presetId), { signal });
    const generation = saved.entries.find(item => item.resourceType === TYPE).resource;
    return { ...entry, ref: reference(generation), resource: generation };
}

export async function applyModelGeneration(ref, targets, { request = runtimeRequest, signal } = {}) {
    const applied = [], failed = [];
    for (const target of targets) {
        try {
            if (!target.fingerprint) throw new Error(t('Reload linked routes before applying this revision.'));
            await request('/configuration/routes', { method: 'PUT', signal, expectedFingerprint: target.fingerprint,
                body: { ...target.route, generationProfileRef: ref } });
            applied.push(target);
        } catch (error) {
            if (signal?.aborted) throw error;
            failed.push({ ...target, error });
        }
    }
    return { applied, failed };
}

export function mountModelGenerationSettings({ document: doc, parent, modelForm, modelId, readModel, signal, isCurrent, onChanged }) {
    const root = doc.createElement('section'); root.className = 'atri-model-generation'; parent.append(root);
    root.dataset.atriaDraftDirty = 'false';
    let sequence = 0, configuration, entries = [], selected = null, read, baseline = '', busy = false, targets = [], pending = [], reloadRequired = false, busyButton = null;
    const node = (tag, text, parent = root) => {
        const el = doc.createElement(tag); if (tag === 'button') el.className = 'atria-button'; if (text !== undefined) el.textContent = t(text); parent.append(el); return el;
    };
    const heading = node('h3', 'Generation parameters');
    heading.id = 'generation-settings-' + createStudioNativeId('view'); root.setAttribute('aria-labelledby', heading.id);
    node('p', 'Edit the existing parameter scheme used by your routes. Model limits remain separate.', root).className = 'atri-runtime-help';
    const selection = node('div'); selection.className = 'atri-runtime-group';
    const pickerLabel = node('label', 'Generation configuration', selection);
    const picker = node('select', undefined, pickerLabel); picker.name = 'generationConfiguration'; picker.autocomplete = 'off'; picker.setAttribute('aria-label', t('Generation configuration'));
    const refresh = node('button', 'Reload configurations', selection); refresh.type = 'button';
    const body = node('div');
    const feedback = node('div'); feedback.className = 'atri-runtime-status'; feedback.setAttribute('aria-live', 'polite');
    const current = () => root.isConnected && isCurrent() && !signal.aborted;
    const message = (text, error = false) => { const el = node('p', text, feedback); el.setAttribute('role', error ? 'alert' : 'status'); return el; };
    function committed() { root.dataset.atriaDraftDirty = 'false'; root.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-committed', { bubbles: true })); }
    function setBusy(value, action) {
        busy = value; root.dataset.atriaSavePending = String(value); root.setAttribute('aria-busy', String(value));
        if (value && action) { busyButton = action; busyButton.setAttribute('aria-busy', 'true'); }
        if (!value) { busyButton?.removeAttribute('aria-busy'); busyButton = null; }
        for (const control of root.querySelectorAll('button,input,select,textarea,fieldset')) control.disabled = value || control.dataset.readOnly === 'true';
        if (reloadRequired) body.querySelector('.atri-model-generation-save')?.setAttribute('disabled', '');
    }
    const describe = error => ({
        native_resource_revision_conflict: t('This configuration has a newer revision. Reload before editing.'),
        native_prompt_preset_conflict: t('This configuration has a newer revision. Reload before editing.'),
        native_generation_configuration_conflict: t('This route changed. Reload configurations before applying the revision.'),
        native_generation_configuration_invalid: t('The route could not use this configuration. Check its model limits and protocol settings.'),
    }[error.code] || error.message || String(error));
    function error(error) { feedback.replaceChildren(); const alert = message(describe(error), true); alert.tabIndex = -1; (body.querySelector(':invalid') || alert).focus(); }
    function assertModelSaved(applying) {
        if (!applying.length) return;
        const saved = configuration.models.find(item => item.modelProfileId === modelId), draft = readModel();
        if (!saved || JSON.stringify(saved.limits) !== JSON.stringify(draft.limits) || saved.connectionProfileRef.connectionProfileId !== draft.connectionProfileRef.connectionProfileId)
            throw new Error(t('Save model connection and limits before applying parameters to routes.'));
    }
    function controls(entry, draft = entry.resource) {
        selected = entry; pending = []; body.replaceChildren(); targets = [];
        const nameLabel = node('label', 'Configuration name', body);
        const name = node('input', undefined, nameLabel); name.name = 'generationConfigurationName'; name.autocomplete = 'off'; name.value = draft.displayName; name.required = true; name.setAttribute('aria-label', t('Configuration name'));
        const details = node('details', undefined, body); node('summary', 'Configuration revision', details); node('code', entry.ref.resourceId + ' · ' + entry.ref.revision, details);
        const fields = node('fieldset', undefined, body); fields.className = 'atri-runtime-group'; node('legend', 'Generation parameters', fields);
        let tracking = false;
        const model = readModel(), connection = configuration.connections.find(item => item.connectionProfileId === model.connectionProfileRef?.connectionProfileId);
        const values = generationFields(doc, fields, draft, () => tracking, { providerAdapter: connection?.providerAdapter, outputLimit: () => Number(readModel().limits?.outputTokens) });
        read = () => ({ ...draft, displayName: name.value.trim(), ...values() });
        try { tracking = true; baseline = JSON.stringify(read()); } catch { baseline = ''; } finally { tracking = false; }
        const owners = node('fieldset', undefined, body); owners.className = 'atri-runtime-group'; node('legend', 'Routes using this configuration', owners);
        const routes = configuration.routes.filter(route => route.generationProfileRef.scope === entry.ref.scope && route.generationProfileRef.resourceId === entry.ref.resourceId);
        for (const route of routes) {
            const sameModel = route.modelProfileRef.modelProfileId === modelId;
            const label = node('label', undefined, owners);
            if (sameModel && entry.ref.scope === 'library') {
                const input = node('input', undefined, label); input.type = 'checkbox'; input.name = 'applyRoute'; input.value = route.runtimeRouteId; input.checked = true;
                input.setAttribute('aria-label', fmt('Apply to route ${0}', [route.displayName]));
                targets.push({ input, route, fingerprint: configuration.routeFingerprints?.[route.runtimeRouteId] });
            }
            node('span', undefined, label).textContent = route.displayName + ' · ' + t(sameModel ? 'This model' : 'Other model — keeps its current revision');
            node('small', undefined, label).textContent = route.generationProfileRef.revision;
        }
        if (!routes.some(route => route.modelProfileRef.modelProfileId === modelId)) node('p', 'No routes use this model and configuration yet. Select this scheme when creating a route.', owners);
        node('p', 'Only checked routes adopt the saved revision. Other routes keep their current settings.', owners);
        const save = node('button', targets.length ? 'Save and apply to checked routes' : 'Save configuration revision', body); save.type = 'button'; save.className = 'atria-button atri-model-generation-save'; save.dataset.variant = 'primary';
        const head = configuration.resources.find(item => item.resourceType === TYPE && item.resourceId === entry.ref.resourceId);
        if (entry.ref.scope !== 'library' || !entry.fresh && head?.currentRevision !== entry.ref.revision) {
            for (const control of [fields, name, save]) { control.dataset.readOnly = 'true'; control.disabled = true; }
            node('p', entry.ref.scope !== 'library' ? 'Edit this configuration in its original workspace.' : 'This is a pinned older revision. Reload configurations to edit the current version.', body);
        }
        if (entry.ref.scope !== 'library') {
            const copy = node('button', 'Copy configuration to Library', body); copy.type = 'button';
            copy.addEventListener('click', () => {
                if (busy || !confirmAtriaDraftLeave(doc, root)) return;
                const resource = { ...structuredClone(entry.resource), generationProfileId: createStudioNativeId('genprof'), revision: createStudioNativeId('rev') };
                const ref = reference(resource);
                resource.provenance = [...(resource.provenance || []), { source: 'atria.fork', ref: JSON.stringify({ source: entry.ref, baseRef: ref }) }];
                picker.value = 'new'; controls({ ref, resource, fresh: true }); root.dataset.atriaDraftDirty = 'true';
                feedback.replaceChildren(); message('A Library copy is ready. Save it to keep your parameter changes.');
            });
        }
        if (targets.length) {
            const apply = node('button', 'Apply selected revision to checked routes', body); apply.type = 'button';
            apply.addEventListener('click', async () => {
                if (busy || !current()) return;
                if (root.dataset.atriaDraftDirty === 'true') { error(new Error(t('Save or discard parameter edits before applying an existing revision.'))); return; }
                try { assertModelSaved(targets.filter(item => item.input.checked)); } catch (failure) { error(failure); return; }
                feedback.replaceChildren(); message('Applying generation parameters…'); setBusy(true, apply);
                try {
                    const result = await applyModelGeneration(entry.ref, targets.filter(item => item.input.checked), { signal });
                    if (!current()) return;
                    committed();
                    await onChanged?.(); await load(entry.ref, false);
                    pending = result.failed;
                    feedback.replaceChildren(); message(pending.length ? 'Some routes changed or could not be updated. Reload configurations to review them.' : 'Saved revision applied.', Boolean(pending.length));
                    if (pending.length) renderRetry(entry.ref, pending);
                } catch (failure) { if (current()) error(failure); } finally { if (current()) setBusy(false); }
            });
        }
        const dirty = () => {
            if (busy) return;
            try { tracking = true; root.dataset.atriaDraftDirty = String(JSON.stringify(read()) !== baseline); } catch { root.dataset.atriaDraftDirty = 'true'; } finally { tracking = false; }
        };
        body.oninput = dirty; body.onchange = dirty;
        save.addEventListener('click', async () => {
            if (busy || !current()) return;
            let value;
            try { if (!name.reportValidity()) return; value = read(); } catch (failure) { error(failure); return; }
            const applying = targets.filter(item => item.input.checked);
            try { assertModelSaved(applying); } catch (failure) { error(failure); return; }
            value.revision = createStudioNativeId('rev');
            feedback.replaceChildren(); message('Saving generation parameters…'); setBusy(true, save);
            let published = false;
            try {
                const saved = await publishModelGeneration(entry, value, { signal, onCommitted: () => { published = true; committed(); } });
                if (!current()) return;
                selected = saved;
                const result = await applyModelGeneration(saved.ref, applying, { signal });
                if (!current()) return;
                await onChanged?.();
                await load(saved.ref, false);
                pending = result.failed;
                feedback.replaceChildren();
                message(result.failed.length ? 'Configuration saved. Some routes could not be updated and still use their previous settings.' : result.applied.length ? 'Generation parameters saved and applied to checked routes.' : 'Configuration saved. Existing routes keep their pinned revisions.', Boolean(result.failed.length));
                if (result.failed.length) renderRetry(saved.ref, result.failed);
            } catch (failure) {
                if (!current()) return;
                error(failure);
                if (published) { reloadRequired = true; committed(); message('The revision was saved. Reload configurations before editing or applying it again.'); }
            } finally { if (current()) setBusy(false); }
        });
    }
    function renderRetry(ref, failed) {
        for (const target of failed) message(target.route.displayName + ': ' + describe(target.error), true);
        const retry = node('button', 'Retry applying saved revision', feedback); retry.type = 'button';
        retry.addEventListener('click', async () => {
            if (busy || !current()) return;
            setBusy(true, retry);
            try {
                const result = await applyModelGeneration(ref, pending.length ? pending : failed, { signal });
                if (!current()) return;
                pending = result.failed; feedback.replaceChildren();
                message(pending.length ? 'Some routes changed or could not be updated. Reload configurations to review them.' : 'Saved revision applied.');
                if (pending.length) renderRetry(ref, pending);
                await onChanged?.();
            } catch (failure) { if (current()) error(failure); } finally { if (current()) setBusy(false); }
        });
    }
    async function load(preferred = selected?.ref, clearFeedback = true) {
        const token = ++sequence;
        picker.disabled = refresh.disabled = true;
        if (clearFeedback) { feedback.replaceChildren(); message('Loading generation configurations…'); }
        try {
            const [config, resources] = await Promise.all([runtimeRequest('/configuration', { signal }), runtimeRequest('/resources', { signal })]);
            if (!current() || token !== sequence) return;
            configuration = config;
            if (reloadRequired && preferred?.scope === 'library') {
                const head = config.resources.find(item => item.resourceType === TYPE && item.resourceId === preferred.resourceId);
                if (head) preferred = { ...preferred, revision: head.currentRevision };
            }
            const bound = config.routes.filter(route => route.modelProfileRef.modelProfileId === modelId).map(route => key(route.generationProfileRef));
            entries = resources.filter(item => item.ref.resourceType === TYPE && !item.archived && (item.ref.scope !== 'library' || bound.includes(key(item.ref)) || key(item.ref) === (preferred && key(preferred)) || config.resources.some(root => root.resourceType === TYPE && root.resourceId === item.ref.resourceId && root.currentRevision === item.ref.revision)));
            picker.replaceChildren();
            for (const entry of entries) { const option = node('option', undefined, picker); option.value = key(entry.ref); option.textContent = entry.resource.displayName + ' · ' + t({ library: 'Library', project: 'Project', package: 'Package' }[entry.ref.scope]) + ' · ' + entry.ref.revision.slice(-8); }
            const create = node('option', 'New generation configuration', picker); create.value = 'new';
            const entry = entries.find(item => preferred && key(item.ref) === key(preferred)) || entries.find(item => bound.includes(key(item.ref))) || entries.find(item => item.ref.scope === 'library') || fresh();
            picker.value = entry.fresh ? 'new' : key(entry.ref); reloadRequired = false; controls(entry); committed();
            if (busy) setBusy(true);
            if (clearFeedback) feedback.replaceChildren();
        } catch (failure) { if (current() && token === sequence) error(failure); } finally { if (current() && token === sequence) { picker.disabled = refresh.disabled = false; } }
    }
    function fresh() {
        const resource = { schemaVersion: 1, generationProfileId: createStudioNativeId('genprof'), revision: createStudioNativeId('rev'), displayName: t('Generation settings'), output: { maxTokens: Math.min(defaults.outputTokens, Number(readModel().limits?.outputTokens) || defaults.outputTokens) }, streaming: { enabled: defaults.streaming } };
        return { ref: reference(resource), resource, fresh: true };
    }
    picker.addEventListener('change', () => {
        if (busy) return;
        const choice = picker.value;
        if (!confirmAtriaDraftLeave(doc, root)) { picker.value = selected.fresh ? 'new' : key(selected.ref); return; }
        controls(choice === 'new' ? fresh() : entries.find(item => key(item.ref) === choice)); feedback.replaceChildren(); committed();
    });
    refresh.addEventListener('click', () => { if (!busy && confirmAtriaDraftLeave(doc, root)) { reloadRequired = true; void load(); } });
    modelForm.addEventListener('change', event => {
        if (event.target.name !== 'Connection' || !selected || busy) return;
        try { const draft = read(); const dirty = root.dataset.atriaDraftDirty; const previousBaseline = baseline; controls(selected, draft); baseline = previousBaseline; root.dataset.atriaDraftDirty = dirty; } catch (failure) { error(failure); }
    });
    // Enter in a parameter field saves this scheme, never the enclosing model.
    root.addEventListener('keydown', event => {
        if (event.isComposing || event.keyCode === 229) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' || event.key === 'Enter' && event.target.matches('input:not([type="checkbox"])')) {
            event.preventDefault(); event.stopPropagation(); if (!busy) body.querySelector('.atri-model-generation-save')?.click();
        }
    });
    void load();
    return root;
}

import { generationFields, newPromptResource } from './prompt-authoring.js';
import { runtimeRequest, runtimeRemediation } from './runtime-client.js';
import { createStudioNativeId } from './studio-authoring.js';
import { NATIVE_GENERATION_DEFAULTS as defaults } from '../../shared/native-generation-defaults.js';
import { translateShellText as t } from '../atria-shell/localization.js';

// The API preset form edits the existing authorities together, with one save.
export function mountApiPresetFields({ doc, form, data, resources, route, field, number, group, notice, button, host, signal, isCurrent }) {
    let model = structuredClone(data.models.find(item => item.modelProfileId === route.modelProfileRef?.modelProfileId) ?? {
        schemaVersion: 1, scope: 'player', modelProfileId: createStudioNativeId('model'), displayName: '', remoteModelId: '',
        limits: { contextTokens: defaults.contextTokens, outputTokens: defaults.outputTokens }, tokenizer: { encoding: 'cl100k_base', source: 'user' }, capabilities: [],
    });
    let generation = structuredClone(resources.find(item => item.ref.resourceType === 'core.generation-profile'
        && ['scope', 'resourceId', 'revision', 'projectId', 'packageVersionId'].every(key => item.ref[key] === route.generationProfileRef?.[key]))?.resource
        ?? { ...newPromptResource('core.generation-profile'), output: {}, streaming: {} });
    const modelFields = group(form, 'Connection and model');
    const connections = data.connections.filter(item => ['provider.openai-compatible', 'provider.openai-responses', 'provider.anthropic', 'provider.gemini', 'provider.raw-text'].includes(item.providerAdapter));
    const connection = field(modelFields, 'Connection', model.connectionProfileRef?.connectionProfileId || '',
        [['', 'Choose…'], ...connections.map(item => [item.connectionProfileId, item.displayName, true])]); connection.required = true;
    const remote = field(modelFields, 'Remote model ID', model.remoteModelId); remote.required = true;
    const choices = field(modelFields, 'Available provider models', '', [['', 'Fetch models to choose…']]); choices.disabled = true;
    choices.parentElement.hidden = true;
    const actions = doc.createElement('div'); actions.className = 'atri-api-model-actions'; modelFields.append(actions);
    const feedback = doc.createElement('p'); feedback.className = 'atri-runtime-help'; feedback.setAttribute('role', 'status'); modelFields.append(feedback);
    let probeSequence = 0;
    let probeController;
    let discoveredModels = [];
    const fetch = button('Fetch models', async () => {
        if (!connection.value || fetch.disabled) { connection.reportValidity(); return; }
        const version = ++probeSequence, selected = data.connections.find(item => item.connectionProfileId === connection.value);
        probeController?.abort(); probeController = new AbortController();
        fetch.disabled = true; fetch.setAttribute('aria-busy', 'true'); feedback.textContent = t('Fetching available models…');
        feedback.setAttribute('role', 'status');
        try {
            const result = await runtimeRequest('/connections/probe', { method: 'POST', body: selected, signal: AbortSignal.any([signal, probeController.signal]) });
            if (!isCurrent() || version !== probeSequence) return;
            discoveredModels = result.models;
            choices.replaceChildren(); const empty = doc.createElement('option'); empty.textContent = t('Choose…'); empty.value = ''; choices.append(empty);
            for (const item of result.models) { const option = doc.createElement('option'); option.value = item.remoteModelId; option.textContent = item.displayName; choices.append(option); }
            choices.parentElement.hidden = false; choices.disabled = !result.models.length; feedback.textContent = t('Choose a model. Fetching does not change saved configuration.');
        } catch (error) { if (isCurrent() && version === probeSequence) { feedback.textContent = runtimeRemediation(error.code || error.message)[0]; feedback.setAttribute('role', 'alert'); } } finally { if (version === probeSequence) { fetch.disabled = false; fetch.removeAttribute('aria-busy'); } }
    }, actions);
    button('Manage connections', () => host.openRuntimeSection('connections'), actions);
    choices.addEventListener('change', () => {
        const item = discoveredModels.find(item => item.remoteModelId === choices.value); if (!item) return;
        remote.value = item.remoteModelId;
        if (item.limits?.contextTokens) context.value = item.limits.contextTokens;
        if (item.limits?.outputTokens) output.value = item.limits.outputTokens;
        output.dispatchEvent(new doc.defaultView.Event('input'));
        model.limitProvenance = item.limitProvenance ?? {};
        model.capabilities = item.capabilities ?? [];
        for (const control of overrides) { control.value = model.capabilities.find(value => value.capability === control.capability); control.input.value = control.value?.state || ''; }
        form.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    });
    const metadata = doc.createElement('details'); metadata.className = 'atri-api-model-limits';
    const summary = doc.createElement('summary'); summary.textContent = t('Model limits and capabilities'); metadata.append(summary); form.append(metadata);
    notice('These are model capabilities. The optional output budget below can request less.', metadata);
    const limits = group(metadata, 'Model limits');
    const context = number(limits, 'Context tokens', model.limits.contextTokens, 1); context.required = true;
    const output = number(limits, 'Output token limit', model.limits.outputTokens, 1); output.required = true;
    const encoding = field(limits, 'Tokenizer encoding', model.tokenizer?.encoding || 'cl100k_base', [['cl100k_base', 'cl100k_base'], ['o200k_base', 'o200k_base']]);
    const capabilities = group(metadata, 'Capabilities');
    const overrides = ['generation.streaming', 'generation.tools', 'generation.structured-output', 'generation.reasoning', 'generation.cache'].map(capability => {
        const value = model.capabilities.find(item => item.capability === capability);
        return { capability, value, input: field(capabilities, capability, value?.state || '', [['', 'Use adapter metadata'], ['unknown', 'Unknown'], ['unsupported', 'Unsupported'], ['supported', 'Supported — explicit user override']]) };
    });
    const generationBox = group(form, 'Generation parameters');
    notice('Saved once in this API preset. Games use these parameters with their own prompts.', generationBox);
    const controls = doc.createElement('div'); controls.className = 'atri-runtime-group'; generationBox.append(controls);
    let readGeneration;
    function drawGeneration() {
        controls.replaceChildren();
        const adapter = connections.find(item => item.connectionProfileId === connection.value)?.providerAdapter;
        if (!adapter) { notice('Select a connection to configure generation parameters.', controls); readGeneration = () => generation; return; }
        readGeneration = generationFields(doc, controls, generation, () => false, { providerAdapter: adapter, outputLimit: () => Number(output.value) });
    }
    let previousConnection = connection.value;
    connection.addEventListener('change', () => {
        try { generation = { ...generation, ...readGeneration() }; } catch { connection.value = previousConnection; return; }
        previousConnection = connection.value; probeSequence++; probeController?.abort(); fetch.disabled = false; fetch.removeAttribute('aria-busy');
        choices.replaceChildren(); choices.disabled = true; choices.parentElement.hidden = true; feedback.textContent = ''; drawGeneration();
    });
    drawGeneration();
    output.addEventListener('input', () => { const budget = controls.querySelector('input[name="Output budget"]'); if (budget) budget.max = output.value; });
    form.append(metadata);
    const reuse = doc.createElement('details'); reuse.className = 'atri-api-model-limits';
    const reuseTitle = doc.createElement('summary'); reuseTitle.textContent = t('Reuse saved configuration'); reuse.append(reuseTitle); form.append(reuse);
    notice('Copy saved values into this API preset. Saving does not change the original configuration.', reuse);
    const reuseFields = group(reuse, 'Saved configuration');
    const savedModel = field(reuseFields, 'Saved model', '', [['', 'Choose…'], ...data.models.map(item => [item.modelProfileId, item.displayName, true])]);
    savedModel.addEventListener('change', () => {
        const item = data.models.find(item => item.modelProfileId === savedModel.value); if (!item) return;
        model = structuredClone(item); remote.value = item.remoteModelId; context.value = item.limits.contextTokens; output.value = item.limits.outputTokens;
        output.dispatchEvent(new doc.defaultView.Event('input'));
        encoding.value = item.tokenizer.encoding; connection.value = item.connectionProfileRef.connectionProfileId;
        for (const control of overrides) { control.value = item.capabilities.find(value => value.capability === control.capability); control.input.value = control.value?.state || ''; }
        connection.dispatchEvent(new doc.defaultView.Event('change')); form.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    });
    const savedGenerations = data.profiles.filter(profile => !data.resources.find(item => item.resourceType === 'core.generation-profile' && item.resourceId === profile.generationProfileId)?.archived)
        .map(resource => ({ resource }));
    const savedParameters = field(reuseFields, 'Saved generation parameters', '', [['', 'Choose…'], ...savedGenerations.map((item, index) => [String(index), item.resource.displayName, true])]);
    savedParameters.addEventListener('change', () => {
        if (!savedParameters.value) return;
        generation = structuredClone(savedGenerations[Number(savedParameters.value)].resource); drawGeneration(); form.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    });
    return () => ({ model: { ...model, connectionProfileRef: { scope: 'player', connectionProfileId: connection.value }, remoteModelId: remote.value.trim(),
        limits: { contextTokens: Number(context.value), outputTokens: Number(output.value) }, tokenizer: { ...model.tokenizer, encoding: encoding.value, source: 'user' },
        capabilities: [...model.capabilities.filter(item => !overrides.some(control => control.capability === item.capability)),
            ...overrides.filter(item => item.input.value).map(item => item.value?.state === item.input.value ? item.value : { capability: item.capability, state: item.input.value, provenance: [{ kind: 'user-override', source: 'API preset' }] })] },
    generation: { ...generation, ...readGeneration() } });
}

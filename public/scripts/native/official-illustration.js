import { formatAtriaDate } from '../atria-shell/components.js';
import { translateShellText, formatShellText } from '../atria-shell/localization.js';
import { mountVisualGallery } from './visual-gallery-ui.js';
import { mountVisualDirector } from './visual-director-ui.js';
import { confirmAtriaDraftLeave } from '../atria-shell/workspace-leave-guard.js';
import { createIllustrationDraft, assertIllustrationDraft, matchDrawingCharacters, composeIllustrationPrompt } from '../../shared/illustration-plugin-contract.js';
import { illustrationNode as node, illustrationField as field, illustrationSelect as select, illustrationButton as button, ILLUSTRATION_CSS } from './illustration-ui.js';
import { renderIllustrationPreset, mountIllustrationSettings } from './illustration-settings-ui.js';
import { nativeAssetUrl } from './session-projection.js';
import { runtimeRequest } from './runtime-client.js';

export async function activate(sdk) {
    const doc = globalThis.document;
    const root = node(doc, null, 'section', undefined, 'atri-illustration-ui'); root.dataset.atriaOfficialIllustration = 'true';
    sdk.ui.mount(root); sdk.ui.style(ILLUSTRATION_CSS);
    const shellRoot = globalThis.Atria?.shell?.getRoot?.();
    if (shellRoot) {
        shellRoot.append(root);
        Object.assign(root.style, { position: 'absolute', inset: '0', zIndex: '5', pointerEvents: 'none' });
    }
    const toolbar = node(doc, root, 'div', undefined, 'atri-illustration-toolbar atri-illustration-actions');
    toolbar.setAttribute('aria-label', translateShellText('Illustration tools'));
    if (doc.defaultView.ResizeObserver) {
        const observer = new doc.defaultView.ResizeObserver(() => root.style.setProperty('--atri-illustration-toolbar-height', toolbar.getBoundingClientRect().height + 'px'));
        observer.observe(toolbar); sdk.onDispose(() => observer.disconnect());
    }
    const panel = node(doc, root, 'aside', undefined, 'atri-illustration-panel'); panel.hidden = true; panel.setAttribute('aria-label', translateShellText('Annotation card'));
    toolbar.style.pointerEvents = panel.style.pointerEvents = 'auto';
    const status = node(doc, toolbar, 'span'); status.setAttribute('role', 'status');
    let mode = false, pending = null, selectedId = null, settings = (await sdk.illustrations.settings.read()).value, configEditor;
    let visualConfiguration = await runtimeRequest('/visual/configuration');
    const drafts = new Map(), operations = new Map(), imageOperations = new Map(), watchers = new Map();
    const terminal = new Set(['completed', 'failed', 'cancelled', 'stale', 'uncertain_submission']);
    const promptErrors = { native_generation_route_missing: translateShellText('Create an illustration prompt route, then select it in illustration settings.'), native_generation_route_ambiguous: translateShellText('Several prompt routes are available. Select one in illustration settings.'), generation_secret_unavailable: translateShellText('The prompt connection secret is unavailable. Check the connection.'), native_illustration_source_unavailable: translateShellText('This older save lacks the original context. You can enter a prompt directly.'), generation_context_budget_exceeded: translateShellText('The selection and character details exceed the model context limit. Choose a larger prompt model.'), native_illustration_prompt_invalid: translateShellText('The model returned an invalid format. Retry prompt generation.') };
    const taskLabels = { queued: translateShellText('Waiting for the prompt model'), running: translateShellText('Generating a prompt'), streaming: translateShellText('Generating a prompt'), retrying: translateShellText('Retrying prompt generation'), finalizing: translateShellText('Saving the prompt version'), completed: translateShellText('Prompt version saved'), failed: translateShellText('Prompt generation failed. You can retry.'), cancelled: translateShellText('Prompt task cancelled'), stale: translateShellText('The annotation is unavailable. The result was not saved.') };
    const imageLabels = { submitting: translateShellText('Submitting the image task'), submitted: translateShellText('The provider accepted the image task.'), result_received: translateShellText('Image received. Waiting to publish.'), uncertain_submission: translateShellText('Submission status is uncertain. Check the provider. This task will not be resent automatically.'), queued: translateShellText('Image task queued'), running: translateShellText('Generating an image'), finalizing: translateShellText('Saving the image version'), completed: translateShellText('Image version saved'), failed: translateShellText('Image generation failed. You can retry.'), cancelled: translateShellText('Image task cancelled'), stale: translateShellText('The image destination is unavailable. The result was not saved.') };
    const imageErrors = { native_illustration_connection_missing: translateShellText('Select an image connection in illustration settings first.'), native_illustration_connection_invalid: translateShellText('Check the NovelAI image adapter and full endpoint URL.'), native_illustration_capabilities_invalid: translateShellText('Use the provider documentation to declare third-party image capabilities.'), native_illustration_prompt_empty: translateShellText('Confirm or enter an image prompt first.'), native_illustration_model_unsupported: translateShellText('The connection does not declare this model. Check its parameters and capabilities.'), native_illustration_parameters_unsupported: translateShellText('The image size, sampler or parameters exceed the declared connection capabilities.'), native_illustration_characters_unsupported: translateShellText('This model supports up to six separate character prompts.'), native_illustration_image_authentication_failed: translateShellText('The image provider rejected the selected secret. Check the connection.'), native_illustration_image_rate_limited: translateShellText('The image provider is rate limiting requests. Retry later.'), native_illustration_image_response_invalid: translateShellText('The image response does not match the protocol or is not a valid PNG. Check the connection capabilities.'), native_illustration_image_unreachable: translateShellText('The image provider is unreachable. You can retry.'), generation_secret_unavailable: translateShellText('The selected connection secret is unavailable. Check the connection.') };
    function watch(operation, submitted, step = 'prompt') {
        const id = operation.operationId;
        const labels = step === 'image' ? imageLabels : taskLabels, tasks = step === 'image' ? imageOperations : operations;
        if (watchers.has(id) || disposed) return;
        watchers.set(id, null);
        const poll = async () => {
            if (disposed) return;
            try {
                const result = await sdk.illustrations[step]('status', { operationId: id });
                if (disposed) return;
                const annotationId = result.operation.anchor.annotationId;
                tasks.set(annotationId, result.operation);
                if (terminal.has(result.operation.status)) {
                    watchers.delete(id);
                    if (selectedId === annotationId) readDraft();
                    const local = drafts.get(annotationId);
                    if (step === 'prompt' && submitted && JSON.stringify(local) === submitted) drafts.delete(annotationId);
                    if (selectedId === annotationId && !panel.hidden && !configEditor) renderCard();
                    const failureDetail = result.operation.errorCode === 'generation_context_budget_exceeded' ? translateShellText('; the selection and characters exceed the model context limit. Choose a larger prompt model') : result.operation.errorCode === 'native_illustration_prompt_invalid' ? translateShellText('; the model returned an invalid format. Retry prompt generation') : '';
                    notify(labels[result.operation.status] + (step === 'image' && result.operation.errorCode ? '；' + (imageErrors[result.operation.errorCode] ?? translateShellText('Check the image connection and retry.')) : failureDetail) + (step === 'prompt' && result.operation.status === 'completed' && drafts.has(annotationId) ? translateShellText('; your draft is preserved. Apply the new version from history.') : '。'), result.operation.status === 'failed');
                    return;
                }
                const indicator = panel.querySelector('[data-' + step + '-status="' + annotationId + '"]');
                if (indicator) indicator.textContent = labels[result.operation.status];
                watchers.set(id, setTimeout(poll, 750));
            } catch (error) {
                watchers.delete(id); if (!disposed) notify(translateShellText('Could not load task status. Reopen the card to reconnect.'), true);
            }
        };
        void poll();
    }
    let readDraft = () => {}, busy = false, disposed = false, galleryEditor = null;
    const navigation = globalThis.Atria?.shell?.getNavigation?.();
    const syncVisibility = () => {
        const route = navigation?.getRoute();
        root.hidden = !sdk.context.sessionId || Boolean(route && (route.domain !== 'play' || route.child?.id?.startsWith('utility.') || route.child?.id?.startsWith('skills')));
        if (root.hidden && configEditor) { configEditor.dispose(); configEditor = null; panel.hidden = true; }
    };
    const unsubscribeNavigation = navigation?.subscribe(syncVisibility);
    sdk.onDispose(() => unsubscribeNavigation?.()); syncVisibility();
    const writable = Boolean(sdk.context.sessionId && !sdk.context.historical);
    toolbar.hidden = !sdk.context.sessionId;
    const notify = (text, error = false) => { if (!disposed) { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); } };
    const run = callback => async () => {
        if (busy || disposed) return;
        busy = true;
        try { await callback(); } catch (error) { notify(error.status === 409 ? translateShellText('The annotation changed. Your draft is preserved. Reopen the card and compare before saving.') : imageErrors[error.code] ?? promptErrors[error.code] ?? error.message, true); } finally { busy = false; }
    };
    // Reconnect to server-owned tasks. UI disposal only releases polling.
    async function refreshTasks() {
        if (!writable) return;
        try {
            for (const step of ['prompt', 'image']) {
                const latest = new Map((await sdk.illustrations[step]('list')).map(operation => [operation.anchor.annotationId, operation]));
                for (const [annotationId, operation] of latest) {
                    (step === 'image' ? imageOperations : operations).set(annotationId, operation);
                    if (!terminal.has(operation.status)) watch(operation, undefined, step);
                    else if (operation.status === 'completed') await sdk.illustrations[step]('status', { operationId: operation.operationId });
                }
            }
        } catch { /* The card remains editable if task inventory is unavailable. */ }
    }
    await refreshTasks();
    function capture() {
        root.style.setProperty('--atri-illustration-controls-inset', sdk.illustrations.toolbarInset() + 'px');
        if (!mode || disposed) return;
        const selection = sdk.illustrations.selection();
        if (selection) pending = selection;
        else if (!doc.getSelection()?.isCollapsed || !root.contains(doc.activeElement)) pending = null;
        create.disabled = !pending || !writable; create.textContent = pending ? translateShellText('Annotate selection') : translateShellText('Select text to annotate');
    }
    const toggle = button(doc, toolbar, translateShellText('Reading mode'), run(() => {
        readDraft(); mode = !mode; toggle.textContent = mode ? translateShellText('Illustration mode') : translateShellText('Reading mode'); toggle.setAttribute('aria-pressed', String(mode));
        sdk.illustrations.setSelectionMode(mode); create.hidden = !mode;
        if (!mode) { panel.hidden = true; pending = null; }
        notify(mode ? translateShellText('Select text with a mouse, or long press and adjust the selection on a phone.') : translateShellText('Reading mode')); capture();
    })); toggle.setAttribute('aria-pressed', 'false'); toggle.disabled = !writable;
    const create = button(doc, toolbar, translateShellText('Select text to annotate'), run(async () => {
        if (!pending) return;
        const selection = { ...pending }, previous = sdk.illustrations.snapshot();
        const nextSettings = await sdk.illustrations.settings.read(); settings = nextSettings.value;
        const { draft } = createIllustrationDraft(selection.quote, settings, sdk.context.packageId);
        const result = await sdk.illustrations.command('createAnnotation', { ...selection, draft, expectedHead: previous.head });
        selectedId = result.state.annotations.at(-1).annotationId; pending = null;
        visualConfiguration = await runtimeRequest('/visual/configuration');
        notify(translateShellText('Annotation saved.')); capture(); renderCard();
    })); create.disabled = true; create.hidden = true;
    // Keep desktop selection on the explicit action. Touch uses its captured
    // canonical range and leaves native selection handles under browser control.
    sdk.events.listen(create, 'mousedown', event => event.preventDefault());
    button(doc, toolbar, translateShellText('Annotations and history'), run(async () => { if (configEditor && !confirmAtriaDraftLeave(doc, configEditor.root)) return; readDraft(); await refreshTasks(); visualConfiguration = await runtimeRequest('/visual/configuration'); if (!mode && writable) { mode = true; toggle.textContent = translateShellText('Illustration mode'); toggle.setAttribute('aria-pressed', 'true'); sdk.illustrations.setSelectionMode(true); create.hidden = false; } renderCard(); }));
    button(doc, toolbar, translateShellText('Gallery / Media Studio'), run(async () => {
        readDraft(); galleryEditor?.dispose(); panel.replaceChildren(); panel.hidden = false; panel.style.width = 'min(980px, calc(100vw - 32px))';
        button(doc, panel, translateShellText('Close gallery'), () => { if (!confirmAtriaDraftLeave(doc, panel)) return; galleryEditor?.dispose(); galleryEditor = null; panel.style.width = ''; panel.hidden = true; });
        galleryEditor = await mountVisualGallery({ document: doc, parent: panel, sdk, report: error => notify(error.message, true),
            onJob: started => { const operation = { operationId: started.operationId, status: 'queued', anchor: {} }; watch(operation, undefined, 'image'); } });
    }));
    sdk.onDispose(() => galleryEditor?.dispose());
    button(doc, toolbar, translateShellText('Image candidates'), run(async () => {
        readDraft(); panel.replaceChildren(); panel.hidden = false;
        button(doc, panel, translateShellText('Close candidates'), () => panel.hidden = true);
        await mountVisualDirector({ document: doc, parent: panel, sdk, report: error => notify(error.message, true) });
    }));
    button(doc, toolbar, translateShellText('Illustration settings'), run(() => {
        if (configEditor && !confirmAtriaDraftLeave(doc, configEditor.root)) return;
        readDraft(); readDraft = () => {}; configEditor?.dispose(); panel.replaceChildren(); panel.hidden = false;
        button(doc, panel, translateShellText('Close settings'), run(async () => { if (configEditor && !confirmAtriaDraftLeave(doc, configEditor.root)) return; configEditor?.dispose(); configEditor = null; settings = (await sdk.illustrations.settings.read()).value; visualConfiguration = await runtimeRequest('/visual/configuration'); panel.hidden = true; }));
        configEditor = mountIllustrationSettings({ document: doc, parent: panel, client: sdk.illustrations.settings, packageId: sdk.context.packageId, showEnabled: false });
    }));
    sdk.events.listen(doc, 'selectionchange', capture);
    sdk.events.listen(doc, 'pointerup', capture);
    sdk.events.listen(doc, 'keyup', capture);
    sdk.events.listen(doc, 'input', capture);
    sdk.events.listen(doc.defaultView, 'resize', capture);
    if (doc.defaultView.visualViewport) sdk.events.listen(doc.defaultView.visualViewport, 'resize', capture);
    capture();
    sdk.events.listen(panel, 'keydown', event => { if (event.key === 'Escape') { readDraft(); panel.hidden = true; toggle.focus(); } });
    sdk.illustrations.onSurfacesChanged(capture);
    function renderCard() {
        const sameCard = panel.querySelector('.atri-illustration-card')?.dataset.annotationId === selectedId;
        const openDetails = new Set(sameCard ? [...panel.querySelectorAll('details[open][data-section]')].map(item => item.dataset.section) : []);
        configEditor?.dispose(); configEditor = null;
        panel.replaceChildren(); panel.hidden = false;
        const snapshot = sdk.illustrations.snapshot(), state = snapshot.state;
        const annotations = state.annotations;
        if (!annotations.some(item => item.annotationId === selectedId)) selectedId = annotations.find(item => item.deletedAt === undefined)?.annotationId ?? annotations[0]?.annotationId;
        const heading = node(doc, panel, 'div', undefined, 'atri-illustration-actions'); node(doc, heading, 'h3', translateShellText('Annotation'));
        button(doc, heading, translateShellText('Close card'), run(() => { readDraft(); panel.hidden = true; toggle.focus(); }));
        if (!annotations.length) { node(doc, panel, 'p', mode ? translateShellText('Select text with a mouse, or long press and adjust the selection on a phone.') : translateShellText('Turn on illustration mode and select text to create an annotation.')); readDraft = () => {}; return; }
        select(doc, panel, translateShellText('Current annotation'), selectedId, annotations.map(item => [item.annotationId, (item.deletedAt === undefined ? '' : translateShellText('Deleted · ')) + item.anchor.quote.slice(0, 48)]), id => {
            try { readDraft(); selectedId = id; renderCard(); } catch (error) { notify(error.message, true); }
        });
        const annotation = annotations.find(item => item.annotationId === selectedId);
        const card = node(doc, panel, 'article', undefined, 'atri-illustration-card'); card.dataset.annotationId = annotation.annotationId;
        node(doc, card, 'blockquote', annotation.anchor.quote);
        const deleted = annotation.deletedAt !== undefined;
        const draft = drafts.get(selectedId) ?? structuredClone(annotation.draft ?? createIllustrationDraft(annotation.anchor.quote, settings, sdk.context.packageId).draft);
        drafts.set(selectedId, draft);
        const editor = node(doc, card, 'fieldset'); editor.disabled = !writable || deleted; node(doc, editor, 'legend', translateShellText('Prompt and characters'));
        const allowed = settings.characters.filter(item => item.enabled && settings.works[sdk.context.packageId]?.characterIds.includes(item.id));
        const matches = matchDrawingCharacters(annotation.anchor.quote, settings.characters, allowed.map(item => item.id));
        for (const ambiguity of matches.ambiguous) node(doc, editor, 'p', formatShellText('Several characters are named “${0}”. Choose the intended character below.', [ambiguity.name]));
        const manual = select(doc, editor, translateShellText('Add a character, including pronoun references'), '', [['', translateShellText('Choose a drawing character')], ...allowed.filter(item => !draft.characters.some(current => current.character.id === item.id)).map(item => [item.id, item.name + ' · ' + item.id])], () => {});
        button(doc, editor, translateShellText('Add selected character'), run(() => {
            readDraft(); const character = allowed.find(item => item.id === manual.value);
            if (!character || draft.characters.some(item => item.character.id === character.id)) return;
            draft.characters.push({ character: structuredClone(character), dynamicPrompt: '', clothing: character.defaultClothing }); renderCard();
        }));
        for (const item of draft.characters) {
            const group = node(doc, editor, 'fieldset'); node(doc, group, 'legend', item.character.name);
            node(doc, group, 'p', formatShellText('Fixed appearance: ${0}', [item.character.fixedPrompt || translateShellText('Not provided')]));
            field(doc, group, formatShellText('Outfit · ${0}', [item.character.name]), item.clothing, text => item.clothing = text);
            field(doc, group, formatShellText('Scene description · ${0}', [item.character.name]), item.dynamicPrompt, text => item.dynamicPrompt = text, { multiline: true });
            button(doc, group, formatShellText('Remove character · ${0}', [item.character.name]), run(() => { readDraft(); draft.characters = draft.characters.filter(current => current !== item); renderCard(); }));
        }
        field(doc, editor, translateShellText('Scene and composition'), draft.scene, text => draft.scene = text, { multiline: true });
        field(doc, editor, translateShellText('Image prompt, directly editable'), draft.prompt, text => draft.prompt = text, { multiline: true });
        const preset = node(doc, editor, 'details'); preset.dataset.section = 'preset'; preset.open = openDetails.has('preset'); node(doc, preset, 'summary', translateShellText('Annotation preset and parameters'));
        const parsePreset = renderIllustrationPreset(doc, preset, draft.preset);
        const imageSelection = { imageTargetId: annotation.imageSelection?.imageTargetId ?? null, imageRenderingId: annotation.imageSelection?.imageRenderingId ?? null };
        const targetChoices = [['', translateShellText('Use the inherited target')], ...visualConfiguration.targets.map(item => [item.imageTargetId, item.displayName])];
        const renderingChoices = [['', translateShellText('Use the inherited style')], ...visualConfiguration.renderings.map(item => [item.imageRenderingId, item.displayName])];
        select(doc, editor, translateShellText('Image target for this annotation'), imageSelection.imageTargetId ?? '', targetChoices, value => imageSelection.imageTargetId = value || null);
        select(doc, editor, translateShellText('Image style for this annotation'), imageSelection.imageRenderingId ?? '', renderingChoices, value => imageSelection.imageRenderingId = value || null);
        let taskTargetId = '', taskRenderingId = '';
        select(doc, editor, translateShellText('Target for this generation only'), '', targetChoices, value => taskTargetId = value);
        select(doc, editor, translateShellText('Style for this generation only'), '', renderingChoices, value => taskRenderingId = value);
        readDraft = () => { parsePreset(); assertIllustrationDraft(draft); };
        const actions = node(doc, editor, 'div', undefined, 'atri-illustration-actions');
        button(doc, actions, translateShellText('Save card'), run(async () => {
            readDraft(); await sdk.illustrations.command('updateAnnotation', { annotationId: annotation.annotationId, draft, imageSelection, expectedHead: snapshot.head });
            drafts.delete(annotation.annotationId); notify(translateShellText('Card saved.')); renderCard();
        }));
        const operation = operations.get(annotation.annotationId);
        const active = operation && !terminal.has(operation.status);
        const promptButton = button(doc, actions, active ? translateShellText('Generating prompt') : translateShellText('Generate prompt'), run(async () => {
            readDraft(); const submitted = structuredClone(draft);
            await sdk.illustrations.command('updateAnnotation', { annotationId: annotation.annotationId, draft: submitted, imageSelection, expectedHead: sdk.illustrations.snapshot().head });
            const started = await sdk.illustrations.prompt('start', { annotationId: annotation.annotationId });
            const operation = { operationId: started.operationId, status: 'queued', anchor: { annotationId: annotation.annotationId } };
            operations.set(annotation.annotationId, operation); watch(operation, JSON.stringify(submitted));
            notify(translateShellText('Prompt task submitted. You can keep reading or editing the card.')); renderCard();
        })); promptButton.disabled = Boolean(active); promptButton.setAttribute('aria-busy', String(Boolean(active)));
        const taskStatus = node(doc, actions, 'span', operation ? taskLabels[operation.status] : '');
        taskStatus.dataset.promptStatus = annotation.annotationId; taskStatus.setAttribute('role', 'status');
        if (active) button(doc, actions, translateShellText('Cancel prompt task'), run(async () => {
            await sdk.illustrations.prompt('cancel', { operationId: operation.operationId }); notify(translateShellText('Prompt cancellation requested.'));
        }));
        const imageOperation = imageOperations.get(annotation.annotationId), imageActive = imageOperation && !terminal.has(imageOperation.status);
        const imageButton = button(doc, actions, imageActive ? translateShellText('Generating image') : translateShellText('Generate image'), run(async () => {
            readDraft(); const submitted = structuredClone(draft);
            const saved = await sdk.illustrations.command('updateAnnotation', { annotationId: annotation.annotationId, draft: submitted, imageSelection, expectedHead: sdk.illustrations.snapshot().head });
            const preview = await sdk.illustrations.image('prepare', { annotationId: annotation.annotationId, expectedHead: saved.head,
                ...(taskTargetId ? { imageTargetId: taskTargetId } : {}), ...(taskRenderingId ? { imageRenderingId: taskRenderingId } : {}) });
            const approvalBox = node(doc, actions, 'fieldset'); node(doc, approvalBox, 'legend', translateShellText('Confirm image task'));
            node(doc, approvalBox, 'p', preview.target.name + ' · ' + preview.target.model + ' · ' + (preview.cost.kind === 'unknown' ? translateShellText('Cost unknown') : preview.cost.kind === 'free' ? translateShellText('No API charge') : translateShellText('Estimated maximum: ') + preview.cost.upperBound + ' ' + preview.cost.currency));
            node(doc, approvalBox, 'p', translateShellText('Target source: ') + (preview.selection.imageTargetIdOrigin ?? translateShellText('Style default')) + translateShellText('; style source: ') + (preview.selection.imageRenderingIdOrigin ?? translateShellText('Default')));
            node(doc, approvalBox, 'p', translateShellText('Results enter history first. Select a version to display it in the story.'));
            let maxCost = String(preview.cost.upperBound ?? 0), currency = preview.cost.currency || 'USD', allowUnknownCost = false;
            field(doc, approvalBox, translateShellText('Cost limit for this task'), maxCost, text => maxCost = text, { type: 'number' });
            field(doc, approvalBox, translateShellText('Currency'), currency, text => currency = text);
            if (preview.cost.kind === 'unknown') field(doc, approvalBox, translateShellText('I accept unknown provider costs and reserve the entered amount'), false, value => allowUnknownCost = value, { type: 'checkbox' });
            button(doc, approvalBox, translateShellText('Approve generation'), run(async () => {
                const started = await sdk.illustrations.image('start', { prepareId: preview.prepareId, approval: { targetFingerprint: preview.targetFingerprint,
                    requestHash: preview.requestHash, maxCost: Number(maxCost), currency, allowUnknownCost, externalAssetIds: [], omittedPreferred: [] } });
                const operation = { operationId: started.operationId, status: 'queued', anchor: { annotationId: annotation.annotationId } };
                imageOperations.set(annotation.annotationId, operation); watch(operation, undefined, 'image');
                notify(translateShellText('Image task submitted. You can keep reading or editing.')); renderCard();
            }));
            button(doc, approvalBox, translateShellText('Cancel'), () => approvalBox.remove());
            approvalBox.querySelector('input')?.focus();
        }));
        const syncImageButton = () => { imageButton.disabled = Boolean(imageActive) || !draft.prompt.trim(); imageButton.setAttribute('aria-busy', String(Boolean(imageActive))); };
        syncImageButton(); editor.addEventListener('input', syncImageButton);
        const imageStatus = node(doc, actions, 'span', imageOperation ? imageLabels[imageOperation.status] : '');
        imageStatus.dataset.imageStatus = annotation.annotationId; imageStatus.setAttribute('role', 'status');
        if (imageActive) button(doc, actions, translateShellText('Cancel image task'), run(async () => {
            await sdk.illustrations.image('cancel', { operationId: imageOperation.operationId }); notify(translateShellText('Image cancellation requested.'));
        }));
        node(doc, editor, 'p', translateShellText('Prompt generation saves a new version. Generate an image separately, or enter a prompt directly.'));
        button(doc, editor, translateShellText('Compose prompt from current sections'), run(() => { readDraft(); draft.prompt = composeIllustrationPrompt(draft); renderCard(); }));
        button(doc, editor, translateShellText('Apply latest characters and preset'), run(async () => {
            readDraft(); settings = (await sdk.illustrations.settings.read()).value;
            draft.characters = draft.characters.map(item => {
                const character = settings.characters.find(current => current.id === item.character.id);
                return character ? { ...item, character: structuredClone(character) } : item;
            });
            draft.preset = structuredClone(settings.works[sdk.context.packageId]?.preset ?? settings.preset);
            notify(translateShellText('Character and preset snapshots updated. The full prompt is preserved and can be recomposed from sections.')); renderCard();
        }));
        const preview = node(doc, editor, 'details'); node(doc, preview, 'summary', translateShellText('Preview image request'));
        const previewText = node(doc, preview, 'pre');
        const previewInput = () => { previewText.textContent = JSON.stringify({ authoring: 'raw', prompt: draft.prompt, negativePrompt: draft.preset.negativePrompt, style: draft.preset.style }, null, 2); };
        editor.addEventListener('input', () => { if (preview.open) previewInput(); });
        preview.addEventListener('toggle', () => { if (preview.open) { try { readDraft(); previewInput(); } catch (error) { notify(error.message, true); } } });
        const promptHistory = node(doc, card, 'details'); promptHistory.dataset.section = 'prompts'; promptHistory.open = openDetails.has('prompts'); node(doc, promptHistory, 'summary', translateShellText('Prompt history'));
        for (const version of [...(annotation.promptVersions ?? [])].reverse()) {
            const row = node(doc, promptHistory, 'article');
            node(doc, row, 'p', formatAtriaDate(version.createdAt)); node(doc, row, 'pre', version.draft.prompt);
            const evidence = node(doc, row, 'details'); node(doc, evidence, 'summary', translateShellText('Generation context, characters and route'));
            evidence.addEventListener('toggle', () => { if (evidence.open && !evidence.querySelector('pre')) node(doc, evidence, 'pre', JSON.stringify({ characters: version.draft.characters, preset: version.draft.preset, template: version.template, request: version.requestSnapshot }, null, 2)); });
            const apply = button(doc, row, translateShellText('Use this prompt version'), run(() => { readDraft(); drafts.set(annotation.annotationId, structuredClone(version.draft)); renderCard(); notify(translateShellText('Version loaded into the editor. Save the card to apply it.')); })); apply.disabled = !writable || deleted;
        }
        if (!annotation.promptVersions?.length) node(doc, promptHistory, 'p', translateShellText('No generated prompt versions yet.'));
        button(doc, editor, translateShellText('Delete annotation'), run(async () => {
            await sdk.illustrations.command('deleteAnnotation', { annotationId: annotation.annotationId, expectedHead: snapshot.head });
            drafts.delete(annotation.annotationId); notify(translateShellText('Annotation deleted. Image history is preserved.')); renderCard();
        }));
        const history = node(doc, card, 'details', undefined, 'atri-illustration-history'); history.dataset.section = 'history'; history.open = openDetails.has('history'); node(doc, history, 'summary', translateShellText('Image history'));
        const images = state.images.filter(item => item.annotationId === annotation.annotationId);
        if (!images.length) node(doc, history, 'p', translateShellText('No image versions yet.'));
        const hide = button(doc, history, translateShellText('Hide the displayed image'), run(async () => {
            readDraft(); await sdk.illustrations.command('selectImageVersion', { annotationId: annotation.annotationId, imageVersionId: null, expectedHead: snapshot.head }); renderCard();
        })); hide.disabled = !writable || deleted || !annotation.selectedImageVersionId;
        for (const image of images) {
            const version = node(doc, history, 'article'); const img = node(doc, version, 'img');
            img.src = nativeAssetUrl(image.assetId); img.alt = image.alt || annotation.anchor.quote; img.width = image.width; img.height = image.height; img.loading = 'lazy'; img.decoding = 'async';
            node(doc, version, 'p', image.imageVersionId === annotation.selectedImageVersionId ? translateShellText('Displayed version') : translateShellText('Previous version'));
            const details = node(doc, version, 'details'); node(doc, details, 'summary', translateShellText('Actual prompt and parameters'));
            details.addEventListener('toggle', () => { if (details.open && !details.querySelector('pre')) node(doc, details, 'pre', JSON.stringify({ prompt: image.prompt, negativePrompt: image.negativePrompt, parameters: image.parameters, ...(image.requestSnapshot ? { requestSnapshot: image.requestSnapshot } : {}) }, null, 2)); });
            const choose = button(doc, version, translateShellText('Display this version'), run(async () => {
                readDraft(); await sdk.illustrations.command('selectImageVersion', { annotationId: annotation.annotationId, imageVersionId: image.imageVersionId, expectedHead: snapshot.head }); renderCard();
            })); choose.disabled = !writable || deleted || image.imageVersionId === annotation.selectedImageVersionId;
        }
        if (deleted) node(doc, card, 'p', translateShellText('This annotation was deleted. Its image history is preserved.'));
    }
    return () => { disposed = true; for (const timer of watchers.values()) clearTimeout(timer); watchers.clear(); configEditor?.dispose(); drafts.clear(); };
}

import { DiffMatchPatch, DOMPurify, localforage } from '../lib.js';
import { chat, event_types, eventSource, getCurrentChatId, reloadCurrentChat } from '../script.js';
import { t } from './i18n.js';
import { oai_settings } from './openai.js';
import { Popup, POPUP_TYPE } from './popup.js';
import { power_user, registerDebugFunction } from './power-user.js';
import { isMobile } from './RossAscends-mods.js';
import { renderTemplateAsync } from './templates.js';
import { deleteItemizedPromptIndexMessage, ItemizedPromptStore, swapItemizedPromptIndexMessageIds } from './atri-itemized-prompt-store.js';
import { getFriendlyTokenizerName, getTokenCountsAsync } from './tokenizers.js';
import { copyText } from './utils.js';

const promptStorage = localforage.createInstance({ name: 'SillyTavern_Prompts' });
const promptStore = new ItemizedPromptStore(promptStorage);
export let itemizedPrompts = [];

let activePromptChatId = '';
let itemizedFlushTimer = null;
let itemizedPendingChatId = null;
let itemizedMutationQueue = Promise.resolve();

function replacePromptSummaries(entries) {
    itemizedPrompts.length = 0;
    itemizedPrompts.push(...(Array.isArray(entries) ? entries : []));
}

function queuePromptMutation(task) {
    itemizedMutationQueue = itemizedMutationQueue
        .catch(() => undefined)
        .then(task);
    return itemizedMutationQueue;
}

async function waitForPromptMutations() {
    await itemizedMutationQueue.catch(() => undefined);
}

/**
 * Gets the lightweight itemized-prompt index for a chat.
 * Prompt bodies stay in independent records and are read only when requested.
 * Legacy full-array records are migrated lazily on first access and preserved.
 * @param {string} chatId Chat ID to load
 */
export async function loadItemizedPrompts(chatId) {
    await flushItemizedPromptsSave();
    const targetChatId = String(chatId || '').trim();
    activePromptChatId = targetChatId;
    if (!targetChatId) {
        replacePromptSummaries([]);
        return;
    }

    try {
        const index = await promptStore.loadIndex(targetChatId);
        replacePromptSummaries(index);
        await eventSource.emit(event_types.ITEMIZED_PROMPTS_LOADED, { chatId: targetChatId });
    } catch {
        console.log('Error loading itemized prompt index for chat', targetChatId);
        replacePromptSummaries([]);
    }
}

/**
 * Persists the current lightweight index, copies diagnostics to a branch /
 * checkpoint target, or imports a caller-supplied full prompt array.
 * @param {string} chatId Chat ID to save itemized prompts for
 * @param {Array} prompts Prompt summaries or full prompt records
 */
export async function saveItemizedPrompts(chatId, prompts = itemizedPrompts) {
    const targetChatId = String(chatId || '').trim();
    if (!targetChatId) return;

    try {
        await waitForPromptMutations();
        const list = Array.isArray(prompts) ? prompts : [];
        const containsFullRecords = list.some(item => item && typeof item === 'object' && !item.recordId && (
            Object.hasOwn(item, 'rawPrompt')
            || Object.hasOwn(item, 'worldInfoString')
            || Object.hasOwn(item, 'finalPrompt')
        ));

        if (containsFullRecords) {
            const index = await promptStore.replaceChatFromRecords(targetChatId, list);
            if (targetChatId === activePromptChatId) replacePromptSummaries(index);
        } else if (activePromptChatId && targetChatId !== activePromptChatId) {
            await promptStore.copyChat(activePromptChatId, targetChatId, itemizedPrompts);
        } else {
            await promptStore.persistIndex(targetChatId, list);
        }

        await eventSource.emit(event_types.ITEMIZED_PROMPTS_SAVED, { chatId: targetChatId });
    } catch {
        console.log('Error saving itemized prompts for chat', targetChatId);
    }
}

const ITEMIZED_FLUSH_DELAY_MS = 1000;

/**
 * Coalesces lightweight index writes. Full diagnostic bodies are persisted by
 * upsertItemizedPrompt() one record at a time, so normal chat saves no longer
 * rewrite the full diagnostic history.
 * @param {string} chatId
 */
export function saveItemizedPromptsDebounced(chatId) {
    const targetChatId = String(chatId || '').trim();
    if (!targetChatId) return;

    itemizedPendingChatId = targetChatId;
    if (itemizedFlushTimer) return;
    itemizedFlushTimer = setTimeout(() => {
        itemizedFlushTimer = null;
        const flushChatId = itemizedPendingChatId;
        itemizedPendingChatId = null;
        if (!flushChatId) return;
        const snapshot = itemizedPrompts.map(entry => ({ ...entry }));
        queuePromptMutation(() => promptStore.persistIndex(flushChatId, snapshot))
            .catch((error) => console.warn('saveItemizedPromptsDebounced: flush failed', error));
    }, ITEMIZED_FLUSH_DELAY_MS);
}

export async function flushItemizedPromptsSave() {
    if (itemizedFlushTimer) {
        clearTimeout(itemizedFlushTimer);
        itemizedFlushTimer = null;
    }

    const flushChatId = itemizedPendingChatId;
    itemizedPendingChatId = null;
    if (flushChatId) {
        const snapshot = itemizedPrompts.map(entry => ({ ...entry }));
        await queuePromptMutation(() => promptStore.persistIndex(flushChatId, snapshot));
    }
    await waitForPromptMutations();
}

function cancelItemizedPromptsDebounced() {
    if (itemizedFlushTimer) {
        clearTimeout(itemizedFlushTimer);
        itemizedFlushTimer = null;
    }
    itemizedPendingChatId = null;
}

/**
 * Persists one prompt diagnostic and updates only the lightweight index.
 * @param {object} promptRecord Full prompt diagnostic record
 * @param {string} [chatId] Target chat; defaults to the active prompt chat
 * @returns {Promise<void>}
 */
export async function upsertItemizedPrompt(promptRecord, chatId = activePromptChatId || getCurrentChatId()) {
    const targetChatId = String(chatId || '').trim();
    if (!targetChatId || !promptRecord || typeof promptRecord !== 'object') return;
    const baseIndex = targetChatId === activePromptChatId
        ? itemizedPrompts.map(entry => ({ ...entry }))
        : null;
    const next = await queuePromptMutation(() => promptStore.upsert(targetChatId, promptRecord, baseIndex));
    if (targetChatId === activePromptChatId) replacePromptSummaries(next);
}

/**
 * Replaces the raw prompt text for a single message without loading or writing
 * the chat's other prompt diagnostics.
 * @param {number} mesId Message ID
 * @param {string} promptText New raw prompt text
 */
export async function replaceItemizedPromptText(mesId, promptText) {
    if (!activePromptChatId) return;
    const baseIndex = itemizedPrompts.map(entry => ({ ...entry }));
    const next = await queuePromptMutation(() => (
        promptStore.replaceRawPrompt(activePromptChatId, mesId, promptText, baseIndex)
    ));
    replacePromptSummaries(next);
}

/**
 * Deletes all prompt diagnostics for a chat, including both the P-02 layout
 * and the preserved legacy array.
 * @param {string} chatId Chat ID to delete
 */
export async function deleteItemizedPrompts(chatId) {
    const targetChatId = String(chatId || '').trim();
    if (!targetChatId) return;
    try {
        if (itemizedPendingChatId === targetChatId) cancelItemizedPromptsDebounced();
        await waitForPromptMutations();
        await promptStore.deleteChat(targetChatId);
        if (activePromptChatId === targetChatId) replacePromptSummaries([]);
        await eventSource.emit(event_types.ITEMIZED_PROMPTS_DELETED, { chatId: targetChatId, all: false });
    } catch {
        console.log('Error deleting itemized prompts for chat', targetChatId);
    }
}

/**
 * Empties all prompt diagnostics and caches.
 */
export async function clearItemizedPrompts() {
    try {
        cancelItemizedPromptsDebounced();
        await waitForPromptMutations();
        await promptStore.clear();
        replacePromptSummaries([]);
        await eventSource.emit(event_types.ITEMIZED_PROMPTS_DELETED, { all: true });
    } catch {
        console.log('Error clearing itemized prompts');
    }
}

/**
 * Explicit rollback aid for P-02. Rebuilds the old per-chat full-array key
 * from the current per-record layout without deleting the new layout.
 * @param {string} [chatId] Chat ID
 * @returns {Promise<Array>}
 */
export async function rollbackItemizedPromptsStorage(chatId = activePromptChatId || getCurrentChatId()) {
    const targetChatId = String(chatId || '').trim();
    if (!targetChatId) return [];
    await waitForPromptMutations();
    return await promptStore.rollbackToLegacy(
        targetChatId,
        targetChatId === activePromptChatId ? itemizedPrompts : null,
    );
}

export async function itemizedParams(itemizedPrompts, thisPromptSet, incomingMesId) {
    const promptSet = itemizedPrompts[thisPromptSet];
    const [
        charDescriptionTokens,
        charPersonalityTokens,
        scenarioTextTokens,
        userPersonaStringTokens,
        worldInfoStringTokens,
        allAnchorsTokens,
        authorsNoteStringTokens,
        smartContextStringTokens,
        beforeScenarioAnchorTokens,
        afterScenarioAnchorTokens,
        zeroDepthAnchorTokens,
        chatInjects,
        chatVectorsStringTokens,
        dataBankVectorsStringTokens,
    ] = await getTokenCountsAsync([
        promptSet.charDescription,
        promptSet.charPersonality,
        promptSet.scenarioText,
        promptSet.userPersona,
        promptSet.worldInfoString,
        promptSet.allAnchors,
        promptSet.authorsNoteString,
        promptSet.smartContextString,
        promptSet.beforeScenarioAnchor,
        promptSet.afterScenarioAnchor,
        promptSet.zeroDepthAnchor,
        promptSet.chatInjects,
        promptSet.chatVectorsString,
        promptSet.dataBankVectorsString,
    ]);

    const params = {
        charDescriptionTokens,
        charPersonalityTokens,
        scenarioTextTokens,
        userPersonaStringTokens,
        worldInfoStringTokens,
        allAnchorsTokens,
        authorsNoteStringTokens,
        smartContextStringTokens,
        beforeScenarioAnchorTokens,
        afterScenarioAnchorTokens,
        zeroDepthAnchorTokens, // TODO: unused
        thisPrompt_padding: promptSet.padding,
        this_main_api: promptSet.main_api,
        chatInjects,
        chatVectorsStringTokens,
        dataBankVectorsStringTokens,
        modelUsed: chat[incomingMesId]?.extra?.model,
        apiUsed: chat[incomingMesId]?.extra?.api,
        presetName: promptSet.presetName || t`(Unknown)`,
        messagesCount: String(promptSet.messagesCount ?? ''),
        examplesCount: String(promptSet.examplesCount ?? ''),
    };

    const getFriendlyName = (value) => $(`#rm_api_block select option[value="${value}"]`).first().text() || value;

    if (params.apiUsed) {
        params.apiUsed = getFriendlyName(params.apiUsed);
    }

    if (params.this_main_api) {
        params.mainApiFriendlyName = getFriendlyName(params.this_main_api);
    }

    if (params.chatInjects) {
        params.ActualChatHistoryTokens = params.ActualChatHistoryTokens - params.chatInjects;
    }

    if (params.this_main_api == 'openai') {
        //for OAI API
        //console.log('-- Counting OAI Tokens');

        //params.finalPromptTokens = itemizedPrompts[thisPromptSet].oaiTotalTokens;
        params.oaiMainTokens = itemizedPrompts[thisPromptSet].oaiMainTokens;
        params.oaiStartTokens = itemizedPrompts[thisPromptSet].oaiStartTokens;
        params.ActualChatHistoryTokens = itemizedPrompts[thisPromptSet].oaiConversationTokens;
        params.examplesStringTokens = itemizedPrompts[thisPromptSet].oaiExamplesTokens;
        params.oaiPromptTokens = itemizedPrompts[thisPromptSet].oaiPromptTokens - (params.afterScenarioAnchorTokens + params.beforeScenarioAnchorTokens) + params.examplesStringTokens;
        params.oaiBiasTokens = itemizedPrompts[thisPromptSet].oaiBiasTokens;
        params.oaiJailbreakTokens = itemizedPrompts[thisPromptSet].oaiJailbreakTokens;
        params.oaiNudgeTokens = itemizedPrompts[thisPromptSet].oaiNudgeTokens;
        params.oaiImpersonateTokens = itemizedPrompts[thisPromptSet].oaiImpersonateTokens;
        params.oaiNsfwTokens = itemizedPrompts[thisPromptSet].oaiNsfwTokens;
        params.finalPromptTokens =
            params.oaiStartTokens +
            params.oaiPromptTokens +
            params.oaiMainTokens +
            params.oaiNsfwTokens +
            params.oaiBiasTokens +
            params.oaiImpersonateTokens +
            params.oaiJailbreakTokens +
            params.oaiNudgeTokens +
            params.ActualChatHistoryTokens +
            //charDescriptionTokens +
            //charPersonalityTokens +
            //allAnchorsTokens +
            params.worldInfoStringTokens +
            params.beforeScenarioAnchorTokens +
            params.afterScenarioAnchorTokens;
        // Max context size - max completion tokens
        params.thisPrompt_max_context = (oai_settings.openai_max_context - oai_settings.openai_max_tokens);

        //console.log('-- applying % on OAI tokens');
        params.oaiStartTokensPercentage = ((params.oaiStartTokens / (params.finalPromptTokens)) * 100).toFixed(2);
        params.storyStringTokensPercentage = (((params.afterScenarioAnchorTokens + params.beforeScenarioAnchorTokens + params.oaiPromptTokens) / (params.finalPromptTokens)) * 100).toFixed(2);
        params.ActualChatHistoryTokensPercentage = ((params.ActualChatHistoryTokens / (params.finalPromptTokens)) * 100).toFixed(2);
        params.promptBiasTokensPercentage = ((params.oaiBiasTokens / (params.finalPromptTokens)) * 100).toFixed(2);
        params.worldInfoStringTokensPercentage = ((params.worldInfoStringTokens / (params.finalPromptTokens)) * 100).toFixed(2);
        params.allAnchorsTokensPercentage = ((params.allAnchorsTokens / (params.finalPromptTokens)) * 100).toFixed(2);
        params.selectedTokenizer = getFriendlyTokenizerName(params.this_main_api).tokenizerName;
        params.oaiSystemTokens = params.oaiImpersonateTokens + params.oaiJailbreakTokens + params.oaiNudgeTokens + params.oaiStartTokens + params.oaiNsfwTokens + params.oaiMainTokens;
        params.oaiSystemTokensPercentage = ((params.oaiSystemTokens / (params.finalPromptTokens)) * 100).toFixed(2);
    } else {
        //for non-OAI APIs
        //console.log('-- Counting non-OAI Tokens');
        const [
            finalPromptTokens,
            storyStringTokens,
            examplesStringTokens,
            mesSendStringTokens,
            instructionTokens,
            promptBiasTokens,
        ] = await getTokenCountsAsync([
            promptSet.finalPrompt,
            promptSet.storyString,
            promptSet.examplesString,
            promptSet.mesSendString,
            promptSet.instruction,
            promptSet.promptBias,
        ]);

        params.finalPromptTokens = finalPromptTokens;
        params.storyStringTokens = storyStringTokens - params.worldInfoStringTokens;
        params.examplesStringTokens = examplesStringTokens;
        params.mesSendStringTokens = mesSendStringTokens;
        params.ActualChatHistoryTokens = params.mesSendStringTokens - (params.allAnchorsTokens - (params.beforeScenarioAnchorTokens + params.afterScenarioAnchorTokens)) + power_user.token_padding;
        params.instructionTokens = instructionTokens;
        params.promptBiasTokens = promptBiasTokens;

        params.totalTokensInPrompt =
            params.storyStringTokens +     //chardefs total
            params.worldInfoStringTokens +
            params.examplesStringTokens + // example messages
            params.ActualChatHistoryTokens +  //chat history
            params.allAnchorsTokens +      // AN and/or legacy anchors
            //afterScenarioAnchorTokens +       //only counts if AN is set to 'after scenario'
            //zeroDepthAnchorTokens +           //same as above, even if AN not on 0 depth
            params.promptBiasTokens;       //{{}}
        //- thisPrompt_padding;  //not sure this way of calculating is correct, but the math results in same value as 'finalPrompt'
        params.thisPrompt_max_context = itemizedPrompts[thisPromptSet].this_max_context;
        params.thisPrompt_actual = params.thisPrompt_max_context - params.thisPrompt_padding;

        //console.log('-- applying % on non-OAI tokens');
        params.storyStringTokensPercentage = ((params.storyStringTokens / (params.totalTokensInPrompt)) * 100).toFixed(2);
        params.ActualChatHistoryTokensPercentage = ((params.ActualChatHistoryTokens / (params.totalTokensInPrompt)) * 100).toFixed(2);
        params.promptBiasTokensPercentage = ((params.promptBiasTokens / (params.totalTokensInPrompt)) * 100).toFixed(2);
        params.worldInfoStringTokensPercentage = ((params.worldInfoStringTokens / (params.totalTokensInPrompt)) * 100).toFixed(2);
        params.allAnchorsTokensPercentage = ((params.allAnchorsTokens / (params.totalTokensInPrompt)) * 100).toFixed(2);
        params.selectedTokenizer = itemizedPrompts[thisPromptSet]?.tokenizer || getFriendlyTokenizerName(params.this_main_api).tokenizerName;
    }
    return params;
}

export function findItemizedPromptSet(itemizedPrompts, incomingMesId) {
    let thisPromptSet = undefined;
    priorPromptArrayItemForRawPromptDisplay = -1;

    for (let i = 0; i < itemizedPrompts.length; i++) {
        console.log(`looking for ${incomingMesId} vs ${itemizedPrompts[i].mesId}`);
        if (itemizedPrompts[i].mesId === incomingMesId) {
            console.log(`found matching mesID ${i}`);
            thisPromptSet = i;
            PromptArrayItemForRawPromptDisplay = i;
            console.log(`wanting to raw display of ArrayItem: ${PromptArrayItemForRawPromptDisplay} which is mesID ${incomingMesId}`);
            console.log(itemizedPrompts[thisPromptSet]);
            break;
        } else if (itemizedPrompts[i].rawPrompt) {
            priorPromptArrayItemForRawPromptDisplay = i;
        }
    }
    return thisPromptSet;
}

export async function promptItemize(itemizedPrompts, requestedMesId) {
    console.log('PROMPT ITEMIZE ENTERED');
    var incomingMesId = Number(requestedMesId);
    console.debug(`looking for MesId ${incomingMesId}`);
    var thisPromptSet = findItemizedPromptSet(itemizedPrompts, incomingMesId);

    if (thisPromptSet === undefined) {
        console.log(`couldnt find the right mesId. looked for ${incomingMesId}`);
        console.log(itemizedPrompts);
        return null;
    }

    const params = await itemizedParams(itemizedPrompts, thisPromptSet, incomingMesId);
    const flatten = (rawPrompt) => Array.isArray(rawPrompt) ? rawPrompt.map(x => x.content).join('\n') : rawPrompt;

    const template = params.this_main_api == 'openai'
        ? await renderTemplateAsync('itemizationChat', params)
        : await renderTemplateAsync('itemizationText', params);

    const popup = new Popup(template, POPUP_TYPE.TEXT);

    /** @type {HTMLElement} */
    const diffPrevPrompt = popup.dlg.querySelector('#diffPrevPrompt');
    if (priorPromptArrayItemForRawPromptDisplay >= 0) {
        diffPrevPrompt.style.display = '';
        diffPrevPrompt.addEventListener('click', function () {
            const dmp = new DiffMatchPatch();
            const text1 = flatten(itemizedPrompts[priorPromptArrayItemForRawPromptDisplay].rawPrompt);
            const text2 = flatten(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt);

            dmp.Diff_Timeout = 2.0;

            const d = dmp.diff_main(text1, text2);
            let ds = dmp.diff_prettyHtml(d);
            // make it readable
            ds = ds.replaceAll('background:#e6ffe6;', 'background:#b9f3b9; color:black;');
            ds = ds.replaceAll('background:#ffe6e6;', 'background:#f5b4b4; color:black;');
            ds = ds.replaceAll('&para;', '');
            const container = document.createElement('div');
            container.innerHTML = DOMPurify.sanitize(ds);
            const rawPromptWrapper = document.getElementById('rawPromptWrapper');
            rawPromptWrapper.replaceChildren(container);
            $('#rawPromptPopup').slideToggle();
        });
    } else {
        diffPrevPrompt.style.display = 'none';
    }
    popup.dlg.querySelector('#copyPromptToClipboard').addEventListener('pointerup', async function () {
        let rawPrompt = itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt;
        let rawPromptValues = rawPrompt;

        if (Array.isArray(rawPrompt)) {
            rawPromptValues = rawPrompt.map(x => x.content).join('\n');
        }

        await copyText(rawPromptValues);
        toastr.info(t`Copied!`);
    });

    popup.dlg.querySelector('#showRawPrompt').addEventListener('click', async function () {
        //console.log(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt);
        console.log(PromptArrayItemForRawPromptDisplay);
        console.log(itemizedPrompts);
        console.log(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt);

        const rawPrompt = flatten(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt);

        // Mobile needs special handholding. The side-view on the popup wouldn't work,
        // so we just show an additional popup for this.
        if (isMobile()) {
            const content = document.createElement('div');
            content.classList.add('tokenItemizingMaintext');
            content.innerText = rawPrompt;
            const popup = new Popup(content, POPUP_TYPE.TEXT, null, { allowVerticalScrolling: true, leftAlign: true });
            await popup.show();
            return;
        }

        //let DisplayStringifiedPrompt = JSON.stringify(itemizedPrompts[PromptArrayItemForRawPromptDisplay].rawPrompt).replace(/\n+/g, '<br>');
        const rawPromptWrapper = document.getElementById('rawPromptWrapper');
        rawPromptWrapper.innerText = rawPrompt;
        $('#rawPromptPopup').slideToggle();
    });

    await popup.show();
}

export function initItemizedPrompts() {
    registerDebugFunction('clearPrompts', 'Delete itemized prompts', 'Deletes all itemized prompts from the local storage.', async () => {
        await clearItemizedPrompts();
        toastr.info('Itemized prompts deleted.');
        if (getCurrentChatId()) {
            await reloadCurrentChat();
        }
    });

    $(document).on('pointerup', '.mes_prompt', async function () {
        let mesIdForItemization = $(this).closest('.mes').attr('mesId');
        console.log(`looking for mesID: ${mesIdForItemization}`);
        if (itemizedPrompts.length !== undefined && itemizedPrompts.length !== 0) {
            await promptItemize(itemizedPrompts, mesIdForItemization);
        }
    });

    eventSource.on(event_types.CHAT_DELETED, async (name) => {
        await deleteItemizedPrompts(name);
    });
    eventSource.on(event_types.GROUP_CHAT_DELETED, async (name) => {
        await deleteItemizedPrompts(name);
    });
}

/**
 * Swaps the itemized prompts between two messages. Useful when moving messages around in the chat.
 * @param {number} sourceMessageId Source message ID
 * @param {number} targetMessageId Target message ID
 */
export function swapItemizedPrompts(sourceMessageId, targetMessageId) {
    if (!Array.isArray(itemizedPrompts)) {
        return;
    }

    const sourcePrompts = itemizedPrompts.filter(x => x.mesId === sourceMessageId);
    const targetPrompts = itemizedPrompts.filter(x => x.mesId === targetMessageId);

    sourcePrompts.forEach(prompt => {
        prompt.mesId = targetMessageId;
    });

    targetPrompts.forEach(prompt => {
        prompt.mesId = sourceMessageId;
    });

    itemizedPrompts.sort((a, b) => a.mesId - b.mesId);
}

/**
 * Deletes the itemized prompt for a specific message.
 * Shifts down other itemized prompts as necessary.
 * @param {number} messageId Message ID to delete itemized prompt for
 */
export function deleteItemizedPromptForMessage(messageId) {
    if (!Array.isArray(itemizedPrompts)) {
        return;
    }

    itemizedPrompts = itemizedPrompts.filter(x => x.mesId !== messageId);

    for (const prompt of itemizedPrompts.filter(x => x.mesId > messageId)) {
        prompt.mesId -= 1;
    }
}

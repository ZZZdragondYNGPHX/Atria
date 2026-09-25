import { NATIVE_SESSION_LIFECYCLE, onNativeSessionLifecycle } from '../../native/session-lifecycle.js';
import { getRegexScopeOwner, regexExecutionId } from './engine.js';
import { initializeNativeRegexScopes, refreshNativeRegexScopes, getNativeRegexScopeStatus } from '../../native/regex-scopes.js';
import { translateShellText as tl } from '../../atria-shell/localization.js';
import { characters, chatElement, eventSource, event_types, getCurrentChatId, messageFormatting, redisplayChat, reloadCurrentChat, saveSettingsDebounced, this_chid } from '../../../script.js';
import { capabilitySettings, renderPluginTemplateAsync } from '../../capability-host.js';
import { callGenericPopup, Popup, POPUP_TYPE } from '../../popup.js';
import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../slash-commands/SlashCommandArgument.js';
import { commonEnumProviders, enumIcons } from '../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandEnumValue, enumTypes } from '../../slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from '../../slash-commands/SlashCommandParser.js';
import { download, equalsIgnoreCaseAndAccents, escapeHtml, getFileText, getSortableDelay, isFalseBoolean, isTrueBoolean, regexFromString, setInfoBlock, uuidv4 } from '../../utils.js';
import { getRegexScripts, getRegexScriptDiagnostics, getRuntimeRegexScripts, getScriptsByType, regex_placement, REGEX_RUNTIME_SCRIPTS_CHANGED_EVENT, runRegexScript, saveScriptsByType, SCRIPT_TYPE_UNKNOWN, SCRIPT_TYPES, substitute_find_regex } from './engine.js';
import { REGEX_OPEN_SCRIPT_EVENT, resetRegexScriptState } from './redos-reporter.js';
import { t } from '../../i18n.js';

// Re-exports for legacy extensions
export { getRegexScripts };

const sanitizeFileName = name => name.replace(/[\s.<>:"/\\|?*\x00-\x1F\x7F]/g, '_').toLowerCase();
const REGEX_SCRIPT_TYPE_LABELS = Object.freeze({
    [SCRIPT_TYPES.GLOBAL]: 'global',
    [SCRIPT_TYPES.PRESET]: 'preset',
    [SCRIPT_TYPES.GAME]: 'game',
    [SCRIPT_TYPE_UNKNOWN]: 'runtime',
});
const REGEX_EDITOR_RENDER_CHUNK_SIZE = 80;

function yieldRegexEditorRender() {
    return new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(resolve, 0);
        }
    });
}

function buildRegexDragHelper(item) {
    const itemEl = item?.get?.(0) || item?.[0] || item;
    const helper = item?.clone?.() || $(itemEl).clone();
    const width = Math.round(item?.outerWidth?.() || itemEl?.getBoundingClientRect?.().width || 0);
    helper.addClass('regex-drag-helper');
    helper.css({
        width: width > 0 ? `${width}px` : '',
        'pointer-events': 'none',
        'box-shadow': '0 12px 28px rgba(0, 0, 0, 0.18)',
        opacity: '0.96',
        transform: 'rotate(1deg)',
    });
    return helper;
}

function styleRegexDragPlaceholder(ui) {
    const placeholder = ui?.placeholder;
    if (!placeholder?.length) {
        return;
    }

    placeholder.css({
        height: '4px',
        'min-height': '4px',
        visibility: 'visible',
        border: '0',
        'border-radius': '999px',
        background: 'var(--SmartThemeQuoteColor)',
        opacity: '0.7',
        margin: '8px 0',
    });
}

function getRegexSortableDelay() {
    // Keep desktop behavior from utils, but avoid very long touch hold on mobile.
    return Math.min(getSortableDelay(), 180);
}

function summarizeRegexScriptForLog(script) {
    if (!script || typeof script !== 'object') {
        return null;
    }

    return {
        id: String(script.id || ''),
        name: String(script.scriptName || ''),
        disabled: Boolean(script.disabled),
        placementCount: Array.isArray(script.placement) ? script.placement.length : 0,
        findRegexLength: String(script.findRegex || '').length,
        replaceLength: String(script.replaceString || '').length,
        runOnEdit: Boolean(script.runOnEdit),
        promptOnly: Boolean(script.promptOnly),
        markdownOnly: Boolean(script.markdownOnly),
        pluginOnly: Boolean(script.pluginOnly),
    };
}

/**
 * @param {JQuery<HTMLElement>} editorHtml
 * @returns {object | null}
 */
function summarizeRegexEditorDomStateForLog(editorHtml) {
    if (!editorHtml?.length) {
        return null;
    }

    return {
        scriptNameLength: String(editorHtml.find('.regex_script_name').val() || '').length,
        findRegexLength: String(editorHtml.find('.find_regex').val() || '').length,
        replaceLength: String(editorHtml.find('.regex_replace_string').val() || '').length,
        disabled: Boolean(editorHtml.find('input[name="disabled"]').prop('checked')),
        markdownOnly: Boolean(editorHtml.find('input[name="only_format_display"]').prop('checked')),
        promptOnly: Boolean(editorHtml.find('input[name="only_format_prompt"]').prop('checked')),
        pluginOnly: Boolean(editorHtml.find('input[name="only_format_plugin"]').prop('checked')),
        runOnEdit: Boolean(editorHtml.find('input[name="run_on_edit"]').prop('checked')),
        minDepthRaw: String(editorHtml.find('input[name="min_depth"]').val() || ''),
        maxDepthRaw: String(editorHtml.find('input[name="max_depth"]').val() || ''),
        placement: editorHtml
            .find('input[name="replace_position"]')
            .filter(':checked')
            .map(function () { return String($(this).val()); })
            .get(),
    };
}

/**
 * @param {unknown} script
 * @returns {script is RegexScript}
 */
function isRegexScriptRecord(script) {
    return Boolean(script) && typeof script === 'object' && !Array.isArray(script);
}

/**
 * @param {SCRIPT_TYPES} scriptType
 * @param {{ readOnly?: boolean }} [options]
 * @returns {string}
 */
function getRegexScriptSourceLabel(scriptType, { readOnly = false } = {}) {
    if (readOnly) {
        return 'runtime';
    }

    switch (scriptType) {
        case SCRIPT_TYPES.GLOBAL:
            return 'global';
        case SCRIPT_TYPES.PRESET:
            return 'preset';
        case SCRIPT_TYPES.GAME:
            return 'game';

        default:
            return String(scriptType);
    }
}

/**
 * @param {SCRIPT_TYPES} scriptType
 * @param {{ readOnly?: boolean }} [options]
 * @returns {string}
 */
function getInvalidRegexScriptsToastMessage(scriptType, { readOnly = false } = {}) {
    if (readOnly) {
        return t`A plugin provided invalid regex entries. They were skipped in Regex Editor. Check the browser console for details.`;
    }

    switch (scriptType) {
        case SCRIPT_TYPES.GLOBAL:
            return t`Global regex entries contained invalid data. Invalid entries were removed before opening Regex Editor. Check the browser console for details.`;

        default:
            return t`Some regex scripts were invalid and could not be shown in Regex Editor. Check the browser console for details.`;
    }
}

/**
 * @param {unknown} value
 * @param {number} index
 * @returns {object}
 */
function summarizeInvalidRegexEntry(value, index) {
    if (value === null) {
        return { index, type: 'null' };
    }

    if (Array.isArray(value)) {
        return { index, type: 'array', length: value.length };
    }

    return {
        index,
        type: typeof value,
        value: typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
            ? value
            : null,
    };
}

/**
 * Removes invalid entries from a script list before Regex Editor touches them.
 * @param {RegexScript[] | unknown} scripts
 * @param {SCRIPT_TYPES} scriptType
 * @param {{ readOnly?: boolean, issues?: Set<string> }} [options]
 * @returns {Promise<RegexScript[]>}
 */
async function sanitizeRegexScriptsForEditor(scripts, scriptType, { readOnly = false, issues = new Set() } = {}) {
    if (!Array.isArray(scripts)) {
        return [];
    }

    const validScripts = [];
    const invalidEntries = [];

    scripts.forEach((script, index) => {
        if (isRegexScriptRecord(script)) {
            validScripts.push(script);
            return;
        }

        invalidEntries.push(summarizeInvalidRegexEntry(script, index));
    });

    if (!invalidEntries.length) {
        return scripts;
    }

    const source = getRegexScriptSourceLabel(scriptType, { readOnly });
    console.error('[Regex] Invalid scripts were skipped while rendering Regex Editor', {
        source,
        invalidCount: invalidEntries.length,
        invalidEntries,
    });

    issues.add(getInvalidRegexScriptsToastMessage(scriptType, { readOnly }));

    if (!readOnly) {
        await saveScriptsByType(validScripts, scriptType);
    }

    return validScripts;
}

/**
 * @typedef {object} RegexPresetState
 * @property {string[]} global - List of enabled global regex script IDs
 */

class RegexPresetManager {
    /** @type {HTMLSelectElement} */
    presetSelect = null;

    /** @type {HTMLElement} */
    presetCreateButton = null;

    /** @type {HTMLElement} */
    presetUpdateButton = null;

    /** @type {HTMLElement} */
    presetApplyButton = null;

    /** @type {HTMLElement} */
    presetDeleteButton = null;

    /** @type {string|null} */
    currentPresetId = null;

    /** @type {RegexPresetState|null} */
    lastKnownState = null;

    /**
     * Captures the current state of enabled regex scripts for change detection.
     * @returns {RegexPresetState} The current state object
     */
    captureCurrentState() { return { global: this.regexListToPresetItems(getScriptsByType(SCRIPT_TYPES.GLOBAL)).map(item => item.id).sort() }; }

    /**
     * Compares two state objects to detect changes.
     * @param {RegexPresetState} state1 First state object
     * @param {RegexPresetState} state2 Second state object
     * @returns {boolean} True if states are different
     */
    hasStateChanged(a, b) { return Boolean(a && b) && JSON.stringify(a.global || []) !== JSON.stringify(b.global || []); }

    /**
     * Updates the stored state after a preset is applied or saved.
     * @param {string} presetId - The current preset ID
     */
    updateStoredState(presetId) {
        this.currentPresetId = presetId;
        this.lastKnownState = this.captureCurrentState();
    }

    /**
     * Checks if there are unsaved changes and shows a confirmation dialog.
     * @returns {Promise<boolean>} True if user wants to proceed without saving
     */
    async checkUnsavedChanges() {
        if (!this.currentPresetId || !this.lastKnownState) {
            return true; // No current preset or state to compare
        }

        const currentState = this.captureCurrentState();
        if (!this.hasStateChanged(this.lastKnownState, currentState)) {
            return true; // No changes detected
        }

        const currentPreset = capabilitySettings.regex_presets.find(p => p.id === this.currentPresetId);
        const presetName = currentPreset ? currentPreset.name : t`Unknown Preset`;

        const choice = await Popup.show.confirm(
            t`You have unsaved changes to the "${presetName}" preset.`,
            t`Do you want to save them before switching?`,
            {
                okButton: t`Save Changes`,
                cancelButton: t`Discard Changes`,
            },
        );

        if (choice) {
            // User chose to save changes
            await this.savePreset(this.currentPresetId, true);
            this.renderPresetList();
            return true;
        }

        // User chose to discard changes
        return true;
    }

    /**
     * Sets up event listeners for the preset management UI.
     * @returns {void}
     */
    setupEventListeners() {
        this.presetSelect = /** @type {HTMLSelectElement} */ (document.getElementById('regex_presets'));
        if (!this.presetSelect) {
            console.error('RegexPresetManager: Could not find preset select element in the DOM.');
            return;
        }

        this.presetSelect.addEventListener('change', async (event) => {
            const selectedPresetId = this.presetSelect.value;
            const fromSlashCommand = event instanceof CustomEvent && event?.detail?.fromSlashCommand === true;

            // Check for unsaved changes before switching
            if (!fromSlashCommand) {
                const canProceed = await this.checkUnsavedChanges();
                if (!canProceed) {
                    // Revert the selection
                    event.preventDefault();
                    const currentPreset = capabilitySettings.regex_presets.find(p => p.id === this.currentPresetId);
                    if (currentPreset) {
                        this.presetSelect.value = currentPreset.id;
                    }
                    return;
                }
            }

            await this.applyPreset(selectedPresetId);
            capabilitySettings.regex_presets.forEach(p => { p.isSelected = p.id === selectedPresetId; });
            saveSettingsDebounced();
            this.updateStoredState(selectedPresetId);
        });

        this.presetCreateButton = document.getElementById('regex_preset_create');
        if (!this.presetCreateButton) {
            console.error('RegexPresetManager: Could not find preset create button in the DOM.');
            return;
        }

        this.presetCreateButton.addEventListener('click', async () => {
            const newId = uuidv4();
            await this.savePreset(newId, false);
            this.renderPresetList();
            this.updateStoredState(newId);
        });

        this.presetUpdateButton = document.getElementById('regex_preset_update');
        if (!this.presetUpdateButton) {
            console.error('RegexPresetManager: Could not find preset update button in the DOM.');
            return;
        }

        this.presetUpdateButton.addEventListener('click', async () => {
            const selectedPresetId = this.presetSelect.value;
            await this.savePreset(selectedPresetId, true);
            this.renderPresetList();
            this.updateStoredState(selectedPresetId);
        });

        this.presetApplyButton = document.getElementById('regex_preset_apply');
        if (!this.presetApplyButton) {
            console.error('RegexPresetManager: Could not find preset apply button in the DOM.');
            return;
        }

        this.presetApplyButton.addEventListener('click', async () => {
            const selectedPresetId = this.presetSelect.value;
            await this.applyPreset(selectedPresetId);
            this.updateStoredState(selectedPresetId);
        });

        this.presetDeleteButton = document.getElementById('regex_preset_delete');
        if (!this.presetDeleteButton) {
            console.error('RegexPresetManager: Could not find preset delete button in the DOM.');
            return;
        }

        this.presetDeleteButton.addEventListener('click', async () => {
            const selectedPresetId = this.presetSelect.value;
            await this.deletePreset(selectedPresetId);
            this.renderPresetList();

            const newSelectedPresetId = capabilitySettings.regex_presets.find(p => p.isSelected)?.id;
            if (newSelectedPresetId) {
                await this.applyPreset(newSelectedPresetId);
                this.presetSelect.value = newSelectedPresetId;
                this.updateStoredState(newSelectedPresetId);
            } else {
                this.currentPresetId = null;
                this.lastKnownState = null;
            }
        });

        this.renderPresetList();

        // Initialize the stored state with the currently selected preset
        const selectedPreset = capabilitySettings.regex_presets?.find(p => p.isSelected);
        if (selectedPreset) {
            this.updateStoredState(selectedPreset.id);
        }
    }

    /**
     * Registers slash commands related to regex presets.
     * @returns {void}
     */
    registerSlashCommands() {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'regex-preset',
            helpString: t`Selects a regex preset by name or ID. Gets the current regex preset ID if no argument is provided.`,
            callback: (args, name) => {
                if (!this.presetSelect) {
                    return '';
                }

                name = String(name ?? '').trim();

                if (name) {
                    const quiet = isTrueBoolean(args?.quiet?.toString());
                    const foundId = capabilitySettings.regex_presets.find(p => equalsIgnoreCaseAndAccents(p.id, name) || equalsIgnoreCaseAndAccents(p.name, name))?.id;

                    if (foundId) {
                        this.presetSelect.value = foundId;
                        this.presetSelect.dispatchEvent(new CustomEvent('change', { detail: { fromSlashCommand: true } }));
                        return foundId;
                    }

                    !quiet && toastr.warning(t`Regex preset "${name}" not found`);
                    return '';
                }

                return this.presetSelect.value;
            },
            returns: 'current preset ID',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'quiet',
                    description: 'Suppress the toast message on preset change',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    defaultValue: 'false',
                    enumList: commonEnumProviders.boolean('trueFalse')(),
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'regex preset name or ID',
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: () => capabilitySettings.regex_presets.map(x => new SlashCommandEnumValue(x.id, x.name, enumTypes.enum, enumIcons.preset)),
                }),
            ],
        }));
    }

    /**
     * Renders the list of regex presets in the UI.
     * @returns {void}
     */
    renderPresetList() {
        if (!this.presetSelect) {
            return;
        }

        this.presetSelect.innerHTML = '';

        if (!Array.isArray(capabilitySettings.regex_presets) || capabilitySettings.regex_presets.length === 0) {
            const fallbackOption = new Option(t`[No presets saved]`, '', true, true);
            this.presetSelect.appendChild(fallbackOption);
            this.presetSelect.disabled = true;
            return;
        }

        capabilitySettings.regex_presets.forEach(preset => {
            const option = new Option(preset.name, preset.id, preset.isSelected, preset.isSelected);
            this.presetSelect.appendChild(option);
        });

        this.presetSelect.disabled = false;
    }

    /**
     * Applies a preset list to a target list of scripts.
     * @param {Object} params The parameters object
     * @param {RegexPresetItem[]} params.presetList The list of preset items
     * @param {RegexScript[]} params.targetList The list of target scripts to modify
     * @param {(targetList: RegexScript[]) => Promise<any>} params.saveFunction Function to save the modified list
     */
    async applyPresetList({ presetList, targetList, saveFunction }) {
        if (!Array.isArray(targetList) || !Array.isArray(presetList)) {
            return;
        }

        // Only enable scripts that are in the preset
        targetList.forEach((script => {
            script.disabled = !presetList.some(p => p.id === script.id);
        }));

        // First sort by the order in the preset, then the original order
        targetList.sort((a, b) => {
            const aIndex = presetList.findIndex(p => p.id === a.id);
            const bIndex = presetList.findIndex(p => p.id === b.id);
            return aIndex - bIndex || targetList.indexOf(a) - targetList.indexOf(b);
        });

        await saveFunction(targetList);
    }

    /**
     * Applies a regex preset to the current context.
     * @param {string} presetId - The ID of the preset to apply
     * @returns {Promise<void>}
     */
    async applyPreset(presetId) {
        const preset = capabilitySettings.regex_presets.find(p => p.id === presetId);
        if (!preset) {
            toastr.error(t`Could not find the selected preset.`);
            return;
        }

        // Apply preset to all lists
        for (const scriptType of [SCRIPT_TYPES.GLOBAL]) {
            await this.applyPresetList({
                presetList: {
                    [SCRIPT_TYPES.GLOBAL]: preset.global,
                }[scriptType],
                targetList: getScriptsByType(scriptType),
                saveFunction: scripts => saveScriptsByType(scripts, scriptType),
            });
        }

        // Render the changes to the UI
        await loadRegexScripts();
        // Apply the changes to the current chat
        await requestRegexChatReload();
    }

    /**
     * Converts a list of regex scripts to preset items.
     * @param {RegexScript[]} list The list of regex scripts
     * @returns {RegexPresetItem[] | null} The list of preset items, or null if the input is invalid
     */
    regexListToPresetItems(list) {
        if (!Array.isArray(list)) {
            return null;
        }

        return list.filter(isRegexScriptRecord).filter(x => !x.disabled).map(s => ({ id: s.id }));
    }

    /**
     * Saves a regex preset.
     * @param {string} presetId - The ID of the preset
     * @param {boolean} isUpdate - Whether this is an update operation
     * @returns {Promise<void>}
     */
    async savePreset(presetId, isUpdate) {
        const existingPreset = isUpdate ? capabilitySettings.regex_presets.find(p => p.id === presetId) : null;

        if (isUpdate && !existingPreset) {
            toastr.error(t`Could not find the preset to update.`);
            return;
        }

        const name = isUpdate ? existingPreset.name : await Popup.show.input(t`Enter a name for the new regex preset:`, '');
        const id = isUpdate ? existingPreset.id : presetId;

        if (!name || !name.trim().length) {
            return;
        }

        const preset = {
            id: id,
            name: name,
            isSelected: false,
            global: this.regexListToPresetItems(getScriptsByType(SCRIPT_TYPES.GLOBAL)),
        };

        if (isUpdate) {
            Object.assign(existingPreset, preset);
        } else {
            capabilitySettings.regex_presets.push(preset);
        }

        capabilitySettings.regex_presets.forEach(p => { p.isSelected = p.id === id; });
        saveSettingsDebounced();

        toastr.success(isUpdate ? t`Regex preset updated` : t`Regex preset saved`);
    }

    /**
     * Deletes a regex preset.
     * @param {string} presetId - The ID of the preset to delete
     * @returns {Promise<void>}
     */
    async deletePreset(presetId) {
        const presetIndex = capabilitySettings.regex_presets.findIndex(p => p.id === presetId);
        if (presetIndex === -1) {
            toastr.error(t`Could not find the preset to delete.`);
            return;
        }

        const presetName = capabilitySettings.regex_presets[presetIndex].name;
        const confirm = await Popup.show.confirm(t`Are you sure you want to delete this regex preset?`, presetName);
        if (!confirm) {
            return;
        }

        capabilitySettings.regex_presets.splice(presetIndex, 1);

        // Select the first preset if any exist
        capabilitySettings.regex_presets.forEach((p, i) => { p.isSelected = i === 0; });
        saveSettingsDebounced();

        toastr.success(t`Regex preset deleted`);
    }
}

const presetManager = new RegexPresetManager();
let pendingRegexChatReload = false;
let regexReloadOnSettingsCloseBound = false;
let regexScriptsRenderRequestId = 0;

function isRegexSettingsPanelOpen() {
    return jQuery('#rm_extensions_block').hasClass('openDrawer');
}

async function rerenderVisibleRegexChatMessages() {
    const firstVisibleMessage = chatElement.children('.mes').first();
    if (!firstVisibleMessage.length) {
        return true;
    }

    const startIndex = Number(firstVisibleMessage.attr('mesid'));
    if (!Number.isInteger(startIndex) || startIndex < 0) {
        return false;
    }

    const previousTop = firstVisibleMessage.get(0)?.getBoundingClientRect?.().top;
    await redisplayChat({ startIndex, fade: false });

    // redisplayChat is silent; mirror reloadCurrentChat's CHAT_LOADED emission so
    // extensions that re-process rendered HTML (e.g. JS-Slash-Runner iframe runtime)
    // get a chance to rebuild after a regex change. Solo-chat path only — group
    // chats don't receive CHAT_LOADED from getGroupChat either.
    if (typeof this_chid !== 'undefined' && characters[this_chid]) {
        eventSource.emit(event_types.CHAT_LOADED, { detail: { id: this_chid, character: characters[this_chid] } });
    }

    if (!Number.isFinite(previousTop)) {
        return true;
    }

    const anchorAfterRerender = chatElement.children(`.mes[mesid="${startIndex}"]`).first();
    if (!anchorAfterRerender.length) {
        return true;
    }

    const nextTop = anchorAfterRerender.get(0)?.getBoundingClientRect?.().top;
    if (!Number.isFinite(nextTop)) {
        return true;
    }

    const offsetDelta = nextTop - previousTop;
    if (Math.abs(offsetDelta) > 0.5) {
        chatElement.scrollTop((chatElement.scrollTop() || 0) + offsetDelta);
    }

    return true;
}

async function requestRegexChatReload({ force = false } = {}) {
    if (!getCurrentChatId()) {
        pendingRegexChatReload = false;
        return;
    }

    if (!force && isRegexSettingsPanelOpen()) {
        pendingRegexChatReload = true;
        return;
    }

    pendingRegexChatReload = false;
    try {
        const rerendered = await rerenderVisibleRegexChatMessages();
        if (rerendered) {
            return;
        }
    } catch (error) {
        console.warn('[Regex] Visible chat rerender failed, falling back to full reload', error);
    }

    await reloadCurrentChat();
}

async function flushPendingRegexChatReload() {
    if (!pendingRegexChatReload) {
        return;
    }
    await requestRegexChatReload({ force: true });
}

function bindRegexReloadOnSettingsClose() {
    if (regexReloadOnSettingsCloseBound) {
        return;
    }
    regexReloadOnSettingsCloseBound = true;

    const panel = document.getElementById('rm_extensions_block');
    if (!panel) {
        return;
    }

    let wasOpen = panel.classList.contains('openDrawer');
    const observer = new MutationObserver(() => {
        const isOpen = panel.classList.contains('openDrawer');
        if (wasOpen && !isOpen) {
            void flushPendingRegexChatReload();
        }
        wasOpen = isOpen;
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
}

const REGEX_SECTION_IDS = ['regex_presets_block', 'global_scripts_block', 'preset_scripts_block', 'game_scripts_block', 'plugin_scripts_block'];

function getCollapsedRegexSections() {
    if (!capabilitySettings.regex_section_collapsed || typeof capabilitySettings.regex_section_collapsed !== 'object') {
        capabilitySettings.regex_section_collapsed = {};
    }
    return capabilitySettings.regex_section_collapsed;
}

function applyCollapsedRegexSections() {
    const state = getCollapsedRegexSections();
    for (const id of REGEX_SECTION_IDS) {
        const section = document.getElementById(id);
        if (!section) continue;
        const sectionKey = section.getAttribute('data-section') || id;
        const shouldCollapse = state[sectionKey] === true;
        const content = section.querySelector(':scope > .inline-drawer-content');
        const icon = section.querySelector(':scope > .inline-drawer-header .inline-drawer-icon');
        if (!(content instanceof HTMLElement) || !(icon instanceof HTMLElement)) continue;
        if (shouldCollapse) {
            content.style.display = 'none';
            icon.classList.remove('down', 'fa-circle-chevron-down');
            icon.classList.add('up', 'fa-circle-chevron-up');
        } else {
            // Override the default `.inline-drawer-content { display: none }` so sections are
            // expanded by default; only sections the user explicitly collapsed stay hidden.
            content.style.display = 'block';
            icon.classList.add('down', 'fa-circle-chevron-down');
            icon.classList.remove('up', 'fa-circle-chevron-up');
        }
    }
}

function bindRegexSectionCollapse() {
    for (const id of REGEX_SECTION_IDS) {
        const section = document.getElementById(id);
        if (!section) continue;
        const sectionKey = section.getAttribute('data-section') || id;
        // jQuery .trigger('inline-drawer-toggle') in script.js fires a jQuery custom event,
        // bind via jQuery so the listener actually runs. The event is dispatched AFTER the
        // icon class toggles but BEFORE slideToggle changes content display, so we read the
        // post-toggle state from the icon (`up` = collapsed) rather than from getComputedStyle.
        $(section).on('inline-drawer-toggle', () => {
            const icon = section.querySelector(':scope > .inline-drawer-header .inline-drawer-icon');
            if (!(icon instanceof HTMLElement)) return;
            const state = getCollapsedRegexSections();
            if (icon.classList.contains('up')) {
                state[sectionKey] = true;
            } else {
                delete state[sectionKey];
            }
            saveSettingsDebounced();
        });
    }
    document.querySelectorAll('#regex_container .regex-section-toggle-control').forEach(label => {
        label.addEventListener('click', (e) => e.stopPropagation());
    });
}

/**
 * Toggle the icon for the "select all" checkbox in the regex settings.
 * - Use `fa-check-double` when the checkbox is unchecked (indicating all scripts are not selected).
 * - Use `fa-minus` when the checkbox is checked (indicating all scripts are selected).
 * @param {boolean} allAreChecked Should the "select all" icon be in the checked state?
 */
function setToggleAllIcon(allAreChecked) {
    const selectAllIcon = $('#bulk_select_all_toggle').find('i');
    selectAllIcon.toggleClass('fa-check-double', !allAreChecked);
    selectAllIcon.toggleClass('fa-minus', allAreChecked);
}

/**
 * Saves a regex script to the account settings.
 * @param {import('../../char-data.js').RegexScriptData} regexScript
 * @param {number} existingScriptIndex Index of the existing script
 * @param {SCRIPT_TYPES} scriptType Type of the script
 * @param {boolean} [saveSettings=true] Whether to save the settings immediately
 * @returns {Promise<void>}
 */
async function saveRegexScript(regexScript, existingScriptIndex, scriptType, saveSettings = true, owner = getRegexScopeOwner(scriptType)) {
    // If not editing
    const array = getScriptsByType(scriptType);
    const scriptTypeLabel = REGEX_SCRIPT_TYPE_LABELS[scriptType] || String(scriptType);

    // Assign a UUID if it doesn't exist
    if (!regexScript.id) {
        regexScript.id = uuidv4();
    }

    // Is the script name undefined or empty?
    if (!regexScript.scriptName) {
        toastr.error(t`Could not save regex script: The script name was undefined or empty!`);
        return;
    }

    // Is a find regex present?
    if (regexScript.findRegex.length === 0) {
        toastr.warning(t`This regex script will not work, but was saved anyway: A find regex isn't present.`);
    }

    // Is there someplace to place results?
    if (!Array.isArray(regexScript.placement)) {
        regexScript.placement = [];
    }
    if (regexScript.placement.length === 0) {
        toastr.warning(t`This regex script will not work, but was saved anyway: One "Affects" checkbox must be selected!`);
    }

    if (existingScriptIndex !== -1) {
        array[existingScriptIndex] = regexScript;
    } else {
        array.push(regexScript);
    }

    // The script may have been auto-paused or user-allowed in a previous
    // session-state. Editing replaces the contract, so wipe its session state
    // and let it be evaluated freshly on the next execution.
    resetRegexScriptState(regexExecutionId(regexScript, scriptType, owner));
    await saveScriptsByType(array, scriptType, owner);

    console.info('[Regex] saveRegexScript prepared', {
        scriptType: scriptTypeLabel,
        existingScriptIndex,
        saveSettings,
        scriptSummary: summarizeRegexScriptForLog(regexScript),
        nextScriptCount: array.length,
    });

    if (saveSettings) {
        saveSettingsDebounced();
        await loadRegexScripts();
        await requestRegexChatReload();
    }

    console.info('[Regex] saveRegexScript completed', {
        scriptType: scriptTypeLabel,
        saveSettings,
        globalCount: getScriptsByType(SCRIPT_TYPES.GLOBAL).length,
    });

    const debuggerPopup = $('#regex_debugger_popup');
    if (debuggerPopup.length) {
        populateDebuggerRuleList(debuggerPopup.parent());
    }
}

/**
 * Delete a regex script by ID
 * @param {string} id ID of the script to delete
 * @param {SCRIPT_TYPES} scriptType Type of the script
 * @param {boolean} saveSettings Whether to save the settings immediately
 * @returns {Promise<void>}
 */
async function deleteRegexScript(id, scriptType, saveSettings = true, owner = getRegexScopeOwner(scriptType)) {
    if (owner !== getRegexScopeOwner(scriptType)) throw new Error(tl('Regex scope changed. Reopen the editor.'));
    const array = getScriptsByType(scriptType);

    const existingScriptIndex = array.findIndex(script => script.id === id);
    if (existingScriptIndex !== -1) {
        array.splice(existingScriptIndex, 1);

        // Wipe any session-level state (paused / user-allowed / popup-shown / stats)
        // so an id reused later cannot inherit stale flags.
        resetRegexScriptState(regexExecutionId({ id }, scriptType, owner));
        await saveScriptsByType(array, scriptType, owner);

        if (saveSettings) {
            saveSettingsDebounced();
            await loadRegexScripts();
        }
    }
}

async function syncRegexEditorState(requestId) { presetManager.renderPresetList(); return requestId === regexScriptsRenderRequestId; }

async function refreshRegexEditorUi() {
    presetManager.renderPresetList();
    await loadRegexScripts();
}

async function loadRegexScripts() {
    const requestId = ++regexScriptsRenderRequestId;
    if (!await syncRegexEditorState(requestId)) {
        return;
    }
    const scriptTemplate = $(await renderPluginTemplateAsync('regex', 'scriptTemplate'));
    if (requestId !== regexScriptsRenderRequestId) {
        return;
    }

    $('#saved_regex_scripts').empty();
    $('#saved_preset_scripts, #saved_game_scripts').empty();
    $('#saved_plugin_scripts').empty();
    setToggleAllIcon(false);

    const renderFragments = {
        global: document.createDocumentFragment(),
        preset: document.createDocumentFragment(),
        game: document.createDocumentFragment(),
        runtime: document.createDocumentFragment(),
    };

    /**
     * Renders a script to the UI.
     * @param {DocumentFragment} container Detached container to render the script into
     * @param {import('../../char-data.js').RegexScriptData} script Script data
     * @param {SCRIPT_TYPES} scriptType Type of the script
     * @param {number} index Index of the script in the array
     */
    function renderScript(container, script, scriptType, index, { readOnly = false } = {}) {
        const owner = getRegexScopeOwner(scriptType);
        // Have to clone here
        const scriptHtml = scriptTemplate.clone();
        const save = () => saveRegexScript(script, index, scriptType);

        if (!script.id) {
            script.id = uuidv4();
        }

        scriptHtml.attr('id', script.id);
        scriptHtml.attr('data-regex-id', script.id).attr('data-regex-type', scriptType);
        if (scriptType !== SCRIPT_TYPES.GLOBAL) scriptHtml.attr('id', `atri_regex_${scriptType}_${index}`);
        const runtimeOwner = String(script.__runtime_owner || '').trim();
        const displayName = readOnly && runtimeOwner
            ? `${script.scriptName} (${runtimeOwner})`
            : script.scriptName;
        scriptHtml.find('.regex_script_name').text(displayName).attr('title', displayName);
        scriptHtml.find('.disable_regex').prop('checked', script.disabled ?? false);

        if (readOnly) {
            const readonlyId = `runtime_${sanitizeFileName(runtimeOwner || 'plugin')}_${sanitizeFileName(String(script.id || index || uuidv4()))}`;
            scriptHtml.attr('id', readonlyId);
            scriptHtml.attr('data-readonly', 'true');
            const viewButton = scriptHtml.find('.edit_existing_regex');
            viewButton.attr('title', String(t`Regex Editor`));
            viewButton.attr('data-i18n', '[title]Regex Editor');
            viewButton.find('i').removeClass('fa-pencil').addClass('fa-eye');
            viewButton.on('click', async function () {
                await onReadonlyRegexViewOpenClick(script, displayName);
            });
            scriptHtml.find('.regex_script_name').on('click', async function () {
                await onReadonlyRegexViewOpenClick(script, displayName);
            });
            scriptHtml.each((_index, node) => container.appendChild(node));
            return;
        }

        scriptHtml.find('.disable_regex').on('input', async function () {
            script.disabled = !!$(this).prop('checked');
            await save();
        });
        scriptHtml.find('.regex-toggle-on').on('click', function () {
            scriptHtml.find('.disable_regex').prop('checked', true).trigger('input');
        });
        scriptHtml.find('.regex-toggle-off').on('click', function () {
            scriptHtml.find('.disable_regex').prop('checked', false).trigger('input');
        });
        scriptHtml.find('.edit_existing_regex').on('click', async function () {
            await onRegexEditorOpenClick(script.id, scriptType);
        });

        scriptHtml.find('.export_regex').on('click', async function () {
            const fileName = `regex-${sanitizeFileName(script.scriptName)}.json`;
            const fileData = JSON.stringify(script, null, 4);
            download(fileData, fileName, 'application/json');
        });
        scriptHtml.find('.delete_regex').on('click', async function () {
            const confirm = await callGenericPopup(t`Are you sure you want to delete this regex script?`, POPUP_TYPE.CONFIRM);
            if (!confirm) {
                return;
            }
            await deleteRegexScript(script.id, scriptType, true, owner);
            await requestRegexChatReload();
        });
        scriptHtml.find('.regex_bulk_checkbox').on('change', function () {
            const checkboxes = $('#regex_container .regex_bulk_checkbox');
            const allAreChecked = checkboxes.length === checkboxes.filter(':checked').length;
            setToggleAllIcon(allAreChecked);
        });
        scriptHtml.find('input[name="regex_expand"]').on('change', function () {
            if (!(this instanceof HTMLInputElement)) {
                return;
            }

            if (!this.checked) {
                return;
            }

            const closeMenuHandler = (e) => {
                if (e.target instanceof HTMLElement) {
                    if (e.target.closest('.regex-script-label')) {
                        return;
                    }
                    this.checked = false;
                    document.removeEventListener('click', closeMenuHandler);
                }
            };

            // Use setTimeout to avoid closing immediately from the same click
            setTimeout(() => {
                document.addEventListener('click', closeMenuHandler, { passive: true, once: false });
            }, 0);
        });

        scriptHtml.each((_index, node) => container.appendChild(node));
    }

    const renderIssues = new Set();
    const globalScripts = await sanitizeRegexScriptsForEditor(getScriptsByType(SCRIPT_TYPES.GLOBAL), SCRIPT_TYPES.GLOBAL, { issues: renderIssues });
    const presetScripts = getScriptsByType(SCRIPT_TYPES.PRESET);
    const gameScripts = getScriptsByType(SCRIPT_TYPES.GAME);
    const runtimeScripts = await sanitizeRegexScriptsForEditor(getRuntimeRegexScripts(), SCRIPT_TYPE_UNKNOWN, { readOnly: true, issues: renderIssues });
    const scopeStatus = getNativeRegexScopeStatus();
    $('#preset_regex_owner').text(scopeStatus.errorMessage || scopeStatus.preset?.displayName || tl('Choose a Prompt Preset on the primary narrator route.'));
    $('#game_regex_owner').text(scopeStatus.errorMessage || scopeStatus.game?.displayName || tl('Open a game Session to edit its Regex.'));
    $('#open_preset_regex_editor, #import_preset_regex').prop('disabled', !scopeStatus.preset);
    $('#open_game_regex_editor, #import_game_regex').prop('disabled', !scopeStatus.gameWritable);

    const diagnostics = getRegexScriptDiagnostics([
        ...globalScripts,
        ...presetScripts,
        ...gameScripts,
        ...runtimeScripts,
    ]);
    const duplicateCount = diagnostics.duplicates.reduce((count, group) => count + Math.max(0, group.scripts.length - 1), 0);
    const conflictCount = diagnostics.conflicts.length;
    const healthSummary = $('#regex_health_summary');
    if (duplicateCount > 0 || conflictCount > 0) {
        healthSummary
            .removeClass('displayNone')
            .text(`Active duplicate rules: ${duplicateCount} · Same-pattern conflicts: ${conflictCount}. Execution order is preserved; review these rules if regex processing feels slow.`);
        console.warn('[Regex] Potential duplicate/conflicting rules detected', {
            duplicateCount,
            conflictCount,
            duplicates: diagnostics.duplicates.map(group => group.scripts.map(script => script.scriptName || script.id || '<unnamed>')),
            conflicts: diagnostics.conflicts.map(group => group.scripts.map(script => script.scriptName || script.id || '<unnamed>')),
        });
    } else {
        healthSummary.addClass('displayNone').empty();
    }

    if (renderIssues.size) {
        toastr.error(Array.from(renderIssues).join('<br>'), t`Regex script error`, {
            escapeHtml: false,
            timeOut: 10000,
        });
    }

    const renderBatch = async (scripts, fragment, scriptType, options = {}) => {
        for (let index = 0; index < scripts.length; index++) {
            renderScript(fragment, scripts[index], scriptType, index, options);
            if ((index + 1) % REGEX_EDITOR_RENDER_CHUNK_SIZE === 0) {
                await yieldRegexEditorRender();
                if (requestId !== regexScriptsRenderRequestId) {
                    return false;
                }
            }
        }
        return requestId === regexScriptsRenderRequestId;
    };

    if (!await renderBatch(globalScripts, renderFragments.global, SCRIPT_TYPES.GLOBAL)) return;
    if (!await renderBatch(presetScripts, renderFragments.preset, SCRIPT_TYPES.PRESET)) return;
    if (!await renderBatch(gameScripts, renderFragments.game, SCRIPT_TYPES.GAME, { readOnly: !scopeStatus.gameWritable })) return;

    if (!await renderBatch(runtimeScripts, renderFragments.runtime, SCRIPT_TYPE_UNKNOWN, { readOnly: true })) return;

    document.querySelector('#saved_regex_scripts')?.appendChild(renderFragments.global);
    document.querySelector('#saved_preset_scripts')?.appendChild(renderFragments.preset);
    document.querySelector('#saved_game_scripts')?.appendChild(renderFragments.game);
    document.querySelector('#saved_plugin_scripts')?.appendChild(renderFragments.runtime);

    // Re-init Sortable after the lists were rebuilt; without this, jQuery UI
    // Sortable keeps internal refs to the old <li> nodes and they linger as
    // detached DOM until full GC (which V8 defers indefinitely under load).
    setupRegexSortable();

    console.info('[Regex] Editor UI loaded', {
        requestId,
        avatar: characters?.[this_chid]?.avatar || null,
        globalCount: globalScripts.length,
        runtimeCount: runtimeScripts.length,
    });
}

function fillRegexEditorFields(editorHtml, script) {
    if (!script?.scriptName) {
        return false;
    }
    editorHtml.find('.regex_script_name').val(script.scriptName);
    editorHtml.find('.find_regex').val(script.findRegex || '');
    editorHtml.find('.regex_replace_string').val(script.replaceString || '');
    editorHtml.find('.regex_trim_strings').val(script.trimStrings?.join('\n') || []);
    editorHtml.find('input[name="disabled"]').prop('checked', script.disabled ?? false);
    editorHtml.find('input[name="only_format_display"]').prop('checked', script.markdownOnly ?? false);
    editorHtml.find('input[name="only_format_prompt"]').prop('checked', script.promptOnly ?? false);
    editorHtml.find('input[name="only_format_plugin"]').prop('checked', script.pluginOnly ?? false);
    editorHtml.find('input[name="run_on_edit"]').prop('checked', script.runOnEdit ?? false);
    editorHtml.find('select[name="substitute_regex"]').val(script.substituteRegex ?? substitute_find_regex.NONE);
    editorHtml.find('input[name="min_depth"]').val(script.minDepth ?? '');
    editorHtml.find('input[name="max_depth"]').val(script.maxDepth ?? '');

    const existingPlacement = Array.isArray(script.placement) ? script.placement : [];
    existingPlacement.forEach((element) => {
        editorHtml
            .find(`input[name="replace_position"][value="${element}"]`)
            .prop('checked', true);
    });
    return true;
}

async function onReadonlyRegexViewOpenClick(script, displayName = '') {
    const editorHtml = $(await renderPluginTemplateAsync('regex', 'editor'));
    if (!fillRegexEditorFields(editorHtml, script)) {
        toastr.error(t`This script doesn't have a name! Please delete it.`);
        return;
    }
    editorHtml.find('#regex_test_mode_toggle').remove();
    editorHtml.find('#regex_test_mode').remove();
    editorHtml.find('input, textarea, select').prop('disabled', true);
    await callGenericPopup(
        editorHtml,
        POPUP_TYPE.TEXT,
        displayName || String(script?.scriptName || ''),
        { okButton: t`Close`, wide: true, large: true, allowVerticalScrolling: true },
    );
}

/**
 * Opens the regex editor.
 * @param {string|boolean} existingId Existing ID
 * @param {SCRIPT_TYPES} scriptType Type of the script
 * @returns {Promise<void>}
 */
async function onRegexEditorOpenClick(existingId, scriptType, context = null) {
    const owner = getRegexScopeOwner(scriptType);
    const editorHtml = $(await renderPluginTemplateAsync('regex', 'editor'));
    const array = context?.scripts || getScriptsByType(scriptType);
    const originalScripts = JSON.stringify(array);
    const scriptTypeLabel = REGEX_SCRIPT_TYPE_LABELS[scriptType] || String(scriptType);
    const logEditorState = (event, extra = {}) => {
        console.info('[Regex] Editor interaction', {
            event,
            scriptType: scriptTypeLabel,
            existingId: existingId || null,
            existingScriptIndex,
            domState: summarizeRegexEditorDomStateForLog(editorHtml),
            ...extra,
        });
    };

    console.info('[Regex] Editor opened', {
        existingId: existingId || null,
        scriptType: scriptTypeLabel,
        currentScriptCount: array.length,
    });

    // If an ID exists, fill in all the values
    let existingScriptIndex = -1;
    if (existingId) {
        existingScriptIndex = array.findIndex((script) => script.id === existingId);
        if (existingScriptIndex !== -1) {
            const existingScript = array[existingScriptIndex];
            if (!fillRegexEditorFields(editorHtml, existingScript)) {
                toastr.error(t`This script doesn't have a name! Please delete it.`);
                return;
            }
        }
    } else {
        editorHtml
            .find('input[name="only_format_display"]')
            .prop('checked', true);

        editorHtml
            .find('input[name="run_on_edit"]')
            .prop('checked', true);

        editorHtml
            .find('input[name="replace_position"][value="1"]')
            .prop('checked', true);
    }

    editorHtml.find('input[name="only_format_plugin"]').on('click input change', function (event) {
        logEditorState('plugin_only_toggled', {
            eventType: event.type,
            inputChecked: Boolean($(this).prop('checked')),
        });
    });

    editorHtml.find('#regex_test_mode_toggle').on('click', function () {
        editorHtml.find('#regex_test_mode').toggleClass('displayNone');
        updateTestResult();
    });

    function updateTestResult() {
        updateInfoBlock(editorHtml);

        if (!editorHtml.find('#regex_test_mode').is(':visible')) {
            return;
        }

        const testScript = {
            id: uuidv4(),
            scriptName: editorHtml.find('.regex_script_name').val().toString(),
            findRegex: editorHtml.find('.find_regex').val().toString(),
            replaceString: editorHtml.find('.regex_replace_string').val().toString(),
            trimStrings: String(editorHtml.find('.regex_trim_strings').val()).split('\n').filter((e) => e.length !== 0) || [],
            substituteRegex: Number(editorHtml.find('select[name="substitute_regex"]').val()),
            disabled: false,
            promptOnly: false,
            pluginOnly: false,
            markdownOnly: false,
            runOnEdit: false,
            minDepth: null,
            maxDepth: null,
            placement: null,
        };
        const rawTestString = String(editorHtml.find('#regex_test_input').val());
        const result = runRegexScript(testScript, rawTestString);
        editorHtml.find('#regex_test_output').text(result);
    }

    editorHtml.find('input, textarea, select').on('input', updateTestResult);
    updateInfoBlock(editorHtml);

    logEditorState('popup_show_requested');

    let popupResult;
    try {
        popupResult = await callGenericPopup(editorHtml, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Save`,
            cancelButton: t`Cancel`,
            allowVerticalScrolling: true,
            onOpen: (popup) => {
                logEditorState('popup_opened');
                popup.okButton?.addEventListener('click', () => {
                    logEditorState('save_button_clicked');
                }, { passive: true });
                popup.cancelButton?.addEventListener('click', () => {
                    logEditorState('cancel_button_clicked');
                }, { passive: true });
            },
            onClosing: (popup) => {
                logEditorState('popup_closing_requested', {
                    popupResult: popup.result ?? null,
                    popupValue: popup.value ?? null,
                });
                return true;
            },
            onClose: (popup) => {
                logEditorState('popup_closed', {
                    popupResult: popup.result ?? null,
                    popupValue: popup.value ?? null,
                });
            },
        });
    } catch (error) {
        console.error('[Regex] Editor popup failed', {
            scriptType: scriptTypeLabel,
            existingId: existingId || null,
            existingScriptIndex,
            domState: summarizeRegexEditorDomStateForLog(editorHtml),
        }, error);
        throw error;
    }

    logEditorState('popup_returned', { popupResult: popupResult ?? null });
    if (popupResult) {
        const newRegexScript = {
            id: existingId ? String(existingId) : uuidv4(),
            scriptName: String(editorHtml.find('.regex_script_name').val()),
            findRegex: String(editorHtml.find('.find_regex').val()),
            replaceString: String(editorHtml.find('.regex_replace_string').val()),
            trimStrings: String(editorHtml.find('.regex_trim_strings').val()).split('\n').filter((e) => e.length !== 0) || [],
            placement:
                editorHtml
                    .find('input[name="replace_position"]')
                    .filter(':checked')
                    .map(function () { return parseInt($(this).val().toString()); })
                    .get()
                    .filter((e) => !isNaN(e)) || [],
            disabled: editorHtml.find('input[name="disabled"]').prop('checked'),
            markdownOnly: editorHtml.find('input[name="only_format_display"]').prop('checked'),
            promptOnly: editorHtml.find('input[name="only_format_prompt"]').prop('checked'),
            pluginOnly: editorHtml.find('input[name="only_format_plugin"]').prop('checked'),
            runOnEdit: editorHtml.find('input[name="run_on_edit"]').prop('checked'),
            substituteRegex: Number(editorHtml.find('select[name="substitute_regex"]').val()),
            minDepth: parseInt(String(editorHtml.find('input[name="min_depth"]').val())),
            maxDepth: parseInt(String(editorHtml.find('input[name="max_depth"]').val())),
        };

        console.info('[Regex] Editor save confirmed', {
            scriptType: scriptTypeLabel,
            existingId: existingId || null,
            existingScriptIndex,
            scriptSummary: summarizeRegexScriptForLog(newRegexScript),
        });

        if (context) { await context.save(newRegexScript); return; }
        if (owner !== getRegexScopeOwner(scriptType) || originalScripts !== JSON.stringify(getScriptsByType(scriptType))) {
            toastr.error(tl('Regex scope changed. Reopen the editor.'));
            return;
        }
        await saveRegexScript(newRegexScript, existingScriptIndex, scriptType, true, owner).catch(error => {
            toastr.error(tl(error.message));
            console.error('[Regex] saveRegexScript failed after editor confirm', {
                scriptType: scriptTypeLabel,
                existingId: existingId || null,
                existingScriptIndex,
                scriptSummary: summarizeRegexScriptForLog(newRegexScript),
            }, error);
        });
        return;
    }

    logEditorState('save_not_confirmed', { popupResult: popupResult ?? null });
}

/**
 * Builds an HTML string for a replacement, highlighting literal parts in green
 * and keeping back-referenced parts plain.
 * @param {RegExpMatchArray} match The match object from `matchAll`.
 * @param {string} pattern The replacement pattern string (e.g., "new text $1").
 * @returns {string} The constructed HTML string.
 */
function buildReplacementHtml(match, pattern) {
    const container = document.createDocumentFragment();
    let lastIndex = 0;
    const backrefRegex = /\$\$|\$&|\$`|\$'|\$(\d{1,2})/g;

    let reMatch;
    while ((reMatch = backrefRegex.exec(pattern)) !== null) {
        // Part of the pattern before the back-reference is a literal.
        const literalPart = pattern.substring(lastIndex, reMatch.index);
        if (literalPart) {
            const mark = document.createElement('mark');
            mark.className = 'green_hl';
            mark.innerText = literalPart;
            container.appendChild(mark);
        }

        const backref = reMatch[0];
        if (backref === '$$') {
            container.appendChild(document.createTextNode('$'));
        } else if (backref === '$&') {
            const mark = document.createElement('mark');
            mark.className = 'yellow_hl';
            mark.innerText = match[0];
            container.appendChild(mark);
        } else if (backref === '$`') {
            container.appendChild(document.createTextNode(match.input.substring(0, match.index)));
        } else if (backref === '$\'') {
            container.appendChild(document.createTextNode(match.input.substring(match.index + match[0].length)));
        } else { // It's a numbered capture group, $n.
            const groupIndex = parseInt(reMatch[1], 10);
            if (groupIndex > 0 && groupIndex < match.length && match[groupIndex] !== undefined) {
                const mark = document.createElement('mark');
                mark.className = 'yellow_hl';
                mark.innerText = match[groupIndex];
                container.appendChild(mark);
            } else {
                // Not a valid group index, treat it as a literal.
                const mark = document.createElement('mark');
                mark.className = 'green_hl';
                mark.innerText = backref;
                container.appendChild(mark);
            }
        }
        lastIndex = backrefRegex.lastIndex;
    }

    // The final part of the pattern after the last back-reference.
    const finalLiteralPart = pattern.substring(lastIndex);
    if (finalLiteralPart) {
        const mark = document.createElement('mark');
        mark.className = 'green_hl';
        mark.innerText = finalLiteralPart;
        container.appendChild(mark);
    }

    // To get the HTML content, we need a temporary parent element.
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(container);
    return tempDiv.innerHTML;
}

function executeRegexScriptForDebugging(script, text) {
    let err;
    let originalRegex;

    try {
        originalRegex = regexFromString(script.findRegex);
        if (!originalRegex) throw new Error('Invalid regex string');
    } catch (e) {
        err = `Compile error: ${e.message}`;
        return { output: text, highlightedOutput: text, error: err, charsCaptured: 0, charsAdded: 0, charsRemoved: 0 };
    }

    const globalRegex = new RegExp(originalRegex.source, originalRegex.flags.includes('g') ? originalRegex.flags : originalRegex.flags + 'g');
    const matches = [...text.matchAll(globalRegex)];

    if (matches.length === 0) {
        return { output: text, highlightedOutput: escapeHtml(text), error: null, charsCaptured: 0, charsAdded: 0, charsRemoved: 0 };
    }

    let outputText = '';
    let highlightedOutput = ''; // This will now be our "diff view"
    let lastIndex = 0;
    let totalCharsCaptured = 0;
    let totalCharsAdded = 0;
    let totalCharsRemoved = 0;

    try {
        for (const match of matches) {
            const originalMatchText = match[0];
            totalCharsCaptured += originalMatchText.length;

            // Append text between matches (this part is unchanged)
            const precedingText = text.substring(lastIndex, match.index);
            outputText += precedingText;
            highlightedOutput += escapeHtml(precedingText);

            // --- Start of new diff and statistics logic ---
            let charsAddedInMatch = 0;
            let charsKeptFromMatch = 0;
            const backrefRegex = /\$\$|\$&|\$`|\$'|\$(\d{1,2})/g;
            let lastPatternIndex = 0;
            let reMatch;
            let replacementForPlainText = '';

            // This loop calculates the stats accurately
            while ((reMatch = backrefRegex.exec(script.replaceString)) !== null) {
                const literalPart = script.replaceString.substring(lastPatternIndex, reMatch.index);
                charsAddedInMatch += literalPart.length;
                replacementForPlainText += literalPart;
                const backref = reMatch[0];
                if (backref === '$$') {
                    replacementForPlainText += '$';
                } else if (backref === '$&') {
                    charsKeptFromMatch += (match[0] || '').length; replacementForPlainText += (match[0] || '');
                } else if (backref === '$`') {
                    const part = match.input.substring(0, match.index); charsKeptFromMatch += part.length; replacementForPlainText += part;
                } else if (backref === '$\'') {
                    const part = match.input.substring(match.index + match[0].length); charsKeptFromMatch += part.length; replacementForPlainText += part;
                } else {
                    const groupIndex = parseInt(reMatch[1], 10);
                    if (groupIndex > 0 && groupIndex < match.length && match[groupIndex] !== undefined) {
                        charsKeptFromMatch += match[groupIndex].length;
                        replacementForPlainText += match[groupIndex];
                    }
                }
                lastPatternIndex = backrefRegex.lastIndex;
            }
            const finalLiteralPart = script.replaceString.substring(lastPatternIndex);
            charsAddedInMatch += finalLiteralPart.length;
            replacementForPlainText += finalLiteralPart;

            totalCharsAdded += charsAddedInMatch;
            totalCharsRemoved += (originalMatchText.length - charsKeptFromMatch);

            outputText += replacementForPlainText;
            // --- End of statistics logic ---

            // --- Build the new Diff View HTML ---
            // 1. Show the entire original match as "removed" (red strikethrough)
            highlightedOutput += `<mark class='red_hl'>${escapeHtml(originalMatchText)}</mark>`;
            // 2. Add an arrow to signify transformation
            highlightedOutput += ' → ';
            // 3. Build the replacement string with green (added) and yellow (kept) parts
            highlightedOutput += buildReplacementHtml(match, script.replaceString);

            lastIndex = match.index + originalMatchText.length;
        }

        // Append text after the last match
        const trailingText = text.substring(lastIndex);
        outputText += trailingText;
        highlightedOutput += escapeHtml(trailingText);
    } catch (e) {
        err = (err ? err + '; ' : '') + `Replace error: ${e.message}`;
        outputText = text; // Fallback
        highlightedOutput = escapeHtml(text);
    }

    return {
        output: outputText,
        highlightedOutput: highlightedOutput,
        error: err,
        charsCaptured: totalCharsCaptured,
        charsAdded: totalCharsAdded,
        charsRemoved: totalCharsRemoved,
    };
}

function populateDebuggerRuleList(container) {
    const rulesContainer = container.find('#regex_debugger_rules');
    const ruleTemplate = container.find('#regex_debugger_rule_template');
    if (!rulesContainer.length || !ruleTemplate.length) {
        console.error('Regex Debugger: Could not find rule list or template in the DOM.');
        return;
    }

    rulesContainer.empty();

    const allScripts = getRegexScripts();
    if (!allScripts || allScripts.length === 0) {
        rulesContainer.append('<div class="regex-debugger-no-rules">' + t`No regex rules found.` + '</div>');
        return;
    }

    const globalScriptIds = new Set(getScriptsByType(SCRIPT_TYPES.GLOBAL).map(s => s.id));
    const globalScripts = [];
    const pluginScripts = [];

    allScripts.forEach(script => {
        const scriptCopy = structuredClone(script); // Use structuredClone for deep copy
        if (globalScriptIds.has(script.id)) {
            // @ts-ignore
            scriptCopy.type = SCRIPT_TYPES.GLOBAL;
            globalScripts.push(scriptCopy);
        } else {
            // @ts-ignore
            scriptCopy.type = SCRIPT_TYPE_UNKNOWN;
            pluginScripts.push(scriptCopy);
        }
    });

    container.data('allScripts', [...globalScripts, ...pluginScripts]);

    const renderRule = (script) => {
        if (!script.id) script.id = uuidv4();
        const ruleElementContent = $(ruleTemplate.prop('content')).clone();
        const ruleElement = ruleElementContent.find('.regex-debugger-rule');

        ruleElement.attr('data-id', script.id);
        // @ts-ignore
        ruleElement.find('.rule-name').text(script.scriptName);
        ruleElement.find('.rule-regex').text(script.findRegex);
        // @ts-ignore
        ruleElement
            .find('.rule-scope')
            .text(
                {
                    [SCRIPT_TYPES.GLOBAL]: t`Global`,
                    [SCRIPT_TYPE_UNKNOWN]: t`Plugin`,
                }[script.type],
            );
        ruleElement.find('.rule-enabled').prop('checked', !script.disabled);
        // @ts-ignore
        ruleElement.find('.edit_rule').on('click', () => script.type === SCRIPT_TYPE_UNKNOWN ? onReadonlyRegexViewOpenClick(script, script.scriptName) : onRegexEditorOpenClick(script.id, script.type));

        ruleElement.on('click', function (event) {
            if ($(event.target).is('input, .menu_button, .menu_button i')) {
                return;
            }
            const scriptId = $(this).data('id');
            const stepElement = $(`#step-result-${scriptId}`);
            const container = $('#regex_debugger_steps_output');

            if (stepElement.length && container.length) {
                // Replace scrollIntoView with scrollTop animation
                const targetTop = stepElement.position().top;
                const containerScrollTop = container.scrollTop();
                const containerHeight = container.height();

                // Center the element if possible
                let scrollTo = containerScrollTop + targetTop - (containerHeight / 2) + (stepElement.height() / 2);

                container.animate({ scrollTop: scrollTo }, 300); // 300ms smooth scroll

                stepElement.css('transition', 'background-color 0.5s').css('background-color', 'var(--highlight_color)');
                setTimeout(() => stepElement.css('background-color', ''), 1000);
            }
        });

        return ruleElementContent;
    };

    if (globalScripts.length > 0) {
        rulesContainer.append('<div class="list-header regex-debugger-list-header">' + t`Global Rules` + '</div>');
        const globalList = $('<ul id="regex_debugger_rules_global" class="sortable-list"></ul>');
        globalScripts.forEach(script => globalList.append(renderRule(script)));
        rulesContainer.append(globalList);
    }

    if (pluginScripts.length > 0) {
        rulesContainer.append('<div class="list-header regex-debugger-list-header">' + t`Plugin Rules` + '</div>');
        const pluginList = $('<ul id="regex_debugger_rules_plugin" class="sortable-list"></ul>');
        pluginScripts.forEach(script => pluginList.append(renderRule(script)));
        rulesContainer.append(pluginList);
    }
}

/**
 * Opens the regex debugger.
 * @returns {Promise<void>}
 */
async function onRegexDebuggerOpenClick() {
    const templateContent = await renderPluginTemplateAsync('regex', 'debugger');
    const debuggerHtml = $('<div>').html(templateContent);

    const stepTemplate = debuggerHtml.find('#regex_debugger_step_template');

    populateDebuggerRuleList(debuggerHtml);

    // @ts-ignore
    debuggerHtml.find('#regex_debugger_rules_global').sortable({ delay: getRegexSortableDelay() }).disableSelection();
    // @ts-ignore
    // @ts-ignore

    debuggerHtml.find('#regex_debugger_run_test').on('click', function () {
        const allScripts = debuggerHtml.data('allScripts');
        const orderedRuleIds = [
            ...$('#regex_debugger_rules_global').find('li.regex-debugger-rule').map((i, el) => $(el).data('id')).get(),
            ...$('#regex_debugger_rules_plugin').find('li.regex-debugger-rule').map((i, el) => $(el).data('id')).get(),
        ];

        const rawInput = String($('#regex_debugger_raw_input').val());
        const stepsOutput = $('#regex_debugger_steps_output');
        const finalOutput = $('#regex_debugger_final_output');

        if (!stepsOutput.length || !finalOutput.length) return;

        const displayMode = $('input[name="display_mode"]:checked').val();
        stepsOutput.empty();
        finalOutput.empty();
        $('#regex_debugger_final_summary').remove();

        if (!allScripts) return;
        let textForNextStep = rawInput;
        let totalCharsCaptured = 0;
        let totalCharsAdded = 0;
        let totalCharsRemoved = 0;

        orderedRuleIds.forEach(scriptId => {
            const ruleElement = $(`#regex_debugger_rules [data-id="${scriptId}"]`);
            if (!ruleElement.find('.rule-enabled').is(':checked')) return;

            const script = allScripts.find(s => s.id === scriptId);

            if (script) {
                const result = executeRegexScriptForDebugging(script, textForNextStep);
                totalCharsCaptured += result.charsCaptured;
                totalCharsAdded += result.charsAdded;
                totalCharsRemoved += result.charsRemoved;

                const stepElement = $(stepTemplate.prop('content')).clone();
                // Set the ID on the TOP-LEVEL element that is being appended.
                stepElement.find('>:first-child').attr('id', `step-result-${script.id}`);
                const stepHeader = stepElement.find('.step-header');
                stepHeader.find('strong').text(t`After:` + ` ${script.scriptName}`);

                const metricsHtml = '<span class="step-metrics">' + t`Captured:` + ` ${result.charsCaptured}, ` + t`Added:` + ` +${result.charsAdded}, ` + t`Removed:` + ` -${result.charsRemoved}</span>`;
                stepHeader.append(metricsHtml);

                if (displayMode === 'highlight') {
                    stepElement.find('.step-output').html(result.highlightedOutput);
                } else {
                    stepElement.find('.step-output').text(result.output);
                }

                if (result.error) {
                    stepHeader.append($(`<div class='warning_text text_rose-500'>${result.error}</div>`));
                }

                stepsOutput.append(stepElement);
                textForNextStep = result.output;
            }
        });

        const summaryHtml = `
            <div id="regex_debugger_final_summary" class="regex-debugger-summary">
                <strong>` + t`Total Captured:` + `</strong> ${totalCharsCaptured} | <strong>` + t`Total Added:` + `</strong> +${totalCharsAdded} | <strong>` + t`Total Removed:` + `</strong> -${totalCharsRemoved}
            </div>
        `;
        finalOutput.before(summaryHtml);

        const renderMode = $('#regex_debugger_render_mode').val();
        if (renderMode === 'message') {
            const formattedHtml = messageFormatting(textForNextStep, 'Debugger', true, false, null);
            const messageBlock = $('<div class="mes"><div class="mes_text"></div></div>');
            messageBlock.find('.mes_text').html(formattedHtml);
            finalOutput.append(messageBlock);
        } else {
            finalOutput.text(textForNextStep);
        }
    });

    debuggerHtml.find('#regex_debugger_save_order').on('click', async function () {
        const allKnownScripts = getEditableRegexScripts();
        const newGlobalScripts = $('#regex_debugger_rules_global').children('li').map((_, el) => allKnownScripts.find(s => s.id === $(el).data('id'))).get().filter(Boolean);

        await saveScriptsByType(newGlobalScripts, SCRIPT_TYPES.GLOBAL);

        saveSettingsDebounced();
        await loadRegexScripts();
        toastr.success(t`Regex script order saved!`);

        const currentPopupContent = $('div:has(> #regex_debugger_rules)');
        populateDebuggerRuleList(currentPopupContent);
        // @ts-ignore
        currentPopupContent.find('#regex_debugger_rules_global').sortable({ delay: getRegexSortableDelay() }).disableSelection();
        // @ts-ignore
        // @ts-ignore
    });

    debuggerHtml.find('#regex_debugger_expand_steps').on('click', function () {
        const popupContainer = $('<div class="expanded-regex-container"></div>');
        const navPanel = $('<div class="expanded-regex-nav"><h4>Steps</h4></div>');
        const contentPanel = $('<div class="expanded-regex-content"></div>');

        const content = $('#regex_debugger_steps_output').clone().html();
        contentPanel.html(content);

        $('#regex_debugger_rules .regex-debugger-rule').each(function () {
            const ruleElement = $(this);
            const scriptId = ruleElement.data('id');
            const scriptName = ruleElement.find('.rule-name').text();

            const link = $(`<a href="#">${escapeHtml(scriptName)}</a>`);
            link.data('target-id', `step-result-${scriptId}`);

            link.on('click', function (e) {
                e.preventDefault();
                navPanel.find('a').removeClass('active');
                $(this).addClass('active');

                const targetId = $(this).data('target-id');
                // The selector is now correct for the structure.
                const targetElement = contentPanel.find(`#${targetId}`);

                if (targetElement.length) {
                    const scrollTo = contentPanel.scrollTop() + targetElement.position().top;
                    contentPanel.animate({ scrollTop: scrollTo }, 300);

                    targetElement.css('transition', 'background-color 0.5s').css('background-color', 'var(--highlight_color)');
                    setTimeout(() => targetElement.css('background-color', ''), 1000);
                }
            });

            navPanel.append(link);
        });

        popupContainer.append(navPanel).append(contentPanel);
        callGenericPopup(popupContainer, POPUP_TYPE.TEXT, t`Step-by-step Transformation`, { wide: true, allowVerticalScrolling: false });
    });

    debuggerHtml.find('#regex_debugger_expand_final').on('click', function () {
        const content = $('#regex_debugger_final_output').html();
        const popupContent = $('<div class="regex-popup-content"></div>').html(content);
        callGenericPopup(popupContent, POPUP_TYPE.TEXT, t`Final Output`, { wide: true, large: true, allowVerticalScrolling: true });
    });

    await callGenericPopup(debuggerHtml.children(), POPUP_TYPE.TEXT, '', { wide: true, allowVerticalScrolling: true });
}

/**
 * Updates the info block in the regex editor with hints regarding the find regex.
 * @param {JQuery<HTMLElement>} editorHtml The editor HTML
 */
function updateInfoBlock(editorHtml) {
    const infoBlock = editorHtml.find('.info-block').get(0);
    const infoBlockFlagsHint = editorHtml.find('#regex_info_block_flags_hint');
    const findRegex = String(editorHtml.find('.find_regex').val());

    infoBlockFlagsHint.hide();

    // Clear the info block if the find regex is empty
    if (!findRegex) {
        setInfoBlock(infoBlock, t`Find Regex is empty`, 'info');
        return;
    }

    try {
        const regex = regexFromString(findRegex);
        if (!regex) {
            throw new Error(t`Invalid Find Regex`);
        }

        const flagInfo = [];
        flagInfo.push(regex.flags.includes('g') ? t`Applies to all matches` : t`Applies to the first match`);
        flagInfo.push(regex.flags.includes('i') ? t`Case insensitive` : t`Case sensitive`);

        setInfoBlock(infoBlock, flagInfo.join('. '), 'hint');
        infoBlockFlagsHint.show();
    } catch (error) {
        setInfoBlock(infoBlock, error.message, 'error');
    }
}

// Common settings migration function. Some parts will eventually be removed
// TODO: Maybe migrate placement to strings?
function migrateSettings() {
    let performSave = false;

    // Current: If MD Display is present in placement, remove it and add new placements/MD option
    capabilitySettings.regex.forEach((script) => {
        if (!script.id) {
            script.id = uuidv4();
            performSave = true;
        }

        if (!Array.isArray(script.placement)) {
            script.placement = [];
            performSave = true;
        }

        if (script.placement.includes(regex_placement.MD_DISPLAY)) {
            script.placement = script.placement.length === 1 ?
                Object.values(regex_placement).filter((e) => e !== regex_placement.MD_DISPLAY) :
                script.placement = script.placement.filter((e) => e !== regex_placement.MD_DISPLAY);

            script.markdownOnly = true;
            script.promptOnly = true;

            performSave = true;
        }

        // Old system and sendas placement migration
        // 4 - sendAs
        if (script.placement.includes(4)) {
            script.placement = script.placement.length === 1 ?
                [regex_placement.SLASH_COMMAND] :
                script.placement = script.placement.filter((e) => e !== 4);

            performSave = true;
        }
    });

    if (performSave) {
        saveSettingsDebounced();
    }
}

/**
 * /regex slash command callback
 * @param {{name: string}} args Named arguments
 * @param {string} value Unnamed argument
 * @returns {string} The regexed string
 */
function runRegexCallback(args, value) {
    if (!args.name) {
        toastr.warning(t`No regex script name provided.`);
        return value;
    }

    const scriptName = args.name;
    const scripts = getRegexScripts();

    for (const script of scripts) {
        if (script.scriptName.toLowerCase() === scriptName.toLowerCase()) {
            if (script.disabled) {
                toastr.warning(t`Regex script "${scriptName}" is disabled.`);
                return value;
            }

            console.debug(`Running regex callback for ${scriptName}`);
            return runRegexScript(script, value);
        }
    }

    toastr.warning(t`Regex script "${scriptName}" not found.`);
    return value;
}

/**
 * /regex-toggle slash command callback
 * @param {{state: string, quiet: string}} args Named arguments
 * @param {string} scriptName The name of the script to toggle
 * @returns {Promise<string>} The name of the script
 */
async function toggleRegexCallback(args, scriptName) {
    if (typeof scriptName !== 'string') throw new Error('Script name must be a string.');

    const quiet = isTrueBoolean(args?.quiet);
    const action = isTrueBoolean(args?.state) ? 'enable' :
        isFalseBoolean(args?.state) ? 'disable' :
            'toggle';

    const scripts = getEditableRegexScripts();
    const script = scripts.find(s => equalsIgnoreCaseAndAccents(s.scriptName, scriptName));

    if (!script) {
        toastr.warning(t`Regex script '${scriptName}' not found.`);
        return '';
    }

    switch (action) {
        case 'enable':
            script.disabled = false;
            break;
        case 'disable':
            script.disabled = true;
            break;
        default:
            script.disabled = !script.disabled;
            break;
    }

    const scriptType = getScriptType(script);
    const index = getScriptsByType(scriptType).findIndex(item => item.id === script.id);

    await saveRegexScript(script, index, scriptType);
    if (script.disabled) {
        !quiet && toastr.success(t`Regex script '${scriptName}' has been disabled.`);
    } else {
        !quiet && toastr.success(t`Regex script '${scriptName}' has been enabled.`);
    }

    return script.scriptName || '';
}

/**
 * Performs the import of the regex object.
 * @param {RegexScript} regexScript Input object
 * @param {SCRIPT_TYPES} scriptType The type of script to import as
 */
async function onRegexImportObjectChange(regexScript, scriptType, owner = getRegexScopeOwner(scriptType)) {
    try {
        if (!regexScript.scriptName) {
            throw new Error('No script name provided.');
        }

        if (!Array.isArray(regexScript.placement)) {
            regexScript.placement = [];
            toastr.warning(t`Imported regex script has invalid "Affects" settings and was normalized. Please review it.`);
        }

        // Assign a new UUID
        regexScript.id = uuidv4();

        const array = getScriptsByType(scriptType);
        array.push(regexScript);

        await saveScriptsByType(array, scriptType, owner);

        saveSettingsDebounced();
        await loadRegexScripts();
        toastr.success(t`Regex script "${regexScript.scriptName}" imported.`);
    } catch (error) {
        console.log(error);
        toastr.error(t`Invalid regex object.`);
        return;
    }
}

/**
 * Performs the import of the regex file.
 * @param {File} file Input file
 * @param {SCRIPT_TYPES} scriptType The type of script to import as
 */
async function onRegexImportFileChange(file, scriptType, owner = getRegexScopeOwner(scriptType)) {
    if (!file) {
        toastr.error(t`No file provided.`);
        return;
    }

    try {
        const regexScripts = JSON.parse(await getFileText(file));
        if (Array.isArray(regexScripts)) {
            for (const regexScript of regexScripts) {
                await onRegexImportObjectChange(regexScript, scriptType, owner);
            }
        } else {
            await onRegexImportObjectChange(regexScripts, scriptType, owner);
        }
    } catch (error) {
        console.log(error);
        toastr.error(t`Invalid JSON file.`);
        return;
    }
}

/**
 * Determines the type of a given script.
 * @param {RegexScript} script The script to check
 * @returns {SCRIPT_TYPES} The script type.
 */
function getScriptType(script) {
    if (script.__regexScope) return script.__regexScope.type;
    for (const scriptType of Object.values(SCRIPT_TYPES)) {
        const scripts = getScriptsByType(scriptType);
        if (scripts.some(s => s.id === script.id)) {
            return scriptType;
        }
    }
    return SCRIPT_TYPE_UNKNOWN;
}

function getEditableRegexScripts() {
    return Object.values(SCRIPT_TYPES).flatMap(type => getScriptsByType(type));
}

function getSelectedScripts() {
    const scripts = getEditableRegexScripts();
    const selector = '#regex_container .regex-script-label:has(.regex_bulk_checkbox:checked)';
    const selected = Array.from(document.querySelectorAll(selector)).filter(e => e.dataset.readonly !== 'true');
    return scripts.filter(script => selected.some(e => e.dataset.regexId === script.id && Number(e.dataset.regexType) === getScriptType(script)));
}

function setupRegexSortable() {
    const sortableDatas = [
        {
            selector: '#saved_regex_scripts',
            setter: scripts => saveScriptsByType(scripts, SCRIPT_TYPES.GLOBAL),
            getter: () => getScriptsByType(SCRIPT_TYPES.GLOBAL),
        },
        ...[[SCRIPT_TYPES.PRESET, '#saved_preset_scripts'], [SCRIPT_TYPES.GAME, '#saved_game_scripts']].map(([type, selector]) => ({
            selector, setter: scripts => saveScriptsByType(scripts, type), getter: () => getScriptsByType(type),
        })),
    ];
    for (const { selector, setter, getter } of sortableDatas) {
        const $el = $(selector);
        // @ts-ignore
        if ($el.sortable('instance') !== undefined) {
            // @ts-ignore
            $el.sortable('destroy');
        }
        // @ts-ignore
        $el.sortable({
            delay: getRegexSortableDelay(),
            handle: '.regex-script-handle',
            helper: (_event, ui) => buildRegexDragHelper(ui),
            appendTo: document.body,
            tolerance: 'pointer',
            forcePlaceholderSize: false,
            placeholder: 'regex-sortable-placeholder',
            cursor: 'grabbing',
            scroll: true,
            scrollSensitivity: 60,
            scrollSpeed: 18,
            start: (_event, ui) => {
                styleRegexDragPlaceholder(ui);
            },
            stop: async function () {
                const oldScripts = getter();
                const newScripts = [];
                $(selector).children().each(function () {
                    const id = $(this).attr('data-regex-id');
                    const existingScript = oldScripts.find((e) => e.id === id);
                    if (existingScript) {
                        newScripts.push(existingScript);
                    }
                });

                await setter(newScripts);
                saveSettingsDebounced();

                console.debug(`Regex scripts in ${selector} reordered`);
                await requestRegexChatReload();
                await loadRegexScripts();
            },
        });

        // Suppress native long-press context menu on drag handles.
        $el
            .off('contextmenu.regexHandle', '.regex-script-handle')
            .on('contextmenu.regexHandle', '.regex-script-handle', (event) => event.preventDefault());
    }
}

// Workaround for loading in sequence with other extensions
// NOTE: Always puts extension at the top of the list, but this is fine since it's static
export async function init() {
    await initializeNativeRegexScopes();
    if (!Array.isArray(capabilitySettings.regex)) {
        capabilitySettings.regex = [];
    }

    if (!Array.isArray(capabilitySettings.regex_presets)) {
        capabilitySettings.regex_presets = [];
    }

    // Manually disable the extension since static imports auto-import the JS file
    if (capabilitySettings.disabledPlugins.includes('regex')) {
        return;
    }

    migrateSettings();

    const settingsHtml = $(await renderPluginTemplateAsync('regex', 'dropdown'));
    $('#regex_container').append(settingsHtml);
    const regexDrawer = document.querySelector('#regex_container .regex_settings .inline-drawer');
    regexDrawer?.addEventListener('inline-drawer-toggle', (e) => {
        if (e.target !== regexDrawer) return;
        // The custom toggle event fires before slideToggle updates display, so read the open state on the next tick.
        window.setTimeout(() => {
            const content = regexDrawer.querySelector(':scope > .inline-drawer-content');
            const isOpen = content instanceof HTMLElement && getComputedStyle(content).display !== 'none';
            if (isOpen) {
                void refreshRegexEditorUi();
            }
        }, 0);
    });
    applyCollapsedRegexSections();
    bindRegexSectionCollapse();
    bindRegexReloadOnSettingsClose();
    $('#open_regex_editor').on('click', function () {
        onRegexEditorOpenClick(false, SCRIPT_TYPES.GLOBAL);
    });
    $('#open_regex_debugger').on('click', onRegexDebuggerOpenClick);
    for (const [name, type] of [['preset', SCRIPT_TYPES.PRESET], ['game', SCRIPT_TYPES.GAME]]) {
        $(`#open_${name}_regex_editor`).on('click', () => onRegexEditorOpenClick(false, type));
        $(`#import_${name}_regex`).on('click', () => $(`#import_${name}_regex_file`).trigger('click'));
        $(`#import_${name}_regex_file`).on('change', async function () {
            try { for (const file of this.files) await onRegexImportFileChange(file, type); } finally { this.value = ''; }
        });
    }
    document.querySelectorAll('#regex_container [data-atri-regex-text]').forEach(el => { el.textContent = tl(el.dataset.atriRegexText); });

    $('#import_regex_file').on('change', async function () {
        const target = SCRIPT_TYPES.GLOBAL;

        const inputElement = this instanceof HTMLInputElement && this;
        for (const file of inputElement.files) {
            await onRegexImportFileChange(file, target);
        }
        inputElement.value = '';
    });
    $('#import_regex').on('click', function () {
        $('#import_regex_file').trigger('click');
    });

    $('#bulk_select_all_toggle').on('click', async function () {
        const checkboxes = $('#regex_container .regex_bulk_checkbox');
        if (checkboxes.length === 0) {
            return;
        }

        const allAreChecked = checkboxes.length === checkboxes.filter(':checked').length;
        const newState = !allAreChecked; // true if we just checked all, false if we just unchecked all

        checkboxes.prop('checked', newState);
        setToggleAllIcon(newState);
    });

    $('#bulk_enable_regex').on('click', async function () {
        await bulkToggleRegexScripts(true);
    });

    $('#bulk_disable_regex').on('click', async function () {
        await bulkToggleRegexScripts(false);
    });

    /**
     * Bulk enable or disable regex scripts
     * @param {boolean} newState New state to set (true = enable, false = disable)
     * @returns {Promise<void>}
     */
    async function bulkToggleRegexScripts(newState) {
        const scripts = getSelectedScripts().filter(script => Boolean(script.disabled) === newState);
        if (scripts.length === 0) {
            toastr.warning(newState
                ? t`No regex scripts selected for enabling.`
                : t`No regex scripts selected for disabling.`,
            );
            return;
        }
        const scriptTypesToSave = new Set();
        for (const script of scripts) {
            const scriptType = getScriptType(script);
            scriptTypesToSave.add(scriptType);
            script.disabled = !newState;
        }
        for (const scriptType of scriptTypesToSave) {
            const changes = new Map(scripts.filter(script => getScriptType(script) === scriptType).map(script => [script.id, script]));
            const scriptsOfType = getScriptsByType(scriptType).map(script => changes.get(script.id) || script);
            await saveScriptsByType(scriptsOfType, scriptType);
        }

        saveSettingsDebounced();
        await loadRegexScripts();
        await requestRegexChatReload();
    }

    $('#bulk_delete_regex').on('click', async function () {
        const scripts = getSelectedScripts();
        if (scripts.length === 0) {
            toastr.warning(t`No regex scripts selected for deletion.`);
            return;
        }
        const confirm = await callGenericPopup(t`Are you sure you want to delete the selected regex scripts?`, POPUP_TYPE.CONFIRM);
        if (!confirm) {
            return;
        }
        for (const script of scripts) {
            await deleteRegexScript(script.id, getScriptType(script), false, script.__regexScope?.owner || 'global');
        }
        saveSettingsDebounced();
        await loadRegexScripts();
        await requestRegexChatReload();
    });

    $('#bulk_export_regex').on('click', async function () {
        const scripts = getSelectedScripts();
        if (scripts.length === 0) {
            toastr.warning(t`No regex scripts selected for export.`);
            return;
        }
        const fileName = `regex-${new Date().toISOString()}.json`;
        const fileData = JSON.stringify(scripts, null, 4);
        download(fileData, fileName, 'application/json');
        await loadRegexScripts();
    });

    setupRegexSortable();

    window.addEventListener(REGEX_RUNTIME_SCRIPTS_CHANGED_EVENT, (event) => {
        void refreshRegexEditorUi();
        const requestReload = Boolean(event?.detail?.requestReload);
        if (requestReload) {
            void requestRegexChatReload();
        }
    });

    window.addEventListener(REGEX_OPEN_SCRIPT_EVENT, async (event) => {
        const id = event?.detail?.id;
        if (!id) return;
        try {
            for (const type of Object.values(SCRIPT_TYPES)) {
                const scripts = getScriptsByType(type);
                const script = scripts.find(s => regexExecutionId(s, type) === id);
                if (script) {
                    await onRegexEditorOpenClick(script.id, type);
                    return;
                }
            }
            const runtimeScripts = getRuntimeRegexScripts();
            if (Array.isArray(runtimeScripts) && runtimeScripts.some(s => s && s.id === id)) {
                if (typeof toastr !== 'undefined') {
                    toastr.warning(t`This script is provided by a plugin and cannot be edited here.`);
                }
                return;
            }
            if (typeof toastr !== 'undefined') {
                toastr.warning(t`Regex script not found.`);
            }
        } catch (error) {
            console.warn('[Regex] Failed to open script editor from popup', { id, error });
        }
    });
    await refreshRegexEditorUi();
    // @ts-ignore
    $('#saved_regex_scripts').sortable('enable');

    /**
     * @param {SCRIPT_TYPES} type The script type
     * @returns {ScriptDecorators} The decorators for the script type
     */
    function getScriptDecorators(type) {
        switch (type) {
            case SCRIPT_TYPES.GLOBAL:
                return {
                    typename: 'global',
                    color: enumTypes.enum,
                    icon: 'G',
                };

            default:
                return {
                    typename: 'Unknown',
                    color: enumTypes.variable,
                    icon: 'Unknown',
                };
        }
    }

    const localEnumProviders = {
        regexScripts: () =>
            getRegexScripts().map(script => {
                const isPluginScript = Boolean(script?.__runtime_owner);
                const type = getScriptType(script);
                const decorators = isPluginScript
                    ? { typename: t`Plugin`, color: enumTypes.variable, icon: 'P' }
                    : getScriptDecorators(type);
                const { typename, color, icon } = decorators;
                return new SlashCommandEnumValue(
                    script.scriptName,
                    `${enumIcons.getStateIcon(!script.disabled)} [${typename}] ${script.findRegex}`,
                    color,
                    icon,
                );
            }),
        editableRegexScripts: () =>
            getEditableRegexScripts().map(script => {
                const type = getScriptType(script);
                const { typename, color, icon } = getScriptDecorators(type);
                return new SlashCommandEnumValue(
                    script.scriptName,
                    `${enumIcons.getStateIcon(!script.disabled)} [${typename}] ${script.findRegex}`,
                    color,
                    icon,
                );
            }),
    };

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'regex',
        callback: runRegexCallback,
        returns: 'replaced text',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'name',
                description: 'script name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.editableRegexScripts,
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                'input', [ARGUMENT_TYPE.STRING], false,
            ),
        ],
        helpString: 'Runs a Regex extension script by name on the provided string. The script must be enabled.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'regex-state',
        /** @param {object} _ @param {string} name */
        callback: (_, name) => {
            if (!name) {
                toastr.warning(t`No regex script name provided.`);
                return '';
            }

            const scripts = getRegexScripts();
            const script = scripts.find(s => equalsIgnoreCaseAndAccents(s.scriptName, name));

            if (!script) {
                toastr.warning(t`Regex script "${name}" not found.`);
                return '';
            }

            return script.disabled ? 'false' : 'true';
        },
        returns: 'true (for enabled) or false (for disabled)',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'script name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.regexScripts,
            }),
        ],
        helpString: 'Returns the current state of a regex script.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'regex-toggle',
        callback: toggleRegexCallback,
        returns: 'The name of the script that was toggled',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'state',
                description: 'Explicitly set the state of the script (\'on\' to enable, \'off\' to disable). If not provided, the state will be toggled to the opposite of the current state.',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'toggle',
                enumList: commonEnumProviders.boolean('onOffToggle')(),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'quiet',
                description: 'Suppress the toast message script toggled',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'script name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.regexScripts,
            }),
        ],
        helpString: `
            <div>
                Toggles the state of a specified regex script.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/regex-toggle MyScript</code></pre>
                    </li>
                    <li>
                        <pre><code class="language-stscript">/regex-toggle state=off MyScript</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));

    presetManager.setupEventListeners();
    presetManager.registerSlashCommands();
    eventSource.on(event_types.APP_READY, refreshRegexEditorUi);
    for (const type of [NATIVE_SESSION_LIFECYCLE.SESSION_LOADED, NATIVE_SESSION_LIFECYCLE.SESSION_CLOSED]) onNativeSessionLifecycle(type, async () => {
        await refreshNativeRegexScopes();
        await refreshRegexEditorUi();
    });
}

// Resource authoring uses the same editor without changing the active scope.
export async function editNativeRegexRule(script, save) {
    await onRegexEditorOpenClick(script?.id || false, SCRIPT_TYPES.PRESET, { scripts: script ? [script] : [], save });
}

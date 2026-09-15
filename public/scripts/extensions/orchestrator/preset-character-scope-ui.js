// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups

/**
 * Character-aware preset selector enhancer.
 *
 * The orchestrator stores global and character presets in separate libraries.
 * Historically the preset bar rendered only the currently-displayed scope, so
 * loading a character with an override made global presets appear to vanish.
 *
 * This module keeps both libraries visible while a character is loaded:
 * - the selector gets Character and Global optgroups;
 * - selecting an option switches the editor to that option's scope before the
 *   existing main.js change handler runs;
 * - New defaults to character scope while a character is loaded;
 * - character presets gain a "Save as global" action that copies (not moves)
 *   the preset into the global library.
 *
 * It intentionally layers on top of the existing delegated handlers in
 * main.js instead of duplicating CRUD/persistence logic. Capture-phase hooks
 * only rewrite the scope/id that those handlers already consume.
 */

import { i18n } from './i18n.js';
import { getCurrentAvatar } from './snapshot-cache.js';
import {
    createPreset,
    deletePreset,
    getActivePresetId,
    getPreset,
    listPresets,
    setActivePresetId,
    writeActivePreset,
} from './preset-library.js';
import { setDisplayedScopeForMode, uiState } from './editor-state.js';

const MODULE_NAME = 'orchestrator';
const MIXED_MARKER = 'lukerMixedPresetSelect';
const MIXED_SEPARATOR = '::';
const ALL_MODES = ['spec', 'agenda', 'loop', 'director'];

function getContextSafe() {
    try {
        return globalThis.Luker?.getContext?.() || null;
    } catch (_) {
        return null;
    }
}

function getSettings(context) {
    return context?.extensionSettings?.[MODULE_NAME] || null;
}

function normalizeScope(scope) {
    return scope === 'character' ? 'character' : 'global';
}

function setExplicitDisplayedScope(context, settings, mode, scope) {
    const safeScope = normalizeScope(scope);
    if (!uiState.explicitDisplayedScopes || typeof uiState.explicitDisplayedScopes !== 'object') {
        uiState.explicitDisplayedScopes = {};
    }
    uiState.explicitDisplayedScopes[mode] = safeScope;
    setDisplayedScopeForMode(context, settings, mode, safeScope);
    return safeScope;
}

function encodeValue(scope, id) {
    return `${normalizeScope(scope)}${MIXED_SEPARATOR}${String(id || '')}`;
}

export function decodeMixedPresetValue(value) {
    const raw = String(value || '');
    const splitAt = raw.indexOf(MIXED_SEPARATOR);
    if (splitAt <= 0) return { scope: '', id: raw };
    return {
        scope: normalizeScope(raw.slice(0, splitAt)),
        id: raw.slice(splitAt + MIXED_SEPARATOR.length),
    };
}

function optionScope(option, fallbackScope = 'global') {
    return normalizeScope(option?.dataset?.lukerPresetScope || fallbackScope);
}

function optionPresetId(option) {
    return String(option?.dataset?.lukerPresetId || decodeMixedPresetValue(option?.value).id || '');
}

function findCharacter(context, avatar) {
    return (context?.characters || []).find(c => String(c?.avatar || '') === String(avatar || '')) || null;
}

/**
 * Lazily create the minimal character-scope containers expected by
 * preset-library.js. The existing main.js CRUD handler persists the mutated
 * extension after New completes, so this only needs to wire the in-memory
 * object before that handler runs.
 */
function ensureCharacterPresetContainer(context, avatar) {
    const character = findCharacter(context, avatar);
    if (!character) return false;
    if (!character.data || typeof character.data !== 'object') character.data = {};
    if (!character.data.extensions || typeof character.data.extensions !== 'object') {
        character.data.extensions = {};
    }
    if (!character.data.extensions[MODULE_NAME] || typeof character.data.extensions[MODULE_NAME] !== 'object') {
        character.data.extensions[MODULE_NAME] = {};
    }
    const ext = character.data.extensions[MODULE_NAME];
    if (!ext.presetLibraries || typeof ext.presetLibraries !== 'object') {
        ext.presetLibraries = { spec: {}, agenda: {}, loop: {}, director: {} };
    }
    for (const mode of ALL_MODES) {
        if (!ext.presetLibraries[mode] || typeof ext.presetLibraries[mode] !== 'object') {
            ext.presetLibraries[mode] = {};
        }
    }
    if (!ext.activePresetIds || typeof ext.activePresetIds !== 'object') {
        ext.activePresetIds = { spec: '', agenda: '', loop: '', director: '' };
    }
    return true;
}

export function buildMixedPresetModel(settings, mode, { context, avatar, selectedScope = 'global' } = {}) {
    const safeScope = normalizeScope(selectedScope);
    const globalPresets = listPresets(settings, mode, {
        scope: 'global',
        context,
        avatar,
    });
    const characterPresets = avatar
        ? listPresets(settings, mode, { scope: 'character', context, avatar })
        : [];
    const globalActiveId = getActivePresetId(settings, mode, {
        scope: 'global',
        context,
        avatar,
    });
    const characterActiveId = avatar
        ? getActivePresetId(settings, mode, { scope: 'character', context, avatar })
        : '';
    return {
        selectedScope: safeScope,
        selectedId: safeScope === 'character' ? characterActiveId : globalActiveId,
        globalActiveId,
        characterActiveId,
        globalPresets,
        characterPresets,
    };
}

function makeOption(documentRef, scope, preset, selectedKey) {
    const option = documentRef.createElement('option');
    option.value = encodeValue(scope, preset.id);
    option.textContent = String(preset.name || preset.id || '');
    option.dataset.lukerPresetScope = scope;
    option.dataset.lukerPresetId = String(preset.id || '');
    option.selected = option.value === selectedKey;
    return option;
}

function appendGroup(select, label, scope, presets, selectedKey) {
    const group = select.ownerDocument.createElement('optgroup');
    group.label = label;
    if (presets.length === 0 && scope === 'character') {
        const empty = select.ownerDocument.createElement('option');
        empty.value = '';
        empty.textContent = i18n('No character presets yet');
        empty.disabled = true;
        empty.dataset.lukerPresetScope = 'character';
        if (selectedKey.startsWith(`character${MIXED_SEPARATOR}`)) empty.selected = true;
        group.appendChild(empty);
    } else {
        for (const preset of presets) {
            group.appendChild(makeOption(select.ownerDocument, scope, preset, selectedKey));
        }
    }
    select.appendChild(group);
}

function selectedDescriptor(select) {
    const option = select?.selectedOptions?.[0] || null;
    return {
        scope: optionScope(option, select?.getAttribute('data-scope') || 'global'),
        id: optionPresetId(option),
    };
}

function ensurePromoteButton(bar, mode) {
    let button = bar.querySelector('[data-luker-preset-promote-global]');
    if (!button) {
        button = bar.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'menu_button';
        button.dataset.lukerPresetPromoteGlobal = '1';
        button.dataset.mode = mode;
        button.textContent = i18n('Save as global preset');
        const deleteButton = bar.querySelector('[data-luker-preset-action="delete"]');
        if (deleteButton) {
            deleteButton.before(button);
        } else {
            bar.appendChild(button);
        }
    }
    return button;
}

function updateBarActionScopes(bar, selectedScope, hasCharacter) {
    const safeScope = normalizeScope(selectedScope);
    for (const button of bar.querySelectorAll('[data-luker-preset-action]')) {
        const action = String(button.getAttribute('data-luker-preset-action') || '');
        const scope = action === 'new' && hasCharacter ? 'character' : safeScope;
        button.setAttribute('data-scope', scope);
    }
    const existingPromote = bar.querySelector('[data-luker-preset-promote-global]');
    if (!hasCharacter) {
        existingPromote?.remove();
        return;
    }
    const promote = existingPromote || ensurePromoteButton(bar, String(bar.getAttribute('data-mode') || ''));
    promote.hidden = safeScope !== 'character';
}

function signatureFor(model, avatar, scope) {
    const compact = list => list.map(p => `${p.id}:${p.name}`).join('|');
    return [
        avatar,
        scope,
        model.globalActiveId,
        model.characterActiveId,
        compact(model.characterPresets),
        compact(model.globalPresets),
    ].join('~~');
}

function enhanceSelect(select, { force = false } = {}) {
    if (!(select instanceof HTMLSelectElement)) return;
    const context = getContextSafe();
    const settings = getSettings(context);
    if (!context || !settings) return;
    const avatar = String(getCurrentAvatar(context) || '').trim();
    const mode = String(select.getAttribute('data-mode') || '').trim();
    if (!mode || !ALL_MODES.includes(mode)) return;
    const bar = select.closest('.luker_orch_preset_bar');
    if (!bar) return;

    if (!avatar) {
        // Outside a character context the native global-only renderer is the
        // source of truth. If this exact node survived a character unload,
        // rebuild it to a plain global list rather than leaving stale card
        // options attached.
        if (select.dataset[MIXED_MARKER] === '1') {
            const globalPresets = listPresets(settings, mode, { scope: 'global', context, avatar: '' });
            const activeId = getActivePresetId(settings, mode, { scope: 'global', context, avatar: '' });
            select.replaceChildren(...globalPresets.map(p => {
                const option = select.ownerDocument.createElement('option');
                option.value = p.id;
                option.textContent = p.name;
                option.selected = p.id === activeId;
                return option;
            }));
            select.setAttribute('data-scope', 'global');
            delete select.dataset[MIXED_MARKER];
            delete select.dataset.lukerMixedSignature;
            const promote = bar.querySelector('[data-luker-preset-promote-global]');
            if (promote) promote.remove();
            updateBarActionScopes(bar, 'global', false);
        }
        return;
    }

    const selectedScope = normalizeScope(select.getAttribute('data-scope') || 'character');
    const model = buildMixedPresetModel(settings, mode, {
        context,
        avatar,
        selectedScope,
    });
    const signature = signatureFor(model, avatar, selectedScope);
    if (!force && select.dataset.lukerMixedSignature === signature && select.dataset[MIXED_MARKER] === '1') {
        updateBarActionScopes(bar, selectedScope, true);
        return;
    }

    const selectedKey = encodeValue(model.selectedScope, model.selectedId);
    select.replaceChildren();
    appendGroup(select, i18n('Character'), 'character', model.characterPresets, selectedKey);
    appendGroup(select, i18n('Global'), 'global', model.globalPresets, selectedKey);
    select.dataset[MIXED_MARKER] = '1';
    select.dataset.lukerMixedSignature = signature;
    select.setAttribute('data-scope', model.selectedScope);
    bar.setAttribute('data-scope', model.selectedScope);
    updateBarActionScopes(bar, model.selectedScope, true);
}

let enhanceQueued = false;
function scheduleEnhance() {
    if (enhanceQueued || typeof document === 'undefined') return;
    enhanceQueued = true;
    queueMicrotask(() => {
        enhanceQueued = false;
        for (const select of document.querySelectorAll('[data-luker-preset-select]')) {
            enhanceSelect(select);
        }
    });
}

function prepareSelectionForMain(select) {
    if (select?.dataset?.[MIXED_MARKER] !== '1') return;
    const descriptor = selectedDescriptor(select);
    if (!descriptor.id) return;
    const context = getContextSafe();
    const settings = getSettings(context);
    const mode = String(select.getAttribute('data-mode') || '');
    if (!context || !settings || !mode) return;
    setExplicitDisplayedScope(context, settings, mode, descriptor.scope);
    select.setAttribute('data-scope', descriptor.scope);
    const bar = select.closest('.luker_orch_preset_bar');
    if (bar) {
        bar.setAttribute('data-scope', descriptor.scope);
        updateBarActionScopes(bar, descriptor.scope, true);
    }
    // main.js expects the raw preset id from jQuery(this).val(). Keep the
    // encoded value only as a rendering concern and expose the raw id for
    // the remainder of this event dispatch. The bar is rebuilt afterwards.
    const option = select.selectedOptions?.[0];
    if (option) option.value = descriptor.id;
}

function prepareNewPresetForCharacter(button) {
    const context = getContextSafe();
    const settings = getSettings(context);
    const avatar = String(context ? getCurrentAvatar(context) || '' : '').trim();
    const mode = String(button?.getAttribute('data-mode') || '');
    if (!context || !settings || !avatar || !mode) return;
    if (!ensureCharacterPresetContainer(context, avatar)) return;
    setExplicitDisplayedScope(context, settings, mode, 'character');
    button.setAttribute('data-scope', 'character');
    const bar = button.closest('.luker_orch_preset_bar');
    const select = bar?.querySelector('[data-luker-preset-select]');
    if (select) select.setAttribute('data-scope', 'character');
}

async function copySkillsBestEffort(context, mode, oldName, newName) {
    if (!context?.skills?.copyScope || !oldName || !newName || oldName === newName) return;
    try {
        await context.skills.copyScope(
            { kind: 'orch-preset', mode, name: oldName },
            { kind: 'orch-preset', mode, name: newName },
        );
    } catch (error) {
        if (error?.status !== 404) {
            console.warn(`[${MODULE_NAME}] promote preset skills copy failed:`, error?.message || error);
        }
    }
}

async function promoteCharacterPreset(button) {
    const context = getContextSafe();
    const settings = getSettings(context);
    const avatar = String(context ? getCurrentAvatar(context) || '' : '').trim();
    const mode = String(button.getAttribute('data-mode') || '').trim();
    const bar = button.closest('.luker_orch_preset_bar');
    const select = bar?.querySelector('[data-luker-preset-select]');
    if (!context || !settings || !avatar || !mode || !select) return;
    const descriptor = selectedDescriptor(select);
    if (descriptor.scope !== 'character' || !descriptor.id) return;

    const source = getPreset(settings, mode, 'character', descriptor.id, { context, avatar });
    if (!source) return;
    const oldName = String(source.name || '').trim();
    const popupType = context.POPUP_TYPE?.INPUT;
    const requestedName = typeof context.callGenericPopup === 'function'
        ? await context.callGenericPopup(
            i18n('Enter a name for the new preset'),
            popupType,
            oldName,
        )
        : oldName;
    const newName = String(requestedName || '').trim();
    if (!newName) return;

    const newId = createPreset(settings, mode, 'global', { name: newName }, { context, avatar });
    if (!newId) return;
    setActivePresetId(settings, mode, 'global', newId, { context, avatar });
    const writeResult = writeActivePreset(settings, mode, 'global', source, { context, avatar });
    if (writeResult?.ok === false) {
        deletePreset(settings, mode, 'global', newId, { context, avatar });
        return;
    }

    await copySkillsBestEffort(context, mode, oldName, newName);
    if (typeof context.saveSettings === 'function') {
        await context.saveSettings();
    }
    setExplicitDisplayedScope(context, settings, mode, 'global');
    select.setAttribute('data-scope', 'global');
    enhanceSelect(select, { force: true });
    select.value = encodeValue('global', newId);
    const promotedOption = Array.from(select.options).find(option =>
        option.dataset.lukerPresetScope === 'global' && option.dataset.lukerPresetId === newId);
    if (promotedOption) promotedOption.selected = true;
    select.dispatchEvent(new Event('change', { bubbles: true }));
}

export function installCharacterPresetScopeUi() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    if (document.documentElement?.dataset?.lukerCharacterPresetUiInstalled === '1') return;
    if (document.documentElement) {
        document.documentElement.dataset.lukerCharacterPresetUiInstalled = '1';
    }

    document.addEventListener('change', event => {
        const select = event.target instanceof Element
            ? event.target.closest('[data-luker-preset-select]')
            : null;
        if (select instanceof HTMLSelectElement) prepareSelectionForMain(select);
    }, true);

    document.addEventListener('click', event => {
        if (!(event.target instanceof Element)) return;
        const promote = event.target.closest('[data-luker-preset-promote-global]');
        if (promote instanceof HTMLButtonElement) {
            event.preventDefault();
            event.stopPropagation();
            void promoteCharacterPreset(promote);
            return;
        }
        const createButton = event.target.closest('[data-luker-preset-action="new"]');
        if (createButton instanceof HTMLButtonElement) {
            prepareNewPresetForCharacter(createButton);
        }
    }, true);

    const startObserver = () => {
        if (!document.body) return;
        const observer = new MutationObserver(scheduleEnhance);
        observer.observe(document.body, { childList: true, subtree: true });
        scheduleEnhance();
    };
    if (document.body) startObserver();
    else document.addEventListener('DOMContentLoaded', startObserver, { once: true });
}

installCharacterPresetScopeUi();

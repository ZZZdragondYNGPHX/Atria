import { t } from './i18n.js';

let actionableSingleSelectCounter = 0;

/** @type {Map<string, Set<string>>} ownerKey -> collapsed group IDs (session-only) */
const collapsedGroupsMap = new Map();

function buildOwnerKey(selectElement) {
    const baseId = String(selectElement?.id || 'select')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'select';
    actionableSingleSelectCounter += 1;
    return `atria-action-select-${baseId}-${actionableSingleSelectCounter}`;
}

function getOptionData(option, selectElement, ownerKey) {
    const value = String(option?.id ?? '');
    const text = String(option?.text ?? '').trim();
    const element = option?.element instanceof HTMLOptionElement ? option.element : null;

    return {
        ownerKey,
        value,
        text,
        element,
        selectElement,
    };
}

function isDeleteButtonTarget(target, ownerKey) {
    if (!(target instanceof Element)) {
        return false;
    }

    const button = target.closest('.atria-action-select2-option__delete');
    return button instanceof HTMLElement && button.dataset.atriaActionOwner === ownerKey;
}

function isGroupMenuButtonTarget(target, ownerKey) {
    if (!(target instanceof Element)) {
        return false;
    }

    const button = target.closest('.atria-action-select2-option__group');
    return button instanceof HTMLElement && button.dataset.atriaActionOwner === ownerKey;
}

function isGroupHeaderTarget(target) {
    if (!(target instanceof Element)) {
        return false;
    }
    return !!target.closest('.atria-preset-group-header');
}

function isGroupActionTarget(target) {
    if (!(target instanceof Element)) {
        return false;
    }
    return !!target.closest('.atria-preset-group-action, .atria-preset-group-subgroup');
}

/**
 * Applies collapsed state to the select2 dropdown.
 * Hides/shows group member LIs based on collapsed groups.
 * @param {HTMLSelectElement} selectElement
 * @param {Set<string>} collapsedGroups
 */
function applyCollapsedState(selectElement, collapsedGroups) {
    const $dropdown = $(selectElement).data('select2')?.$dropdown;
    if (!$dropdown?.length) return;

    // Build a map of groupId -> whether any ancestor is collapsed
    const options = selectElement.options;
    const groupIds = new Set();
    for (const opt of options) {
        if (opt.dataset.presetGroupHeader === 'true') {
            groupIds.add(opt.dataset.presetGroupId);
        }
    }

    // Helper: check if a group or any of its ancestor groups is collapsed
    const isAncestorCollapsed = (groupId) => {
        let currentId = groupId;
        while (currentId) {
            if (collapsedGroups.has(currentId)) return true;
            // Find parent of currentId
            const currentOpt = Array.from(options).find(o => o.dataset.presetGroupHeader === 'true' && o.dataset.presetGroupId === currentId);
            const parentId = currentOpt?.dataset?.presetGroupParentId || null;
            currentId = parentId;
        }
        return false;
    };

    $dropdown.find('.select2-results__option').each(function () {
        const $li = $(this);
        const $content = $li.children().first();

        // Group member
        if ($content.hasClass('atria-preset-group-member')) {
            const groupId = $content.attr('data-preset-group-id');
            // Hide if own group is collapsed OR any ancestor is collapsed
            if (groupId && isAncestorCollapsed(groupId)) {
                $li.addClass('atria-preset-group-member--hidden');
            } else {
                $li.removeClass('atria-preset-group-member--hidden');
            }
        }

        // Group header
        if ($content.hasClass('atria-preset-group-header')) {
            const groupId = $content.attr('data-preset-group-id');
            const $chevron = $content.find('.atria-preset-group-chevron');
            if (groupId && collapsedGroups.has(groupId)) {
                $chevron.removeClass('atria-preset-group-chevron--expanded');
            } else {
                $chevron.addClass('atria-preset-group-chevron--expanded');
            }

            // Hide sub-group headers if any ancestor is collapsed (but not self)
            const parentId = $content.attr('data-preset-group-parent-id');
            if (parentId && isAncestorCollapsed(parentId)) {
                $li.addClass('atria-preset-group-member--hidden');
            } else {
                $li.removeClass('atria-preset-group-member--hidden');
            }
        }
    });
}

function getCanonicalJQuery() {
    return globalThis.jQuery || globalThis.$ || null;
}

/**
 * Re-renders an already-open Select2 dropdown after options are rebuilt.
 * @param {HTMLSelectElement} selectElement
 */
export function refreshOpenDropdown(selectElement, ownerKey = '') {
    const jq = getCanonicalJQuery();
    if (typeof jq !== 'function' || typeof jq.fn?.select2 !== 'function') {
        return false;
    }

    const $select = jq(selectElement);
    const isOpen = $select.next('.select2-container').hasClass('select2-container--open');
    if (isOpen) {
        const select2 = $select.data('select2');
        if (!select2) return;

        const $results = select2.$dropdown?.find('.select2-results__options');
        const scrollTop = $results?.scrollTop() ?? 0;
        const term = String(select2.dropdown?.$search?.val?.() ?? '');
        const params = term ? { term } : {};

        if (typeof select2.dataAdapter?.query === 'function' && typeof select2.trigger === 'function') {
            select2.dataAdapter.query(params, (data) => {
                select2.trigger('results:all', { data, query: params });
                requestAnimationFrame(() => {
                    const $updatedResults = select2.$dropdown?.find('.select2-results__options');
                    if ($updatedResults?.length) {
                        $updatedResults.scrollTop(scrollTop);
                    }

                    const collapsedGroups = ownerKey ? collapsedGroupsMap.get(ownerKey) : null;
                    if (collapsedGroups) {
                        applyCollapsedState(selectElement, collapsedGroups);
                    }
                });
            });
            return;
        }

        $select.trigger('change.select2');
    } else {
        $select.select2('open');
    }

    return true;
}

/**
 * Dismisses any open preset context menu.
 */
function dismissContextMenu() {
    $('.atria-preset-ctx-menu').remove();
    $(document).off('pointerdown.atriaCtxMenu');
    $('.atria-action-select2-option__group--selected').removeClass('atria-action-select2-option__group--selected');
}

function getOpenPresetContextMenu(ownerKey) {
    return $('.atria-preset-ctx-menu').filter(function () {
        return this.dataset.atriaActionOwner === ownerKey;
    }).first();
}

function getPresetContextSelection($menu) {
    const selected = $menu.data('selectedPresetNames');
    return Array.isArray(selected) ? selected : [];
}

function syncPresetContextSelectionState(ownerKey, selectedPresetNames = []) {
    const selected = new Set(selectedPresetNames);
    $('.atria-action-select2-option__group').each(function () {
        const $button = $(this);
        if ($button.data('atriaActionOwner') !== ownerKey) {
            return;
        }
        const presetName = String($button.data('optionText') ?? '').trim();
        $button.toggleClass('atria-action-select2-option__group--selected', selected.has(presetName));
    });
}

/**
 * Repositions a context menu so it always stays within the viewport.
 * @param {JQuery<HTMLElement>} $menu
 * @param {number} x
 * @param {number} y
 */
function positionContextMenuInViewport($menu, x, y) {
    if (!$menu?.length) {
        return;
    }

    const margin = 8;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth ?? document.documentElement.clientWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? document.documentElement.clientHeight;
    const menuWidth = $menu.outerWidth() ?? 0;
    const menuHeight = $menu.outerHeight() ?? 0;

    const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
    const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);

    const left = Math.min(Math.max(margin, x), maxLeft);
    const top = Math.min(Math.max(margin, y), maxTop);

    $menu.css({
        left: left + 'px',
        top: top + 'px',
    });
}

/**
 * Shows a context menu for a preset option.
 * @param {MouseEvent|{x:number,y:number}} anchor
 * @param {string} presetName
 * @param {object} callbacks
 * @param {HTMLSelectElement} selectElement
 * @param {string} ownerKey
 */
function showPresetContextMenu(anchor, presetName, callbacks, selectElement, ownerKey) {
    const $existingMenu = getOpenPresetContextMenu(ownerKey);
    const existingSelection = getPresetContextSelection($existingMenu);
    const keepPosition = $existingMenu.length > 0;
    let selectedPresetNames = [presetName].filter(Boolean);

    if (keepPosition && selectedPresetNames.length) {
        if (existingSelection.includes(presetName)) {
            selectedPresetNames = existingSelection.length > 1 ? existingSelection.filter(name => name !== presetName) : existingSelection;
        } else {
            selectedPresetNames = [...existingSelection, presetName];
        }
    }

    selectedPresetNames = Array.from(new Set(selectedPresetNames));

    const existingX = Number.parseFloat($existingMenu.css('left'));
    const existingY = Number.parseFloat($existingMenu.css('top'));

    dismissContextMenu();
    if (!callbacks) return;

    const groups = callbacks.getGroups();
    const selectedGroups = selectedPresetNames.map(name => callbacks.getGroupForPreset(name));
    const currentGroup = selectedPresetNames.length === 1 ? selectedGroups[0] : null;
    const commonGroup = selectedGroups.length > 0 && selectedGroups.every(group => group?.id === selectedGroups[0]?.id) ? selectedGroups[0] : null;
    const hasGroupedPreset = selectedGroups.some(Boolean);

    const $menu = $('<div class="atria-preset-ctx-menu"></div>')
        .attr('data-atria-action-owner', ownerKey)
        .data('selectedPresetNames', selectedPresetNames)
        .on('pointerdown mousedown mouseup pointerup touchstart touchend click', (e) => {
            e.stopPropagation();
        });

    // "New Group..." option
    const $newGroup = $('<div class="atria-preset-ctx-menu__item atria-preset-ctx-menu__item--new"></div>')
        .html('<i class="fa-solid fa-folder-plus"></i> ' + t`New Preset Group...`)
        .on('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dismissContextMenu();
            const name = prompt(t`Preset group name:`);
            if (!name?.trim()) return;
            const groupId = await callbacks.createGroup(name.trim(), commonGroup?.id);
            if (groupId) {
                for (const selectedPresetName of selectedPresetNames) {
                    await callbacks.addToGroup(selectedPresetName, groupId);
                }
            }
            if (typeof callbacks.rebuild === 'function') {
                callbacks.rebuild();
            }
            refreshOpenDropdown(selectElement, ownerKey);
        });
    $menu.append($newGroup);

    // Existing groups
    if (groups.length > 0) {
        $menu.append('<div class="atria-preset-ctx-menu__divider"></div>');

        if (selectedPresetNames.length > 1) {
            const $current = $('<div class="atria-preset-ctx-menu__item atria-preset-ctx-menu__item--label"></div>')
                .text(`${t`Selected presets`}: ${selectedPresetNames.length}`);
            $menu.append($current);
        } else if (currentGroup) {
            const $current = $('<div class="atria-preset-ctx-menu__item atria-preset-ctx-menu__item--label"></div>')
                .text(`${t`Current group`}: ${currentGroup.name}`);
            $menu.append($current);
        } else {
            const $current = $('<div class="atria-preset-ctx-menu__item atria-preset-ctx-menu__item--label"></div>')
                .text(t`Current group: Ungrouped`);
            $menu.append($current);
        }

        for (const group of groups) {
            const isActive = selectedPresetNames.length > 0 && selectedGroups.every(selectedGroup => selectedGroup?.id === group.id);
            const depth = callbacks.getGroupDepth ? callbacks.getGroupDepth(group.id) : 0;
            const indent = '\u00A0'.repeat(depth * 2);
            const prefix = depth > 0 ? '└ ' : '';
            const $item = $('<div class="atria-preset-ctx-menu__item"></div>')
                .text(isActive ? `${indent}${prefix}${t`In group`}: ${group.name}` : `${indent}${prefix}${t`Move to group`}: ${group.name}`)
                .toggleClass('atria-preset-ctx-menu__item--active', isActive)
                .on('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dismissContextMenu();
                    if (!isActive) {
                        for (const selectedPresetName of selectedPresetNames) {
                            await callbacks.addToGroup(selectedPresetName, group.id);
                        }
                        if (typeof callbacks.rebuild === 'function') {
                            callbacks.rebuild();
                        }
                        refreshOpenDropdown(selectElement, ownerKey);
                    }
                });
            if (isActive) {
                $item.prepend('<i class="fa-solid fa-check"></i> ');
            }
            $menu.append($item);
        }
    }

    // "Remove from group" if currently grouped
    if (hasGroupedPreset) {
        $menu.append('<div class="atria-preset-ctx-menu__divider"></div>');
        const $remove = $('<div class="atria-preset-ctx-menu__item atria-preset-ctx-menu__item--remove"></div>')
            .html('<i class="fa-solid fa-folder-minus"></i> ' + t`Remove from preset group`)
            .on('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                dismissContextMenu();
                for (const selectedPresetName of selectedPresetNames) {
                    await callbacks.removeFromGroup(selectedPresetName);
                }
                if (typeof callbacks.rebuild === 'function') {
                    callbacks.rebuild();
                }
                refreshOpenDropdown(selectElement, ownerKey);
            });
        $menu.append($remove);
    } else if (groups.length === 0) {
        $menu.append('<div class="atria-preset-ctx-menu__divider"></div>');
        const $empty = $('<div class="atria-preset-ctx-menu__item atria-preset-ctx-menu__item--label"></div>')
            .text(t`No preset groups yet`);
        $menu.append($empty);
    }

    // Position and show
    const x = keepPosition && Number.isFinite(existingX) ? existingX : anchor instanceof MouseEvent ? anchor.clientX : Number(anchor?.x ?? 0);
    const y = keepPosition && Number.isFinite(existingY) ? existingY : anchor instanceof MouseEvent ? anchor.clientY : Number(anchor?.y ?? 0);

    $menu.css({
        position: 'fixed',
        left: x + 'px',
        top: y + 'px',
        zIndex: 99999,
    });

    $(document.body).append($menu);
    positionContextMenuInViewport($menu, x, y);
    syncPresetContextSelectionState(ownerKey, selectedPresetNames);

    // Dismiss on outside click (next tick)
    requestAnimationFrame(() => {
        $(document).off('pointerdown.atriaCtxMenu').on('pointerdown.atriaCtxMenu', (e) => {
            const $target = $(e.target);
            const $groupButton = $target.closest('.atria-action-select2-option__group');
            if ($target.closest('.atria-preset-ctx-menu').length) {
                return;
            }
            if ($groupButton.length && $groupButton.data('atriaActionOwner') === ownerKey) {
                return;
            }
            if ($target.closest('.atria-action-select2-dropdown').length) {
                return;
            }
            dismissContextMenu();
        });
    });
}

/**
 * Initializes a single-select Select2 with optional inline delete actions.
 * @param {JQuery<HTMLElement>|HTMLElement|string} select
 * @param {object} [options]
 * @param {string} [options.placeholder]
 * @param {string} [options.searchInputPlaceholder]
 * @param {boolean} [options.allowClear=false]
 * @param {boolean} [options.closeOnSelect=true]
 * @param {string} [options.deleteButtonTitle='Delete']
 * @param {(option: { ownerKey: string, value: string, text: string, element: HTMLOptionElement|null, selectElement: HTMLSelectElement }) => boolean} [options.canDelete]
 * @param {(option: { ownerKey: string, value: string, text: string, element: HTMLOptionElement|null, selectElement: HTMLSelectElement }) => Promise<void>|void} [options.onDelete]
 * @param {string} [options.containerCssClass]
 * @param {string} [options.dropdownCssClass]
 * @param {object} [options.select2Options]
 * @param {object} [options.presetGroupCallbacks]
 */
export function initActionableSingleSelect(select, {
    placeholder = '',
    searchInputPlaceholder = '',
    allowClear = false,
    closeOnSelect = true,
    deleteButtonTitle = 'Delete',
    canDelete = () => false,
    onDelete = null,
    containerCssClass = '',
    dropdownCssClass = '',
    select2Options = {},
    presetGroupCallbacks = null,
} = {}) {
    const jq = getCanonicalJQuery();
    if (typeof jq !== 'function') {
        return false;
    }

    const selectElement = select?.jquery
        ? select.get(0)
        : typeof select === 'string'
            ? document.querySelector(select)
            : select;

    if (!(selectElement instanceof HTMLSelectElement)) {
        return false;
    }

    if (typeof jq.fn?.select2 !== 'function') {
        console.warn('[init] Select2 is not ready; actionable single-select stays native.');
        return false;
    }

    const $select = jq(selectElement);

    const previousNamespace = selectElement.dataset.atriaActionableSingleSelectNamespace;
    if (previousNamespace) {
        $select.off(`select2:selecting${previousNamespace} select2:opening${previousNamespace} select2:open${previousNamespace} select2:close${previousNamespace}`);
        jq(document).off(`pointerdown${previousNamespace} mousedown${previousNamespace} mouseup${previousNamespace} touchstart${previousNamespace} touchend${previousNamespace} pointerup${previousNamespace} click${previousNamespace} contextmenu${previousNamespace}`);
    }

    const ownerKey = buildOwnerKey(selectElement);
    const namespace = `.atriaActionableSingleSelect-${ownerKey}`;
    const dropdownClasses = ['atria-action-select2-dropdown', dropdownCssClass].filter(Boolean).join(' ');
    selectElement.dataset.atriaActionableSingleSelectNamespace = namespace;

    // Initialize collapsed groups set for this owner
    if (!collapsedGroupsMap.has(ownerKey)) {
        collapsedGroupsMap.set(ownerKey, new Set());
    }
    const collapsedGroups = collapsedGroupsMap.get(ownerKey);

    if ($select.data('select2')) {
        $select.select2('destroy');
    }

    $select.select2({
        placeholder,
        searchInputPlaceholder,
        allowClear,
        closeOnSelect,
        multiple: false,
        dropdownCssClass: dropdownClasses,
        templateResult: (option) => {
            const optionData = getOptionData(option, selectElement, ownerKey);
            const element = option?.element;

            // === Group header ===
            if (element?.dataset?.presetGroupHeader === 'true') {
                const groupId = element.dataset.presetGroupId;
                const isCollapsed = collapsedGroups.has(groupId);
                const depth = parseInt(element.dataset.depth || '0', 10);
                const parentId = element.dataset.presetGroupParentId || null;

                const header = jq('<div class="atria-preset-group-header"></div>')
                    .attr('data-preset-group-id', groupId)
                    .attr('data-atria-action-owner', ownerKey)
                    .attr('data-preset-group-parent-id', parentId || '')
                    .css('padding-left', depth > 0 ? (depth * 20) + 'px' : '');
                const chevron = jq('<i class="fa-solid fa-chevron-right atria-preset-group-chevron"></i>')
                    .toggleClass('atria-preset-group-chevron--expanded', !isCollapsed);
                const label = jq('<span class="atria-preset-group-header__label"></span>').text(option.text);

                const memberCount = jq(selectElement).find('option[data-preset-group-id="' + groupId + '"][data-preset-group-member="true"]').length;
                const count = jq('<span class="atria-preset-group-header__count"></span>').text('(' + memberCount + ')');

                const actions = jq('<span class="atria-preset-group-header__actions"></span>');
                const subgroupBtn = jq('<button type="button" class="atria-preset-group-action atria-preset-group-subgroup" tabindex="-1"></button>')
                    .attr('data-action', 'subgroup')
                    .attr('data-group-id', groupId)
                    .attr('data-atria-action-owner', ownerKey)
                    .html('<i class="fa-solid fa-folder-plus"></i>');
                const renameBtn = jq('<button type="button" class="atria-preset-group-action" tabindex="-1"></button>')
                    .attr('data-action', 'rename')
                    .attr('data-group-id', groupId)
                    .attr('data-atria-action-owner', ownerKey)
                    .html('<i class="fa-solid fa-pen"></i>');
                const deleteBtn = jq('<button type="button" class="atria-preset-group-action" tabindex="-1"></button>')
                    .attr('data-action', 'delete')
                    .attr('data-group-id', groupId)
                    .attr('data-atria-action-owner', ownerKey)
                    .html('<i class="fa-solid fa-trash-can"></i>');
                actions.append(subgroupBtn, renameBtn, deleteBtn);

                header.append(chevron, label, count, actions);
                return header;
            }

            // === Group member ===
            if (element?.dataset?.presetGroupMember === 'true') {
                const groupId = element.dataset.presetGroupId;
                const depth = parseInt(element.dataset.depth || '0', 10);

                const row = jq('<div class="atria-action-select2-option atria-preset-group-member"></div>')
                    .attr('data-preset-group-id', groupId)
                    .css('padding-left', depth > 0 ? ((depth + 1) * 20) + 'px' : '');
                const label = jq('<span class="atria-action-select2-option__label"></span>').text(optionData.text);
                row.append(label);

                if (presetGroupCallbacks) {
                    const groupButton = jq('<button type="button" class="atria-action-select2-option__group" tabindex="-1"><i class="fa-solid fa-folder-tree"></i></button>')
                        .attr('title', t`Manage preset group`)
                        .attr('aria-label', t`Manage preset group`)
                        .attr('data-atria-action-owner', ownerKey)
                        .attr('data-option-value', optionData.value)
                        .attr('data-option-text', optionData.text);
                    row.append(groupButton);
                }

                if (canDelete(optionData)) {
                    const deleteButton = jq('<button type="button" class="atria-action-select2-option__delete" tabindex="-1"><i class="fa-solid fa-trash-can"></i></button>')
                        .attr('title', deleteButtonTitle)
                        .attr('aria-label', deleteButtonTitle)
                        .attr('data-atria-action-owner', ownerKey)
                        .attr('data-option-value', optionData.value)
                        .attr('data-option-text', optionData.text);
                    row.append(deleteButton);
                }

                return row;
            }

            // === Ungrouped (original logic) ===
            if (!option?.element || option.loading || optionData.value === '') {
                return jq('<span></span>').text(String(option?.text || ''));
            }

            const row = jq('<div class="atria-action-select2-option"></div>');
            const label = jq('<span class="atria-action-select2-option__label"></span>').text(optionData.text);
            row.append(label);

            if (presetGroupCallbacks) {
                const groupButton = jq('<button type="button" class="atria-action-select2-option__group" tabindex="-1"><i class="fa-solid fa-folder-tree"></i></button>');
                groupButton
                    .attr('title', t`Manage preset group`)
                    .attr('aria-label', t`Manage preset group`)
                    .attr('data-atria-action-owner', ownerKey)
                    .attr('data-option-value', optionData.value)
                    .attr('data-option-text', optionData.text);
                row.append(groupButton);
            }

            if (canDelete(optionData)) {
                const deleteButton = jq('<button type="button" class="atria-action-select2-option__delete" tabindex="-1"><i class="fa-solid fa-trash-can"></i></button>');
                deleteButton
                    .attr('title', deleteButtonTitle)
                    .attr('aria-label', deleteButtonTitle)
                    .attr('data-atria-action-owner', ownerKey)
                    .attr('data-option-value', optionData.value)
                    .attr('data-option-text', optionData.text);
                row.append(deleteButton);
            }

            return row;
        },
        ...select2Options,
    });

    $select.next('.select2-container')
        .addClass('atria-action-select2')
        .addClass(containerCssClass);

    $select
        .off('select2:opening' + namespace)
        .on('select2:opening' + namespace, function () {
            if (presetGroupCallbacks && typeof presetGroupCallbacks.rebuild === 'function') {
                presetGroupCallbacks.rebuild();
            }
        });

    // === select2:open - apply collapsed state & default-collapse new groups ===
    $select
        .off('select2:open' + namespace)
        .on('select2:open' + namespace, function () {
            // Default-collapse any groups not yet tracked
            if (presetGroupCallbacks) {
                const groups = presetGroupCallbacks.getGroups();
                for (const group of groups) {
                    if (!collapsedGroups.has(group.id) && !collapsedGroups._initialized?.has(group.id)) {
                        collapsedGroups.add(group.id);
                    }
                }
                // Mark as initialized so we don't re-collapse after user expands
                if (!collapsedGroups._initialized) {
                    Object.defineProperty(collapsedGroups, '_initialized', { value: new Set(), writable: false, enumerable: false });
                }
                for (const group of groups) {
                    collapsedGroups._initialized.add(group.id);
                }
            }

            // Apply after a microtask to let select2 finish rendering
            requestAnimationFrame(() => {
                applyCollapsedState(selectElement, collapsedGroups);

                if (presetGroupCallbacks) {
                    const $dropdown = $select.data('select2')?.$dropdown;
                    const $results = $dropdown?.find('.select2-results');
                    if ($results?.length) {
                        $results.find('.atria-preset-group-toolbar').remove();

                        const $toolbar = jq('<div class="atria-preset-group-toolbar"></div>');
                        const $newGroupButton = jq('<button type="button" class="atria-preset-group-toolbar__new"></button>')
                            .html('<i class="fa-solid fa-folder-plus"></i> ' + t`New Preset Group...`)
                            .on('click', async (event) => {
                                event.preventDefault();
                                event.stopPropagation();

                                const name = prompt(t`Preset group name:`);
                                if (!name?.trim()) return;
                                await presetGroupCallbacks.createGroup(name.trim());
                                if (typeof presetGroupCallbacks.rebuild === 'function') {
                                    presetGroupCallbacks.rebuild();
                                }
                                refreshOpenDropdown(selectElement, ownerKey);
                            });

                        $toolbar.append($newGroupButton);
                        $results.prepend($toolbar);
                    }
                }
            });
        });

    $select
        .off('select2:close' + namespace)
        .on('select2:close' + namespace, function () {
            dismissContextMenu();
        });

    // === Prevent selection of group headers and action buttons ===
    $select
        .off('select2:selecting' + namespace)
        .on('select2:selecting' + namespace, function (event) {
            const originalTarget = event?.params?.args?.originalEvent?.target;
            if (isDeleteButtonTarget(originalTarget, ownerKey)) {
                event.preventDefault();
                return;
            }
            if (isGroupMenuButtonTarget(originalTarget, ownerKey)) {
                event.preventDefault();
                return;
            }
            if (isGroupHeaderTarget(originalTarget) || isGroupActionTarget(originalTarget)) {
                event.preventDefault();
                return;
            }
        });

    // === Pointer events for delete buttons, group headers, group actions ===
    jq(document)
        .off('pointerdown' + namespace + ' mousedown' + namespace + ' mouseup' + namespace + ' touchstart' + namespace + ' touchend' + namespace)
        .on('pointerdown' + namespace + ' mousedown' + namespace + ' mouseup' + namespace + ' touchstart' + namespace + ' touchend' + namespace, '.atria-action-select2-option__delete, .atria-action-select2-option__group, .atria-preset-group-header, .atria-preset-group-action, .atria-preset-group-subgroup', function (event) {
            const $el = jq(this);
            // Only handle events for our owner
            if ($el.data('atriaActionOwner') !== ownerKey && $el.closest('[data-atria-action-owner]').data('atriaActionOwner') !== ownerKey) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
        });

    // === Group menu button handler ===
    jq(document)
        .off('pointerup' + namespace + '.groupMenu')
        .on('pointerup' + namespace + '.groupMenu', '.atria-action-select2-option__group', function (event) {
            if (jq(this).data('atriaActionOwner') !== ownerKey || !presetGroupCallbacks) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const presetName = String(jq(this).data('optionText') ?? '').trim();
            if (!presetName) {
                return;
            }

            const rect = this.getBoundingClientRect();
            showPresetContextMenu({ x: rect.right + 6, y: rect.top + rect.height / 2 }, presetName, presetGroupCallbacks, selectElement, ownerKey);
        });

    // === Delete button handler ===
    jq(document)
        .off('pointerup' + namespace + '.delete')
        .on('pointerup' + namespace + '.delete', '.atria-action-select2-option__delete', async function (event) {
            if (jq(this).data('atriaActionOwner') !== ownerKey || typeof onDelete !== 'function') {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const value = String(jq(this).data('optionValue') ?? '');
            const text = String(jq(this).data('optionText') ?? '').trim();
            const optionElement = Array.from(selectElement.options).find((option) => String(option.value) === value && String(option.textContent || '').trim() === text) || null;
            const optionData = {
                ownerKey,
                value,
                text,
                element: optionElement,
                selectElement,
            };

            if (!canDelete(optionData)) {
                return;
            }

            if ($select.data('select2')) {
                $select.select2('close');
            }

            try {
                await onDelete(optionData);
            } catch (error) {
                console.error('Actionable single select delete handler failed', error);
            }
        });

    // === Group header pointerup - toggle collapse (pointerup for WebView touch handling) ===
    jq(document)
        .off('pointerup' + namespace + '.groupHeader')
        .on('pointerup' + namespace + '.groupHeader', '.atria-preset-group-header', function (event) {
            const $header = jq(this);
            if ($header.data('atriaActionOwner') !== ownerKey) {
                return;
            }

            // Don't toggle if clicking action buttons or subgroup button
            if (jq(event.target).closest('.atria-preset-group-action, .atria-preset-group-subgroup').length) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const groupId = $header.attr('data-preset-group-id');
            if (!groupId) return;

            if (collapsedGroups.has(groupId)) {
                collapsedGroups.delete(groupId);
            } else {
                collapsedGroups.add(groupId);
            }

            applyCollapsedState(selectElement, collapsedGroups);
        });

    // === Group action buttons (rename/delete/create sub-group) — pointerup for WebView touch handling ===
    jq(document)
        .off('pointerup' + namespace + '.groupAction')
        .on('pointerup' + namespace + '.groupAction', '.atria-preset-group-action, .atria-preset-group-subgroup', async function (event) {
            if (jq(this).data('atriaActionOwner') !== ownerKey || !presetGroupCallbacks) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const action = jq(this).data('action');
            const groupId = jq(this).data('groupId');

            if (action === 'subgroup') {
                const name = prompt(t`Sub-group name:`);
                if (!name?.trim()) return;

                if ($select.data('select2')) {
                    $select.select2('close');
                }

                await presetGroupCallbacks.createGroup(name.trim(), groupId);
                if (typeof presetGroupCallbacks.rebuild === 'function') {
                    presetGroupCallbacks.rebuild();
                }
                refreshOpenDropdown(selectElement, ownerKey);
            } else if (action === 'rename') {
                const groups = presetGroupCallbacks.getGroups();
                const group = groups.find(g => g.id === groupId);
                if (!group) return;

                const newName = prompt(t`Rename preset group:`, group.name);
                if (!newName?.trim() || newName.trim() === group.name) return;

                if ($select.data('select2')) {
                    $select.select2('close');
                }

                await presetGroupCallbacks.renameGroup(groupId, newName.trim());
                if (typeof presetGroupCallbacks.rebuild === 'function') {
                    presetGroupCallbacks.rebuild();
                }
                refreshOpenDropdown(selectElement, ownerKey);
            } else if (action === 'delete') {
                if (!confirm(t`Delete this preset group? Presets will become ungrouped.`)) return;

                if ($select.data('select2')) {
                    $select.select2('close');
                }

                collapsedGroups.delete(groupId);
                await presetGroupCallbacks.deleteGroup(groupId);
                if (typeof presetGroupCallbacks.rebuild === 'function') {
                    presetGroupCallbacks.rebuild();
                }
                refreshOpenDropdown(selectElement, ownerKey);
            }
        });
    return true;
}

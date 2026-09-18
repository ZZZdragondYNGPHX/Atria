import { getRequestHeaders } from '../script.js';
import {
    clearFrontendLogs,
    getFrontendLogsSnapshot,
    installFrontendLogCapture,
    isFrontendConsoleDebugLoggingEnabled,
} from './frontend-log-manager.js';
import { t } from './i18n.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from './popup.js';
import { renderTemplateAsync } from './templates.js';
import { openBackupSyncCenter } from './backup-sync-center.js';
import { openStorageManagement } from './storage-management.js';
import { debounce, ensureImageFormatSupported, getBase64Async, humanFileSize } from './utils.js';

/**
 * @type {import('../../src/users.js').UserViewModel} Logged in user
 */
export let currentUser = null;
export let accountsEnabled = false;

// Extend the session every 10 minutes
const SESSION_EXTEND_INTERVAL = 10 * 60 * 1000;
const DEFAULT_LOG_VIEW_LIMIT = 300;
const MAX_LOG_VIEW_LIMIT = 5000;
const MAX_LOG_VIEW_CHARS = 250000;

function normalizeOptionalTimestamp(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, Math.floor(numericValue)) : null;
}

function normalizeLogQueryOptions(options = {}) {
    return {
        limit: Math.min(MAX_LOG_VIEW_LIMIT, Math.max(1, Math.floor(Number(options.limit) || DEFAULT_LOG_VIEW_LIMIT))),
        sinceId: Math.max(0, Math.floor(Number(options.sinceId) || 0)),
        startTime: normalizeOptionalTimestamp(options.startTime),
        endTime: normalizeOptionalTimestamp(options.endTime),
        searchTerm: String(options.searchTerm || '').trim(),
    };
}

function buildLogOutputWithinCharBudget(entries, formatter, options = {}) {
    const maxChars = options?.maxChars ?? MAX_LOG_VIEW_CHARS;
    const normalizedMaxChars = Math.max(1, Math.floor(Number(maxChars) || MAX_LOG_VIEW_CHARS));
    const normalizedSearchTerm = String(options?.searchTerm || '').trim().toLowerCase();
    const lines = [];
    let totalChars = 0;
    let matchedEntries = 0;
    let filteredEntries = 0;
    let hiddenEntries = 0;
    let oversizedEntries = 0;
    let budgetExceeded = false;

    for (let index = entries.length - 1; index >= 0; index--) {
        const line = String(formatter(entries[index]) || '');
        if (normalizedSearchTerm && !line.toLowerCase().includes(normalizedSearchTerm)) {
            filteredEntries += 1;
            continue;
        }

        matchedEntries += 1;

        if (line.length > normalizedMaxChars) {
            hiddenEntries += 1;
            oversizedEntries += 1;
            continue;
        }

        const additionalChars = line.length + (lines.length > 0 ? 1 : 0);
        if (budgetExceeded || totalChars + additionalChars > normalizedMaxChars) {
            hiddenEntries += 1;
            budgetExceeded = true;
            continue;
        }

        lines.push(line);
        totalChars += additionalChars;
    }

    lines.reverse();

    return {
        text: lines.join('\n'),
        totalEntries: entries.length,
        matchedEntries,
        filteredEntries,
        visibleEntries: lines.length,
        hiddenEntries,
        oversizedEntries,
        totalChars,
        searchTerm: normalizedSearchTerm,
    };
}

function parseLogTimeInputValue(value, { roundUpMinute = false } = {}) {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) {
        return null;
    }

    const timestamp = new Date(normalizedValue).getTime();
    if (!Number.isFinite(timestamp)) {
        return null;
    }

    if (roundUpMinute && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalizedValue)) {
        return timestamp + 59_999;
    }

    return timestamp;
}

/**
 * Enable or disable user account controls in the UI.
 * @param {boolean} isEnabled User account controls enabled
 * @returns {Promise<void>}
 */
export async function setUserControls(isEnabled) {
    accountsEnabled = isEnabled;
    installFrontendLogCapture();

    if (!isEnabled) {
        $('#logout_button').hide();
        $('#server_logs_button').show();
        return;
    }

    $('#logout_button').show();
    await getCurrentUser();
}

/**
 * Check if the current user is an admin.
 * @returns {boolean} True if the current user is an admin
 */
export function isAdmin() {
    if (!accountsEnabled) {
        return true;
    }

    if (!currentUser) {
        return false;
    }

    return Boolean(currentUser.admin);
}

/**
 * Gets the handle string of the current user.
 * @returns {string} User handle
 */
export function getCurrentUserHandle() {
    return currentUser?.handle || 'default-user';
}

/**
 * Map a config-validation error code returned by the server to a localized message.
 * This remains part of script.js' public startup contract even though the
 * former admin-panel UI has been removed.
 * @param {string} code Machine-readable error code
 * @returns {string|null} Localized message, or null if the code is unknown
 */
export function getConfigValidationMessage(code) {
    switch (code) {
        case 'CONFIG_UNSAFE_NO_AUTH':
            return t`Cannot save: with "listen" on, you must enable one of whitelistMode, basicAuthMode, or enableUserAccounts (or set securityOverride: true). Otherwise the server will refuse to start.`;
        case 'CONFIG_UNSAFE_NO_PROTOCOL':
            return t`Cannot save: at least one of protocol.ipv4 or protocol.ipv6 must be enabled (or set to "auto"). Otherwise the server will refuse to start.`;
        default:
            return null;
    }
}

/**
 * Refresh the current account view model.
 * @returns {Promise<void>}
 */
async function getCurrentUser() {
    try {
        const response = await fetch('/api/users/me', {
            headers: getRequestHeaders(),
        });
        if (!response.ok) {
            throw new Error('Failed to get current user');
        }
        currentUser = await response.json();
        $('#server_logs_button').show();
    } catch (error) {
        console.error('Error getting current user:', error);
    }
}

async function fetchServerLogs(options = {}) {
    const { limit, sinceId, startTime, endTime, searchTerm } = normalizeLogQueryOptions(options);
    const response = await fetch('/api/users/logs/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ limit, sinceId, startTime, endTime, searchTerm }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch server logs');
    }

    return response.json();
}

async function clearServerLogsRemote() {
    const response = await fetch('/api/users/logs/clear', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to clear server logs');
    }
}

function formatServerLogEntry(entry) {
    const date = new Date(Number(entry?.timestamp) || Date.now());
    const level = String(entry?.level || 'log').toUpperCase();
    const message = String(entry?.message || '');
    return `[${date.toLocaleString()}] [${level}] ${message}`;
}

function formatFrontendLogEntry(entry) {
    const date = new Date(Number(entry?.timestamp) || Date.now());
    const level = String(entry?.level || 'log').toUpperCase();
    const source = String(entry?.source || 'console');
    const message = String(entry?.message || '');
    return `[${date.toLocaleString()}] [${level}] [${source}] ${message}`;
}

async function openLogsViewer() {
    installFrontendLogCapture();
    const canViewServerLogs = !accountsEnabled || isAdmin();
    const template = $(`
        <div class="accountLogsViewer flex-container flexFlowColumn flexNoGap">
            <h3 class="marginBot5">${t`Logs`}</h3>
            <div class="accountLogsActionRow flex-container flexGap10 marginBot10">
                <label class="checkbox_label accountLogsFieldLabel logSourceLabel">
                    <span>${t`Log source`}</span>
                    <select class="serverLogsSource text_pole">
                        ${canViewServerLogs ? `<option value="server">${t`Server`}</option>` : ''}
                        <option value="frontend">${t`Frontend`}</option>
                    </select>
                </label>
                <label class="checkbox_label accountLogsFieldLabel logFilterLabel">
                    <span>${t`Start time`}</span>
                    <input type="datetime-local" class="serverLogsStartTime text_pole" step="60">
                </label>
                <label class="checkbox_label accountLogsFieldLabel logFilterLabel">
                    <span>${t`End time`}</span>
                    <input type="datetime-local" class="serverLogsEndTime text_pole" step="60">
                </label>
                <label class="checkbox_label accountLogsFieldLabel logFilterLabel">
                    <span>${t`Max entries`}</span>
                    <input type="number" class="serverLogsLimit text_pole" min="1" max="${MAX_LOG_VIEW_LIMIT}" step="50" value="${DEFAULT_LOG_VIEW_LIMIT}">
                </label>
            </div>
            <div class="accountLogsActionRow flex-container flexGap10 marginBot10">
                <div class="serverLogsRefreshButton menu_button menu_button_icon">
                    <i class="fa-fw fa-solid fa-rotate"></i>
                    <span>${t`Refresh`}</span>
                </div>
                <div class="serverLogsCopyButton menu_button menu_button_icon">
                    <i class="fa-fw fa-solid fa-copy"></i>
                    <span>${t`Copy`}</span>
                </div>
                <div class="serverLogsClearButton menu_button menu_button_icon">
                    <i class="fa-fw fa-solid fa-trash"></i>
                    <span>${t`Clear`}</span>
                </div>
                <label class="checkbox_label accountLogsFieldLabel">
                    <input type="checkbox" class="serverLogsAutoRefresh" checked>
                    <span>${t`Auto refresh`}</span>
                </label>
            </div>
            <div class="accountLogsActionRow flex-container flexGap10 marginBot10">
                <label class="checkbox_label accountLogsFieldLabel logFilterLabel wide100p">
                    <span>${t`Search`}</span>
                    <input type="search" class="serverLogsSearch text_pole" placeholder="${t`Search loaded logs`}">
                </label>
            </div>
            <textarea class="text_pole serverLogsOutput" rows="20" readonly></textarea>
            <div class="menu_button_note serverLogsNote"></div>
            <div class="menu_button_note serverLogsStatus"></div>
        </div>
    `);

    const output = template.find('.serverLogsOutput');
    const autoRefresh = template.find('.serverLogsAutoRefresh');
    const sourceSelect = template.find('.serverLogsSource');
    const startTimeInput = template.find('.serverLogsStartTime');
    const endTimeInput = template.find('.serverLogsEndTime');
    const limitInput = template.find('.serverLogsLimit');
    const searchInput = template.find('.serverLogsSearch');
    const noteElement = template.find('.serverLogsNote');
    const statusElement = template.find('.serverLogsStatus');
    let latestServerId = 0;
    let latestFrontendId = 0;
    let renderedServerEntries = [];
    let renderedFrontendEntries = [];
    let currentSearchTerm = '';
    let closed = false;
    let inFlight = false;
    let reloadQueued = false;
    let currentSource = canViewServerLogs ? 'server' : 'frontend';
    sourceSelect.val(currentSource);

    const updateNote = () => {
        if (currentSource === 'server') {
            noteElement.text(t`This viewer shows runtime backend logs captured in memory.`);
            return;
        }

        noteElement.text(isFrontendConsoleDebugLoggingEnabled()
            ? t`This viewer shows frontend console logs captured in this app session.`
            : t`Verbose frontend debug logs are off. Only frontend errors are captured until you enable them in User Settings.`);
    };

    const isBackendSearchActive = () => currentSource === 'server' && currentSearchTerm.length > 0;

    const updateSearchPlaceholder = () => {
        const placeholder = currentSource === 'server' ? t`Search server logs` : t`Search loaded logs`;
        searchInput.attr('placeholder', placeholder);
    };

    const updateStatus = (summary = null) => {
        if (!summary) {
            statusElement.text(t`Showing the newest complete log entries that fit within a ${MAX_LOG_VIEW_CHARS.toLocaleString()} character display budget.`);
            return;
        }

        if (summary.totalEntries === 0) {
            statusElement.text(t`No logs matched the current filters.`);
            return;
        }

        if (summary.searchTerm && summary.matchedEntries === 0) {
            statusElement.text(isBackendSearchActive() ? t`No logs matched the current search.` : t`No loaded logs matched the current search.`);
            return;
        }

        if (summary.visibleEntries === 0) {
            statusElement.text(t`Matching logs exceeded the ${MAX_LOG_VIEW_CHARS.toLocaleString()} character display budget. Narrow the filters to inspect them safely.`);
            return;
        }

        const matchingEntries = summary.searchTerm ? summary.matchedEntries : summary.totalEntries;

        if (summary.hiddenEntries > 0) {
            statusElement.text(summary.searchTerm
                ? (isBackendSearchActive()
                    ? t`Showing ${summary.visibleEntries} of ${matchingEntries} matching entries within the ${MAX_LOG_VIEW_CHARS.toLocaleString()} character display budget. ${summary.hiddenEntries} additional matching entries are hidden.`
                    : t`Showing ${summary.visibleEntries} of ${matchingEntries} matching loaded entries within the ${MAX_LOG_VIEW_CHARS.toLocaleString()} character display budget. ${summary.hiddenEntries} additional matching entries are hidden.`)
                : t`Showing ${summary.visibleEntries} complete entries within the ${MAX_LOG_VIEW_CHARS.toLocaleString()} character display budget. ${summary.hiddenEntries} additional entries are hidden.`);
            return;
        }

        statusElement.text(summary.searchTerm
            ? (isBackendSearchActive()
                ? t`Showing ${summary.visibleEntries} matching entries within the ${MAX_LOG_VIEW_CHARS.toLocaleString()} character display budget.`
                : t`Showing ${summary.visibleEntries} matching loaded entries within the ${MAX_LOG_VIEW_CHARS.toLocaleString()} character display budget.`)
            : t`Showing ${summary.visibleEntries} complete entries within the ${MAX_LOG_VIEW_CHARS.toLocaleString()} character display budget.`);
    };

    const renderOutput = (entries, formatter) => {
        const summary = buildLogOutputWithinCharBudget(entries, formatter, { searchTerm: currentSource === 'frontend' ? currentSearchTerm : '' });
        summary.searchTerm = currentSearchTerm;
        output.val(summary.text);
        output.scrollTop(summary.visibleEntries > 0 ? (output[0]?.scrollHeight || 0) : 0);
        updateStatus(summary);
    };

    const renderCurrentSourceLogs = () => {
        if (currentSource === 'server') {
            renderOutput(renderedServerEntries, formatServerLogEntry);
            return;
        }

        renderOutput(renderedFrontendEntries, formatFrontendLogEntry);
    };

    const readLogQuery = ({ sinceId = 0, silent = false } = {}) => {
        const startTime = parseLogTimeInputValue(startTimeInput.val());
        const endTime = parseLogTimeInputValue(endTimeInput.val(), { roundUpMinute: true });
        if (startTime !== null && endTime !== null && startTime > endTime) {
            if (!silent) {
                toastr.warning(t`Start time must be earlier than end time.`, t`Invalid log filter`);
            }
            return null;
        }

        return normalizeLogQueryOptions({
            limit: limitInput.val(),
            sinceId,
            startTime,
            endTime,
            searchTerm: currentSource === 'server' ? currentSearchTerm : '',
        });
    };

    const renderServerLogs = (payload, appendOnly = false, maxEntries = DEFAULT_LOG_VIEW_LIMIT) => {
        const incomingEntries = Array.isArray(payload?.entries) ? payload.entries : [];
        renderedServerEntries = appendOnly
            ? [...renderedServerEntries, ...incomingEntries].slice(-maxEntries)
            : incomingEntries.slice(-maxEntries);
        latestServerId = Number(payload?.latestId) || latestServerId;
        if (currentSource === 'server') {
            renderCurrentSourceLogs();
        }
    };

    const renderFrontendLogs = (payload, appendOnly = false, maxEntries = DEFAULT_LOG_VIEW_LIMIT) => {
        const incomingEntries = Array.isArray(payload?.entries) ? payload.entries : [];
        renderedFrontendEntries = appendOnly
            ? [...renderedFrontendEntries, ...incomingEntries].slice(-maxEntries)
            : incomingEntries.slice(-maxEntries);
        latestFrontendId = Number(payload?.latestId) || latestFrontendId;
        if (currentSource === 'frontend') {
            renderCurrentSourceLogs();
        }
    };

    const reloadAll = async () => {
        if (closed) {
            return;
        }

        if (inFlight) {
            reloadQueued = true;
            return;
        }

        updateNote();
        const query = readLogQuery();
        if (!query) {
            return;
        }

        inFlight = true;
        try {
            if (currentSource === 'server') {
                const payload = await fetchServerLogs(query);
                renderServerLogs(payload, false, query.limit);
            } else {
                const payload = getFrontendLogsSnapshot(query);
                renderFrontendLogs(payload, false, query.limit);
            }
        } catch (error) {
            const title = currentSource === 'server' ? t`Failed to fetch server logs` : t`Failed to fetch frontend logs`;
            console.error('Failed to load logs:', error);
            toastr.error(String(error.message || error), title);
        } finally {
            inFlight = false;
            if (reloadQueued && !closed) {
                reloadQueued = false;
                void reloadAll();
            }
        }
    };

    const loadIncremental = async () => {
        if (inFlight || closed || !autoRefresh.is(':checked')) {
            return;
        }

        const latestId = currentSource === 'server' ? latestServerId : latestFrontendId;
        const query = readLogQuery({ sinceId: latestId, silent: true });
        if (!query) {
            return;
        }

        if (query.endTime !== null && query.endTime < Date.now()) {
            return;
        }

        inFlight = true;
        try {
            if (currentSource === 'server') {
                const payload = await fetchServerLogs(query);
                renderServerLogs(payload, true, query.limit);
            } else {
                const payload = getFrontendLogsSnapshot(query);
                renderFrontendLogs(payload, true, query.limit);
            }
        } catch {
            // Keep silent during background refresh to avoid toast spam.
        } finally {
            inFlight = false;
        }
    };

    sourceSelect.on('change', async function () {
        const nextSource = String($(this).val() || 'frontend');
        if (nextSource === 'server' && !canViewServerLogs) {
            currentSource = 'frontend';
            sourceSelect.val('frontend');
            toastr.error(t`Only admins can view server logs.`, t`Permission denied`);
            return;
        }

        currentSource = nextSource;
        updateNote();
        updateSearchPlaceholder();
        await reloadAll();
    });

    template.find('.serverLogsRefreshButton').on('click', reloadAll);
    startTimeInput.on('change', reloadAll);
    endTimeInput.on('change', reloadAll);
    limitInput.on('change', function () {
        $(this).val(readLogQuery({ silent: true })?.limit || DEFAULT_LOG_VIEW_LIMIT);
        reloadAll();
    });
    searchInput.on('input', debounce((event) => {
        currentSearchTerm = String(event?.target?.value || '').trim();
        if (currentSource === 'server') {
            void reloadAll();
            return;
        }

        renderCurrentSourceLogs();
    }, 120));
    template.find('.serverLogsCopyButton').on('click', async () => {
        try {
            await navigator.clipboard.writeText(String(output.val() || ''));
            const title = currentSource === 'server' ? t`Server Logs` : t`Frontend Logs`;
            toastr.success(t`Logs copied to clipboard.`, title);
        } catch (error) {
            console.error('Copy logs failed:', error);
            const title = currentSource === 'server' ? t`Server Logs` : t`Frontend Logs`;
            toastr.error(t`Copy failed.`, title);
        }
    });
    template.find('.serverLogsClearButton').on('click', async () => {
        const confirmText = currentSource === 'server'
            ? t`Clear all captured server logs?`
            : t`Clear all captured frontend logs?`;
        const confirmed = await callGenericPopup(confirmText, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Clear`,
            cancelButton: t`Cancel`,
            wide: false,
            large: false,
        });

        if (confirmed !== POPUP_RESULT.AFFIRMATIVE) {
            return;
        }

        try {
            if (currentSource === 'server') {
                await clearServerLogsRemote();
                latestServerId = 0;
                renderedServerEntries = [];
                toastr.success(t`Server logs cleared.`, t`Server Logs`);
            } else {
                clearFrontendLogs();
                latestFrontendId = 0;
                renderedFrontendEntries = [];
                toastr.success(t`Frontend logs cleared.`, t`Frontend Logs`);
            }
            renderCurrentSourceLogs();
        } catch (error) {
            console.error('Clear logs failed:', error);
            const title = currentSource === 'server' ? t`Failed to clear server logs` : t`Failed to clear frontend logs`;
            toastr.error(String(error.message || error), title);
        }
    });

    updateNote();
    updateSearchPlaceholder();
    updateStatus();
    output.val(t`Loading logs...`);
    const timer = setInterval(loadIncremental, 1500);
    const popupPromise = callGenericPopup(template, POPUP_TYPE.TEXT, '', {
        okButton: t`Close`,
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        allowHorizontalScrolling: false,
    });

    setTimeout(() => {
        if (!closed) {
            void reloadAll();
        }
    }, 0);

    try {
        await popupPromise;
    } finally {
        closed = true;
        clearInterval(timer);
    }
}

/**
 * Shows a popup to change a user's password.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
async function changePassword(handle, callback) {
    try {
        const template = $(await renderTemplateAsync('changePassword'));
        template.find('.currentPasswordBlock').toggle(!isAdmin());
        let newPassword = '';
        let confirmPassword = '';
        let oldPassword = '';
        template.find('input[name="current"]').on('input', function () {
            oldPassword = String($(this).val());
        });
        template.find('input[name="password"]').on('input', function () {
            newPassword = String($(this).val());
        });
        template.find('input[name="confirm"]').on('input', function () {
            confirmPassword = String($(this).val());
        });
        const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { okButton: 'Change', cancelButton: 'Cancel', wide: false, large: false });
        if (result === POPUP_RESULT.CANCELLED || result === POPUP_RESULT.NEGATIVE) {
            throw new Error('Change password cancelled');
        }

        if (newPassword !== confirmPassword) {
            toastr.error('Passwords do not match', 'Failed to change password');
            throw new Error('Passwords do not match');
        }

        const response = await fetch('/api/users/change-password', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, newPassword, oldPassword }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to change password');
            throw new Error('Failed to change password');
        }

        toastr.success('Password changed successfully', 'Password Changed');
        callback();
    } catch (error) {
        console.error('Error changing password:', error);
    }
}


/**
 * Reset a user's settings.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
async function resetSettings(handle, callback) {
    try {
        let password = '';
        const template = $(await renderTemplateAsync('resetSettings'));
        template.find('input[name="password"]').on('input', function () {
            password = String($(this).val());
        });
        const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { okButton: 'Reset', cancelButton: 'Cancel', wide: false, large: false });

        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            throw new Error('Reset settings cancelled');
        }

        const response = await fetch('/api/users/reset-settings', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, password }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to reset settings');
            throw new Error('Failed to reset settings');
        }

        toastr.success('Settings reset successfully', 'Settings Reset');
        callback();
    } catch (error) {
        console.error('Error resetting settings:', error);
    }
}

/**
 * Change a user's display name.
 * @param {string} handle User handle
 * @param {string} name Current name
 * @param {function} callback Success callback
 */
async function changeName(handle, name, callback) {
    try {
        const template = $(await renderTemplateAsync('changeName'));
        const result = await callGenericPopup(template, POPUP_TYPE.INPUT, name, { okButton: 'Change', cancelButton: 'Cancel', wide: false, large: false });

        if (!result) {
            throw new Error('Change name cancelled');
        }

        name = String(result);

        const response = await fetch('/api/users/change-name', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, name }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to change name');
            throw new Error('Failed to change name');
        }

        toastr.success('Name changed successfully', 'Name Changed');
        callback();
    } catch (error) {
        console.error('Error changing name:', error);
    }
}

/**
 * Restore a settings snapshot.
 * @param {string} name Snapshot name
 * @param {function} callback Success callback
 */
async function restoreSnapshot(name, callback) {
    try {
        const confirm = await callGenericPopup(
            `Are you sure you want to restore the settings from "${name}"?`,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Restore', cancelButton: 'Cancel', wide: false, large: false },
        );

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            throw new Error('Restore snapshot cancelled');
        }

        const response = await fetch('/api/settings/restore-snapshot', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to restore snapshot');
            throw new Error('Failed to restore snapshot');
        }

        callback();
    } catch (error) {
        console.error('Error restoring snapshot:', error);
    }
}

/**
 * Load the content of a settings snapshot.
 * @param {string} name Snapshot name
 * @returns {Promise<string>} Snapshot content
 */
async function loadSnapshotContent(name) {
    try {
        const response = await fetch('/api/settings/load-snapshot', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to load snapshot content');
            throw new Error('Failed to load snapshot content');
        }

        return response.text();
    } catch (error) {
        console.error('Error loading snapshot content:', error);
    }
}

/**
 * Gets a list of settings snapshots.
 * @returns {Promise<Snapshot[]>} List of snapshots
 * @typedef {Object} Snapshot
 * @property {string} name Snapshot name
 * @property {number} date Date in milliseconds
 * @property {number} size File size in bytes
 */
async function getSnapshots() {
    try {
        const response = await fetch('/api/settings/get-snapshots', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to get settings snapshots');
            throw new Error('Failed to get settings snapshots');
        }

        const snapshots = await response.json();
        return snapshots;
    } catch (error) {
        console.error('Error getting settings snapshots:', error);
        return [];
    }
}

/**
 * Make a snapshot of the current settings.
 * @param {function} callback Success callback
 * @returns {Promise<void>}
 */
async function makeSnapshot(callback) {
    try {
        const response = await fetch('/api/settings/make-snapshot', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to make snapshot');
            throw new Error('Failed to make snapshot');
        }

        toastr.success('Snapshot created successfully', 'Snapshot Created');
        callback();
    } catch (error) {
        console.error('Error making snapshot:', error);
    }
}

/**
 * Open the settings snapshots view.
 */
async function viewSettingsSnapshots() {
    const template = $(await renderTemplateAsync('snapshotsView'));
    async function renderSnapshots() {
        const snapshots = await getSnapshots();
        template.find('.snapshotList').empty();

        for (const snapshot of snapshots.sort((a, b) => b.date - a.date)) {
            const snapshotBlock = template.find('.snapshotTemplate .snapshot').clone();
            snapshotBlock.find('.snapshotName').text(snapshot.name);
            snapshotBlock.find('.snapshotDate').text(new Date(snapshot.date).toLocaleString());
            snapshotBlock.find('.snapshotSize').text(humanFileSize(snapshot.size));
            snapshotBlock.find('.snapshotRestoreButton').on('click', async (e) => {
                e.stopPropagation();
                restoreSnapshot(snapshot.name, () => location.reload());
            });
            snapshotBlock.find('.inline-drawer-toggle').on('click', async () => {
                const contentBlock = snapshotBlock.find('.snapshotContent');
                if (!contentBlock.val()) {
                    const content = await loadSnapshotContent(snapshot.name);
                    contentBlock.val(content);
                }
            });
            template.find('.snapshotList').append(snapshotBlock);
        }
    }

    callGenericPopup(template, POPUP_TYPE.TEXT, '', { okButton: 'Close', wide: false, large: false, allowVerticalScrolling: true });
    template.find('.makeSnapshotButton').on('click', () => makeSnapshot(renderSnapshots));
    renderSnapshots();
}

/**
 * Reset everything to default.
 * @param {function} callback Success callback
 */
async function resetEverything(callback) {
    try {
        const step1Response = await fetch('/api/users/reset-step1', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!step1Response.ok) {
            const data = await step1Response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to reset');
            throw new Error('Failed to reset everything');
        }

        let password = '';
        let code = '';

        const template = $(await renderTemplateAsync('userReset'));
        template.find('input[name="password"]').on('input', function () {
            password = String($(this).val());
        });
        template.find('input[name="code"]').on('input', function () {
            code = String($(this).val());
        });
        const confirm = await callGenericPopup(
            template,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Reset', cancelButton: 'Cancel', wide: false, large: false },
        );

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            throw new Error('Reset everything cancelled');
        }

        const step2Response = await fetch('/api/users/reset-step2', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ password, code }),
        });

        if (!step2Response.ok) {
            const data = await step2Response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to reset');
            throw new Error('Failed to reset everything');
        }

        toastr.success('Everything reset successfully', 'Reset Everything');
        callback();
    } catch (error) {
        console.error('Error resetting everything:', error);
    }
}

async function openUserProfile() {
    await getCurrentUser();
    const template = $(await renderTemplateAsync('userProfile'));
    template.find('.userName').text(currentUser.name);
    template.find('.userHandle').text(currentUser.handle);
    template.find('.avatar img').attr('src', currentUser.avatar);
    template.find('.userRole').text(currentUser.admin ? 'Admin' : 'User');
    template.find('.userCreated').text(new Date(currentUser.created).toLocaleString());
    template.find('.hasPassword').toggle(currentUser.password);
    template.find('.noPassword').toggle(!currentUser.password);
    template.find('.userSettingsSnapshotsButton').on('click', () => viewSettingsSnapshots());
    template.find('.userBackupSyncButton').on('click', () => openBackupSyncCenter({
        handle: currentUser.handle,
        canManageGlobalExtensions: isAdmin(),
        openSettingsSnapshots: viewSettingsSnapshots,
        onRestored: () => location.reload(),
    }));
    template.find('.userStorageManagementButton').on('click', () => openStorageManagement());
    template.find('.userChangeNameButton').on('click', async () => changeName(currentUser.handle, currentUser.name, async () => {
        await getCurrentUser();
        template.find('.userName').text(currentUser.name);
    }));
    template.find('.userChangePasswordButton').on('click', () => changePassword(currentUser.handle, async () => {
        await getCurrentUser();
        template.find('.hasPassword').toggle(currentUser.password);
        template.find('.noPassword').toggle(!currentUser.password);
    }));
    template.find('.userResetSettingsButton').on('click', () => resetSettings(currentUser.handle, () => location.reload()));
    template.find('.userResetAllButton').on('click', () => resetEverything(() => location.reload()));
    template.find('.userAvatarChange').on('click', () => template.find('.avatarUpload').trigger('click'));
    template.find('.avatarUpload').on('change', async function () {
        if (!(this instanceof HTMLInputElement)) {
            return;
        }

        const file = this.files[0];
        if (!file) {
            return;
        }

        await cropAndUploadAvatar(currentUser.handle, file);
        await getCurrentUser();
        template.find('.avatar img').attr('src', currentUser.avatar);
    });
    template.find('.userAvatarRemove').on('click', async function () {
        await changeAvatar(currentUser.handle, '');
        await getCurrentUser();
        template.find('.avatar img').attr('src', currentUser.avatar);
    });

    if (!accountsEnabled) {
        template.find('[data-require-accounts]').hide();
        template.find('.accountsDisabledHint').show();
    }

    const popupOptions = {
        okButton: 'Close',
        wide: false,
        large: false,
        allowVerticalScrolling: true,
        allowHorizontalScrolling: false,
    };
    callGenericPopup(template, POPUP_TYPE.TEXT, '', popupOptions);
}

/**
 * Crop and upload an avatar image.
 * @param {string} handle User handle
 * @param {File} file Avatar file
 * @returns {Promise<string>}
 */
async function cropAndUploadAvatar(handle, file) {
    const dataUrl = await getBase64Async(await ensureImageFormatSupported(file));
    const croppedImage = await callGenericPopup('Set the crop position of the avatar image', POPUP_TYPE.CROP, '', { cropAspect: 1, cropImage: dataUrl });
    if (!croppedImage) {
        return;
    }

    await changeAvatar(handle, String(croppedImage));

    return String(croppedImage);
}

/**
 * Change the avatar of the user.
 * @param {string} handle User handle
 * @param {string} avatar File to upload or base64 string
 * @returns {Promise<void>} Avatar URL
 */
async function changeAvatar(handle, avatar) {
    try {
        const response = await fetch('/api/users/change-avatar', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar, handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to change avatar');
            return;
        }
    } catch (error) {
        console.error('Error changing avatar:', error);
    }
}

/**
 * Log out the current user.
 * @returns {Promise<void>}
 */
async function logout() {
    await fetch('/api/users/logout', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
    });

    // On an explicit logout stop auto login
    // to allow user to change username even
    // when auto auth (such as authelia or basic)
    // would be valid
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('noauto', 'true');

    window.location.search = urlParams.toString();
}


/**
 * Pings the server to extend the user session.
 */
async function extendUserSession() {
    try {
        const response = await fetch('/api/ping?extend=1', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });

        if (!response.ok) {
            throw new Error('Ping did not succeed', { cause: response.status });
        }
    } catch (error) {
        console.error('Failed to extend user session', error);
    }
}

jQuery(() => {
    $('#logout_button').on('click', () => {
        logout();
    });
    $('#account_button').on('click', () => {
        openUserProfile();
    });
    $('#server_logs_button').on('click', () => {
        openLogsViewer();
    });
    setInterval(async () => {
        if (currentUser) {
            await extendUserSession();
        }
    }, SESSION_EXTEND_INTERVAL);
});

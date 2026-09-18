import { getRequestHeaders, uploadWithProgress } from '../script.js';
import {
    clearFrontendLogs,
    getFrontendLogsSnapshot,
    installFrontendLogCapture,
    isFrontendConsoleDebugLoggingEnabled,
} from './frontend-log-manager.js';
import { t } from './i18n.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from './popup.js';
import { canViewSecrets } from './secrets.js';
import { renderTemplateAsync } from './templates.js';
import { copyText, debounce, ensureImageFormatSupported, getBase64Async, humanFileSize } from './utils.js';
import { downloadFromServer } from './atria-download.js';
import { openLanSyncPanel } from './lan-sync.js';
import { openStorageInspector } from './storage-inspector.js';
import { openBrowserStorageInspector } from './browser-storage-inspector.js';

/**
 * @type {import('../../src/users.js').UserViewModel} Logged in user
 */
export let currentUser = null;
export let accountsEnabled = false;

// Extend the session every 10 minutes
const SESSION_EXTEND_INTERVAL = 10 * 60 * 1000;
const BACKUP_CATEGORY_KEYS = Object.freeze([
    'settings',
    'secrets',
    'characters',
    'chats',
    'lorebooks',
    'presets',
    'assets',
    'extensions',
    'globalExtensions',
    'vectors',
]);
const BACKUP_DEFAULT_SELECTION = Object.freeze({
    settings: true,
    secrets: true,
    characters: true,
    chats: true,
    lorebooks: true,
    presets: true,
    assets: true,
    extensions: true,
    globalExtensions: false,
    vectors: false,
});
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
 * Get the current user.
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

function clientBackupTimestamp() {
    const d = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

/**
 * Backup a user's data.
 * @param {string} handle Handle of the user to backup
 * @param {function} callback Success callback
 * @param {Record<string, boolean>} [selection] Backup category selection
 * @returns {Promise<void>}
 */
async function backupUserData(handle, callback, selection = BACKUP_DEFAULT_SELECTION) {
    let progressToast;
    const clearProgressToast = () => {
        if (!progressToast) {
            return;
        }

        toastr.clear(progressToast);
        progressToast = null;
    };

    try {
        progressToast = toastr.info(
            t`Please wait for the download to start.`,
            t`Backup Requested`,
            { timeOut: 0, extendedTimeOut: 0, closeButton: false, tapToDismiss: false },
        );

        const includesSecrets = await canViewSecrets();
        if (includesSecrets === false) {
            toastr.warning('The backup will not include secrets due to a server configuration.', 'Secrets Not Included');
        }

        const fileName = `${handle}-${clientBackupTimestamp()}.zip`;
        await downloadFromServer({
            url: '/api/users/backup',
            fileName,
            mimeType: 'application/zip',
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, selection }),
        });
        callback?.();
    } catch (error) {
        console.error('Error backing up user data:', error);
        const message = error?.serverMessage || (error instanceof Error ? error.message : '') || t`Unknown error`;
        toastr.error(message, t`Failed to backup user data`);
    } finally {
        clearProgressToast();
    }
}

function collectBackupSelection(rootElement, categoryKeys = BACKUP_CATEGORY_KEYS) {
    const selection = { ...BACKUP_DEFAULT_SELECTION };

    categoryKeys.forEach((key) => {
        const checkbox = rootElement.find(`input[name="backupCategory"][value="${key}"]`);
        if (checkbox.length > 0) {
            selection[key] = checkbox.is(':checked');
        }
    });

    return selection;
}

function getSelectedRestoreMode(rootElement) {
    const selected = rootElement.find('input[name="backupRestoreMode"]:checked').val();
    return String(selected || 'merge') === 'overwrite' ? 'overwrite' : 'merge';
}

function formatRestorePhaseMessage(event, archiveLabel) {
    if (!event || typeof event !== 'object') {
        return '';
    }
    const total = Number.isFinite(event.total) ? Number(event.total) : 0;
    const current = Number.isFinite(event.current) ? Math.min(Number(event.current), total || Number.MAX_SAFE_INTEGER) : 0;
    const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    switch (event.phase) {
        case 'download':
            return t`Downloading ${archiveLabel}...`;
        case 'analyze':
            return total > 0
                ? t`Analyzing ${archiveLabel}: ${current} / ${total} entries (${pct}%)`
                : t`Analyzing ${archiveLabel}...`;
        case 'snapshot':
            return total > 0
                ? t`Snapshotting existing data: ${current} / ${total} (${pct}%)`
                : t`Snapshotting existing data...`;
        case 'extract':
            return total > 0
                ? t`Restoring files: ${current} / ${total} (${pct}%)`
                : t`Restoring files...`;
        case 'convert': {
            const stage = String(event.stage || '');
            const counts = event.counts;
            const numbers = counts
                ? ` (settings:${counts.settings ?? 0}, presets:${counts.presets ?? 0}, worlds:${counts.worlds ?? 0}, chats:${counts.chats ?? 0})`
                : '';
            return t`Converting backup: ${stage}${numbers}`;
        }
        case 'finalize':
            return t`Finalizing restore...`;
        default:
            return '';
    }
}

async function restoreUserData(handle, file, selection, mode, callback, { onProgress = null, onPhaseProgress = null, scratchCreds = null } = {}) {
    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('handle', handle);
    formData.append('mode', mode);
    formData.append('selection', JSON.stringify(selection));
    if (scratchCreds?.mysqlUrl) formData.append('scratchMysqlUrl', scratchCreds.mysqlUrl);
    if (scratchCreds?.postgresUrl) formData.append('scratchPostgresUrl', scratchCreds.postgresUrl);
    if (scratchCreds?.mysqlPoolSize != null) formData.append('scratchMysqlPoolSize', String(scratchCreds.mysqlPoolSize));
    if (scratchCreds?.postgresPoolSize != null) formData.append('scratchPostgresPoolSize', String(scratchCreds.postgresPoolSize));

    const stream = createRestoreProgressStream(onPhaseProgress);
    const response = await uploadWithProgress('/api/users/restore-backup', formData, {
        onProgress,
        onResponseChunk: stream.onChunk,
        headers: { ...getRequestHeaders({ omitContentType: true }), 'Accept': 'application/x-ndjson, application/json' },
    });
    stream.finish(response.text);

    if (stream.streamed) {
        if (stream.error) {
            const err = new Error(stream.error);
            // NDJSON stream cannot carry the structured crossModeScratchRequired payload, so a
            // creds-missing error in streaming mode surfaces as a plain message. Callers wanting
            // the structured prompt rely on the non-streaming path (or the probe endpoint).
            throw err;
        }
        if (!stream.result) {
            throw new Error('Restore stream ended without a result.');
        }
        callback?.(stream.result);
        return stream.result;
    }

    const data = response.json();
    if (!response.ok) {
        const err = new Error(data?.error || 'Failed to restore backup');
        // Forward the structured cross-mode payloads on the error so the UI
        // can drive the scratch-creds prompt without parsing the message.
        if (data?.crossModeScratchRequired) err.crossModeScratchRequired = data.crossModeScratchRequired;
        if (data?.crossModeScratchConnection) err.crossModeScratchConnection = data.crossModeScratchConnection;
        if (data?.crossModeFailure) err.crossModeFailure = data.crossModeFailure;
        throw err;
    }

    callback?.(data);
    return data;
}

/**
 * Peek at a backup ZIP to find out whether the current server can restore it
 * directly (same-mode) or needs the cross-mode conversion pipeline — and, if
 * the source engine is mysql/postgres, whether the UI must prompt the user
 * for a scratch DB connection string before submitting.
 *
 * Returns `{ engineKind, schemaVersion, sourceHandle, crossModeRequired,
 * scratchCredsNeeded }` from POST /api/users/restore-backup/probe.
 */
async function probeBackupArchive(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await fetch('/api/users/restore-backup/probe', {
        method: 'POST',
        headers: { ...getRequestHeaders({ omitContentType: true }) },
        body: formData,
    });
    if (!response.ok) {
        const txt = await response.text().catch(() => '');
        throw new Error(`Probe failed (${response.status}): ${txt}`);
    }
    return await response.json();
}

/**
 * Reveal the cross-mode scratch creds block in the Backup Manager template
 * and wait for the user to either fill it in (+ click "Use Connection") or
 * cancel. Returns `{ ok: false }` on cancel or `{ ok: true, creds }` on
 * confirm. The block is hidden on resolution.
 */
async function revealCrossModeScratchPrompt(template, kind, { focus = true } = {}) {
    const credsBlock = template.find('.crossModeScratchCreds');
    credsBlock.attr('hidden', null);
    credsBlock.removeAttr('hidden');
    template.find('.crossModeScratchFields').attr('hidden', '').addClass('displayNone');
    const activeFields = template.find(`.crossModeScratchFields[data-scratch-kind="${kind}"]`);
    activeFields.attr('hidden', null);
    activeFields.removeAttr('hidden');
    activeFields.removeClass('displayNone');
    const input = activeFields.find('input').first();
    if (focus) input.trigger('focus');
    const labelText = kind === 'mysql'
        ? t`Scratch MySQL connection URL`
        : t`Scratch PostgreSQL connection URL`;
    const promptHtml = `<div>
            <p>${t`The backup is from a ${kind} engine. Provide a scratch ${labelText.toLowerCase()} so the conversion can ingest the backup before applying it to your current data.`}</p>
            <p><small>${t`A temporary handle is created on the scratch database and removed when the restore completes.`}</small></p>
        </div>`;
    const result = await callGenericPopup(promptHtml, POPUP_TYPE.CONFIRM, '', {
        okButton: t`Use Connection`,
        cancelButton: t`Cancel`,
        wide: false,
        large: false,
    });
    if (result !== POPUP_RESULT.AFFIRMATIVE) {
        hideCrossModeScratchPrompt(template);
        return { ok: false };
    }
    const url = String(input.val() || '').trim();
    if (!url) {
        hideCrossModeScratchPrompt(template);
        toastr.warning(t`No connection URL entered; cancel and retry.`, t`Cross-Mode Restore`);
        return { ok: false };
    }
    const creds = kind === 'mysql' ? { mysqlUrl: url } : { postgresUrl: url };
    return { ok: true, creds };
}

function hideCrossModeScratchPrompt(template) {
    const credsBlock = template.find('.crossModeScratchCreds');
    credsBlock.attr('hidden', '').addClass('displayNone');
    template.find('.crossModeScratchFields').attr('hidden', '').addClass('displayNone');
}

/**
 * @param {((event: any) => void)|null} onPhaseProgress
 */
function createRestoreProgressStream(onPhaseProgress) {
    let buffer = '';
    const state = { streamed: false, result: null, error: null };
    const dispatch = typeof onPhaseProgress === 'function' ? onPhaseProgress : null;
    const consumeLine = (raw) => {
        const line = raw.trim();
        if (!line || line[0] !== '{') {
            return;
        }
        let payload;
        try {
            payload = JSON.parse(line);
        } catch {
            return;
        }
        state.streamed = true;
        if (payload.type === 'progress' && dispatch) {
            try { dispatch(payload); } catch { /* observer errors must not abort */ }
        } else if (payload.type === 'result') {
            const { type, ...rest } = payload;
            state.result = rest;
        } else if (payload.type === 'error') {
            state.error = String(payload.error || 'Restore failed');
        }
    };
    const drain = (text) => {
        if (typeof text !== 'string' || !text) {
            return;
        }
        buffer += text;
        let idx = buffer.indexOf('\n');
        while (idx !== -1) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            consumeLine(raw);
            idx = buffer.indexOf('\n');
        }
    };
    return {
        onChunk: drain,
        finish(finalText) {
            if (typeof finalText === 'string' && finalText.length > 0 && !state.streamed) {
                // Server did not stream — caller will parse the response as a single JSON document.
                return;
            }
            if (buffer) {
                consumeLine(buffer);
                buffer = '';
            }
        },
        get streamed() { return state.streamed; },
        get result() { return state.result; },
        get error() { return state.error; },
    };
}

async function createLanMigrationLink(handle, selection) {
    const response = await fetch('/api/users/lan-migration/offer', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ handle, selection }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create migration link');
    }

    return response.json();
}

function isLocalOnlyHostName(hostname) {
    const normalized = String(hostname || '').trim().toLowerCase();
    return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

async function getShareableLanMigrationLink(link) {
    try {
        const currentLink = new URL(String(link || ''));
        if (!isLocalOnlyHostName(currentLink.hostname)) {
            return currentLink.toString();
        }

        const input = await callGenericPopup(
            t`Enter a LAN host or IP for this device. You can include a port.`,
            POPUP_TYPE.INPUT,
            '',
            {
                okButton: t`Use Host`,
                cancelButton: t`Cancel`,
                rows: 1,
                wide: false,
                large: false,
            },
        );

        const value = String(input || '').trim();
        if (!value) {
            return currentLink.toString();
        }

        const sharedUrl = new URL(value.includes('://') ? value : `${currentLink.protocol}//${value}`);
        if (!sharedUrl.port && currentLink.port) {
            sharedUrl.port = currentLink.port;
        }
        sharedUrl.pathname = currentLink.pathname;
        sharedUrl.search = currentLink.search;
        sharedUrl.hash = currentLink.hash;
        return sharedUrl.toString();
    } catch {
        return String(link || '');
    }
}

async function importLanMigrationLink(handle, url, selection, mode, callback, { onPhaseProgress = null } = {}) {
    const response = await fetch('/api/users/lan-migration/import', {
        method: 'POST',
        headers: { ...getRequestHeaders(), 'Accept': 'application/x-ndjson, application/json' },
        body: JSON.stringify({
            handle,
            url,
            selection,
            mode,
        }),
    });

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/x-ndjson') && response.body) {
        const stream = createRestoreProgressStream(onPhaseProgress);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (; ;) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            stream.onChunk(decoder.decode(value, { stream: true }));
        }
        stream.onChunk(decoder.decode());
        stream.finish('');
        if (stream.error) {
            throw new Error(stream.error);
        }
        if (!stream.result) {
            throw new Error('LAN migration stream ended without a result.');
        }
        callback?.(stream.result);
        return stream.result;
    }

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to import migration link');
    }

    const data = await response.json();
    callback?.(data);
    return data;
}

function buildRestoreDiagnosticReport({ handle, file, mode, selection, result }) {
    return {
        timestamp: new Date().toISOString(),
        handle: String(handle || ''),
        mode: String(mode || 'merge'),
        file: {
            name: String(file?.name || ''),
            size: Number(file?.size || 0),
            type: String(file?.type || ''),
        },
        selection: selection || {},
        result: {
            restoredCount: Number(result?.restoredCount || 0),
            skippedCount: Number(result?.skippedCount || 0),
            rejectedCount: Number(result?.rejectedCount || 0),
            failedCount: Number(result?.failedCount || 0),
            preflight: result?.preflight || {},
        },
    };
}

function hasRestoreWarnings(result) {
    const skipped = Number(result?.skippedCount || 0);
    const rejected = Number(result?.rejectedCount || 0);
    const failed = Number(result?.failedCount || 0);
    const targetable = Number(result?.preflight?.targetableEntries || 0);
    return skipped > 0 || rejected > 0 || failed > 0 || targetable === 0;
}

function getRestoreCategoryRows(report) {
    const categoryStats = report?.result?.preflight?.categoryStats;
    if (!categoryStats || typeof categoryStats !== 'object') {
        return [];
    }

    return Object.entries(categoryStats).map(([category, stats]) => ({
        category,
        targetableEntries: Number(stats?.targetableEntries || 0),
        restoredEntries: Number(stats?.restoredEntries || 0),
        failedEntries: Number(stats?.failedEntries || 0),
    }));
}

async function showRestoreDiagnosticReport(report) {
    const content = $('<div class="flex-container flexFlowColumn flexNoGap"></div>');
    content.append(`<h4 class="marginBot10">${t`Restore Diagnostic Report`}</h4>`);

    const totals = report?.result || {};
    const preflight = totals.preflight || {};
    const summary = $(`
        <div class="menu_button_note justifyLeft marginBot10">
            <div><strong>${t`Restore Summary`}</strong></div>
            <div>${t`Restored entries`}: ${Number(totals.restoredCount || 0)}</div>
            <div>${t`Skipped entries`}: ${Number(totals.skippedCount || 0)}</div>
            <div>${t`Rejected entries`}: ${Number(totals.rejectedCount || 0)}</div>
            <div>${t`Failed writes`}: ${Number(totals.failedCount || 0)}</div>
            <div>${t`Preflight total files`}: ${Number(preflight.fileEntries || 0)} / ${t`targetable`}: ${Number(preflight.targetableEntries || 0)}</div>
        </div>
    `);
    content.append(summary);

    const rows = getRestoreCategoryRows(report);
    if (rows.length > 0) {
        const categoryBlock = $('<div class="menu_button_note justifyLeft marginBot10"></div>');
        categoryBlock.append(`<div><strong>${t`Restored by category`}</strong></div>`);
        const list = $('<ul class="justifyLeft marginTopBot5"></ul>');
        for (const row of rows) {
            list.append(`<li>${row.category}: ${t`restored`} ${row.restoredEntries} / ${t`targetable`} ${row.targetableEntries}${row.failedEntries > 0 ? ` (${t`failed`} ${row.failedEntries})` : ''}</li>`);
        }
        categoryBlock.append(list);
        content.append(categoryBlock);
    }

    const samples = Array.isArray(preflight.sampleSkippedEntries) ? preflight.sampleSkippedEntries : [];
    if (samples.length > 0) {
        const sampleText = samples.slice(0, 12).map(item => `${item.entry} -> ${item.reason}`).join('\n');
        content.append(`<div class="menu_button_note justifyLeft marginBot10"><strong>${t`Sample skipped entries`}</strong></div>`);
        content.append(`<textarea class="text_pole marginBot10" rows="8" readonly>${sampleText}</textarea>`);
    }

    const detailWrapper = $('<details class="marginBot5"></details>');
    detailWrapper.append(`<summary>${t`Raw JSON report`}</summary>`);
    const output = $('<textarea class="text_pole marginTopBot5" rows="16" readonly></textarea>');
    output.val(JSON.stringify(report, null, 2));
    detailWrapper.append(output);
    content.append(detailWrapper);

    await callGenericPopup(content, POPUP_TYPE.TEXT, '', {
        okButton: t`Close`,
        wide: true,
        large: false,
        allowVerticalScrolling: true,
        allowHorizontalScrolling: false,
    });
}

async function openBackupManager(handle, callback) {
    const template = $(await renderTemplateAsync('userBackupManager'));
    const canManageGlobalExtensions = isAdmin();
    const activeCategoryKeys = BACKUP_CATEGORY_KEYS.filter((key) => canManageGlobalExtensions || key !== 'globalExtensions');
    const fileInput = template.find('.backupRestoreFileInput');
    const selectedFileText = template.find('.backupSelectedFileName');
    const restoreButton = template.find('.backupRestoreButton');
    const restoreSelectButton = template.find('.backupRestoreSelectButton');
    const downloadButton = template.find('.backupDownloadButton');
    const checkboxes = template.find('input[name="backupCategory"]');
    const summaryText = template.find('.backupCategorySummary');
    const globalExtensionsItem = template.find('.backupCategoryGlobalExtensions');
    const lanSyncOpenButton = template.find('.backupLanSyncOpenButton');
    const lanCreateLinkButton = template.find('.backupLanCreateLinkButton');
    const lanCopyLinkButton = template.find('.backupLanCopyLinkButton');
    const lanGeneratedLink = template.find('.backupLanGeneratedLink');
    const lanImportLink = template.find('.backupLanImportLink');
    const lanImportButton = template.find('.backupLanImportButton');
    globalExtensionsItem.toggle(canManageGlobalExtensions);
    if (!canManageGlobalExtensions) {
        template.find('input[name="backupCategory"][value="globalExtensions"]').prop('checked', false);
    }

    const updateSelectionSummary = () => {
        const selectedCount = activeCategoryKeys.reduce((count, key) => {
            const checkbox = template.find(`input[name="backupCategory"][value="${key}"]`);
            return count + (checkbox.is(':checked') ? 1 : 0);
        }, 0);
        summaryText.text(t`Selected ${selectedCount} of ${activeCategoryKeys.length} categories`);
    };

    const setSelection = (selection) => {
        activeCategoryKeys.forEach((key) => {
            const checkbox = template.find(`input[name="backupCategory"][value="${key}"]`);
            checkbox.prop('checked', Boolean(selection[key]));
        });
        updateSelectionSummary();
    };

    const updateRestoreState = () => {
        const hasFile = Boolean(fileInput[0]?.files?.[0]);
        restoreButton.toggleClass('disabled', !hasFile);
    };

    const updateLanState = () => {
        const hasGeneratedLink = Boolean(String(lanGeneratedLink.val() || '').trim());
        const hasImportLink = Boolean(String(lanImportLink.val() || '').trim());
        lanCopyLinkButton.toggleClass('disabled', !hasGeneratedLink);
        lanImportButton.toggleClass('disabled', !hasImportLink);
    };

    const setActionBusy = (busy) => {
        [
            restoreButton,
            restoreSelectButton,
            downloadButton,
            lanCreateLinkButton,
            lanCopyLinkButton,
            lanImportButton,
        ].forEach((element) => element.toggleClass('disabled', Boolean(busy)));

        if (!busy) {
            updateRestoreState();
            updateLanState();
        }
    };

    const runRestore = async (file) => {
        if (!file) {
            return;
        }

        const selection = collectBackupSelection(template, activeCategoryKeys);
        if (!Object.values(selection).some(Boolean)) {
            toastr.warning(t`Select at least one data category.`, t`Nothing selected`);
            return;
        }

        const mode = getSelectedRestoreMode(template);
        const confirmationMessage = mode === 'overwrite'
            ? t`Overwrite mode will clear existing selected data before restore. Continue?`
            : t`Restore in merge mode and overwrite files on path conflicts?`;

        const confirm = await callGenericPopup(confirmationMessage, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Start Restore`,
            cancelButton: t`Cancel`,
            wide: false,
            large: false,
        });

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            return;
        }

        // Probe the ZIP first to detect whether cross-mode conversion is
        // needed and (if mysql/pg source) whether the user must supply a
        // scratch DB URL before the actual upload starts. The probe is a
        // separate POST that only reads the ZIP's _engine_meta.json — it
        // doesn't kick off the snapshot/extract pipeline.
        let scratchCreds = null;
        try {
            setActionBusy(true);
            const probe = await probeBackupArchive(file);
            if (probe?.crossModeRequired) {
                if (probe.scratchCredsNeeded) {
                    const reveal = await revealCrossModeScratchPrompt(template, probe.scratchCredsNeeded);
                    if (!reveal.ok) {
                        toastr.info(t`Restore cancelled — scratch DB connection not provided.`, t`Cross-Mode Restore`);
                        setActionBusy(false);
                        return;
                    }
                    scratchCreds = reveal.creds;
                } else {
                    // fs-source on db server — no creds needed; just notify.
                    toastr.info(t`Cross-mode restore: converting backup into current storage engine.`, t`Cross-Mode Restore`);
                }
            }
        } catch (err) {
            console.warn('Probe failed (continuing with direct restore):', err);
            // Probe failures are non-fatal — fall through to the real restore;
            // it'll surface a definitive error if the ZIP is truly invalid.
        } finally {
            setActionBusy(false);
        }

        let progressToast;
        const updateProgressMessage = (text) => {
            if (progressToast && typeof progressToast.find === 'function') {
                progressToast.find('.toast-message').text(text);
            }
        };
        const formatUploadingStatus = (loaded, total) => {
            const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
            return t`Uploading ${file.name}: ${pct}% (${humanFileSize(loaded, true, 1)} / ${humanFileSize(total, true, 1)})`;
        };
        const formatRestorePhase = (event) => formatRestorePhaseMessage(event, file.name);
        try {
            progressToast = toastr.info(
                formatUploadingStatus(0, file.size),
                t`Backup and Restore`,
                { timeOut: 0, extendedTimeOut: 0, closeButton: false, tapToDismiss: false },
            );
            setActionBusy(true);
            const result = await restoreUserData(handle, file, selection, mode, undefined, {
                onProgress: ({ loaded, total, done }) => {
                    if (done) {
                        updateProgressMessage(t`Processing ${file.name}...`);
                        return;
                    }
                    updateProgressMessage(formatUploadingStatus(loaded, total));
                },
                onPhaseProgress: (event) => {
                    const message = formatRestorePhase(event);
                    if (message) {
                        updateProgressMessage(message);
                    }
                },
                scratchCreds,
            });
            toastr.clear(progressToast);
            progressToast = null;
            const diagnosticReport = buildRestoreDiagnosticReport({ handle, file, mode, selection, result });
            console.info('BACKUP_RESTORE_REPORT', diagnosticReport);
            const crossNote = result?.crossMode
                ? t` (cross-mode ${result.crossMode.sourceKind} → ${result.crossMode.destKind})`
                : '';
            toastr.success(
                t`Restored ${result.restoredCount ?? 0} files. Skipped ${result.skippedCount ?? 0}, rejected ${result.rejectedCount ?? 0}.${crossNote}`,
                t`Backup Restored`,
            );
            if (hasRestoreWarnings(result)) {
                toastr.warning(t`Restore completed with warnings. Showing diagnostic report.`, t`Restore Warnings`);
                await showRestoreDiagnosticReport(diagnosticReport);
            }
            callback?.(result);
        } catch (error) {
            console.error('Error restoring user data:', error);
            // If the server told us we still need scratch creds (e.g. probe
            // race or operator skipped it), reveal the prompt so they can
            // retry from a clean state.
            if (error?.crossModeScratchRequired?.kind) {
                revealCrossModeScratchPrompt(template, error.crossModeScratchRequired.kind, { focus: true });
            }
            toastr.error(String(error.message || error), t`Failed to restore backup`);
        } finally {
            if (progressToast) {
                toastr.clear(progressToast);
            }
            fileInput.val('');
            selectedFileText.text(t`No ZIP selected.`);
            setActionBusy(false);
            hideCrossModeScratchPrompt(template);
        }
    };

    template.find('.backupSelectAllButton').on('click', function () {
        setSelection(Object.fromEntries(activeCategoryKeys.map((key) => [key, true])));
    });

    template.find('.backupSelectRecommendedButton').on('click', function () {
        setSelection(BACKUP_DEFAULT_SELECTION);
    });

    template.find('.backupSelectNoneButton').on('click', function () {
        setSelection(Object.fromEntries(activeCategoryKeys.map((key) => [key, false])));
    });

    checkboxes.on('change', updateSelectionSummary);
    updateSelectionSummary();

    downloadButton.on('click', async function () {
        if ($(this).hasClass('disabled')) {
            return;
        }

        const selection = collectBackupSelection(template, activeCategoryKeys);
        if (!Object.values(selection).some(Boolean)) {
            toastr.warning(t`Select at least one data category.`, t`Nothing selected`);
            return;
        }

        try {
            setActionBusy(true);
            await backupUserData(handle, () => { }, selection);
        } finally {
            setActionBusy(false);
        }
    });

    restoreSelectButton.on('click', function () {
        if ($(this).hasClass('disabled')) {
            return;
        }
        fileInput.trigger('click');
    });

    restoreButton.on('click', async function () {
        if ($(this).hasClass('disabled')) {
            return;
        }
        const file = fileInput[0]?.files?.[0];
        await runRestore(file);
    });

    fileInput.on('change', function () {
        const file = this instanceof HTMLInputElement ? this.files?.[0] : null;
        selectedFileText.text(file ? t`${file.name} (${humanFileSize(file.size)})` : t`No ZIP selected.`);
        updateRestoreState();
    });

    lanSyncOpenButton.on('click', async function () {
        if ($(this).hasClass('disabled')) {
            return;
        }
        try {
            await openLanSyncPanel();
        } catch (error) {
            console.error('Error opening LAN Sync panel:', error);
            toastr.error(String(error.message || error), t`Failed to open LAN Sync`);
        }
    });

    lanCreateLinkButton.on('click', async function () {
        if ($(this).hasClass('disabled')) {
            return;
        }

        const selection = collectBackupSelection(template, activeCategoryKeys);
        if (!Object.values(selection).some(Boolean)) {
            toastr.warning(t`Select at least one data category.`, t`Nothing selected`);
            return;
        }

        let progressToast;
        try {
            progressToast = toastr.info(
                t`Please wait...`,
                t`LAN Migration`,
                { timeOut: 0, extendedTimeOut: 0, closeButton: false, tapToDismiss: false },
            );
            setActionBusy(true);
            const result = await createLanMigrationLink(handle, selection);
            const link = await getShareableLanMigrationLink(String(result?.url || ''));
            lanGeneratedLink.val(link);
            updateLanState();

            if (link) {
                try {
                    await copyText(link);
                    toastr.success(t`Migration link copied to clipboard.`, t`LAN Migration`);
                } catch {
                    toastr.info(t`Migration link created. Copy it from the field below.`, t`LAN Migration`);
                }
            }
        } catch (error) {
            console.error('Error creating LAN migration link:', error);
            toastr.error(String(error.message || error), t`Failed to create migration link`);
        } finally {
            if (progressToast) {
                toastr.clear(progressToast);
            }
            setActionBusy(false);
        }
    });

    lanCopyLinkButton.on('click', async function () {
        if ($(this).hasClass('disabled')) {
            return;
        }

        const link = String(lanGeneratedLink.val() || '').trim();
        if (!link) {
            return;
        }

        try {
            await copyText(link);
            toastr.success(t`Migration link copied to clipboard.`, t`LAN Migration`);
        } catch (error) {
            console.error('Error copying LAN migration link:', error);
            toastr.error(String(error.message || error), t`Failed to copy link`);
        }
    });

    lanImportButton.on('click', async function () {
        if ($(this).hasClass('disabled')) {
            return;
        }

        const link = String(lanImportLink.val() || '').trim();
        if (!link) {
            toastr.warning(t`Paste a migration link first.`, t`Missing link`);
            return;
        }

        const selection = collectBackupSelection(template, activeCategoryKeys);
        if (!Object.values(selection).some(Boolean)) {
            toastr.warning(t`Select at least one data category.`, t`Nothing selected`);
            return;
        }

        const mode = getSelectedRestoreMode(template);
        const confirmationMessage = mode === 'overwrite'
            ? t`Overwrite mode will clear existing selected data before LAN migration. Continue?`
            : t`Import data from the migration link in incremental mode and overwrite files on path conflicts?`;

        const confirm = await callGenericPopup(confirmationMessage, POPUP_TYPE.CONFIRM, '', {
            okButton: t`Start Migration`,
            cancelButton: t`Cancel`,
            wide: false,
            large: false,
        });

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            return;
        }

        let progressToast;
        const updateLanProgressMessage = (text) => {
            if (progressToast && typeof progressToast.find === 'function') {
                progressToast.find('.toast-message').text(text);
            }
        };
        try {
            progressToast = toastr.info(
                t`Please wait...`,
                t`LAN Migration`,
                { timeOut: 0, extendedTimeOut: 0, closeButton: false, tapToDismiss: false },
            );
            setActionBusy(true);
            const result = await importLanMigrationLink(handle, link, selection, mode, undefined, {
                onPhaseProgress: (event) => {
                    const message = formatRestorePhaseMessage(event, t`migration archive`);
                    if (message) {
                        updateLanProgressMessage(message);
                    }
                },
            });
            toastr.clear(progressToast);
            progressToast = null;
            const diagnosticReport = buildRestoreDiagnosticReport({
                handle,
                file: { name: link, size: 0, type: 'lan-migration-link' },
                mode,
                selection,
                result,
            });
            console.info('LAN_MIGRATION_REPORT', diagnosticReport);
            toastr.success(
                t`Restored ${result.restoredCount} files. Skipped ${result.skippedCount}, rejected ${result.rejectedCount}.`,
                t`LAN Migration Complete`,
            );
            if (hasRestoreWarnings(result)) {
                toastr.warning(t`Migration completed with warnings. Showing diagnostic report.`, t`LAN Migration Warnings`);
                await showRestoreDiagnosticReport(diagnosticReport);
            }
            callback?.(result);
        } catch (error) {
            console.error('Error importing LAN migration link:', error);
            toastr.error(String(error.message || error), t`Failed to import migration link`);
        } finally {
            if (progressToast) {
                toastr.clear(progressToast);
            }
            lanImportLink.val('');
            setActionBusy(false);
        }
    });

    lanImportLink.on('input change', updateLanState);

    updateRestoreState();
    updateLanState();

    await callGenericPopup(template, POPUP_TYPE.TEXT, '', {
        okButton: 'Close',
        wide: true,
        large: false,
        allowVerticalScrolling: true,
        allowHorizontalScrolling: false,
    });
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
        <div class="userBackupManager flex-container flexFlowColumn flexNoGap">
            <h3 class="marginBot5">${t`Logs`}</h3>
            <div class="backupActionRow flex-container flexGap10 marginBot10">
                <label class="checkbox_label backupRestoreModeLabel logSourceLabel">
                    <span>${t`Log source`}</span>
                    <select class="serverLogsSource text_pole">
                        ${canViewServerLogs ? `<option value="server">${t`Server`}</option>` : ''}
                        <option value="frontend">${t`Frontend`}</option>
                    </select>
                </label>
                <label class="checkbox_label backupRestoreModeLabel logFilterLabel">
                    <span>${t`Start time`}</span>
                    <input type="datetime-local" class="serverLogsStartTime text_pole" step="60">
                </label>
                <label class="checkbox_label backupRestoreModeLabel logFilterLabel">
                    <span>${t`End time`}</span>
                    <input type="datetime-local" class="serverLogsEndTime text_pole" step="60">
                </label>
                <label class="checkbox_label backupRestoreModeLabel logFilterLabel">
                    <span>${t`Max entries`}</span>
                    <input type="number" class="serverLogsLimit text_pole" min="1" max="${MAX_LOG_VIEW_LIMIT}" step="50" value="${DEFAULT_LOG_VIEW_LIMIT}">
                </label>
            </div>
            <div class="backupActionRow flex-container flexGap10 marginBot10">
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
                <label class="checkbox_label backupRestoreModeLabel">
                    <input type="checkbox" class="serverLogsAutoRefresh" checked>
                    <span>${t`Auto refresh`}</span>
                </label>
            </div>
            <div class="backupActionRow flex-container flexGap10 marginBot10">
                <label class="checkbox_label backupRestoreModeLabel logFilterLabel wide100p">
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
    template.find('.userStorageInspectorButton').on('click', () => openStorageInspector({ kind: 'self' }));
    template.find('.userBrowserStorageInspectorButton').on('click', () => openBrowserStorageInspector());
    template.find('.userChangeNameButton').on('click', async () => changeName(currentUser.handle, currentUser.name, async () => {
        await getCurrentUser();
        template.find('.userName').text(currentUser.name);
    }));
    template.find('.userChangePasswordButton').on('click', () => changePassword(currentUser.handle, async () => {
        await getCurrentUser();
        template.find('.hasPassword').toggle(currentUser.password);
        template.find('.noPassword').toggle(!currentUser.password);
    }));
    template.find('.userBackupButton').on('click', async function () {
        if ($(this).hasClass('disabled')) {
            return;
        }

        $(this).addClass('disabled');
        await openBackupManager(currentUser.handle, () => location.reload());
        $(this).removeClass('disabled');
    });
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

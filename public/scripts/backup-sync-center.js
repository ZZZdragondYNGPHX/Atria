import { formatAtriaDate } from './atria-shell/components.js';
import { translateShellText as tl, formatShellText as formatProductText } from './atria-shell/localization.js';
import { getRequestHeaders } from '../script.js';
import { downloadFromServer } from './atria-download.js';
import { t } from './i18n.js';
import { callGenericPopup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { createBackupSyncProviderRegistry } from './backup-sync/providers.js';
import { renderTemplateAsync } from './templates.js';
import { humanFileSize } from './utils.js';
import { createLogger } from './logging/logger.js';
import { captureFrontendIncident } from './logging/incident-reporter.js';

const MiB = 1024 * 1024;
const backupLogger = createLogger('backup');
const PROVIDERS = createBackupSyncProviderRegistry();
const RESTORE_STREAM_MIME = 'application/x-ndjson';

let activeArchiveRestore = null;
const archiveRestoreViews = new Set();
let backupViewSequence = 0;

function archiveRestoreRunning() {
    return activeArchiveRestore?.state === 'running' || activeArchiveRestore?.state === 'cancelling';
}

function activateArchivePanel(root) {
    const tab = root.querySelector('.backupSyncTab[data-tab="archive"]');
    if (!tab) return;
    root.querySelectorAll('.backupSyncTab').forEach(item => item.classList.toggle('active', item === tab));
    root.querySelectorAll('.backupSyncTab').forEach(item => {
        item.setAttribute('aria-selected', String(item === tab)); item.tabIndex = item === tab ? 0 : -1;
    });
    root.querySelectorAll('.backupSyncPanel').forEach(panel => {
        panel.classList.toggle('displayNone', panel.dataset.panel !== 'archive');
        panel.hidden = panel.dataset.panel !== 'archive';
    });
}

function setRestoreCancelState(root, { disabled = true, label = tl('Cancel and roll back') } = {}) {
    const button = root.querySelector('.backupRestoreCancel');
    if (!button) return;
    button.classList.remove('displayNone');
    button.disabled = Boolean(disabled);
    button.setAttribute('aria-disabled', String(Boolean(disabled)));
    button.title = disabled ? tl('Available only during a restore') : tl('Cancel this restore and return to the previous state');
    const text = button.querySelector('span');
    if (text) text.textContent = label;
    else button.innerHTML = `<i class="fa-fw fa-solid fa-rotate-left"></i><span>${label}</span>`;
}

function syncArchiveRestoreView(root) {
    const session = activeArchiveRestore;
    if (!root || !session) return;

    if (session.fileName) {
        const label = root.querySelector('.backupArchiveFileLabel');
        if (label && (session.state === 'running' || session.state === 'cancelling')) {
            label.textContent = session.state === 'cancelling'
                ? formatProductText('Cancelling: ${0}', [session.fileName])
                : formatProductText('Restoring: ${0}', [session.fileName]);
        }
    }

    if (session.state === 'running' || session.state === 'cancelling') {
        activateArchivePanel(root);
        setRestoreControlsBusy(root, true);
        setRestoreStartEnabled(root, false);
        setRestoreCancelState(root, {
            disabled: session.state === 'cancelling',
            label: session.state === 'cancelling' ? tl('Cancelling and rolling back…') : tl('Cancel and roll back'),
        });
        if (session.state === 'cancelling') {
            renderRestoreTerminalState(root, tl('Cancelling this restore and returning to the previous state…'), 'running');
        } else if (session.progress) {
            renderRestoreProgress(root, session.progress);
        } else {
            renderRestoreTerminalState(root, tl('The restore is still running in the background…'), 'running');
        }
        return;
    }

    setRestoreControlsBusy(root, false);
    setRestoreCancelState(root, { disabled: true });

    if (session.state === 'completed') {
        renderRestoreTerminalState(
            root,
            formatProductText('Last restore: ${0} items restored; ${1} failed.', [Number(session.result?.restoredCount || 0), Number(session.result?.failedCount || 0)]),
            'ok',
        );
    } else if (session.state === 'failed') {
        renderRestoreTerminalState(root, formatProductText('Last restore failed: ${0}', [session.error || tl('Unknown error')]), 'error');
    } else if (session.state === 'cancelled') {
        renderRestoreTerminalState(
            root,
            session.result?.rolledBack
                ? tl('Restore cancelled. The previous state has been restored.')
                : tl('Restore cancelled before any data was written.'),
            'idle',
        );
    }
}

function broadcastArchiveRestoreState() {
    for (const view of archiveRestoreViews) {
        syncArchiveRestoreView(view);
    }
}

function beginArchiveRestoreSession({ fileName, mode }) {
    const session = {
        state: 'running',
        fileName: String(fileName || ''),
        mode: String(mode || ''),
        progress: null,
        result: null,
        error: '',
        operationId: globalThis.crypto?.randomUUID?.() || `restore-${Date.now().toString(36)}`,
        startedAt: Date.now(),
    };
    activeArchiveRestore = session;
    broadcastArchiveRestoreState();
    return session;
}

function updateArchiveRestoreProgress(session, event) {
    if (activeArchiveRestore !== session || session.state !== 'running') return;
    session.progress = { ...event };
    broadcastArchiveRestoreState();
}

function finishArchiveRestoreSession(session, state, payload = null) {
    if (activeArchiveRestore !== session) return;
    session.state = state;
    if (state === 'completed' || state === 'cancelled') session.result = payload;
    if (state === 'failed') {
        session.error = String(payload?.message || payload || tl('Restore failed'));
        const stage = `restore.${String(session.progress?.phase || 'terminal')}`;
        const failure = payload instanceof Error ? payload : new Error(session.error);
        const correlation = { operationId: String(session.operationId || '') };
        backupLogger.error('restore.failed', '[Backup] archive restore failed', {
            stage,
            fileName: session.fileName,
            mode: session.mode,
            message: session.error,
        }, { category: 'restore', correlation });
        void captureFrontendIncident({
            type: 'backup_failure',
            severity: 'error',
            primaryModule: 'backup',
            stage,
            summary: session.error,
            failure,
            correlation,
            environment: {
                fileName: session.fileName,
                mode: session.mode,
                progress: session.progress || null,
            },
        });
    }
    broadcastArchiveRestoreState();
}

function setRestoreStartEnabled(root, enabled) {
    const button = root.querySelector('.backupRestoreStart');
    if (!button) return;
    const active = Boolean(enabled);
    button.disabled = !active;
    button.classList.toggle('disabled', !active);
    button.setAttribute('aria-disabled', String(!active));
}

function setRestoreControlsBusy(root, busy) {
    const disabled = Boolean(busy);
    root.querySelectorAll(
        '.backupArchiveChoose, .backupSelectAll, .backupSelectRecommended, .backupSelectNone, '
        + '.backupRecoveryRefresh, .backupRecoveryList button, '
        + 'input[name="backupCategory"], input[name="backupRestoreMode"]',
    ).forEach(control => {
        control.disabled = disabled;
    });
}

function renderRestoreProgress(root, event = {}) {
    const box = root.querySelector('.backupRestoreProgress');
    if (!box) return;
    box.classList.remove('displayNone');
    box.dataset.state = 'running';

    const phase = String(event.phase || '');
    const current = Number(event.current);
    const total = Number(event.total);
    const countText = Number.isFinite(current) && Number.isFinite(total) && total > 0
        ? ` ${Math.max(0, current)}/${Math.max(0, total)}`
        : '';

    const phaseLabel = phase === 'stage'
        ? tl('Preparing the restore file')
        : phase === 'analyze'
            ? tl('Checking the archive')
            : phase === 'snapshot'
                ? tl('Creating a recovery point')
                : phase === 'extract'
                    ? tl('Writing restored data')
                    : phase === 'convert'
                        ? tl('Converting stored data')
                        : phase === 'finalize'
                            ? tl('Verifying the restored data')
                            : tl('Restoring');

    const stage = event.stage ? ` · ${String(event.stage)}` : '';
    const entry = event.entry
        ? ` · ${String(event.entry).split('/').slice(-2).join('/')}`
        : '';
    const entryBytes = Number(event.entryBytes);
    const entryTotalBytes = Number(event.entryTotalBytes);
    const byteText = Number.isFinite(entryBytes) && Number.isFinite(entryTotalBytes) && entryTotalBytes > 0
        ? ` · ${humanFileSize(entryBytes)} / ${humanFileSize(entryTotalBytes)}`
        : '';
    box.textContent = `${phaseLabel}${countText}${entry}${byteText}${stage}…`;
}

function renderRestoreTerminalState(root, text, state = 'ok') {
    const box = root.querySelector('.backupRestoreProgress');
    if (!box) return;
    box.classList.remove('displayNone');
    box.dataset.state = state;
    box.textContent = text;
}

async function readRestoreResponse(response, onProgress = () => {}) {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const isProgressStream = contentType.includes(RESTORE_STREAM_MIME);

    if (!isProgressStream || !response.body?.getReader) {
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(data?.error || `HTTP ${response.status}`);
            error.code = data?.code || null;
            error.rolledBack = Boolean(data?.rolledBack);
            throw error;
        }
        return data;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;
    let streamedError = null;

    const consumeLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let payload;
        try {
            payload = JSON.parse(trimmed);
        } catch {
            throw new Error(tl('The restore progress response contains invalid data.'));
        }
        if (payload?.type === 'progress') {
            onProgress(payload);
            return;
        }
        if (payload?.type === 'error') {
            streamedError = {
                message: String(payload.error || tl('Restore failed')),
                code: payload.code || null,
                rolledBack: Boolean(payload.rolledBack),
            };
            return;
        }
        if (payload?.type === 'result') {
            const { type: _type, ...rest } = payload;
            result = rest;
        }
    };

    while (true) {
        const { value, done } = await reader.read();
        if (value) {
            buffer += decoder.decode(value, { stream: !done });
            let newline;
            while ((newline = buffer.indexOf('\n')) !== -1) {
                consumeLine(buffer.slice(0, newline));
                buffer = buffer.slice(newline + 1);
            }
        }
        if (done) break;
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer);

    if (streamedError) {
        const error = new Error(streamedError.message);
        error.code = streamedError.code;
        error.rolledBack = streamedError.rolledBack;
        throw error;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!result) throw new Error(tl('The restore connection closed without a completion receipt.'));
    return result;
}

const BACKUP_CATEGORY_KEYS = Object.freeze([
    'native',
    'settings',
    'secrets',
    'characters',
    'chats',
    'lorebooks',
    'presets',
    'assets',
    'vectors',
]);
const BACKUP_DEFAULT_SELECTION = Object.freeze({
    native: true,
    settings: true,
    secrets: true,
    characters: false,
    chats: false,
    lorebooks: false,
    presets: false,
    assets: true,
    vectors: false,
});

function backupTimestamp() {
    const d = new Date();
    const pad = value => String(value).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function postJson(url, body = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(tl(data?.error?.message || data?.error || `HTTP ${response.status}`));
    }
    return data;
}

function parseRetentionCard(root, type) {
    const card = root.querySelector(`[data-retention-type="${type}"]`);
    const readInt = (field) => {
        const input = card.querySelector(`[data-field="${field}"]`);
        const value = Number(input.value);
        if (!Number.isSafeInteger(value) || value < -1) {
            const label = input.closest('label')?.textContent.trim() || field;
            const message = formatProductText('${0} must be a whole number of -1 or higher.', [label]);
            input.setCustomValidity(message); input.setAttribute('aria-invalid', 'true'); input.reportValidity(); input.focus();
            throw new Error(message);
        }
        return value;
    };
    const sizeMiB = Number(card.querySelector('[data-field="maxTotalSizeMiB"]').value);
    if (!Number.isFinite(sizeMiB) || sizeMiB < -1) {
        throw new Error(tl('The storage limit must be -1 or higher.'));
    }
    return {
        enabled: card.querySelector('[data-field="enabled"]').checked,
        maxPerEntity: readInt('maxPerEntity'),
        maxTotalBackups: readInt('maxTotalBackups'),
        maxTotalSizeBytes: sizeMiB < 0 ? -1 : Math.round(sizeMiB * MiB),
    };
}

function applyRetentionCard(root, type, policy, usage) {
    const card = root.querySelector(`[data-retention-type="${type}"]`);
    if (!card) return;
    card.querySelector('[data-field="enabled"]').checked = Boolean(policy?.enabled);
    card.querySelector('[data-field="maxPerEntity"]').value = String(policy?.maxPerEntity ?? 20);
    card.querySelector('[data-field="maxTotalBackups"]').value = String(policy?.maxTotalBackups ?? 500);
    const bytes = Number(policy?.maxTotalSizeBytes ?? 1024 * MiB);
    card.querySelector('[data-field="maxTotalSizeMiB"]').value = bytes < 0 ? '-1' : String(Math.round(bytes / MiB));
    const typed = usage?.[type] || {};
    card.querySelector('.backupRetentionUsage').textContent =
        formatProductText('${0} items · ${1}', [Number(typed.count || 0), humanFileSize(Number(typed.bytes || 0))]);
}

async function refreshRetention(root) {
    const payload = await postJson('/api/backups/retention/status');
    applyRetentionCard(root, 'settings', payload.policy?.settings, payload.usage);
    return payload;
}

function collectSelection(root, canManageGlobalExtensions) {
    const selection = { ...BACKUP_DEFAULT_SELECTION };
    for (const key of BACKUP_CATEGORY_KEYS) {
        if (key === 'globalExtensions' && !canManageGlobalExtensions) {
            selection[key] = false;
            continue;
        }
        const input = root.querySelector(`input[name="backupCategory"][value="${key}"]`);
        selection[key] = Boolean(input?.checked);
    }
    return selection;
}

function setSelection(root, selection, canManageGlobalExtensions) {
    for (const key of BACKUP_CATEGORY_KEYS) {
        const input = root.querySelector(`input[name="backupCategory"][value="${key}"]`);
        if (!input) continue;
        input.checked = key === 'globalExtensions' && !canManageGlobalExtensions
            ? false
            : Boolean(selection[key]);
    }
}

function effectiveRestoreSelection(root, canManageGlobalExtensions) {
    const mode = root.querySelector('input[name="backupRestoreMode"]:checked')?.value || 'merge';
    if (mode === 'full') {
        return Object.fromEntries(BACKUP_CATEGORY_KEYS.map(key => [
            key,
            key === 'globalExtensions' ? Boolean(canManageGlobalExtensions) : true,
        ]));
    }
    return collectSelection(root, canManageGlobalExtensions);
}

function renderPreflight(root, result) {
    const box = root.querySelector('.backupPreflightReport');
    const report = result?.preflight || {};
    const source = result?.engineKind || 'fs';
    const dest = result?.destinationEngineKind || source;
    const categoryStats = report?.categoryStats && typeof report.categoryStats === 'object'
        ? Object.entries(report.categoryStats)
            .filter(([, value]) => Number(value?.targetableEntries || 0) > 0)
            .map(([key, value]) => `${key}: ${Number(value.targetableEntries || 0)}`)
            .join(' · ')
        : '';
    const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
    const plan = result?.restorePlan || {};
    const modeLabel = plan.mode === 'full'
        ? tl('Full restore')
        : plan.mode === 'overwrite'
            ? tl('Replace selected categories')
            : tl('Merge restore');
    const parts = [
        formatProductText('Mode: ${0}', [modeLabel]),
        formatProductText('Source storage: ${0}', [source]),
        formatProductText('Destination storage: ${0}', [dest]),
        formatProductText('Restorable items: ${0}', [Number(report?.targetableEntries ?? result?.targetableEntries ?? 0)]),
        plan.stagedEngineRestore
            ? (plan.crossModeRequired ? tl('Prepare data and convert between storage engines') : tl('Prepare data and restore selected categories'))
            : tl('Restore files directly'),
        plan.recoveryPoint === 'required' ? tl('Recovery point: required') : '',
        plan.verification === 'required' ? tl('Verification after restore: required') : '',
        categoryStats,
        warnings.length ? formatProductText('Warnings: ${0}', [warnings.join('; ')]) : '',
    ].filter(Boolean);
    box.dataset.state = 'ok';
    box.textContent = parts.join('\n');
}

function renderPreflightError(root, error) {
    const box = root.querySelector('.backupPreflightReport');
    box.dataset.state = 'error';
    box.textContent = formatProductText('Preflight failed: ${0}', [error.message]);
}

async function runPreflight(root, file, canManageGlobalExtensions) {
    const mode = root.querySelector('input[name="backupRestoreMode"]:checked')?.value || 'merge';
    const selection = effectiveRestoreSelection(root, canManageGlobalExtensions);
    if (!Object.values(selection).some(Boolean)) {
        throw new Error(tl('Select at least one data category.'));
    }

    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('selection', JSON.stringify(selection));
    formData.append('mode', mode);
    const response = await fetch('/api/users/restore-backup/probe', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
    }
    if (data?.compatible === false) {
        throw new Error(data?.reason || tl('This archive cannot be restored with the current selection.'));
    }
    return { ...data, selection, mode };
}

async function requestScratchCreds(kind) {
    const label = kind === 'mysql' ? 'MySQL' : 'PostgreSQL';
    const value = await callGenericPopup(
        formatProductText('This archive uses ${0}. Enter the scratch ${1} URL for temporary conversion.', [label, label]),
        POPUP_TYPE.INPUT,
        '',
        { okButton: t`Use Connection`, cancelButton: t`Cancel`, rows: 1, wide: true },
    );
    const url = String(value || '').trim();
    if (!url) return null;
    return kind === 'mysql' ? { scratchMysqlUrl: url } : { scratchPostgresUrl: url };
}

async function restoreArchive({ handle, file, preflight, onProgress = () => {} }) {
    const confirmText = preflight.mode === 'full'
        ? tl('Full restore will replace the selected scope with the account state in this archive. A recovery point will be created first. Continue?')
        : preflight.mode === 'overwrite'
            ? tl('A recovery point will be created before replacing the selected categories with this archive. Continue?')
            : tl('Merge restore creates a recovery point. Conflicting paths will use the archive version. Continue?');
    const confirmed = await callGenericPopup(confirmText, POPUP_TYPE.CONFIRM, '', {
        okButton: tl('Start restore'),
        cancelButton: tl('Cancel'),
        wide: true,
    });
    if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return null;

    let scratchFields = {};
    if (preflight.scratchCredsNeeded) {
        const creds = await requestScratchCreds(preflight.scratchCredsNeeded);
        if (!creds) return null;
        scratchFields = creds;
    }

    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('handle', handle);
    formData.append('mode', preflight.mode);
    formData.append('selection', JSON.stringify(preflight.selection));
    if (preflight.personaDefault?.adopt) formData.append('personaDefault', JSON.stringify(preflight.personaDefault));
    for (const [key, value] of Object.entries(scratchFields)) formData.append(key, value);

    const headers = {
        ...getRequestHeaders({ omitContentType: true }),
        Accept: RESTORE_STREAM_MIME,
    };
    const response = await fetch('/api/users/restore-backup', {
        method: 'POST',
        headers,
        body: formData,
    });
    return readRestoreResponse(response, onProgress);
}

async function loadRestoreRecoveryPoints(root) {
    const payload = await postJson('/api/users/restore-backup/recovery/list');
    const list = root.querySelector('.backupRecoveryList');
    list.innerHTML = '';
    const points = Array.isArray(payload?.recoveryPoints) ? payload.recoveryPoints : [];
    if (points.length === 0) {
        list.innerHTML = tl('<div class="menu_button_note">No archive recovery points yet.</div>');
        return;
    }

    for (const point of points) {
        const row = document.createElement('div');
        row.className = 'backupManagedRow';

        const meta = document.createElement('div');
        meta.className = 'backupManagedRowMeta';
        const source = point.sourceRecoveryPoint
            ? formatProductText(' · Source recovery point ${0}', [point.sourceRecoveryPoint])
            : '';
        meta.textContent = `${formatAtriaDate(point.createdAt)} · ${point.restoreMode || point.purpose || 'restore'} · ${point.engineKind || 'fs'}${source}`;

        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'menu_button menu_button_icon';
        restore.innerHTML = tl('<i class="fa-fw fa-solid fa-rotate-left" aria-hidden="true"></i><span>Restore this point</span>');
        restore.addEventListener('click', async () => {
            const confirmed = await callGenericPopup(
                formatProductText('Restore account recovery point ${0}? The current state will be saved first.', [point.id]),
                POPUP_TYPE.CONFIRM,
                '',
                { okButton: tl('Restore'), cancelButton: tl('Cancel'), wide: true },
            );
            if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;

            restore.disabled = true;
            try {
                const result = await postJson('/api/users/restore-backup/recovery/apply', { id: point.id });
                toastr.success(
                    result?.undoRecoveryPoint
                        ? formatProductText('Recovery point restored. The previous state was saved as ${0}.', [result.undoRecoveryPoint])
                        : tl('Recovery point restored.'),
                );
                await loadRestoreRecoveryPoints(root);
            } catch (error) {
                toastr.error(formatProductText('Could not restore the recovery point: ${0}', [error.message]));
            } finally {
                if (restore.isConnected) restore.disabled = false;
            }
        });

        row.append(meta, restore);
        list.appendChild(row);
    }
}

async function loadProviders(root) {
    const mount = root.querySelector('.backupCloudProviders');
    mount.innerHTML = '';
    const providers = PROVIDERS.list();
    for (const provider of providers.filter(item => item.future || !item.available)) {
        const card = document.createElement('div');
        card.className = 'backupProviderCard';
        const header = document.createElement('div');
        header.className = 'backupProviderCardHeader';
        const title = document.createElement('strong');
        title.textContent = provider.label;
        const badge = document.createElement('span');
        badge.className = 'backupProviderBadge';
        badge.textContent = provider.available ? tl('Available') : tl('Not available yet');
        header.append(title, badge);
        card.append(header);
        mount.appendChild(card);
    }
}

export async function openBackupSyncCenter({
    handle,
    canManageGlobalExtensions = false,
    openSettingsSnapshots = null,
    onRestored = null,
} = {}) {
    const root = document.createElement('div');
    root.innerHTML = await renderTemplateAsync('backupSyncCenter');
    const center = root.firstElementChild;

    const globalItem = center.querySelector('.backupCategoryGlobalExtensions');
    if (globalItem) globalItem.classList.toggle('displayNone', !canManageGlobalExtensions);
    setSelection(center, BACKUP_DEFAULT_SELECTION, canManageGlobalExtensions);

    let retentionPolicy = null;
    let selectedArchive = null;
    let preflight = null;
    let preflightVersion = 0;
    let archiveSelectionSequence = 0;
    let retentionBusy = false;
    archiveRestoreViews.add(center);

    const reloadRetention = async () => {
        const payload = await refreshRetention(center);
        retentionPolicy = payload.policy;
    };

    const rerunPreflight = async () => {
        const version = ++preflightVersion;
        preflight = null;
        center.querySelector('[data-persona-default-review]')?.remove();
        setRestoreStartEnabled(center, false);
        if (!selectedArchive || archiveRestoreRunning()) return;
        try {
            const result = await runPreflight(center, selectedArchive.file, canManageGlobalExtensions);
            if (version !== preflightVersion || archiveRestoreRunning()) return;
            preflight = result;
            renderPreflight(center, result);
            if (result.personaReview?.hasPersonaManifest && result.selection.native) {
                const review = document.createElement('section'); review.dataset.personaDefaultReview = 'true';
                const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.disabled = result.personaReview.defaultStatus === 'archived';
                label.append(checkbox, document.createTextNode(tl('Adopt the backup Persona default (existing sessions keep their identity)')));
                const details = document.createElement('pre'); details.textContent = JSON.stringify(result.personaReview.defaultSelection, null, 2);
                const note = document.createElement('p'); note.textContent = tl('The target account default is preserved unless you select adoption.');
                const policy = document.createElement('p'); policy.textContent = tl('Persona resources retain exact IDs. Existing target Personas are preserved; ID conflicts require review.');
                review.append(policy, note, label, details); center.querySelector('.backupPreflightReport').after(review);
                checkbox.addEventListener('change', () => { if (preflight === result) result.personaDefault = { adopt: checkbox.checked, expectedFingerprint: result.personaReview.expectedDefaultFingerprint }; });
            }
            setRestoreStartEnabled(center, true);
        } catch (error) {
            if (version !== preflightVersion || archiveRestoreRunning()) return;
            renderPreflightError(center, error);
        }
    };

    const viewId = ++backupViewSequence;
    const navigation = center.querySelector('.backupSyncTabs');
    navigation.setAttribute('role', 'tablist'); navigation.setAttribute('aria-label', tl('Backup sections'));
    const tabs = [...center.querySelectorAll('.backupSyncTab')];
    for (const button of tabs) {
        const panel = center.querySelector(`[data-panel="${button.dataset.tab}"]`);
        button.id = `atria-backup-${viewId}-tab-${button.dataset.tab}`;
        panel.id = `atria-backup-${viewId}-panel-${button.dataset.tab}`;
        button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panel.id);
        button.setAttribute('aria-selected', String(button.classList.contains('active'))); button.tabIndex = button.classList.contains('active') ? 0 : -1;
        panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id); panel.tabIndex = 0;
        panel.hidden = !button.classList.contains('active');
        button.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); const index = tabs.indexOf(button);
            const target = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length];
            tabs.forEach(item => { item.tabIndex = item === target ? 0 : -1; }); target.focus();
        });
        button.addEventListener('click', () => {
            tabs.forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-selected', String(item === button)); item.tabIndex = item === button ? 0 : -1; });
            center.querySelectorAll('.backupSyncPanel').forEach(panel => {
                panel.classList.toggle('displayNone', panel.dataset.panel !== button.dataset.tab);
                panel.hidden = panel.dataset.panel !== button.dataset.tab;
            });
        });
    }

    const retentionFeedback = document.createElement('p'); retentionFeedback.className = 'atri-library-feedback'; retentionFeedback.setAttribute('role', 'status');
    center.querySelector('.backupRetentionSave').parentElement.after(retentionFeedback);
    async function changeRetention(button, request, message, accept = () => {}) {
        if (retentionBusy) return;
        retentionBusy = true;
        const controls = [...center.querySelectorAll('.backupRetentionGrid input, .backupRetentionSave, .backupRetentionCleanup, .backupRetentionReset, .backupManagedRefresh')].map(node => [node, node.disabled]);
        retentionFeedback.textContent = tl('Saving…'); retentionFeedback.setAttribute('role', 'status');
        let committed = false;
        try {
            const pending = request();
            controls.forEach(([node]) => { node.disabled = true; }); button.setAttribute('aria-busy', 'true');
            const payload = await pending; committed = true; accept(payload);
            retentionFeedback.textContent = tl(message);
            await reloadRetention();
        } catch (error) {
            retentionFeedback.textContent = committed ? tl('Saved, but the backup list could not refresh. Refresh the list to read the saved result.') : error.message;
            retentionFeedback.setAttribute('role', committed ? 'status' : 'alert');
        } finally {
            retentionBusy = false; controls.forEach(([node, disabled]) => { node.disabled = disabled; }); button.removeAttribute('aria-busy');
        }
    }
    center.querySelectorAll('.backupRetentionGrid input').forEach(input => input.addEventListener('input', () => {
        input.setCustomValidity(''); input.removeAttribute('aria-invalid');
    }));

    center.querySelector('.backupRetentionSave').addEventListener('click', async () => {
        await changeRetention(center.querySelector('.backupRetentionSave'), () => postJson('/api/backups/retention/settings', {
            ...(retentionPolicy?.chat ? { chat: retentionPolicy.chat } : {}),
            settings: parseRetentionCard(center, 'settings'),
        }), 'Settings backup retention saved.', payload => {
            retentionPolicy = payload.policy;
            applyRetentionCard(center, 'settings', payload.policy?.settings, payload.usage);
        });
    });
    center.querySelector('.backupManagedRefresh').addEventListener('click', async () => {
        const button = center.querySelector('.backupManagedRefresh');
        if (button.disabled || retentionBusy) return;
        button.disabled = true; button.setAttribute('aria-busy', 'true');
        try {
            await reloadRetention();
            center.querySelector('.backupRetentionSave').disabled = false;
            retentionFeedback.textContent = tl('Backup list refreshed.'); retentionFeedback.setAttribute('role', 'status');
        } catch (error) { retentionFeedback.textContent = error.message; retentionFeedback.setAttribute('role', 'alert'); } finally { button.disabled = false; button.removeAttribute('aria-busy'); }
    });
    center.querySelector('.backupOpenSettingsSnapshots').addEventListener('click', () => openSettingsSnapshots?.());

    center.querySelector('.backupSelectAll').addEventListener('click', () => {
        setSelection(center, Object.fromEntries(BACKUP_CATEGORY_KEYS.map(key => [key, true])), canManageGlobalExtensions);
        void rerunPreflight();
    });
    center.querySelector('.backupSelectRecommended').addEventListener('click', () => {
        setSelection(center, BACKUP_DEFAULT_SELECTION, canManageGlobalExtensions);
        void rerunPreflight();
    });
    center.querySelector('.backupSelectNone').addEventListener('click', () => {
        setSelection(center, Object.fromEntries(BACKUP_CATEGORY_KEYS.map(key => [key, false])), canManageGlobalExtensions);
        void rerunPreflight();
    });
    center.querySelectorAll('input[name="backupCategory"], input[name="backupRestoreMode"]').forEach(input => {
        input.addEventListener('change', () => void rerunPreflight());
    });

    center.querySelector('.backupArchiveDownload').addEventListener('click', async () => {
        const selection = collectSelection(center, canManageGlobalExtensions);
        if (!Object.values(selection).some(Boolean)) {
            toastr.warning(tl('Select at least one data category.'));
            return;
        }
        try {
            await downloadFromServer({
                url: '/api/users/backup',
                fileName: `${handle}-${backupTimestamp()}.zip`,
                mimeType: 'application/zip',
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ handle, selection }),
            });
        } catch (error) {
            toastr.error(error?.serverMessage || error.message);
        }
    });

    const archiveInput = center.querySelector('.backupArchiveInput');
    center.querySelector('.backupArchiveChoose').addEventListener('click', () => archiveInput.click());
    archiveInput.addEventListener('change', async () => {
        if (archiveRestoreRunning()) return;
        const file = archiveInput.files?.[0] || null;
        const token = ++archiveSelectionSequence;
        selectedArchive = null; preflight = null; preflightVersion++; setRestoreStartEnabled(center, false);
        activeArchiveRestore = null;
        center.querySelector('.backupArchiveFileLabel').textContent = file?.name || tl('No file selected');
        try {
            const archive = file ? await PROVIDERS.get('local-file').openArtifact(file) : null;
            if (token !== archiveSelectionSequence || !center.isConnected || archiveRestoreRunning()) return;
            selectedArchive = archive; await rerunPreflight();
        } catch (error) {
            if (token === archiveSelectionSequence && center.isConnected && !archiveRestoreRunning()) renderPreflightError(center, error);
        }
    });

    center.querySelector('.backupRestoreCancel').addEventListener('click', async () => {
        const session = activeArchiveRestore;
        if (!session || session.state !== 'running') return;

        const confirmed = await callGenericPopup(
            tl('Cancel this restore and return to the previous state?'),
            POPUP_TYPE.CONFIRM,
            '',
            {
                okButton: tl('Cancel and roll back'),
                cancelButton: tl('Continue restore'),
                wide: true,
            },
        );
        if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
        if (activeArchiveRestore !== session || session.state !== 'running') return;

        session.state = 'cancelling';
        broadcastArchiveRestoreState();

        try {
            const result = await postJson('/api/users/restore-backup/cancel', { handle });
            if (!result?.cancelRequested) {
                throw new Error(tl('The server did not accept the cancellation request.'));
            }
        } catch (error) {
            if (activeArchiveRestore === session && session.state === 'cancelling') {
                session.state = 'running';
                broadcastArchiveRestoreState();
            }
            toastr.error(formatProductText('Could not cancel the restore: ${0}', [error.message]));
        }
    });
    center.querySelector('.backupRestoreStart').addEventListener('click', async () => {
        const button = center.querySelector('.backupRestoreStart');
        if (button.disabled || archiveRestoreRunning() || !selectedArchive || !preflight) return;

        preflightVersion++;
        const session = beginArchiveRestoreSession({
            fileName: selectedArchive.name,
            mode: preflight.mode,
        });
        setRestoreStartEnabled(center, false);
        setRestoreControlsBusy(center, true);
        renderRestoreTerminalState(center, tl('Preparing the restore…'), 'running');

        try {
            const result = await restoreArchive({
                handle,
                file: selectedArchive.file,
                preflight,
                onProgress: event => updateArchiveRestoreProgress(session, event),
            });
            if (!result) {
                finishArchiveRestoreSession(session, 'cancelled');
                return;
            }
            finishArchiveRestoreSession(session, 'completed', result);
            toastr.success(formatProductText('Restore complete: ${0} items restored; ${1} failed.', [Number(result.restoredCount || 0), Number(result.failedCount || 0)]));
            await onRestored?.(result);
            if (center.isConnected) {
                await reloadRetention();
            }
        } catch (error) {
            if (error?.code === 'ATRIA_RESTORE_CANCELLED') {
                finishArchiveRestoreSession(session, 'cancelled', {
                    rolledBack: Boolean(error.rolledBack),
                });
                toastr.success(
                    error.rolledBack
                        ? tl('Restore cancelled. The previous state has been restored.')
                        : tl('Restore cancelled before any data was written.'),
                );
                return;
            }
            finishArchiveRestoreSession(session, 'failed', error);
            toastr.error(formatProductText('Restore failed: ${0}', [error.message]));
        } finally {
            if (center.isConnected) {
                setRestoreControlsBusy(center, false);
                setRestoreStartEnabled(center, Boolean(preflight) && !archiveRestoreRunning());
            }
        }
    });

    center.querySelector('.backupRecoveryRefresh').addEventListener('click', () => {
        void loadRestoreRecoveryPoints(center).catch(error => toastr.error(formatProductText('Could not load recovery points: ${0}', [error.message])));
    });
    center.querySelector('.backupOpenLanSync').addEventListener('click', () => void PROVIDERS.get('lan-sync').open());
    await Promise.all([
        reloadRetention().catch(error => { center.querySelector('.backupRetentionSave').disabled = true; toastr.error(formatProductText('Could not load backup retention: ${0}', [error.message])); }),
        loadProviders(center).catch(error => toastr.error(formatProductText('Could not load sync services: ${0}', [error.message]))),
        loadRestoreRecoveryPoints(center).catch(error => toastr.error(formatProductText('Could not load recovery points: ${0}', [error.message]))),
    ]);
    syncArchiveRestoreView(center);

    try {
        return await callGenericPopup(center, POPUP_TYPE.DISPLAY, '', {
            wide: true,
            wider: true,
            large: true,
            allowVerticalScrolling: true,
            okButton: t`Close`,
        });
    } finally {
        archiveRestoreViews.delete(center);
    }
}

import { displayPastChats, getRequestHeaders, importCharacterChat } from '../script.js';
import { importGroupChat } from './group-chats.js';
import { downloadFromServer } from './atria-download.js';
import { t } from './i18n.js';
import { callGenericPopup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { createBackupSyncProviderRegistry } from './backup-sync/providers.js';
import { renderTemplateAsync } from './templates.js';
import { humanFileSize } from './utils.js';

const MiB = 1024 * 1024;
const PROVIDERS = createBackupSyncProviderRegistry();
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
        throw new Error(data?.error?.message || data?.error || `HTTP ${response.status}`);
    }
    return data;
}

function parseRetentionCard(root, type) {
    const card = root.querySelector(`[data-retention-type="${type}"]`);
    const readInt = (field) => {
        const value = Number(card.querySelector(`[data-field="${field}"]`).value);
        if (!Number.isSafeInteger(value) || value < -1) {
            throw new Error(`${field} 必须是大于等于 -1 的整数。`);
        }
        return value;
    };
    const sizeMiB = Number(card.querySelector('[data-field="maxTotalSizeMiB"]').value);
    if (!Number.isFinite(sizeMiB) || sizeMiB < -1) {
        throw new Error('空间上限必须是大于等于 -1 的数字。');
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
        `${Number(typed.count || 0)} 个 · ${humanFileSize(Number(typed.bytes || 0))}`;
}

async function refreshRetention(root) {
    const payload = await postJson('/api/backups/retention/status');
    applyRetentionCard(root, 'chat', payload.policy?.chat, payload.usage);
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
        if (input) selection[key] = input.checked;
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
        ? '完整恢复'
        : plan.mode === 'overwrite'
            ? '替换所选类别'
            : '合并恢复';
    const parts = [
        `模式：${modeLabel}`,
        `来源引擎：${source}`,
        `目标引擎：${dest}`,
        `可恢复条目：${Number(report?.targetableEntries ?? result?.targetableEntries ?? 0)}`,
        plan.stagedEngineRestore
            ? (plan.crossModeRequired ? '执行 staging + 跨引擎转换' : '执行 staging + 按类别恢复')
            : '直接文件恢复',
        plan.recoveryPoint === 'required' ? '恢复点：必建' : '',
        plan.verification === 'required' ? '恢复后校验：必做' : '',
        categoryStats,
        warnings.length ? `警告：${warnings.join('；')}` : '',
    ].filter(Boolean);
    box.dataset.state = 'ok';
    box.textContent = parts.join('\n');
}

function renderPreflightError(root, error) {
    const box = root.querySelector('.backupPreflightReport');
    box.dataset.state = 'error';
    box.textContent = `预检失败：${error.message}`;
}

async function runPreflight(root, file, canManageGlobalExtensions) {
    const mode = root.querySelector('input[name="backupRestoreMode"]:checked')?.value || 'merge';
    const selection = effectiveRestoreSelection(root, canManageGlobalExtensions);
    if (!Object.values(selection).some(Boolean)) {
        throw new Error('至少选择一个数据类别。');
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
        throw new Error(data?.reason || '此归档不能按当前选择恢复。');
    }
    return { ...data, selection, mode };
}

async function requestScratchCreds(kind) {
    const label = kind === 'mysql' ? 'MySQL' : 'PostgreSQL';
    const value = await callGenericPopup(
        `此归档来自 ${label}。请输入用于临时转换的 Scratch ${label} URL。`,
        POPUP_TYPE.INPUT,
        '',
        { okButton: t`Use Connection`, cancelButton: t`Cancel`, rows: 1, wide: true },
    );
    const url = String(value || '').trim();
    if (!url) return null;
    return kind === 'mysql' ? { scratchMysqlUrl: url } : { scratchPostgresUrl: url };
}

async function restoreArchive({ handle, file, preflight }) {
    const confirmText = preflight.mode === 'full'
        ? '完整恢复会将所选范围视为归档中的账户状态，并在操作前创建恢复点。继续？'
        : preflight.mode === 'overwrite'
            ? '替换所选类别会先创建恢复点，再以归档内容替换对应类别。继续？'
            : '合并恢复也会创建恢复点；冲突路径将采用归档版本。继续？';
    const confirmed = await callGenericPopup(confirmText, POPUP_TYPE.CONFIRM, '', {
        okButton: '开始恢复',
        cancelButton: '取消',
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
    for (const [key, value] of Object.entries(scratchFields)) formData.append(key, value);

    const response = await fetch('/api/users/restore-backup', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data;
}

async function previewManagedBackup(name) {
    const payload = await postJson('/api/backups/managed/preview', { name });
    const textarea = document.createElement('textarea');
    textarea.className = 'text_pole monospace';
    textarea.rows = 24;
    textarea.readOnly = true;
    if (payload.type === 'chat') {
        const rendered = [];
        for (const line of String(payload.content || '').split('\n')) {
            if (!line.trim()) continue;
            try {
                const item = JSON.parse(line);
                if (item?.mes) rendered.push(`${item.name || item.character_name || 'Message'}\n${item.mes}`);
            } catch {
                rendered.push(line);
            }
        }
        textarea.value = rendered.join('\n\n');
    } else {
        textarea.value = String(payload.content || '');
    }
    if (payload.truncated) textarea.value += '\n\n…预览已截断…';
    return callGenericPopup(textarea, POPUP_TYPE.TEXT, '', {
        okButton: t`Close`,
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });
}

async function downloadManagedBackup(name) {
    await downloadFromServer({
        url: '/api/backups/managed/download',
        fileName: name,
        mimeType: 'application/octet-stream',
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name }),
    });
}

async function restoreChatBackup(name) {
    const response = await fetch('/api/backups/managed/download', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error('读取聊天备份失败。');
    const blob = await response.blob();
    const file = new File([blob], name, { type: 'application/octet-stream' });
    const context = Atria.getContext();
    const formData = new FormData();
    formData.set('file_type', 'jsonl');
    formData.set('avatar', file);
    formData.set('avatar_url', context.characters[context.characterId]?.avatar || '');
    formData.set('user_name', context.name1);
    formData.set('character_name', context.name2);
    const importFn = context.groupId ? importGroupChat : importCharacterChat;
    const result = await importFn(formData, { refresh: false });
    if (!Array.isArray(result) || result.length === 0) throw new Error('聊天备份导入失败。');
    await displayPastChats(result);
    return result;
}

function renderManagedGroups(root, records, reload) {
    const list = root.querySelector('.backupManagedList');
    const query = String(root.querySelector('.backupManagedSearch').value || '').trim().toLowerCase();
    list.innerHTML = '';
    const groups = new Map();
    for (const record of records) {
        const haystack = `${record.entityKey} ${record.name}`.toLowerCase();
        if (query && !haystack.includes(query)) continue;
        const rows = groups.get(record.entityKey) || [];
        rows.push(record);
        groups.set(record.entityKey, rows);
    }
    if (groups.size === 0) {
        list.innerHTML = '<div class="menu_button_note">没有匹配的聊天备份。</div>';
        return;
    }

    for (const [entityKey, rows] of groups) {
        const group = document.createElement('div');
        group.className = 'backupManagedGroup';
        const header = document.createElement('div');
        header.className = 'backupManagedGroupHeader';
        const title = document.createElement('strong');
        title.textContent = entityKey.replace(/^chat_/, '');
        const count = document.createElement('span');
        count.textContent = `${rows.length} 个版本`;
        header.append(title, count);
        const rowsEl = document.createElement('div');
        rowsEl.className = 'backupManagedRows';

        for (const record of rows) {
            const row = document.createElement('div');
            row.className = 'backupManagedRow';
            const meta = document.createElement('div');
            meta.className = 'backupManagedRowMeta';
            const when = new Date(Number(record.modifiedMs || 0)).toLocaleString();
            meta.textContent = `${when} · ${humanFileSize(Number(record.size || 0))} · ${record.chat?.chat_items ?? '?'} 条消息`;

            const actions = document.createElement('div');
            actions.className = 'backupManagedRowActions';
            const make = (icon, titleText, fn, danger = false) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `menu_button menu_button_icon${danger ? ' warning' : ''}`;
                button.title = titleText;
                button.innerHTML = `<i class="fa-fw fa-solid fa-${icon}"></i>`;
                button.addEventListener('click', async () => {
                    button.disabled = true;
                    try {
                        await fn();
                    } catch (error) {
                        toastr.error(error.message);
                    } finally {
                        if (button.isConnected) button.disabled = false;
                    }
                });
                return button;
            };
            actions.append(
                make('eye', '预览', () => previewManagedBackup(record.name)),
                make('download', '下载', () => downloadManagedBackup(record.name)),
                make('rotate-left', '恢复为新的聊天导入', async () => {
                    const result = await callGenericPopup('将此备份导入到当前角色/群聊的聊天列表中？', POPUP_TYPE.CONFIRM);
                    if (result !== POPUP_RESULT.AFFIRMATIVE) return;
                    await restoreChatBackup(record.name);
                    toastr.success('聊天备份已导入。');
                }),
                make('trash', '删除', async () => {
                    const ok = await callGenericPopup(`删除备份 ${record.name}？`, POPUP_TYPE.CONFIRM);
                    if (ok !== POPUP_RESULT.AFFIRMATIVE) return;
                    await postJson('/api/backups/managed/delete', { name: record.name });
                    await reload();
                }, true),
            );
            row.append(meta, actions);
            rowsEl.appendChild(row);
        }
        group.append(header, rowsEl);
        list.appendChild(group);
    }
}

async function loadRestoreRecoveryPoints(root) {
    const payload = await postJson('/api/users/restore-backup/recovery/list');
    const list = root.querySelector('.backupRecoveryList');
    list.innerHTML = '';
    const points = Array.isArray(payload?.recoveryPoints) ? payload.recoveryPoints : [];
    if (points.length === 0) {
        list.innerHTML = '<div class="menu_button_note">暂无归档恢复点。</div>';
        return;
    }

    for (const point of points) {
        const row = document.createElement('div');
        row.className = 'backupManagedRow';

        const meta = document.createElement('div');
        meta.className = 'backupManagedRowMeta';
        const source = point.sourceRecoveryPoint
            ? ` · 源恢复点 ${point.sourceRecoveryPoint}`
            : '';
        meta.textContent = `${new Date(point.createdAt).toLocaleString()} · ${point.restoreMode || point.purpose || 'restore'} · ${point.engineKind || 'fs'}${source}`;

        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'menu_button menu_button_icon';
        restore.innerHTML = '<i class="fa-fw fa-solid fa-rotate-left"></i><span>回滚到这里</span>';
        restore.addEventListener('click', async () => {
            const confirmed = await callGenericPopup(
                `回滚到账户恢复点 ${point.id}？应用前会先保存当前状态。`,
                POPUP_TYPE.CONFIRM,
                '',
                { okButton: '回滚', cancelButton: '取消', wide: true },
            );
            if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;

            restore.disabled = true;
            try {
                const result = await postJson('/api/users/restore-backup/recovery/apply', { id: point.id });
                toastr.success(
                    result?.undoRecoveryPoint
                        ? `恢复点已应用；当前状态已保存为 ${result.undoRecoveryPoint}。`
                        : '恢复点已应用。',
                );
                await loadRestoreRecoveryPoints(root);
            } catch (error) {
                toastr.error(`恢复点应用失败：${error.message}`);
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
        badge.textContent = provider.available ? '可用' : '框架已就绪 · 尚未连接实现';
        header.append(title, badge);
        const capabilities = Object.entries(provider.capabilities || {})
            .filter(([, enabled]) => enabled)
            .map(([name]) => name)
            .join(' · ');
        const cap = document.createElement('div');
        cap.className = 'backupProviderCapabilities';
        cap.textContent = capabilities || '—';
        card.append(header, cap);
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

    let managedRecords = [];
    let selectedArchive = null;
    let preflight = null;

    const reloadManaged = async () => {
        const payload = await postJson('/api/backups/managed/list', { type: 'chat' });
        managedRecords = Array.isArray(payload?.records) ? payload.records : [];
        renderManagedGroups(center, managedRecords, reloadManaged);
    };

    const rerunPreflight = async () => {
        preflight = null;
        center.querySelector('.backupRestoreStart').classList.add('disabled');
        if (!selectedArchive) return;
        try {
            const result = await runPreflight(center, selectedArchive.file, canManageGlobalExtensions);
            preflight = result;
            renderPreflight(center, result);
            center.querySelector('.backupRestoreStart').classList.remove('disabled');
        } catch (error) {
            renderPreflightError(center, error);
        }
    };

    center.querySelectorAll('.backupSyncTab').forEach(button => {
        button.addEventListener('click', () => {
            center.querySelectorAll('.backupSyncTab').forEach(item => item.classList.toggle('active', item === button));
            center.querySelectorAll('.backupSyncPanel').forEach(panel => {
                panel.classList.toggle('displayNone', panel.dataset.panel !== button.dataset.tab);
            });
        });
    });

    center.querySelector('.backupRetentionSave').addEventListener('click', async () => {
        try {
            const payload = await postJson('/api/backups/retention/settings', {
                chat: parseRetentionCard(center, 'chat'),
                settings: parseRetentionCard(center, 'settings'),
            });
            applyRetentionCard(center, 'chat', payload.policy?.chat, payload.usage);
            applyRetentionCard(center, 'settings', payload.policy?.settings, payload.usage);
            await reloadManaged();
            toastr.success('聊天与设置备份保留策略已分别保存。');
        } catch (error) {
            toastr.error(error.message);
        }
    });
    center.querySelector('.backupRetentionCleanup').addEventListener('click', async () => {
        try {
            await postJson('/api/backups/retention/cleanup');
            await refreshRetention(center);
            await reloadManaged();
            toastr.success('备份清理完成。');
        } catch (error) { toastr.error(error.message); }
    });
    center.querySelector('.backupRetentionReset').addEventListener('click', async () => {
        try {
            await postJson('/api/backups/retention/reset');
            await refreshRetention(center);
            await reloadManaged();
            toastr.success('备份保留策略已恢复服务器默认值。');
        } catch (error) { toastr.error(error.message); }
    });
    center.querySelector('.backupManagedRefresh').addEventListener('click', () => void reloadManaged());
    center.querySelector('.backupManagedSearch').addEventListener('input', () => renderManagedGroups(center, managedRecords, reloadManaged));
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
            toastr.warning('至少选择一个数据类别。');
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
        const file = archiveInput.files?.[0] || null;
        selectedArchive = file
            ? await PROVIDERS.get('local-file').openArtifact(file)
            : null;
        center.querySelector('.backupArchiveFileLabel').textContent = selectedArchive?.name || '未选择文件';
        await rerunPreflight();
    });
    center.querySelector('.backupRestoreStart').addEventListener('click', async () => {
        const button = center.querySelector('.backupRestoreStart');
        if (button.classList.contains('disabled') || !selectedArchive || !preflight) return;
        button.classList.add('disabled');
        try {
            const result = await restoreArchive({ handle, file: selectedArchive.file, preflight });
            if (!result) return;
            toastr.success(`恢复完成：${Number(result.restoredCount || 0)} 项；失败 ${Number(result.failedCount || 0)} 项。`);
            await onRestored?.(result);
            await refreshRetention(center);
            await reloadManaged();
        } catch (error) {
            toastr.error(`恢复失败：${error.message}`);
        } finally {
            if (preflight) button.classList.remove('disabled');
        }
    });

    center.querySelector('.backupRecoveryRefresh').addEventListener('click', () => {
        void loadRestoreRecoveryPoints(center).catch(error => toastr.error(`读取恢复点失败：${error.message}`));
    });
    center.querySelector('.backupOpenLanSync').addEventListener('click', () => void PROVIDERS.get('lan-sync').open());
    await Promise.all([
        refreshRetention(center).catch(error => toastr.error(`读取备份策略失败：${error.message}`)),
        reloadManaged().catch(error => toastr.error(`读取聊天备份失败：${error.message}`)),
        loadProviders(center).catch(error => toastr.error(`读取 Provider 失败：${error.message}`)),
        loadRestoreRecoveryPoints(center).catch(error => toastr.error(`读取恢复点失败：${error.message}`)),
    ]);

    return callGenericPopup(center, POPUP_TYPE.DISPLAY, '', {
        wide: true,
        wider: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: t`Close`,
    });
}

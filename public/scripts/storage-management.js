import { getRequestHeaders } from '../script.js';
import { BrowserMutator, BrowserProvider } from './browser-storage-inspector.js';
import { t } from './i18n.js';
import { callGenericPopup, POPUP_RESULT, POPUP_TYPE } from './popup.js';
import { createStorageInspector, RestMutator, RestProvider } from './storage-inspector.js';
import { renderTemplateAsync } from './templates.js';

async function postJson(endpoint, body = {}) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const err = new Error(payload?.error?.message || payload?.error || `HTTP ${response.status}`);
        err.code = payload?.error?.code || 'E_UNKNOWN';
        throw err;
    }
    return payload;
}

function renderRecoveryPoints(center, points, refreshInspector, reloadRecovery) {
    const list = center.querySelector('.storageRecoveryList');
    list.innerHTML = '';
    list.classList.remove('displayNone');
    if (!Array.isArray(points) || points.length === 0) {
        list.innerHTML = '<div class="menu_button_note">暂无存储编辑/删除恢复点。</div>';
        return;
    }

    for (const point of points) {
        const row = document.createElement('div');
        row.className = 'backupManagedRow';
        const meta = document.createElement('div');
        meta.className = 'backupManagedRowMeta';
        meta.textContent = `${new Date(point.createdAt).toLocaleString()} · ${point.action} · ${point.relativePath}`;
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'menu_button menu_button_icon';
        restore.innerHTML = '<i class="fa-fw fa-solid fa-rotate-left"></i><span>恢复</span>';
        restore.addEventListener('click', async () => {
            const confirmed = await callGenericPopup(
                `将 ${point.relativePath} 恢复到此恢复点？当前同路径内容会被替换。`,
                POPUP_TYPE.CONFIRM,
                '',
                { okButton: '恢复', cancelButton: '取消' },
            );
            if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
            restore.disabled = true;
            try {
                await postJson('/api/users/storage/recovery/restore', { id: point.id });
                toastr.success('恢复点已应用。');
                await refreshInspector();
                await reloadRecovery();
            } catch (error) {
                toastr.error(error.message);
            } finally {
                restore.disabled = false;
            }
        });
        row.append(meta, restore);
        list.appendChild(row);
    }
}


export async function openStorageManagement() {
    const root = document.createElement('div');
    root.innerHTML = await renderTemplateAsync('storageManagement');
    const center = root.firstElementChild;
    const serverMount = center.querySelector('.storageManagementServerMount');
    const browserMount = center.querySelector('.storageManagementBrowserMount');

    const serverInspector = createStorageInspector({
        provider: new RestProvider({ kind: 'self' }),
        mutator: new RestMutator(),
        container: serverMount,
    });
    const browserInspector = createStorageInspector({
        provider: new BrowserProvider(),
        mutator: new BrowserMutator(),
        container: browserMount,
    });

    let browserReady = false;
    await serverInspector.init();

    const reloadRecovery = async () => {
        const payload = await postJson('/api/users/storage/recovery/list', { limit: 25 });
        renderRecoveryPoints(
            center,
            payload.recoveryPoints,
            () => serverInspector.refresh(),
            reloadRecovery,
        );
    };

    center.querySelector('.storageRecoveryRefresh').addEventListener('click', async () => {
        try {
            await reloadRecovery();
        } catch (error) {
            toastr.error(`读取恢复点失败：${error.message}`);
        }
    });

    center.querySelectorAll('.storageManagementTab').forEach(button => {
        button.addEventListener('click', async () => {
            center.querySelectorAll('.storageManagementTab').forEach(item => item.classList.toggle('active', item === button));
            center.querySelectorAll('.storageManagementSection').forEach(panel => {
                panel.classList.toggle('displayNone', panel.dataset.panel !== button.dataset.tab);
            });
            if (button.dataset.tab === 'browser' && !browserReady) {
                browserReady = true;
                await browserInspector.init();
            }
        });
    });

    return callGenericPopup(center, POPUP_TYPE.DISPLAY, '', {
        wide: true,
        wider: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: t`Close`,
    });
}

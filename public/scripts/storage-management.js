import { formatAtriaDate } from './atria-shell/components.js';
import { translateShellText as tl, formatShellText as formatProductText } from './atria-shell/localization.js';
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
        list.innerHTML = tl('<div class="menu_button_note">No recovery points for storage changes yet.</div>');
        return;
    }

    for (const point of points) {
        const row = document.createElement('div');
        row.className = 'backupManagedRow';
        const meta = document.createElement('div');
        meta.className = 'backupManagedRowMeta';
        meta.textContent = `${formatAtriaDate(point.createdAt)} · ${point.action} · ${point.relativePath}`;
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'menu_button menu_button_icon';
        restore.innerHTML = tl('<i class="fa-fw fa-solid fa-rotate-left" aria-hidden="true"></i><span>Restore</span>');
        restore.addEventListener('click', async () => {
            const confirmed = await callGenericPopup(
                formatProductText('Restore ${0} to this recovery point? The current content at this path will be replaced.', [point.relativePath]),
                POPUP_TYPE.CONFIRM,
                '',
                { okButton: tl('Restore'), cancelButton: tl('Cancel') },
            );
            if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;
            restore.disabled = true;
            try {
                await postJson('/api/users/storage/recovery/restore', { id: point.id });
                toastr.success(tl('Recovery point restored.'));
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
            toastr.error(formatProductText('Could not load recovery points: ${0}', [error.message]));
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

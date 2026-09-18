import { BrowserMutator, BrowserProvider } from './browser-storage-inspector.js';
import { t } from './i18n.js';
import { callGenericPopup, POPUP_TYPE } from './popup.js';
import { createStorageInspector, RestProvider, ThrowingMutator } from './storage-inspector.js';
import { renderTemplateAsync } from './templates.js';

export async function openStorageManagement() {
    const root = document.createElement('div');
    root.innerHTML = await renderTemplateAsync('storageManagement');
    const center = root.firstElementChild;
    const serverMount = center.querySelector('.storageManagementServerMount');
    const browserMount = center.querySelector('.storageManagementBrowserMount');

    const serverInspector = createStorageInspector({
        provider: new RestProvider({ kind: 'self' }),
        mutator: new ThrowingMutator(),
        container: serverMount,
    });
    const browserInspector = createStorageInspector({
        provider: new BrowserProvider(),
        mutator: new BrowserMutator(),
        container: browserMount,
    });

    let browserReady = false;
    await serverInspector.init();

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

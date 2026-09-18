// Unified browser Storage Management CRUD coverage.
//
// Exercises the new capability-driven actions at the same UI surface users
// reach from Account -> Storage Management -> Browser Data.

import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import {
    openBrowserStorageInspector,
    seedBrowserFixture,
    wipeBrowserFixture,
} from './_helpers.js';

let server;

test.beforeAll(async () => {
    server = await startServer({ batchKey: 'browser-storage-inspector', scenarioId: 'crud-records' });
});

test.afterAll(async () => {
    await tearDownServer(server);
});

function topActivePopup(page) {
    return page.locator('dialog.popup[open]:not([closing])').last();
}

async function confirmTopPopup(page) {
    const popup = topActivePopup(page);
    await popup.locator('.popup-button-ok').click();
}

test.describe('Browser Storage Management · CRUD', () => {
    test('edits and creates localStorage entries', async ({ page }) => {
        await awaitMainUI(page, server.baseURL);
        await wipeBrowserFixture(page);
        await seedBrowserFixture(page, {
            localStorage: { 'atria-theme': 'dark' },
        });

        const inspector = await openBrowserStorageInspector(page);
        await inspector.locator('.storageInspectorEntry[data-key="localStorage"]').click();
        await inspector.locator('.storageInspectorLoading.displayNone').waitFor({ state: 'attached' });

        const row = inspector.locator('.storageInspectorEntry[data-key="atria-theme"]');
        await row.locator('.storageInspectorEntryEditButton').click();
        const editPopup = topActivePopup(page);
        const editArea = editPopup.locator('textarea').first();
        await editArea.fill('light');
        await editPopup.locator('.popup-button-ok').click();

        await expect.poll(() => page.evaluate(() => localStorage.getItem('atria-theme'))).toBe('light');

        await inspector.locator('.storageInspectorCreateButton').click();
        const namePopup = topActivePopup(page);
        await namePopup.locator('.popup-input').fill('atria-new-key');
        await namePopup.locator('.popup-button-ok').click();

        const valuePopup = topActivePopup(page);
        await valuePopup.locator('textarea').first().fill('created-value');
        await valuePopup.locator('.popup-button-ok').click();

        await expect.poll(() => page.evaluate(() => localStorage.getItem('atria-new-key'))).toBe('created-value');
        await wipeBrowserFixture(page);
    });

    test('drills to an IndexedDB record and safely edits plain JSON', async ({ page }) => {
        await awaitMainUI(page, server.baseURL);
        await wipeBrowserFixture(page);
        await seedBrowserFixture(page, {
            indexeddb: [{ name: 'atria-records', stores: ['items'] }],
        });
        await page.evaluate(async () => {
            await new Promise((resolve, reject) => {
                const req = indexedDB.open('atria-records');
                req.onerror = () => reject(req.error);
                req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction('items', 'readwrite');
                    tx.objectStore('items').put({ value: 1, label: 'before' }, 'alpha');
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = () => reject(tx.error);
                };
            });
        });

        const inspector = await openBrowserStorageInspector(page);
        await inspector.locator('.storageInspectorEntry[data-key="indexeddb"]').click();
        await inspector.locator('.storageInspectorEntry[data-key="atria-records"]').click();
        await inspector.locator('.storageInspectorEntry[data-key="items"]').click();

        const record = inspector.locator('.storageInspectorEntry', { hasText: 'alpha' }).first();
        await expect(record).toBeVisible();
        await record.locator('.storageInspectorEntryEditButton').click();

        const popup = topActivePopup(page);
        await popup.locator('textarea').first().fill(JSON.stringify({ value: 2, label: 'after' }, null, 2));
        await popup.locator('.popup-button-ok').click();

        await expect.poll(() => page.evaluate(async () => {
            return await new Promise((resolve, reject) => {
                const req = indexedDB.open('atria-records');
                req.onerror = () => reject(req.error);
                req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction('items', 'readonly');
                    const get = tx.objectStore('items').get('alpha');
                    get.onsuccess = () => {
                        resolve(get.result);
                        db.close();
                    };
                    get.onerror = () => reject(get.error);
                };
            });
        })).toEqual({ value: 2, label: 'after' });
        await wipeBrowserFixture(page);
    });

    test('inspects and deletes one Cache Storage request without deleting its cache', async ({ page }) => {
        await awaitMainUI(page, server.baseURL);
        await wipeBrowserFixture(page);
        await seedBrowserFixture(page, {
            caches: [{ name: 'atria-cache', requests: ['/one.txt', '/two.txt'] }],
        });

        const inspector = await openBrowserStorageInspector(page);
        await inspector.locator('.storageInspectorEntry[data-key="cachestorage"]').click();
        await inspector.locator('.storageInspectorEntry[data-key="atria-cache"]').click();

        const row = inspector.locator('.storageInspectorEntry', { hasText: '/one.txt' }).first();
        await row.locator('.storageInspectorEntryViewButton').click();
        const viewPopup = topActivePopup(page);
        await expect(viewPopup.locator('textarea').first()).toHaveValue(/fake body/);
        await viewPopup.locator('.popup-button-ok').click();

        await row.locator('.storageInspectorEntryDeleteButton').click();
        await confirmTopPopup(page);

        const state = await page.evaluate(async () => {
            const cache = await caches.open('atria-cache');
            return {
                names: await caches.keys(),
                one: Boolean(await cache.match('/one.txt')),
                two: Boolean(await cache.match('/two.txt')),
            };
        });
        expect(state.names).toContain('atria-cache');
        expect(state.one).toBe(false);
        expect(state.two).toBe(true);

        await wipeBrowserFixture(page);
    });
});

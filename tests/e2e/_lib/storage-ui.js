// Storage-backend migration helpers for Playwright E2E specs.
//
// The Admin Panel product surface has been removed. Storage-engine migration
// remains a backend/operator capability, so tests exercise the authenticated
// endpoint directly while continuing to drive the surrounding product flow
// through the real UI.

import { expect } from '@playwright/test';

/**
 * Migrate the active Atria storage backend through the authenticated operator
 * endpoint and wait until /storage/status reports the requested mode.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'fs' | 'sqlite' | 'mysql' | 'postgres'} targetMode
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]
 * @param {object} [opts.dbConfig] Optional { mysql } / { postgres } body fields.
 */
export async function migrateStorageBackend(page, targetMode, { timeoutMs = 60_000, dbConfig = {} } = {}) {
    const response = await page.evaluate(async ({ mode, config }) => {
        const mod = await import('/script.js').catch(() => null);
        const headers = typeof mod?.getRequestHeaders === 'function'
            ? mod.getRequestHeaders()
            : { 'Content-Type': 'application/json' };
        const res = await fetch('/api/users/storage/migrate', {
            method: 'POST',
            headers,
            body: JSON.stringify({ targetMode: mode, ...config }),
        });
        const body = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, body };
    }, { mode: targetMode, config: dbConfig });

    if (!response.ok) {
        throw new Error(
            response.body?.message
            || response.body?.error
            || `storage migration failed: HTTP ${response.status}`,
        );
    }

    await expect.poll(
        async () => (await fetchStorageStatus(page)).currentMode,
        { timeout: timeoutMs },
    ).toBe(targetMode);
}

/**
 * Read the current storage backend through the authenticated operator status
 * endpoint.
 */
export async function fetchStorageStatus(page) {
    return page.evaluate(async () => {
        const mod = await import('/script.js').catch(() => null);
        const headers = typeof mod?.getRequestHeaders === 'function'
            ? mod.getRequestHeaders()
            : { 'Content-Type': 'application/json' };
        const res = await fetch('/api/users/storage/status', { method: 'POST', headers });
        if (!res.ok) throw new Error(`storage/status failed: ${res.status}`);
        return res.json();
    });
}

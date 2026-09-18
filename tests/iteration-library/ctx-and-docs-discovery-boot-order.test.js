/**
 * Boot-order regression test for `ctx-and-docs-discovery.js`.
 *
 * The orchestrator extension loads via SillyTavern's extension activator
 * during boot, which means everything it transitively imports — including
 * `ctx-and-docs-discovery.js` — has to evaluate cleanly under a global
 * `Atria` that may not yet be defined.
 *
 * Original bug (caught by Playwright dry-run): the module called
 * `Atria.getContext()` at module top, throwing `ReferenceError: Atria is
 * not defined` and bricking the entire app (symptom: stuck #preloader +
 * "Failed to initialize Atria application" in console).
 *
 * Fix: defer every `Atria.getContext()` lookup inside the exported async
 * helpers. This test re-loads the module with `globalThis.Atria` deleted
 * so a future module-top `Atria.*` call would resurface the bug.
 */

import { describe, test, expect, jest } from '@jest/globals';

describe('ctx-and-docs-discovery boot order', () => {
    test('module evaluates cleanly when global Atria is missing at import time', async () => {
        const prior = globalThis.Atria;
        // eslint-disable-next-line no-undef
        delete globalThis.Atria;
        // Use jest.isolateModulesAsync to get a fresh module registry so
        // the import re-evaluates module-top code under the missing-Atria
        // condition. Falls back to a direct dynamic import with a cache-
        // busting query when isolateModulesAsync is unavailable.
        let mod;
        try {
            await jest.isolateModulesAsync(async () => {
                mod = await import('../../public/scripts/iteration-library/tools/ctx-and-docs-discovery.js');
            });
        } catch (e) {
            // Restore before failing so other tests aren't affected.
            if (prior !== undefined) globalThis.Atria = prior;
            throw new Error(`Module evaluation threw without Atria present — this would brick app boot. Original error: ${e?.message || e}`);
        }
        // Restore for any subsequent tests.
        if (prior !== undefined) globalThis.Atria = prior;
        expect(typeof mod.listCtxKeys).toBe('function');
        expect(typeof mod.describeCtxPath).toBe('function');
        expect(typeof mod.listAtriaDocs).toBe('function');
        expect(typeof mod.readAtriaDoc).toBe('function');
    });

    test('executors that need Atria only call it when invoked (not at import)', async () => {
        // Re-import under a deleted-Atria context and confirm that simply
        // having the module loaded does NOT trigger Atria.getContext().
        // The actual call happens only inside the exported async helpers.
        const prior = globalThis.Atria;
        // eslint-disable-next-line no-undef
        delete globalThis.Atria;
        let mod;
        await jest.isolateModulesAsync(async () => {
            mod = await import('../../public/scripts/iteration-library/tools/ctx-and-docs-discovery.js');
        });
        // Now provide Atria before calling the helper.
        globalThis.Atria = {
            getContext: () => ({
                chat: [],
                getRequestHeaders: () => ({}),
            }),
        };
        const out = await mod.listCtxKeys({});
        expect(out.ok).toBe(true);
        // Cleanup.
        if (prior !== undefined) globalThis.Atria = prior;
        else delete globalThis.Atria;
    });
});

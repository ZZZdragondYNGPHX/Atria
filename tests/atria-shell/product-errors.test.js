/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { nativeProductClient } from '../../public/scripts/native/product-client.js';
import { libraryError, feedback } from '../../public/scripts/native/library-ui.js';
import { sanitizeProductDetails } from '../../public/scripts/native/product-error-details.js';

afterEach(() => { delete globalThis.fetch; document.body.replaceChildren(); });
test('Product client and Library preserve actionable deletion blockers without raw payloads', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: 'native_world_project_referenced', details: {
        worldId: 'world_example', references: [{ kind: 'studio-project', projectId: 'project_example', secret: 'hidden', revisions: ['r1'] }], stack: 'private stack', apiKey: 'private key',
    } }) }));
    const error = await nativeProductClient.deleteWorld('world_example').catch(error => error);
    expect(error.code).toBe('native_world_project_referenced');
    expect(error.details.references).toEqual([{ kind: 'studio-project', projectId: 'project_example', revisions: ['r1'] }]);
    expect(libraryError(error)).toContain('Review the listed references');
    expect(libraryError(error)).not.toContain('project_example');
    expect(error.message).not.toMatch(/hidden|private/);
    const alert = feedback(document, document.body, libraryError(error), true);
    expect(document.activeElement).toBe(alert);
});

test('known dependency and field failures remain actionable and unknown responses use safe status guidance', async () => {
    for (const [code, status, detail, expected] of [
        ['native_save_package_missing', 500, { packageVersionId: 'exact_version' }, 'Install the exact Package version'],
        ['native_product_invalid_request', 400, { field: 'displayName' }, 'displayName'],
        ['native_package_permission_required', 500, { permissions: ['network'] }, 'explicitly grant'],
        ['storage_read_only', 500, {}, 'Restore write access'],
        ['<unsafe>', 401, undefined, 'Sign in again'],
    ]) {
        globalThis.fetch = jest.fn(async () => ({ ok: false, status, json: async () => ({ error: code, details: detail, message: 'private exception' }) }));
        const error = await nativeProductClient.listWorks().catch(error => error);
        expect(error.message).toContain(expected); expect(error.message).not.toContain('private exception');
    }
});

test('detail contract bounds untrusted nested payloads and strips markup/control characters', () => {
    const safe = sanitizeProductDetails({ field: '<script>\u0000displayName', references: Array.from({ length: 40 }, () => ({ projectId: 'p'.repeat(1000), password: 'hidden', body: '<script>' })) });
    expect(safe.field).toBe('scriptdisplayName'); expect(safe.references).toHaveLength(20);
    expect(safe.references[0]).toEqual({ projectId: 'p'.repeat(256) });
});

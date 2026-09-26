import { describe, expect, jest, test } from '@jest/globals';

import {
    GAME_PACKAGE_STATUS,
    loadGamePackageJsonResource,
    loadNativeGamePackage,
} from '../../public/scripts/native/experience/package-loader.js';

function response({ status = 200, body = null, text = null, jsonError = null } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            if (jsonError) throw jsonError;
            return structuredClone(body);
        },
        async text() {
            return text ?? JSON.stringify(body);
        },
    };
}

const descriptor = {
    format: 'atria-native-runtime-descriptor',
    schemaVersion: 1,
    packageId: 'package_0123456789abcdef0123456789abcdef',
    packageVersionId: 'packageVersion_0123456789abcdef0123456789abcdef',
    packageContentHash: 'a'.repeat(64),
    entryPointId: 'entryPoint_0123456789abcdef0123456789abcdef',
    experience: { mode: 'text' },
    capabilities: ['game-runtime'],
    resources: [],
    plugins: [],
    skills: [],
};

describe('A3 Native Game Runtime loader', () => {
    test.each([
        { schemaVersion: 1, capabilities: [{ id: 'workflow', version: 1, required: true }], dataResources: [] },
        { schemaVersion: 1, capabilities: [{ id: 'unknown', version: 1, required: false }], dataResources: [] },
        { schemaVersion: 1, capabilities: [], dataResources: [], script: 'main.js' },
        { schemaVersion: 2, capabilities: [], dataResources: [] },
    ])('P0 fails closed before activation for invalid or unsupported contract %#', async experienceContract => {
        const fetchImpl = jest.fn(async () => response({ body: {
            descriptor: { ...descriptor, experienceContract }, runtime: { experience: { mode: 'text' } },
        } }));
        const result = await loadNativeGamePackage('session_current', { fetchImpl });
        expect(result.active).toBe(false);
        expect(result.status).toBe(GAME_PACKAGE_STATUS.ERROR);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('P0 retains optional reserved capability metadata without granting it', async () => {
        const experienceContract = { schemaVersion: 1, capabilities: [{ id: 'workflow', version: 1, required: false }], dataResources: [] };
        const fetchImpl = jest.fn(async () => response({ body: {
            descriptor: { ...descriptor, experienceContract }, runtime: { experience: { mode: 'text' } },
        } }));
        const result = await loadNativeGamePackage('session_current', { fetchImpl });
        expect(result.status).toBe(GAME_PACKAGE_STATUS.READY);
        expect(result.descriptor.experienceContract).toEqual(experienceContract);
        expect(result.runtime).not.toHaveProperty('workflow');
    });

    test('does not activate without an active Native Session identity', async () => {
        const fetchImpl = jest.fn();
        const result = await loadNativeGamePackage('', { fetchImpl });
        expect(result).toEqual({
            status: GAME_PACKAGE_STATUS.NONE,
            active: false,
            sessionId: '',
            descriptor: null,
            runtime: null,
            errors: [],
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('resolves Text Experience through Native Session runtime API', async () => {
        const fetchImpl = jest.fn(async () => response({
            body: {
                descriptor,
                runtime: {
                    experience: { mode: 'text' },
                    game: { logic: 'logic/main.json' },
                    primaryWorldId: null,
                },
            },
        }));
        const result = await loadNativeGamePackage('session_current', {
            fetchImpl,
            headers: { 'x-test': '1' },
        });

        expect(result.status).toBe(GAME_PACKAGE_STATUS.READY);
        expect(result.active).toBe(true);
        expect(result.descriptor).toEqual(descriptor);
        expect(fetchImpl).toHaveBeenCalledWith('/api/native/session/runtime/resolve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-test': '1',
            },
            body: JSON.stringify({ sessionId: 'session_current' }),
            cache: 'no-store',
        });
    });

    test('activates non-Text descriptors in A4 without changing Native identity', async () => {
        const componentDescriptor = {
            ...descriptor,
            experience: { mode: 'component', componentModelVersion: 1 },
        };
        const fetchImpl = jest.fn(async () => response({
            body: {
                descriptor: componentDescriptor,
                runtime: {
                    experience: {
                        mode: 'component',
                        componentModelVersion: 1,
                        component: 'ui/main.json',
                        surface: 'app.root',
                    },
                    game: {},
                    primaryWorldId: null,
                },
            },
        }));
        const result = await loadNativeGamePackage('session_component', { fetchImpl });
        expect(result.status).toBe(GAME_PACKAGE_STATUS.READY);
        expect(result.active).toBe(true);
        expect(result.descriptor.entryPointId).toBe(descriptor.entryPointId);
    });

    test('loads declarative resources from the exact Session-bound PackageVersion', async () => {
        const fetchImpl = jest.fn(async () => response({
            body: { commands: [], reducers: [] },
        }));
        const body = await loadGamePackageJsonResource(
            { sessionId: 'session_current' },
            'logic/main.json',
            { fetchImpl },
        );
        expect(body).toEqual({ commands: [], reducers: [] });
        expect(fetchImpl).toHaveBeenCalledWith('/api/native/session/runtime/resource', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'session_current',
                path: 'logic/main.json',
            }),
            cache: 'no-store',
        });
    });

    test('reports Native runtime transport failure without any CardApp fallback', async () => {
        const fetchImpl = jest.fn(async () => response({
            status: 404,
            body: { error: 'native_session_failed' },
        }));
        const result = await loadNativeGamePackage('session_missing', { fetchImpl });
        expect(result.status).toBe(GAME_PACKAGE_STATUS.ERROR);
        expect(result.active).toBe(false);
        expect(result.errors.join('\n')).toContain('runtime/resolve failed');
        expect(fetchImpl.mock.calls.flat().join(' ')).not.toContain('/api/card-app/');
    });
});

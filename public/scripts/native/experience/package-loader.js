import { assertSupportedExperienceContract } from '../../../shared/native-experience-contract.js';

export const GAME_PACKAGE_STATUS = Object.freeze({
    NONE: 'none',
    READY: 'ready',
    INVALID: 'invalid',
    ERROR: 'error',
});

function sessionIdOf(value) {
    const sessionId = String(
        typeof value === 'string'
            ? value
            : value?.sessionId ?? value?.session?.sessionId ?? '',
    ).trim();
    if (!sessionId) throw new Error('Native Game Runtime requires an active Session identity');
    return sessionId;
}

function requestHeaders(headers = {}) {
    return {
        'Content-Type': 'application/json',
        ...headers,
    };
}

async function postJson(path, body, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('Native Game Runtime has no fetch implementation');
    const response = await fetchImpl('/api/native/session/' + path, {
        method: 'POST',
        headers: requestHeaders(options.headers || {}),
        body: JSON.stringify(body),
        cache: 'no-store',
    });
    if (!response?.ok) {
        let payload = null;
        try { payload = await response.json(); } catch { /* optional error body */ }
        const error = new Error(
            'Native Game Runtime ' + path + ' failed: HTTP ' + String(response?.status ?? 'unknown'),
        );
        error.code = payload?.error || 'native_game_runtime_request_failed';
        error.status = response?.status ?? 0;
        throw error;
    }
    return response;
}

export async function loadNativeGamePackage(session, options = {}) {
    let sessionId;
    try {
        sessionId = sessionIdOf(session);
    } catch {
        return Object.freeze({
            status: GAME_PACKAGE_STATUS.NONE,
            active: false,
            sessionId: '',
            descriptor: null,
            runtime: null,
            errors: [],
        });
    }

    try {
        const response = await postJson('runtime/resolve', { sessionId }, options);
        const body = await response.json();
        const descriptor = body?.descriptor;
        const runtime = body?.runtime;
        if (
            !descriptor
            || descriptor.format !== 'atria-native-runtime-descriptor'
            || descriptor.sessionId !== undefined
            || descriptor.entryPointId == null
            || runtime?.experience?.mode !== descriptor.experience?.mode
        ) {
            return Object.freeze({
                status: GAME_PACKAGE_STATUS.INVALID,
                active: false,
                sessionId,
                descriptor: null,
                runtime: null,
                errors: ['Native Runtime Descriptor response is invalid'],
            });
        }

        if (descriptor.experienceContract !== undefined) {
            assertSupportedExperienceContract(descriptor.experienceContract);
        }

        return Object.freeze({
            status: GAME_PACKAGE_STATUS.READY,
            // A4 activates every explicit Native Experience through the same
            // Session-bound Runtime Descriptor authority.
            active: ['text', 'component', 'hybrid', 'full'].includes(descriptor.experience.mode),
            sessionId,
            descriptor: Object.freeze(structuredClone(descriptor)),
            runtime: Object.freeze(structuredClone(runtime)),
            errors: [],
        });
    } catch (error) {
        return Object.freeze({
            status: GAME_PACKAGE_STATUS.ERROR,
            active: false,
            sessionId,
            descriptor: null,
            runtime: null,
            errors: [error?.message || String(error)],
        });
    }
}

export async function loadGamePackageTextResource(packageState, relativePath, options = {}) {
    const sessionId = sessionIdOf(packageState);
    const path = String(relativePath || '').trim();
    const response = await postJson('runtime/resource', { sessionId, path }, options);
    if (typeof response.text !== 'function') {
        throw new Error('Native Game Runtime resource did not provide text content');
    }
    return response.text();
}

export async function loadGamePackageJsonResource(packageState, relativePath, options = {}) {
    const sessionId = sessionIdOf(packageState);
    const path = String(relativePath || '').trim();
    const response = await postJson('runtime/resource', { sessionId, path }, options);
    try {
        return await response.json();
    } catch (error) {
        throw new Error(
            'Native Game Runtime resource ' + path + ' is not valid JSON: '
            + (error?.message || String(error)),
        );
    }
}

export async function loadExperienceData(packageState, options = {}) {
    const entries = packageState.descriptor?.experienceContract?.dataResources || [];
    const result = {};
    const names = new Set(entries.map(ref => ref.resourceId));
    for (const ref of entries) {
        const response = await postJson('runtime/resource', { sessionId: sessionIdOf(packageState), resourceId: ref.resourceId }, options);
        const path = ref.resourceId.split('.'); let target = result;
        for (const segment of path) if (!segment || ['__proto__', 'constructor', 'prototype'].includes(segment)) throw new Error('Unsafe Package Data identifier');
        for (let index = 0; index < path.length - 1; index++) {
            const segment = path[index];
            if (!segment || names.has(path.slice(0, index + 1).join('.'))) throw new Error('Overlapping Package Data identifiers');
            target[segment] ??= {}; target = target[segment];
        }
        if (Object.hasOwn(target, path.at(-1))) throw new Error('Overlapping Package Data identifiers');
        target[path.at(-1)] = await response.json();
    }
    return result;
}

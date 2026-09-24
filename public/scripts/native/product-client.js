import { createNativeProductError } from './product-errors.js';

function requestHeaders() {
    const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() || {};
    return {
        ...headers,
        'Content-Type': 'application/json',
    };
}

async function request(path, { method = 'GET', body = undefined } = {}) {
    const response = await fetch('/api/native/product/' + String(path || '').replace(/^\/+/, ''), {
        method,
        headers: requestHeaders(),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }
    if (!response.ok) {
        throw createNativeProductError(payload?.error, response.status, payload?.details);
    }
    return payload;
}

function encode(value) {
    return encodeURIComponent(String(value));
}

export const nativeProductClient = Object.freeze({
    listWorks: () => request('works'),
    getWork: packageId => request(`works/${encode(packageId)}`),
    startWork: (packageId, options = {}) => request(`works/${encode(packageId)}/start`, {
        method: 'POST',
        body: options,
    }),
    deleteWork: packageId => request(`works/${encode(packageId)}`, { method: 'DELETE' }),

    preflightPackage: data => request('packages/preflight', {
        method: 'POST',
        body: { data },
    }),
    installPackage: (data, grantedPermissions = []) => request('packages/install', {
        method: 'POST',
        body: { data, grantedPermissions },
    }),

    listWorlds: () => request('worlds'),
    createWorld: displayName => request('worlds', { method: 'POST', body: { displayName } }),
    getWorld: worldId => request(`worlds/${encode(worldId)}`),
    updateWorld: (worldId, displayName) => request(`worlds/${encode(worldId)}`, {
        method: 'PUT',
        body: { displayName },
    }),
    deleteWorld: worldId => request(`worlds/${encode(worldId)}`, { method: 'DELETE' }),

    listKnowledge: () => request('knowledge'),
    createKnowledge: displayName => request('knowledge', { method: 'POST', body: { displayName } }),
    getKnowledge: (knowledgeBaseId, revisionId = null) => request(
        `knowledge/${encode(knowledgeBaseId)}${revisionId ? `?revisionId=${encode(revisionId)}` : ''}`,
    ),
    updateKnowledge: (knowledgeBaseId, displayName) => request(`knowledge/${encode(knowledgeBaseId)}`, {
        method: 'PUT',
        body: { displayName },
    }),
    deleteKnowledge: knowledgeBaseId => request(`knowledge/${encode(knowledgeBaseId)}`, { method: 'DELETE' }),

    preflightSave: data => request('saves/preflight', {
        method: 'POST',
        body: { data },
    }),
    importSave: (data, password = undefined) => request('saves/import', {
        method: 'POST',
        body: { data, ...(password === undefined ? {} : { password }) },
    }),

    listSessions: packageId => request(`sessions${packageId ? `?packageId=${encode(packageId)}` : ''}`),
    getSession: sessionId => request(`sessions/${encode(sessionId)}`),
    exportSession: (sessionId, password = undefined) => request(`sessions/${encode(sessionId)}/export`, {
        method: 'POST',
        body: { ...(password === undefined ? {} : { password }) },
    }),
    exportSave: (sessionId, saveId, password = undefined) => request(
        `sessions/${encode(sessionId)}/saves/${encode(saveId)}/export`,
        {
            method: 'POST',
            body: { ...(password === undefined ? {} : { password }) },
        },
    ),
    createSave: (sessionId, options = {}) => request(`sessions/${encode(sessionId)}/save`, {
        method: 'POST',
        body: options,
    }),
    loadSave: (sessionId, saveId, expectedRevisionId) => request(`sessions/${encode(sessionId)}/load`, {
        method: 'POST',
        body: { saveId, expectedRevisionId },
    }),
    promoteKnowledge: (sessionId, options) => request(`sessions/${encode(sessionId)}/promote-knowledge`, {
        method: 'POST',
        body: options,
    }),
    deleteSession: sessionId => request(`sessions/${encode(sessionId)}`, { method: 'DELETE' }),

    listProjects: () => request('projects'),
    getProject: projectId => request(`projects/${encode(projectId)}`),
    createProject: source => request('projects', { method: 'POST', body: source }),
    updateProjectDependencies: (projectId, dependencies) => request(`projects/${encode(projectId)}/dependencies`, {
        method: 'PUT',
        body: { dependencies },
    }),
    deleteProject: projectId => request(`projects/${encode(projectId)}`, { method: 'DELETE' }),
});

export function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
    }
    return btoa(binary);
}

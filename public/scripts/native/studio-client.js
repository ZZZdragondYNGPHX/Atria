import { createNativeProductError } from './product-errors.js';

function requestHeaders() {
    const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() || {};
    return {
        ...headers,
        'Content-Type': 'application/json',
    };
}

async function request(path, { method = 'GET', body = undefined, responseType = 'json' } = {}) {
    const response = await fetch('/api/native/studio/' + String(path || '').replace(/^\/+/, ''), {
        method,
        headers: requestHeaders(),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    let payload = null;
    if (responseType === 'json') {
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }
    } else {
        payload = await response.arrayBuffer();
    }

    if (!response.ok) {
        const error = createNativeProductError(payload?.error || 'native_studio_request_failed', response.status, payload?.details);
        error.status = response.status;
        error.code = payload?.error || 'native_studio_request_failed';
        error.details = payload?.details;
        throw error;
    }
    return payload;
}

function encode(value) {
    return encodeURIComponent(String(value));
}

function query(values) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(values || {})) {
        if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    }
    const text = search.toString();
    return text ? '?' + text : '';
}

export const nativeStudioClient = Object.freeze({
    listProjects: ({ summary = false } = {}) => request('projects' + (summary ? '?summary=true' : '')),
    createProject: source => request('projects', { method: 'POST', body: { source } }),
    getProject: projectId => request(`projects/${encode(projectId)}`),
    deleteProject: (projectId, baseRevision) => request(`projects/${encode(projectId)}`, { method: 'DELETE', body: { baseRevision } }),
    getRevision: projectId => request(`projects/${encode(projectId)}/revision`),
    listSources: projectId => request(`projects/${encode(projectId)}/sources`),
    readSource: (projectId, path) => request(`projects/${encode(projectId)}/source${query({ path })}`),

    getPackageLibraryResource: ref => request('resources/package-original', { method: 'POST', body: { ref } }),
    deleteLibraryRevision: ref => request('library/resources/revisions', { method: 'DELETE', body: { ref } }),
    exportResourceBundle: ref => request('resources/bundle/export', { method: 'POST', body: { ref } }),
    preflightResourceBundle: (bundle, token) => request('resources/bundle/preflight', { method: 'POST', body: { bundle, token } }),
    importResourceBundle: (bundle, token) => request('resources/bundle/import', { method: 'POST', body: { bundle, token } }),
    getResourceRegistry: () => request('resources/registry'),
    prepareOperation: (projectId, operation) => request(`projects/${encode(projectId)}/operations/prepare`, { method: 'POST', body: operation }),
    listLibraryResources: options => request('library/resources' + query(options)),
    getResourceGraph: () => request('resources/graph'),
    queryResources: options => request('resources' + query(options)),
    getResourceReferences: (reference, { reverse = false } = {}) => request('resources/references', {
        method: 'POST',
        body: { ...reference, reverse },
    }),
    inspectResourceDelete: reference => request('resources/delete-safety', {
        method: 'POST',
        body: reference,
    }),
    resolveResourceClosure: projectId => request(`projects/${encode(projectId)}/resources/closure`),

    listAgentTasks: projectId => request(`projects/${encode(projectId)}/agent/tasks`),
    createAgentTask: (projectId, body) => request(`projects/${encode(projectId)}/agent/tasks`, {
        method: 'POST',
        body,
    }),
    getAgentTask: (projectId, taskId) => request(
        `projects/${encode(projectId)}/agent/tasks/${encode(taskId)}`,
    ),
    getAgentContext: (projectId, taskId) => request(
        `projects/${encode(projectId)}/agent/tasks/${encode(taskId)}/context`,
    ),
    executeAgentTool: (projectId, taskId, body) => request(
        `projects/${encode(projectId)}/agent/tasks/${encode(taskId)}/tool`,
        { method: 'POST', body },
    ),
    commitAgentTask: (projectId, taskId) => request(
        `projects/${encode(projectId)}/agent/tasks/${encode(taskId)}/commit`,
        { method: 'POST', body: {} },
    ),
    takeOverAgentTask: (projectId, taskId) => request(
        `projects/${encode(projectId)}/agent/tasks/${encode(taskId)}/takeover`,
        { method: 'POST', body: {} },
    ),

    inspectWorkspace: (projectId, workspace) => request(`projects/${encode(projectId)}/workspaces/inspect`, {
        method: 'POST',
        body: workspace,
    }),
    executeWorkspace: (projectId, workspace) => request(`projects/${encode(projectId)}/workspaces/execute`, {
        method: 'POST',
        body: workspace,
    }),
    attachResource: (projectId, body) => request(`projects/${encode(projectId)}/resources/attach`, {
        method: 'POST',
        body,
    }),
    forkResource: (projectId, body) => request(`projects/${encode(projectId)}/resources/fork`, {
        method: 'POST',
        body,
    }),
    updateResource: (projectId, body) => request(`projects/${encode(projectId)}/resources/update`, {
        method: 'POST',
        body,
    }),

    validateProject: projectId => request(`projects/${encode(projectId)}/validate`, { method: 'POST', body: {} }),
    history: (projectId, limit = 50) => request(`projects/${encode(projectId)}/history${query({ limit })}`),
    diff: (projectId, revision) => request(`projects/${encode(projectId)}/history/${encode(revision)}/diff`),
    preflight: (projectId, baseRevision) => request(`projects/${encode(projectId)}/preflight`, {
        method: 'POST',
        body: { baseRevision },
    }),
    build: (projectId, baseRevision) => request(`projects/${encode(projectId)}/build`, {
        method: 'POST',
        body: { baseRevision },
    }),
    preview: (projectId, body) => request(`projects/${encode(projectId)}/preview`, {
        method: 'POST',
        body,
    }),
    simulate: (projectId, body) => request(`projects/${encode(projectId)}/simulate`, {
        method: 'POST',
        body,
    }),
    listPreviews: projectId => request('previews' + query({ projectId })),
    closePreview: previewId => request(`previews/${encode(previewId)}`, { method: 'DELETE' }),
});

export { request as requestNativeStudio };

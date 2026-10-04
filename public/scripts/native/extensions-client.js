const listeners = new Set();
export function onExtensionsChanged(listener) { listeners.add(listener); return () => listeners.delete(listener); }

export async function extensionsRequest(path, { method = 'GET', body, signal } = {}) {
    const response = await fetch('/api/native/extensions' + path, {
        method, signal, headers: { ...globalThis.Atria?.getContext?.()?.getRequestHeaders?.(), 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error || 'Extension request failed'), { status: response.status });
    if (method !== 'GET') for (const listener of listeners) {
        try { listener({ path, id: payload.id, ...(path === '/official/illustration' ? { enabled: payload.value.enabled } : {}) }); } catch (error) { console.warn('[Atria Extensions] observer failed', error); }
    }
    return payload;
}

export const nativeExtensionsClient = Object.freeze({
    list: () => extensionsRequest('/plugins'),
    get: id => extensionsRequest('/plugins/' + encodeURIComponent(id)),
    save: (value, expectedRevision = null) => extensionsRequest('/plugins', { method: 'POST', body: { value, expectedRevision } }),
    remove: (id, expectedRevision) => extensionsRequest('/plugins/' + encodeURIComponent(id), { method: 'DELETE', body: { expectedRevision } }),
    install: (url, { id, expectedRevision } = {}) => extensionsRequest('/install', { method: 'POST', body: { url, id, expectedRevision } }),
});

export function extensionFileUrl(plugin, path = plugin.entrypoint) {
    if (plugin.id === 'atri_official_illustration' && plugin.kind === 'official' && path === 'official-illustration.js') return '/scripts/native/official-illustration.js';
    if (typeof path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(path) || path.split('/').some(part => !part || ['.', '..', '.git'].includes(part))) throw new TypeError('Invalid extension file path');
    return '/api/native/extensions/files/' + encodeURIComponent(plugin.id) + '/' + encodeURIComponent(plugin.revision) + '/' + path;
}

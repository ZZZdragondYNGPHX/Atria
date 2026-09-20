import { frontendLogStore } from './logger.js';
import { redactText } from './redact.js';

let installedWindow = null;

function inferModuleFromFilename(filename) {
    const path = String(filename || '').replaceAll('\\', '/').toLowerCase();
    if (path.includes('/extensions/orchestrator/')) return 'orchestrator';
    if (path.includes('/extensions/memory-graph/')) return 'memory';
    if (path.includes('/world-info/')) return 'worldbook';
    if (path.includes('/regex')) return 'regex';
    if (path.includes('/editor')) return 'editor';
    if (path.includes('/studio')) return 'studio';
    if (path.includes('/extensions/')) return 'extensions';
    return 'system';
}

export function installFrontendErrorAdapter({ store = frontendLogStore, windowObject = globalThis.window } = {}) {
    if (!windowObject || installedWindow === windowObject) return;
    installedWindow = windowObject;
    windowObject.addEventListener('error', event => {
        try {
            const filename = String(event.filename || '');
            const message = redactText(event.message || event.error?.message || 'Unhandled frontend error');
            store.append({
                level: 'error',
                module: inferModuleFromFilename(filename),
                category: 'exception',
                event: 'global.error',
                message,
                data: {
                    filename,
                    line: Number(event.lineno || 0),
                    column: Number(event.colno || 0),
                    stack: event.error?.stack || '',
                },
                source: 'window-error',
            });
        } catch {
            // Diagnostics must not interfere with the browser error path.
        }
    });
    windowObject.addEventListener('unhandledrejection', event => {
        try {
            const reason = event.reason;
            const message = redactText(reason?.message || reason || 'Unhandled promise rejection');
            store.append({
                level: 'error',
                module: 'system',
                category: 'promise',
                event: 'global.unhandled-rejection',
                message: `Unhandled promise rejection: ${message}`,
                data: {
                    name: String(reason?.name || ''),
                    stack: reason?.stack || '',
                },
                source: 'promise-rejection',
            });
        } catch {
            // Diagnostics must not interfere with rejection handling.
        }
    });
}

export const __frontendErrorAdapterTestUtils = Object.freeze({
    inferModuleFromFilename,
});

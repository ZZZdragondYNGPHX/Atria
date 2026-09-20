import { frontendLogStore } from './logger.js';
import { redactText } from './redact.js';
import { attributeFrontendOwnership } from './ownership.js';
import { captureFrontendIncident } from './incident-reporter.js';

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
            const module = inferModuleFromFilename(filename);
            const stack = event.error?.stack || '';
            const entry = store.append({
                level: 'error',
                module,
                category: 'exception',
                event: 'global.error',
                message,
                data: {
                    filename,
                    line: Number(event.lineno || 0),
                    column: Number(event.colno || 0),
                    stack,
                },
                source: 'window-error',
            });
            const ownership = attributeFrontendOwnership({ stack });
            void captureFrontendIncident({
                type: ownership.probableOwner === 'third-party-extension' ? 'extension_runtime_failure' : 'unhandled_frontend_error',
                primaryModule: module,
                stage: 'global.error',
                summary: message,
                failure: event.error || { message, stack },
                ownership,
                correlation: entry?.correlation || {},
                provenance: ownership.probableOwner === 'third-party-extension'
                    ? { type: 'extension', name: ownership.ownerName, displayName: ownership.ownerName }
                    : {},
            });
        } catch {
            // Diagnostics must not interfere with the browser error path.
        }
    });
    windowObject.addEventListener('unhandledrejection', event => {
        try {
            const reason = event.reason;
            const message = redactText(reason?.message || reason || 'Unhandled promise rejection');
            const stack = reason?.stack || '';
            const ownership = attributeFrontendOwnership({ stack });
            const module = ownership.probableOwner === 'third-party-extension' ? 'extensions' : 'system';
            const entry = store.append({
                level: 'error',
                module,
                category: 'promise',
                event: 'global.unhandled-rejection',
                message: `Unhandled promise rejection: ${message}`,
                data: {
                    name: String(reason?.name || ''),
                    stack,
                },
                source: 'promise-rejection',
            });
            void captureFrontendIncident({
                type: ownership.probableOwner === 'third-party-extension' ? 'extension_runtime_failure' : 'unhandled_frontend_error',
                primaryModule: module,
                stage: 'global.unhandled-rejection',
                summary: message,
                failure: reason instanceof Error ? reason : { message, stack },
                ownership,
                correlation: entry?.correlation || {},
                provenance: ownership.probableOwner === 'third-party-extension'
                    ? { type: 'extension', name: ownership.ownerName, displayName: ownership.ownerName }
                    : {},
            });
        } catch {
            // Diagnostics must not interfere with rejection handling.
        }
    });
}

export const __frontendErrorAdapterTestUtils = Object.freeze({
    inferModuleFromFilename,
});

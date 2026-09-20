import {
    installFrontendConsoleAdapter,
    isFrontendConsoleDebugLoggingEnabled,
    setFrontendConsoleDebugLoggingEnabled,
} from './logging/console-adapter.js';
import { installFrontendErrorAdapter } from './logging/error-adapter.js';
import { installFrontendFetchAdapter } from './logging/fetch-adapter.js';
import { frontendLogStore } from './logging/logger.js';

let installed = false;

/**
 * Compatibility facade for callers that still import frontend-log-manager.
 * Storage and adapters live under public/scripts/logging/.
 */
export function installFrontendLogCapture() {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    installFrontendConsoleAdapter();
    installFrontendFetchAdapter();
    installFrontendErrorAdapter();
}

export { setFrontendConsoleDebugLoggingEnabled, isFrontendConsoleDebugLoggingEnabled };

export function getFrontendLogsSnapshot(options = {}) {
    return frontendLogStore.query({
        ...options,
        text: options.text ?? options.searchTerm,
    });
}

export function clearFrontendLogs() {
    frontendLogStore.clear();
}

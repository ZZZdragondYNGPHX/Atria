import {
    isFrontendConsoleDebugLoggingEnabled,
    setFrontendConsoleDebugLoggingEnabled,
} from './logging/console-adapter.js';
import { installFrontendLogging } from './logging/bootstrap.js';
import { frontendLogStore } from './logging/logger.js';

/**
 * Stable compatibility shim for third-party/upstream imports.
 * Atria-owned code imports modules under scripts/logging/ directly.
 */
export function installFrontendLogCapture() {
    installFrontendLogging();
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

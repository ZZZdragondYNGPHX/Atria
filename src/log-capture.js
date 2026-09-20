import { installConsoleAdapter } from './logging/console-adapter.js';
import { backendLogStore } from './logging/store.js';

/**
 * Compatibility facade for the old backend log viewer API.
 * The canonical source of truth is src/logging/store.js.
 */
export function installLogCapture() {
    installConsoleAdapter();
}

export function clearCapturedLogs() {
    backendLogStore.clear();
}

export function getCapturedLogs(options = {}) {
    return backendLogStore.query({
        ...options,
        text: options.text ?? options.searchTerm,
    });
}

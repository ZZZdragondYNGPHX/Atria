import { installFrontendConsoleAdapter } from './console-adapter.js';
import { installFrontendErrorAdapter } from './error-adapter.js';
import { installFrontendFetchAdapter } from './fetch-adapter.js';

let installed = false;

export function installFrontendLogging() {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    installFrontendConsoleAdapter();
    installFrontendFetchAdapter();
    installFrontendErrorAdapter();
}

export function isFrontendLoggingInstalled() {
    return installed;
}

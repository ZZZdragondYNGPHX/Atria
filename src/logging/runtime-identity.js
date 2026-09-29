import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { serverDirectory } from '../server-directory.js';
import { getCurrentServerStartupSnapshot, serverBootId } from './startup-store.js';
import { captureSourceIdentity } from './source-identity.js';

let startupIdentity;
let initialization;

// Called by the launcher before server-main is imported. Never recompute from
// the checkout on an HTTP request: those bytes may no longer be startup bytes.
export function initializeRuntimeIdentity() {
    initialization ??= (async () => {
        let appVersion = null;
        try { appVersion = JSON.parse(await readFile(path.join(serverDirectory, 'package.json'), 'utf8')).version; } catch { /* reported as unavailable */ }
        startupIdentity = { version: 1, serverBootId, mutationGuards: 1, processStartedAt: getCurrentServerStartupSnapshot().createdAt,
            appVersion, source: await captureSourceIdentity(serverDirectory) };
    })();
    return initialization;
}

export function getRuntimeIdentity() {
    return structuredClone(startupIdentity ?? { version: 1, serverBootId,
        processStartedAt: getCurrentServerStartupSnapshot().createdAt, appVersion: null,
        source: { algorithm: 'atria-source-v1', revision: null, branch: null, workspaceId: null, fingerprint: null, reasons: ['startup_identity_not_captured'] } });
}

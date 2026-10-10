import { contentSha256 } from '../../../../shared/content-sha256.js';

// The accepted profile is cloned by the original run consumer after this read.
// A second browser cannot silently restore an obsolete Host publication.
export function createWorkspaceHostRefresh(settings, read) {
    let revision = settings.agentWorkspaceRevision || 0;
    let accepted = contentSha256(JSON.stringify(settings.agentWorkspace));
    let pending = null;
    return async () => {
        if (pending) return pending;
        pending = (async () => {
            const next = await read();
            if (next.revision !== revision) {
                if (contentSha256(JSON.stringify(settings.agentWorkspace)) !== accepted) throw new Error('Workspace changed locally and on the Host; reload before running');
                if (!next.library) throw new Error('Host Workspace is unavailable');
                settings.agentWorkspace = structuredClone(next.library);
                settings.agentWorkspaceRevision = next.revision;
                revision = next.revision;
            }
            accepted = contentSha256(JSON.stringify(settings.agentWorkspace));
        })();
        try { await pending; } finally { pending = null; }
    };
}

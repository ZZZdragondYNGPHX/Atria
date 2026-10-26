import { compilePinnedTaskLogic } from '../task-authority.js';
import { readPackagePayload } from '../package-payload-cache.js';

// Link bindings against the exact entrypoint's declarative catalog, at Build,
// install and runtime. Frontend source never supplies its own authority schema.
export function frontendTransactions(manifest, owner, files) {
    const contract = manifest.runtime?.experienceContract;
    if (!contract?.authorityRuntime) return [];
    const path = owner?.runtime?.game?.logic ?? manifest.runtime?.game?.logic;
    const bytes = readPackagePayload(files, path);
    if (!bytes || bytes.length > 2 * 1024 * 1024) throw new TypeError('Pinned Transaction logic required');
    return compilePinnedTaskLogic(bytes, {}, contract).logic.transactions.filter(item => item.origin !== 'simulation');
}

import { compileDeclarativeLogic } from '../../../public/scripts/native/experience/logic/declarative.js';

// Link bindings against the exact entrypoint's declarative catalog, at Build,
// install and runtime. Frontend source never supplies its own authority schema.
export function frontendTransactions(manifest, owner, files) {
    const contract = manifest.runtime?.experienceContract;
    if (!contract?.authorityRuntime) return [];
    const path = owner?.runtime?.game?.logic ?? manifest.runtime?.game?.logic;
    const bytes = files.get(path);
    if (!bytes || bytes.length > 2 * 1024 * 1024) throw new TypeError('Pinned Transaction logic required');
    return compileDeclarativeLogic(JSON.parse(bytes.toString('utf8')), { data: {}, experienceContract: contract }).transactions;
}

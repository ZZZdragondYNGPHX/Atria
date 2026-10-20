import { hashNativeDocument } from './repositories/common.js';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { lowerDeclarativeMutations } from '../../public/scripts/native/experience/logic/mutations.js';

// A reference records coverage by an existing immutable Work rule. It neither
// compiles prose nor adds a new validator or action to that rule.
export function lawExecutionDigest(logic, contract) {
    return hashNativeDocument({ logic, contract: contract ?? null });
}

export function readLawMechanisms(manifest, files) {
    const contract = manifest.runtime?.experienceContract;
    const paths = [...new Set(manifest.entryPoints.map(entry => entry.runtime?.game?.logic ?? manifest.runtime?.game?.logic).filter(Boolean))];
    const items = [];
    for (const logicPath of paths) {
        const bytes = files.get(logicPath);
        if (!bytes || bytes.length > 2 * 1024 * 1024) throw new TypeError('Law mechanism requires bounded pinned Game Logic');
        const raw = JSON.parse(bytes.toString('utf8'));
        const logic = raw.schemaVersion === 2 ? lowerDeclarativeMutations(raw) : raw;
        compileDeclarativeLogic(logic, { data: {}, experienceContract: contract });
        const digest = lawExecutionDigest(logic, contract);
        const starts = manifest.entryPoints.filter(entry => (entry.runtime?.game?.logic ?? manifest.runtime?.game?.logic) === logicPath)
            .map(entry => ({ entryPointId: entry.entryPointId, displayName: entry.displayName }));
        for (const transaction of logic.transactions ?? []) items.push({
            reference: { logicPath, transactionId: transaction.id, digest }, description: transaction.intent.description,
            starts, inputSchema: transaction.inputSchema, validators: transaction.validators.length,
            effects: [...new Set(transaction.effects.map(effect => effect.kind))],
        });
    }
    return items;
}

export function assertWorldLawExecutions(worlds, logicByPath, contract) {
    const digests = new Map();
    for (const world of worlds) for (const note of world.revision.annotations ?? []) {
        if (!note.execution) continue;
        const { logicPath, transactionId, digest } = note.execution, logic = logicByPath.get(logicPath);
        if (logic && !digests.has(logicPath)) digests.set(logicPath, lawExecutionDigest(logic, contract));
        if (!logic?.transactions?.some(item => item.id === transactionId) || digests.get(logicPath) !== digest) {
            throw new TypeError('World law execution reference is unavailable or changed: ' + note.id);
        }
    }
}

export function assertPinnedWorldLawExecutions(worlds, manifest, files) {
    const declared = new Set(manifest.entryPoints.map(entry => entry.runtime?.game?.logic ?? manifest.runtime?.game?.logic));
    const paths = new Set(worlds.flatMap(world => (world.revision.annotations ?? []).map(note => note.execution?.logicPath).filter(Boolean)));
    const logicByPath = new Map();
    for (const path of paths) {
        const bytes = declared.has(path) ? files.get(path) : null;
        if (!bytes) continue;
        const raw = JSON.parse(bytes.toString('utf8'));
        logicByPath.set(path, raw.schemaVersion === 2 ? lowerDeclarativeMutations(raw) : raw);
    }
    assertWorldLawExecutions(worlds, logicByPath, manifest.runtime?.experienceContract);
}

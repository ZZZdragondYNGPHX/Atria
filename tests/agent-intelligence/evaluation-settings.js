import { canonical, hash } from './cases.js';
import { jsonSafe } from './report.js';
import { createNativeId } from '../../src/native/identity.js';

// Synthetic evaluator inputs, never a production binding or installed version.
export const BASE_SETTINGS = Object.freeze({
    rpPrompt: 'Express only the NPC response. Preserve the player choice and use the revised visible promise.',
    projectSkill: 'Preserve the original Project authority and human Review gate.',
    roundLimit: 6,
});
export function assertCandidate(value) {
    jsonSafe(value);
    if (!value || canonical(Object.keys(value).sort()) !== canonical(['target', 'value'])
        || !Object.hasOwn(BASE_SETTINGS, value.target)) throw new Error('Single allowed evaluator target required');
    if (value.target === 'roundLimit') {
        if (!Number.isSafeInteger(value.value) || value.value < 1 || value.value > 6) throw new Error('Round limit must be 1–6');
    } else if (typeof value.value !== 'string' || !value.value.trim() || Buffer.byteLength(value.value) > 16384) throw new Error('Bounded candidate text required');
    if (value.value === BASE_SETTINGS[value.target]) throw new Error('Candidate must change its target');
    return structuredClone(value);
}
export function settingsFor(candidate, arm) {
    assertCandidate(candidate);
    if (!['baseline', 'candidate'].includes(arm)) throw new Error('Unknown comparison arm');
    return { ...BASE_SETTINGS, ...(arm === 'candidate' ? { [candidate.target]: candidate.value } : {}) };
}
export const settingsHash = settings => hash(settings);

export function projectFixtureSource(name, seed = null) {
    const id = kind => createNativeId(kind, seed ? () => hash([seed, kind]).slice(0, 32) : undefined);
    return {
        format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: id('project'), packageId: id('package'), displayName: name, createdAt: 10, updatedAt: 10 },
        package: { name: 'Synthetic S01 Work', version: '1.0.0', actors: [], entryPoints: [{ entryPointId: id('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }], capabilities: ['narrative'], permissions: [] },
        worlds: [], knowledge: [], knowledgeBindings: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [] }, assetFiles: [],
    };
}

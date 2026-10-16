import { assertAtriaPackageManifest } from '../../src/native/contracts.js';
import { sessionFixture } from './helpers/session-fixture.js';
import { test, expect } from '@jest/globals';
import { assertExperienceContract } from '../../src/native/authoring-contracts.js';
import { loadNativeGamePackage } from '../../public/scripts/native/experience/package-loader.js';
import { minimalFrontend } from './helpers/frontend-fixture.js';

test.each(['component', 'hybrid', 'full'])('installed and browser transport reject legacy / mismatched %s selectors', async mode => {
    const { experience } = minimalFrontend(mode);
    expect(assertExperienceContract(experience)).toEqual(experience);
    for (const version of [1, 2]) {
        const legacy = { mode, componentModelVersion: version, component: 'ui.json' };
        expect(() => assertExperienceContract(legacy)).toThrow();
        const { manifest } = sessionFixture(); manifest.runtime = { experience: legacy };
        expect(() => assertAtriaPackageManifest(manifest)).toThrow();
        manifest.runtime.experience = { mode: 'text' }; manifest.entryPoints[0].runtime = { experience: legacy };
        expect(() => assertAtriaPackageManifest(manifest)).toThrow();
    }
    for (const selected of [{ mode, componentModelVersion: 2, component: 'ui.json' }, { ...experience, frontend: { ...experience.frontend, entry: 'runtime/frontend/other/index.json' } }]) {
        const state = await loadNativeGamePackage('session', { fetchImpl: async () => ({ ok: true, json: async () => ({ descriptor: { format: 'atria-native-runtime-descriptor', entryPointId: 'entry', experience }, runtime: { experience: selected } }) }) });
        expect(state.active).toBe(false);
    }
});

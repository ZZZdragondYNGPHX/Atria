import { assertAtriaPackageManifest } from '../../src/native/contracts.js';
import { sessionFixture } from './helpers/session-fixture.js';
import { test, expect } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { assertExperienceContract } from '../../src/native/authoring-contracts.js';
import { listAuthoringReferences } from '../../src/native/authoring-reference.js';
import { loadNativeGamePackage } from '../../public/scripts/native/experience/package-loader.js';
import { minimalFrontend } from './helpers/frontend-fixture.js';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
test('no formal runtime/compiler, Studio or authoring Skill points to legacy UI', () => {
    for (const name of ['component-model', 'v2-document', 'v2-runtime', 'v2-state', 'v2-values', 'declarative', 'runtime', 'selectors', 'package', 'native-components', 'message-templates']) {
        expect(existsSync(new URL('../../public/scripts/native/experience/ui/' + name + '.js', import.meta.url))).toBe(false);
    }
    for (const path of ['src/native/runtime-descriptor.js', 'src/native/authoring-contracts.js', 'src/native/experience-validation.js', 'src/native/session-core.js', 'src/native/lifecycle-authority.js', 'public/scripts/native/experience/ui/live.js', 'public/scripts/native/studio-workspace.js', 'public/scripts/native/studio-preview-ui.js', 'default/skills/global/atri-native-ui-authoring/SKILL.md']) {
        expect(read(path)).not.toMatch(/componentModelVersion|compileUiDocument|mountUiDocument|compileExperienceComponentModel/);
    }
    for (const id of ['ui-document', 'ui-actions', 'example-ui-v2']) expect(listAuthoringReferences().references.map(ref => ref.id)).not.toContain(id);
    expect(read('public/scripts/native/studio-preview-ui.js')).toContain('mountNativeFrontend');
    expect(read('public/scripts/native/shared-client.js')).not.toMatch(/mountUiDocument|frontendHttpTransport/);
});

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

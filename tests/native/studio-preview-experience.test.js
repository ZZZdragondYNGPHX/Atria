import { describe, expect, test } from '@jest/globals';

import {
    StudioPreviewHost,
    buildAtriaPackageContainer,
    createNativeId,
} from '../../src/native/index.js';
import { sessionFixture } from './helpers/session-fixture.js';

function uuidFactory() {
    let counter = 0;
    return () => {
        counter += 1;
        return '00000000-0000-4000-8000-' + String(counter).padStart(12, '0');
    };
}

describe('A4 Native Studio Experience preview', () => {
    test('projects all four Experience modes through the same derived Runtime Descriptor without Session authority', () => {
        const host = new StudioPreviewHost({ previewIdFactory: uuidFactory() });

        for (const mode of ['text', 'component', 'hybrid', 'full']) {
            const fixture = sessionFixture();
            fixture.manifest.capabilities = [...fixture.manifest.capabilities, 'game-runtime'];
            fixture.manifest.entryPoints[0] = {
                ...fixture.manifest.entryPoints[0],
                runtime: {
                    experience: mode === 'text'
                        ? { mode: 'text' }
                        : {
                            mode,
                            componentModelVersion: 1,
                            component: 'ui/main.json',
                            selectors: 'ui/selectors.json',
                            surface: 'app.root',
                        },
                },
            };

            const built = buildAtriaPackageContainer({
                manifest: fixture.manifest,
                sourceFiles: new Map([
                    ['ui/main.json', Buffer.from(JSON.stringify({
                        id: 'root',
                        type: 'container',
                    }))],
                    ['ui/selectors.json', Buffer.from('[]')],
                ]),
                assetPayloads: new Map(),
            });

            const preview = host.create({
                projectId: createNativeId('project'),
                archive: built.archive,
                entryPointId: fixture.manifest.entryPoints[0].entryPointId,
            });

            expect(preview.persisted).toBe(false);
            expect(preview).not.toHaveProperty('sessionId');
            expect(preview).not.toHaveProperty('branchId');
            expect(preview.descriptor.experience).toEqual(
                mode === 'text'
                    ? { mode: 'text' }
                    : { mode, componentModelVersion: 1 },
            );
            const expectedRuntimeExperience = mode === 'text'
                ? { mode: 'text' }
                : {
                    mode,
                    componentModelVersion: 1,
                    component: 'ui/main.json',
                    selectors: 'ui/selectors.json',
                    surface: 'app.root',
                };
            expect(preview.runtime.experience).toEqual(expectedRuntimeExperience);
        }

        expect(host.list()).toHaveLength(4);
        expect(host.list().map(item => item.experience.mode))
            .toEqual(['text', 'component', 'hybrid', 'full']);
    });
});

import { createHash } from 'node:crypto';

import { describe, expect, test } from '@jest/globals';

import {
    ATRIA_PACKAGE_CONTAINER_MAGIC,
    buildAtriaPackageContainer,
    createNativeId,
    inspectAtriaPackageContainer,
    preflightAtriaPackageContainer,
} from '../../src/native/index.js';

const digest = value => createHash('sha256').update(value).digest('hex');

function manifest(overrides = {}) {
    const assetBytes = Buffer.from('package-asset');
    const assetId = createNativeId('asset');
    return {
        manifest: {
            format: 'atria-package',
            schemaVersion: 2,
            nativeSchemaVersion: 1,
            packageId: createNativeId('package'),
            packageVersionId: createNativeId('packageVersion'),
            name: 'Container Work',
            version: '1.0.0',
            actors: [],
            entryPoints: [{
                entryPointId: createNativeId('entryPoint'),
                displayName: 'Main',
                actorIds: [],
                worldIds: [],
                knowledgeBindingIds: [],
            }],
            capabilities: ['narrative'],
            permissions: [{
                permission: 'generation',
                required: true,
                reason: 'Interactive generation',
            }],
            worlds: [],
            knowledge: [],
            knowledgeBindings: [],
            assets: [{
                assetId,
                contentHash: digest(assetBytes),
                size: assetBytes.length,
                mediaType: 'text/plain',
                logicalName: 'asset.txt',
            }],
            ...overrides,
        },
        assetId,
        assetBytes,
    };
}

describe('N2 .atria Package Container v2', () => {
    test('uses an authenticated Atria binary envelope instead of a renamed ZIP', () => {
        const fixture = manifest();
        const built = buildAtriaPackageContainer({
            manifest: fixture.manifest,
            sourceFiles: new Map([
                ['runtime/main.json', Buffer.from('{"ok":true}\n')],
            ]),
            assetPayloads: new Map([[fixture.assetId, fixture.assetBytes]]),
        });

        expect(built.archive.subarray(0, ATRIA_PACKAGE_CONTAINER_MAGIC.length))
            .toEqual(ATRIA_PACKAGE_CONTAINER_MAGIC);
        expect(built.archive.subarray(0, 2).toString('ascii')).not.toBe('PK');

        const preflight = preflightAtriaPackageContainer(built.archive);
        expect(preflight).toMatchObject({
            containerVersion: 2,
            packageId: fixture.manifest.packageId,
            packageVersionId: fixture.manifest.packageVersionId,
            name: 'Container Work',
            version: '1.0.0',
            requiredPermissions: ['generation'],
        });

        const inspected = inspectAtriaPackageContainer(built.archive);
        expect(inspected.manifest).toEqual(expect.objectContaining({
            packageId: fixture.manifest.packageId,
            packageVersionId: fixture.manifest.packageVersionId,
        }));
        expect(inspected.sourceFiles.get('runtime/main.json').toString('utf8'))
            .toBe('{"ok":true}\n');
        expect(inspected.assets.get(fixture.assetId)).toEqual(fixture.assetBytes);
        expect(inspected.containerHash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('rejects tampering before exposing Package content', () => {
        const fixture = manifest();
        const { archive } = buildAtriaPackageContainer({
            manifest: fixture.manifest,
            sourceFiles: new Map(),
            assetPayloads: new Map([[fixture.assetId, fixture.assetBytes]]),
        });
        const tampered = Buffer.from(archive);
        tampered[tampered.length - 17] ^= 0xff;

        expect(() => inspectAtriaPackageContainer(tampered))
            .toThrow(/authentication|integrity/i);
    });

    test('fails closed on missing, undeclared, corrupt or unsafe asset/source payloads', () => {
        const fixture = manifest();

        expect(() => buildAtriaPackageContainer({
            manifest: fixture.manifest,
            sourceFiles: new Map(),
            assetPayloads: new Map(),
        })).toThrow(/asset payload is missing/);

        expect(() => buildAtriaPackageContainer({
            manifest: fixture.manifest,
            sourceFiles: new Map([['../escape.json', '{}']]),
            assetPayloads: new Map([[fixture.assetId, fixture.assetBytes]]),
        })).toThrow(/path traversal|illegal segment/);

        expect(() => buildAtriaPackageContainer({
            manifest: fixture.manifest,
            sourceFiles: new Map(),
            assetPayloads: new Map([[fixture.assetId, Buffer.from('wrong')]]),
        })).toThrow(/integrity mismatch/);

        expect(() => buildAtriaPackageContainer({
            manifest: fixture.manifest,
            sourceFiles: new Map(),
            assetPayloads: new Map([
                [fixture.assetId, fixture.assetBytes],
                [createNativeId('asset'), Buffer.from('undeclared')],
            ]),
        })).toThrow(/undeclared/);
    });
});

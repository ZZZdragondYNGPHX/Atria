import fs from 'node:fs';
import path from 'node:path';
import { USER_DIRECTORY_TEMPLATE, resolveUserDirectory } from '../../src/constants.js';
import { AssetStore, ProjectStore, NATIVE_RESOURCE_KINDS, createNativeId } from '../../src/native/index.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

describe('Native user data layout', () => {
    let h;
    beforeEach(async () => { h = await makeTempFsEngine(); });
    afterEach(() => h.cleanup());

    test('stores preserve existing physical locations and share the registered roots', async () => {
        const projects = new ProjectStore({ directoriesByHandle: () => h.dirs });
        const assets = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
        expect(projects._root(h.handle)).toBe(path.join(h.dirs.root, 'projects'));
        const bytes = Buffer.from('Native asset');
        const hash = await assets.putBlob(h.handle, bytes);
        expect(fs.readFileSync(path.join(h.dirs.root, USER_DIRECTORY_TEMPLATE.nativeBlobs, hash.slice(0, 2), hash))).toEqual(bytes);
        const key = { kind: NATIVE_RESOURCE_KINDS.package, handle: h.handle, packageId: createNativeId('package') };
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, { doc: { marker: 'preserved' } }));
        expect(fs.readdirSync(path.join(h.dirs.root, USER_DIRECTORY_TEMPLATE.nativeResources, key.kind))).toHaveLength(1);
        expect(await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: key.kind, handle: h.handle }))).toHaveLength(1);
    });

    test('explicit registered roots are used consistently for writes and reads', async () => {
        h.dirs.nativeResources = path.join(h.dirs.root, 'resource-test');
        h.dirs.nativeBlobs = path.join(h.dirs.root, 'blob-test');
        h.dirs.projects = path.join(h.dirs.root, 'project-test');
        const key = { kind: NATIVE_RESOURCE_KINDS.package, handle: h.handle, packageId: createNativeId('package') };
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, { doc: { marker: 'registered' } }));
        expect(await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: key.kind, handle: h.handle }))).toHaveLength(1);
        const assets = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
        const bytes = Buffer.from('registered blob');
        const hash = await assets.putBlob(h.handle, bytes);
        expect(await assets.readBlob(h.handle, hash)).toEqual(bytes);
        expect(fs.existsSync(path.join(h.dirs.nativeBlobs, hash.slice(0, 2), hash))).toBe(true);
        expect(new ProjectStore({ directoriesByHandle: () => h.dirs })._root(h.handle)).toBe(h.dirs.projects);
        expect(fs.existsSync(path.join(h.dirs.root, 'atria-native'))).toBe(false);
    });

    test('unknown directories and missing roots fail instead of writing elsewhere', () => {
        expect(() => resolveUserDirectory(h.dirs, 'unknown')).toThrow('Unknown user directory');
        expect(() => resolveUserDirectory({}, 'nativeResources')).toThrow('require a root');
    });
});

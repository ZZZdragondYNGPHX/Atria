import { test, expect } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';

test('S24 Project source IO cannot address case aliases of Git recovery metadata', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = services(h), source = projectSource();
        await f.studio.createProject(h.handle, source);
        const store = f.studio._projects, id = source.project.projectId;
        for (const root of ['.git', '.GIT', '.Git']) {
            const path = root + '/atria-evaluation-recovery.json';
            await expect(store.writeFile(h.handle, id, path, '{}')).rejects.toThrow(/git internals/);
            await expect(store.readFile(h.handle, id, path)).rejects.toThrow(/git internals/);
            await expect(store.deleteFile(h.handle, id, path)).rejects.toThrow(/git internals/);
            await expect(store.moveFile(h.handle, id, 'note.txt', path)).rejects.toThrow(/git internals/);
        }
    } finally { await h.cleanup(); }
});

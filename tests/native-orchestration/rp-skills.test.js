import { expect, test } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { ExtensionsStore } from '../../src/native/extensions-store.js';
import { skillEntryKey } from '../../public/shared/extension-contract.js';

const body = '---\nname: guide\ndescription: Scoped instructions\n---\nPreserve the player decision. 雪';
async function setup() {
    const f = await rpModelFixture(makeTempFsEngineHarness), repository = createSkillRepository(f.h.dirs.root), extensions = new ExtensionsStore({ engine: f.h.engine });
    const scope = { kind: 'character', characterFile: 'Actor.png' };
    await repository.install({ scope, payload: { files: [{ path: 'SKILL.md', content: body }] } });
    const before = await extensions.settings(f.h.handle);
    await extensions.saveSettings(f.h.handle, { ...before.value, skills: { [skillEntryKey({ scope, name: 'guide' })]: { paths: { narrative: 'always' } } } }, before.revision);
    f.host.skillRepository = () => repository; f.host.extensions = extensions;
    return { ...f, repository, scope, extensions };
}
test('Native RP uses original always Skill instructions, exact versions and the original local-work bank', async () => {
    const f = await setup();
    try {
        const result = await f.run();
        expect(JSON.stringify(f.requests)).toContain('Preserve the player decision. 雪');
        const root = await f.authority.execution.runs.get(f.h.handle, result.runId);
        const control = await f.control.status(f.h.handle, f.controlId);
        const facts = control.operations[root.budgetAuthorityRef.operationId].compute;
        expect(facts.localWork.map(row => row.kind)).toEqual(expect.arrayContaining(['skill_inventory', 'skill_pin', 'skill_load', 'context_build']));
        expect(facts.localWork.every(row => row.status === 'settled')).toBe(true);
    } finally { await f.cleanup(); }
}, 30000);
test('Skill version drift after compilation denies consumption and publishes no output', async () => {
    const f = await setup();
    try {
        f.onResponse(async () => {
            await f.repository.install({ scope: f.scope, conflictStrategy: 'replace', payload: { files: [{ path: 'SKILL.md', content: body + '\nA changed instruction.' }] } });
        });
        await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_skill_source_stale' });
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
    } finally { await f.cleanup(); }
}, 30000);
test('Skill drift during the original read is rejected before the first Provider send', async () => {
    const f = await setup();
    try {
        const read = f.repository.readFile.bind(f.repository);
        let changed = false;
        f.repository.readFile = async input => {
            const file = await read(input);
            if (!changed) {
                changed = true;
                await f.repository.install({ scope: f.scope, conflictStrategy: 'replace', payload: { files: [{ path: 'SKILL.md', content: body + '\nNew guidance.' }] } });
            }
            return file;
        };
        await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_skill_source_stale' });
        expect(f.requests).toHaveLength(0);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
    } finally { await f.cleanup(); }
}, 30000);

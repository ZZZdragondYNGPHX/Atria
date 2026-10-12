import { expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import './_mocks/main-module-stack.js';
import { frozen, hash, memoryFixture, localRetrieval, countTokens } from './hm1-fixture.js';
import { informationActor } from '../native/helpers/information-fixture.js';
import { resolveMemoryEligibility, eligibleMemorySnapshot } from '../../public/scripts/agents/memory/eligibility.js';
import { retrieveMemory, buildMemoryCorpus } from '../../public/scripts/agents/memory/hybrid-retrieval.js';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

test('S16 broad Narrator and its independent disclosure do not enlarge actual Actor Hybrid inputs or survive revoked grants', async () => {
    const f = memoryFixture(frozen.cases[3], { native: true }), local = await localRetrieval();
    const info = f.snapshot.manifest.runtime.experienceContract.informationRuntime;
    delete info.views.find(view => view.id === 'pov').actorId;
    info.narration = { mode: 'separate', contextViewId: 'pov', disclosureViewId: 'player' };
    const before = hash(fs.readFileSync(path.join(f.root, 'raw-sources.json')));
    try {
        const original = await f.retrievalSnapshot();
        const narrator = eligibleMemorySnapshot(original, resolveMemoryEligibility(f.context, { requester: { kind: 'narrator' } }));
        const eligibility = resolveMemoryEligibility(f.context, { requester: { kind: 'actor', id: informationActor } });
        const actor = eligibleMemorySnapshot(original, eligibility);
        expect(JSON.stringify(buildMemoryCorpus(narrator))).toContain('秘密档案解释了寄信者的动机');
        expect(JSON.stringify(buildMemoryCorpus(actor))).not.toContain('秘密档案');
        const output = await retrieveMemory(actor, frozen.cases[3].queries[0].text, { countTokens, budget: 2400, service: local.service, profile: { source: 'synthetic' } });
        expect(output.sourceMessageIds).not.toContain('s04-third');
        expect(JSON.stringify(local.calls)).not.toContain('秘密档案');
        info.views.find(view => view.id === 'actor').memory = false;
        expect(() => eligibility.assertCurrent()).toThrow();
        await expect(retrieveMemory(actor, '寄信者', { countTokens, budget: 2400, service: local.service })).rejects.toHaveProperty('name', 'AbortError');
        expect(hash(fs.readFileSync(path.join(f.root, 'raw-sources.json')))).toBe(before);
    } finally { await local.close(); fs.rmSync(f.root, { recursive: true, force: true }); }
});

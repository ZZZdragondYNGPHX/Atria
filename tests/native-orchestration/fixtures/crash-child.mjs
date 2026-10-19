// Same default config path as the Jest setup; some imported modules read config at load.
import '../../util/config.js';
import fs from 'node:fs';
import path from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { SqliteEngine } from '../../../src/storage/engines/sqlite-engine.js';
import { attachNativeHostLifecycle } from '../../../src/storage/native-host-lifecycle.js';
import { PlanRepository, validationDigest } from '../../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../../src/native/orchestration/run-repository.js';
import { hashNativeDocument } from '../../../src/native/repositories/common.js';
import { createNativeId } from '../../../src/native/identity.js';
import { planFixture } from '../fixtures.js';

const [mode, root, window, commandId] = process.argv.slice(2);
const dirs = { root, chats: path.join(root, 'chats'), groupChats: path.join(root, 'group-chats') };
for (const directory of Object.values(dirs)) fs.mkdirSync(directory, { recursive: true });
const engine = new (mode === 'fs' ? FsEngine : SqliteEngine)({ directoriesByHandle: () => dirs });
const lifecycle = attachNativeHostLifecycle(engine, { directoriesByHandle: () => dirs });
const authorize = async () => {};
const assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx);
const plans = new PlanRepository({ engine, authorize, assertWriter, validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
const plan = await plans.create('u', createNativeId('orchestrationCommand'), planFixture());
const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
const report = await plans.validate('u', expected);
const { planRef } = await plans.publish('u', createNativeId('orchestrationCommand'), { ...expected, validationDigest: validationDigest(report) });
const source = { sourceAuthority: 'test-original-native-domain', sourceRef: { sourceId: 'test-source' } };
const runs = new RunRepository({ engine, authorize, assertWriter,
    admit: async () => ({ sourceBinding: { ...source, bindingDigest: hashNativeDocument(source) }, budgetAuthorityRef: { domain: 'test-original-domain' } }) });
const pause = async () => { process.stdout.write('FAULT\n'); await new Promise(() => {}); };
if (mode === 'fs') engine._durabilityFault = async stage => { if (stage === window) await pause(); };
else {
    const transaction = engine.withTransaction.bind(engine);
    engine.withTransaction = async (handle, fn, options) => {
        const result = await transaction(handle, async tx => {
            const value = await fn(tx);
            if (window === 'before_commit') await pause();
            return value;
        }, options);
        if (window === 'after_commit') await pause();
        return result;
    };
}
await runs.start('u', commandId, { planRef, sourceRequest: { id: 'test-source' }, retentionPolicyRef: { policyId: 'test-retention' } });
throw new Error('Expected parent to terminate child at the requested durability window');

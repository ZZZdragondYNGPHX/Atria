import { createHash } from 'node:crypto';

import { NATIVE_RESOURCE_KINDS, createNativeId } from '../../src/native/index.js';
import {
    makeTempFsEngineHarness,
    makeTempSqliteEngineHarness,
} from '../storage/harness/contract-harness.js';

const digest = value => createHash('sha256').update(value).digest('hex');

function makeNativeKeys(handle) {
    const packageId = createNativeId('package');
    const packageVersionId = createNativeId('packageVersion');
    const worldId = createNativeId('world');
    const worldRevisionId = createNativeId('worldRevision');
    const knowledgeBaseId = createNativeId('knowledgeBase');
    const knowledgeRevisionId = createNativeId('knowledgeRevision');
    const knowledgeEntryId = createNativeId('knowledgeEntry');
    const knowledgeBindingId = createNativeId('knowledgeBinding');
    const sessionId = createNativeId('session');
    const branchId = createNativeId('branch');
    const messageId = createNativeId('message');
    const variantId = createNativeId('variant');
    const revisionId = createNativeId('revision');
    return [
        { kind: NATIVE_RESOURCE_KINDS.package, handle, packageId },
        { kind: NATIVE_RESOURCE_KINDS.packageVersion, handle, packageId, packageVersionId },
        { kind: NATIVE_RESOURCE_KINDS.packageState, handle, packageId, namespace: 'atri_test' },
        { kind: NATIVE_RESOURCE_KINDS.world, handle, worldId },
        { kind: NATIVE_RESOURCE_KINDS.worldRevision, handle, worldId, worldRevisionId },
        { kind: NATIVE_RESOURCE_KINDS.knowledgeBase, handle, knowledgeBaseId },
        { kind: NATIVE_RESOURCE_KINDS.knowledgeRevision, handle, knowledgeBaseId, knowledgeRevisionId },
        {
            kind: NATIVE_RESOURCE_KINDS.knowledgeEntry,
            handle,
            knowledgeBaseId,
            knowledgeRevisionId,
            knowledgeEntryId,
        },
        { kind: NATIVE_RESOURCE_KINDS.knowledgeBinding, handle, knowledgeBindingId },
        { kind: NATIVE_RESOURCE_KINDS.session, handle, sessionId },
        { kind: NATIVE_RESOURCE_KINDS.branch, handle, sessionId, branchId },
        { kind: NATIVE_RESOURCE_KINDS.timelineEntry, handle, sessionId, branchId, messageId },
        { kind: NATIVE_RESOURCE_KINDS.timelineVariant, handle, sessionId, messageId, variantId },
        {
            kind: NATIVE_RESOURCE_KINDS.sessionState,
            handle,
            sessionId,
            namespace: 'atri_test_state',
            head: 'head-1',
        },
        { kind: NATIVE_RESOURCE_KINDS.sessionRevision, handle, sessionId, revisionId },
        { kind: NATIVE_RESOURCE_KINDS.savePoint, handle, sessionId, saveId: createNativeId('savePoint') },
        { kind: NATIVE_RESOURCE_KINDS.assetRef, handle, assetId: createNativeId('asset') },
    ];
}

describe('N1 Native resource cross-engine round trip', () => {
    let fsHarness;
    let sqliteHarness;

    beforeEach(async () => {
        fsHarness = await makeTempFsEngineHarness();
        sqliteHarness = await makeTempSqliteEngineHarness();
    });

    afterEach(async () => {
        await fsHarness.cleanup();
        await sqliteHarness.cleanup();
    });

    test('all frozen N0 resource kinds survive FS -> SQLite -> FS exactly', async () => {
        const handle = fsHarness.handle;
        const keys = makeNativeKeys(handle);

        await fsHarness.engine.withTransaction(handle, async (tx) => {
            for (const [index, key] of keys.entries()) {
                await tx.putResource(key, {
                    doc: { marker: key.kind, index },
                    integrity: digest(key.kind + ':' + index),
                    createdAt: 1000 + index,
                    updatedAt: 2000 + index,
                });
            }
        });

        for (const key of keys) {
            const source = await fsHarness.engine.withTransaction(handle, tx => tx.getResource(key));
            await sqliteHarness.engine.withTransaction(handle, tx => tx.putResource(key, source));
        }

        await fsHarness.engine.withTransaction(handle, async (tx) => {
            for (const key of keys) await tx.deleteResource(key);
        });

        for (const key of keys) {
            const sqlRecord = await sqliteHarness.engine.withTransaction(handle, tx => tx.getResource(key));
            await fsHarness.engine.withTransaction(handle, tx => tx.putResource(key, sqlRecord));
        }

        for (const key of keys) {
            const a = await fsHarness.engine.withTransaction(handle, tx => tx.getResource(key));
            const b = await sqliteHarness.engine.withTransaction(handle, tx => tx.getResource(key));
            expect(a).toEqual(b);
        }
    });
});

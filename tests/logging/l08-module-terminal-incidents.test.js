import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('L08 memory/worldbook/sync/storage terminal incidents', () => {
    test('memory extraction reports only terminal non-abort failures', () => {
        const source = readFileSync(new URL('../../public/scripts/extensions/memory-graph/extract-transaction.js', import.meta.url), 'utf8');
        expect(source).toContain('collectExtractTransactionInternal');
        expect(source).toContain("type: 'tool_failure'");
        expect(source).toContain("primaryModule: 'memory'");
        expect(source).toContain("stage = protocolFailure ? 'extract.transaction.validation' : 'extract.transaction.request'");
        expect(source).toContain("error?.name === 'AbortError'");
    });

    test('worldbook diagnostic actions generate worldbook-scoped incidents on failure', () => {
        const source = readFileSync(new URL('../../public/scripts/world-info/workspace.js', import.meta.url), 'utf8');
        expect(source).toContain("worldbookLogger.error('activation-test.failed'");
        expect(source).toContain("worldbookLogger.error('activation-trace.failed'");
        expect(source).toContain("primaryModule: 'worldbook'");
    });

    test('sync-now uses one operation id across offer/pull failure stages', () => {
        const source = readFileSync(new URL('../../src/endpoints/sync.js', import.meta.url), 'utf8');
        expect(source).toContain("response.setHeader('x-atria-operation-id', operationId)");
        expect(source).toContain("stage: 'offer.http'");
        expect(source).toContain("stage: 'offer.response'");
        expect(source).toContain("stage: 'pull.conflict'");
        expect(source).toContain("stage: 'pull.timeout'");
        expect(source).toContain("type: 'sync_failure'");
    });

    test('storage final engine errors are correlated into stable incidents', () => {
        const source = readFileSync(new URL('../../src/storage/engine-logger.js', import.meta.url), 'utf8');
        expect(source).toContain("type: 'storage_failure'");
        expect(source).toContain('storage:${engineKind}:${op}:${safeHandle}');
        expect(source).toContain('correlation: { operationId }');
    });
});

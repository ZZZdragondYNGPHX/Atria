import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { readSessionTurnOutput } from '../../src/native/session-turn-output.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { createNativeId } from '../../src/native/identity.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));

function captureWriter(f) {
    const original = f.core.finalizeTurn.bind(f.core); let expected, calls = 0;
    f.core.finalizeTurn = async (handle, sessionId, prepared, anchor) => {
        calls++;
        expected = { sessionId, branchId: f.base.revision.branchId, expectedRevisionId: anchor.expectedRevisionId,
            invocationId: prepared.invocationId, requestHash: prepared.requestHash, envelope: prepared.envelope, provenance: prepared.provenance };
        return original(handle, sessionId, prepared, anchor);
    };
    return { get expected() { return expected; }, get calls() { return calls; } };
}

describe.each(harnesses)('$name original Session output receipt', ({ make }) => {
    test('exact commit, Task and assistant facts survive lawful source advancement and cold reads without restoring a consumer scope', async () => {
        const f = await modelPortFixture(make), writer = captureWriter(f);
        try {
            const result = await f.start(), expected = writer.expected;
            const committed = await readSessionTurnOutput(f.core._sessions, f.h.handle, expected);
            expect(committed.domainReceiptRef).toMatchObject({ domain: 'native_session', sessionId: f.base.session.sessionId,
                branchId: f.base.revision.branchId, revisionId: result.revision.revisionId });
            expect(committed.record).toMatchObject({ kind: 'turn', invocationId: f.input.invocationId, storedRevisionId: result.revision.revisionId });
            expect(committed.entry.messageId).toBe(result.timeline.at(-1).messageId);
            for (const change of [{ requestHash: 'a'.repeat(64) }, { envelope: { ...expected.envelope, narrative: 'Changed expected output' } },
                { provenance: [] }])
                await expect(readSessionTurnOutput(f.core._sessions, f.h.handle, { ...expected, ...change })).rejects.toThrow('native_session_turn_receipt_invalid');
            await expect(readSessionTurnOutput(f.core._sessions, f.h.handle, { ...expected, expectedRevisionId: createNativeId('revision') })).resolves.toBeNull();
            expect((await f.start()).revision).toEqual(result.revision); expect(writer.calls).toBe(1);
            await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Lawful input after this output' });
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            await expect(f.authority.execution.sourcePort.revalidate(f.h.handle, root.sourceBinding)).rejects.toThrow();
            expect((await readSessionTurnOutput(f.core._sessions, f.h.handle, expected)).domainReceiptRef).toEqual(committed.domainReceiptRef);
            await f.cold();
            expect((await readSessionTurnOutput(f.core._sessions, f.h.handle, expected)).domainReceiptRef).toEqual(committed.domainReceiptRef);
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['before', 'after'])('an unknown ACK %s the original physical commit only observes the exact receipt, never retries the writer', async timing => {
        const f = await modelPortFixture(make), writer = captureWriter(f), repo = f.core._sessions, commit = repo.commitSnapshot.bind(repo);
        let commits = 0;
        repo.commitSnapshot = async (handle, input) => {
            if (!input.commitId?.startsWith('turn:')) return commit(handle, input);
            commits++;
            if (timing === 'after') await commit(handle, input);
            throw new StorageCommitUnknownError(new Error('Synthetic lost Session ACK'));
        };
        try {
            const outcome = await f.start().then(value => ({ value }), error => ({ error }));
            const committed = await readSessionTurnOutput(repo, f.h.handle, writer.expected), snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(Boolean(outcome.value)).toBe(timing === 'after'); expect(committed === null).toBe(timing === 'before');
            const outputCount = snapshot.timeline.filter(item => item.content === 'Synthetic native narrator response.').length;
            expect(outputCount).toBe(timing === 'after' ? 1 : 0);
            expect(outcome.value?.revision.revisionId ?? outcome.error.code).toBe(timing === 'after' ? committed.domainReceiptRef.revisionId : 'storage_commit_unknown');
            expect(commits).toBe(1); expect(writer.calls).toBe(1); expect(f.requests).toHaveLength(1);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
            expect(bank.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
        } finally { await f.cleanup(); }
    });

    test('a writer-shaped snapshot without an original domain commit is rejected', async () => {
        const f = await modelPortFixture(make); let writes = 0;
        f.core.finalizeTurn = async () => { writes++; return { ...f.base, timeline: [...f.base.timeline, { role: 'assistant', content: 'Synthetic native narrator response.' }] }; };
        try {
            await expect(f.start()).rejects.toThrow();
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(f.base.revision);
            expect(writes).toBe(1); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });
});

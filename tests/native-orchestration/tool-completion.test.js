import { toolCompletionFixture as fixture } from './helpers/tool-completion-fixture.js';
import { executeProjectSkillWork, verifyProjectSkillCompletion } from '../../src/native/skill-invocation.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { localWorkAttemptId } from '../../src/native/orchestration/budget-port.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const limits = { maxRequests: 1, maxTokens: 4096, localWork: { maxJobs: 16, maxItems: 10000, maxInputBytes: 16777216 } };

describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_TOOL_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name original completion proof', ({ make }) => {
    test.each(['mcp_tool', 'mcp_resource', 'skill_read', 'skill_files'])('%s saves only validated observation and cold reads existing receipt', async kind => {
        const f = await fixture(make, kind);
        try {
            await f.start(); const saved = await f.observe();
            expect(saved).toMatchObject({ outcome: 'confirmed', observation: { domainReceiptRef: null, resultRefs: [] } });
            expect(saved.observation.remoteOperationRef?.protocol ?? null).toBe(kind.startsWith('skill') ? null : 'mcp');
            expect(JSON.stringify(saved)).not.toMatch(/Synthetic (remote|Skill) body/);
            await f.cold(); expect(await f.observe()).toEqual(saved);
            const copied = structuredClone(saved.observation); copied.observationId = 'caller-copy';
            await expect(f.exec.effects.observe(f.h.handle, { ...runGuard(await f.exec.runs.get(f.h.handle, f.root.runId)), effectId: f.effectId, observation: copied }))
                .rejects.toThrow(/completion_proof_required/);
            await expect(f.start()).rejects.toThrow(/dispatch_stale/);
            expect(f.calls.length).toBe(kind.startsWith('mcp') ? 4 : 0);
        } finally { await f.cleanup(); }
    });

    test('remote Tool isError is a verified remote error, never business success or rollback', async () => {
        const f = await fixture(make, 'mcp_tool', { remoteError: true });
        try {
            await f.start(); await f.cold();
            expect(await f.observe()).toMatchObject({ outcome: 'failed', observation: { reasonCode: 'mcp_remote_reported_error',
                dispatchEvidence: { reference: { evidence: { remoteReportedError: true } } }, domainReceiptRef: null, resultRefs: [] } });
            expect(f.calls).toHaveLength(4);
        } finally { await f.cleanup(); }
    });

    test.each(['true', null, 1])('malformed remote isError=%p cannot mint a validated response proof', async remoteError => {
        const f = await fixture(make, 'mcp_tool', { remoteError });
        try {
            await expect(f.start()).rejects.toThrow(/isError must be boolean/);
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown'); expect(f.calls).toHaveLength(4);
        } finally { await f.cleanup(); }
    });

    test.each(['source', 'grant'])('Skill %s revoked during receipt persistence blocks body return but preserves historical fact', async change => {
        const f = await fixture(make, 'skill_read');
        try {
            const original = f.exec.effects.observe.bind(f.exec.effects);
            f.exec.effects.observe = async (...args) => {
                const ack = await original(...args);
                if (change === 'source') await f.core.appendTimeline(f.h.handle, f.root.sourceBinding.sourceRef.sessionId, { role: 'user', content: 'Moved source during callback' });
                else f.revokeGrant();
                return ack;
            };
            await expect(f.start()).rejects.toThrow(change === 'source' ? /revision_conflict/ : /grant revoked/);
            await f.cold(); const saved = await f.observe();
            expect(saved).toMatchObject({ outcome: 'confirmed', observation: { resultRefs: [] } });
            expect(JSON.stringify(saved)).not.toContain('Synthetic Skill body');
        } finally { await f.cleanup(); }
    });

    test('Skill contradictory observation during completion blocks live body and cold confirmed receipt resurrection', async () => {
        const f = await fixture(make, 'skill_read'); let contradicting = false;
        try {
            const original = f.exec.effects.observe.bind(f.exec.effects);
            f.exec.effects.observe = async (...args) => {
                const ack = await original(...args);
                if (!contradicting) {
                    contradicting = true;
                    await f.contradict(args[1].observation);
                }
                return ack;
            };
            await expect(f.start()).rejects.toThrow(/consume_denied|consumption_stale/);
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown');
            expect(f.calls).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    test('original MCP final freshness failure never invokes completion persistence', async () => {
        const f = await fixture(make, 'mcp_resource'); let writes = 0;
        try {
            const original = f.exec.effects.observe.bind(f.exec.effects);
            f.exec.effects.observe = (...args) => { writes++; return original(...args); };
            f.onResponse(async body => { if (body.method === 'resources/read') await f.core.appendTimeline(f.h.handle, f.root.sourceBinding.sourceRef.sessionId, { role: 'user', content: 'Moved source during response' }); });
            await expect(f.start()).rejects.toThrow(/source_stale/);
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown'); expect(writes).toBe(0);
        } finally { await f.cleanup(); }
    });

    test.each(['mcp_tool', 'skill_read'])('%s live proof cannot be substituted by plain object, reference or saved receipt', async kind => {
        const f = await fixture(make, kind);
        try {
            expect(() => f.service.verifyCompletion(f.h.handle, {}, {})).toThrow(/completion_proof_invalid/);
            expect(() => verifyProjectSkillCompletion({}, {})).toThrow(/completion proof/);
            const copyRejections = [], bindingRejections = []; let expired = () => true;
            if (kind.startsWith('mcp')) {
                const original = f.service.verifyCompletion.bind(f.service); let captured, expected;
                f.service.verifyCompletion = (handle, proof, binding) => {
                    captured = proof; expected = binding;
                    try { original(handle, JSON.parse(JSON.stringify(proof)), binding); copyRejections.push('accepted'); } catch (error) { copyRejections.push(error.code); }
                    try { original(handle, proof, { ...binding, bindingDigest: 'f'.repeat(64) }); bindingRejections.push('accepted'); } catch (error) { bindingRejections.push(error.code); }
                    return original(handle, proof, binding);
                };
                expired = () => { try { original(f.h.handle, captured, expected); return false; } catch { return true; } };
            }
            await f.start(); expect(expired()).toBe(true);
            expect(copyRejections).toEqual(kind.startsWith('mcp') ? ['native_mcp_completion_proof_invalid', 'native_mcp_completion_proof_invalid'] : []);
            expect(bindingRejections).toEqual(copyRejections);
            const saved = await f.observe();
            const forged = { ...saved.observation, observationId: 'forged-reference', dispatchEvidence: { kind: 'original_port_observation', reference: { authorized: true } } };
            await expect(f.exec.effects.observe(f.h.handle, { ...runGuard(await f.exec.runs.get(f.h.handle, f.root.runId)), effectId: f.effectId, observation: forged }))
                .rejects.toThrow(/completion_proof_required/);
            await f.contradict(saved.observation); expect((await f.observe()).outcome).toBe('unknown');
        } finally { await f.cleanup(); }
    });

    test.each(['mcp_resource', 'skill_files'])('%s save-before-ACK loss resolves only by reading the same receipt', async kind => {
        const f = await fixture(make, kind); let writes = 0;
        try {
            const original = f.exec.effects.observe.bind(f.exec.effects);
            f.exec.effects.observe = async (...args) => { writes++; await original(...args); throw new StorageCommitUnknownError(new Error('Synthetic saved ACK loss')); };
            await f.start(); await f.cold(); expect((await f.observe()).outcome).toBe('confirmed'); expect(writes).toBe(1);
        } finally { await f.cleanup(); }
    });

    test.each(['mcp_tool', 'skill_read'])('%s no-save and unresolved original budget remain unknown after cold reopen', async kind => {
        const f = await fixture(make, kind); let writes = 0;
        try {
            f.exec.effects.observe = async () => { writes++; throw new StorageCommitUnknownError(new Error('Synthetic no-save boundary')); };
            await expect(f.start()).rejects.toThrow(/commit outcome is unknown/);
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown'); expect(writes).toBe(1);
            expect(f.calls.length).toBe(kind.startsWith('mcp') ? 4 : 0);
        } finally { await f.cleanup(); }
        const unsettled = await fixture(make, kind, { settleInitial: false });
        try {
            await expect(unsettled.start()).rejects.toThrow(/completion_budget_invalid/);
            await unsettled.settleAdmission(); await unsettled.cold(); expect((await unsettled.observe()).outcome).toBe('unknown');
        } finally { await unsettled.cleanup(); }
    });

    test('original Skill proof is valid only during its actual read callback and JSON copies cannot carry it', async () => {
        const f = await fixture(make, 'skill_read'); let captured;
        try {
            const attemptId = localWorkAttemptId(f.effectId, 1), bindingDigest = hash({ originalRead: true });
            const compute = { assertCurrent: () => f.exec.sourcePort.revalidate(f.h.handle, f.root.sourceBinding),
                beforeLocalWork: async ({ items, inputBytes, kind }) => {
                    await f.exec.budgetPort.chargeLocalWork(f.h.handle, { authorityRef: f.root.budgetAuthorityRef, reservationId: f.root.runId, limits,
                        effectId: f.effectId, localWorkOrdinal: 1, attempt: { attemptId, requestId: 'native-skill-proof', kind,
                            estimatedItems: items, estimatedInputBytes: inputBytes, targetFingerprint: hash(f.input) } }); return { attemptId };
                }, settleLocalWork: (ticket, usage) => f.exec.budgetPort.settleLocalWork(f.h.handle, f.root.budgetAuthorityRef, ticket.attemptId, usage) };
            const expected = { repository: f.repository, bindingDigest, inputHash: hash(f.input), operation: 'read' };
            await executeProjectSkillWork({ operation: 'read', input: f.input, repository: f.repository, compute, completionBindingDigest: bindingDigest,
                onCompleted: proof => { captured = proof; expect(verifyProjectSkillCompletion(proof, expected)).toMatchObject({ protocol: 'skill', operation: 'read' });
                    expect(() => verifyProjectSkillCompletion(proof, { ...expected, bindingDigest: 'f'.repeat(64) })).toThrow();
                    expect(() => verifyProjectSkillCompletion(JSON.parse(JSON.stringify(proof)), expected)).toThrow(); } });
            expect(() => verifyProjectSkillCompletion(captured, expected)).toThrow();
            expect((await f.observe()).outcome).toBe('unknown');
        } finally { await f.cleanup(); }
    });
});

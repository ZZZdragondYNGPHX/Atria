import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionOutputFixture as setup, configureSessionOutput } from './helpers/session-output-fixture.js';
import { resolverTurnFixture } from './helpers/resolver-turn-fixture.js';
import { readSessionOutput, sessionOutputClaimId, sessionOutputClosureId } from '../../src/native/orchestration/session-output-contracts.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { createNativeId } from '../../src/native/identity.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { orchestrationSessionRoots } from '../../src/native/orchestration/reference-roots.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const memorySettings = { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 };
const changeContract = contract => { const view = contract.informationRuntime.views.find(item => item.id === 'pov'); view.sources.push('history'); view.memory = true; };

describe.each(harnesses)('$name original Session output terminal proof', ({ make }) => {
    test('a completed proof remains readable after a new user input and cold reopen while the original output Context expires', async () => {
        const f = await setup(make, { memorySettings, changeContract }), revalidate = ContextPort.prototype.revalidateNativeOutputCommit;
        let port, request;
        ContextPort.prototype.revalidateNativeOutputCommit = async function (handle, input) {
            const result = await revalidate.call(this, handle, input);
            if (handle !== f.h.handle) return result;
            port = this; request = input;
            for (const committed of [{}, structuredClone(input.committed)])
                await expect(revalidate.call(this, handle, { ...input, committed })).rejects.toThrow();
            await expect(revalidate.call(this, 'foreign', input)).rejects.toThrow();
            await expect(revalidate.call(this, handle, { ...input, audience: { kind: 'actor', id: 'foreign' } })).rejects.toThrow();
            return result;
        };
        try {
            const result = await f.start(), runId = f.effectRef.runId;
            const root = await f.authority.execution.runs.get(f.h.handle, runId);
            expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1);
            await expect(revalidate.call(port, f.h.handle, request)).rejects.toThrow();
            await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Lawful input after completed output' });
            expect((await f.authority.execution.runs.get(f.h.handle, runId)).status).toBe('completed');
            await f.cold();
            const observed = await f.authority.execution.runs.get(f.h.handle, runId);
            const proof = await f.authority.execution.runs.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, observed));
            expect(proof.claim.domainReceiptRef.revisionId).toBe(result.revision.revisionId); expect(f.requests).toHaveLength(1);
        } finally { ContextPort.prototype.revalidateNativeOutputCommit = revalidate; await f.cleanup(); }
    });

    test('unknown Model usage keeps the one original domain output and costs without inventing a terminal claim', async () => {
        const f = await setup(make, { usage: false });
        try {
            const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(root.status).toBe('running'); expect(root.outputClaims).toEqual([]);
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.');
            const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
            expect(bank.attempts[0].status).toBe('unknown'); expect(bank.localWork.find(row => row.kind === 'session_output').status).toBe('settled');
            expect((await f.start()).revision).toEqual(result.revision); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['memory', 'binding', 'source', 'cancel'])('%s withdrawal in the final cost-closure await persists after the original domain commit', async change => {
        const f = await setup(make, { memorySettings, changeContract }), observe = BudgetPort.prototype.observeEffectClosure; let changed = false, expectedVersion;
        BudgetPort.prototype.observeEffectClosure = async function (...args) {
            const result = await observe.apply(this, args);
            if (this === f.authority.execution.budgetPort && !changed) {
                changed = true;
                if (change === 'memory') await new SettingsRepo({ engine: f.h.engine }).save(f.h.handle, { atri_capabilities: { memory_graph: { ...memorySettings, recallEnabled: false } } });
                else if (change === 'binding') {
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector); expectedVersion = binding.version + 1;
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else if (change === 'source') await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Lawful post-commit input' });
                else {
                    const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
                    await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'post_commit_cancel' });
                }
            }
            return result;
        };
        try {
            await expect(f.start()).rejects.toThrow(); expect(changed).toBe(true);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId), snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(root.outputClaims).toEqual([]); expect(snapshot.timeline.filter(item => item.content === 'Synthetic native narrator response.')).toHaveLength(1);
            const observed = change === 'memory' ? (await new SettingsRepo({ engine: f.h.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled
                : change === 'binding' ? (await f.plans.getBinding(f.h.handle, f.sourceSelector)).version
                    : change === 'source' ? snapshot.timeline.at(-1).content : root.cancelRequested;
            expect(observed).toEqual({ memory: false, binding: expectedVersion, source: 'Lawful post-commit input', cancel: true }[change]);
            expect(f.requests).toHaveLength(1);
        } finally { BudgetPort.prototype.observeEffectClosure = observe; await f.cleanup(); }
    });

    test.each(['before', 'after'])('a terminal commit ACK lost %s persistence only observes the same Native claim', async timing => {
        const f = await setup(make), transaction = f.h.engine.withTransaction.bind(f.h.engine); let injected = false;
        const matches = value => value?.outcome?.claimRef?.claimId && value?.outcome?.outputReceiptRef;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const result = await transaction(handle, async tx => {
                const value = await callback(tx);
                if (!injected && matches(value) && timing === 'before') { injected = true; throw new StorageCommitUnknownError(new Error('Before terminal persistence')); }
                return value;
            }, ...options);
            if (!injected && matches(result) && timing === 'after') { injected = true; throw new StorageCommitUnknownError(new Error('After terminal persistence')); }
            return result;
        };
        try {
            const result = await f.start().then(value => ({ value }), error => ({ error })); expect(injected).toBe(true);
            expect(Boolean(result.value)).toBe(timing === 'after');
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(root.status).toBe(timing === 'after' ? 'completed' : 'running'); expect(root.outputClaims).toHaveLength(timing === 'after' ? 1 : 0);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline.filter(item => item.content === 'Synthetic native narrator response.')).toHaveLength(1);
            expect(f.requests).toHaveLength(1);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    });

    test.each(['saved', 'missing'])('Host receipt ACK %s preserves the committed domain revision and never repeats its output', async ack => {
        const f = await setup(make), effects = f.authority.execution.effects, observe = effects.observe.bind(effects); let injected = false;
        effects.observe = async (handle, input) => {
            if (!input.observation.observationId.startsWith('session.output:')) return observe(handle, input);
            injected = true;
            if (ack === 'saved') await observe(handle, input);
            throw new StorageCommitUnknownError(new Error('Synthetic Session Host receipt ACK loss'));
        };
        try {
            const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(injected).toBe(true); expect(root.outputClaims).toHaveLength(ack === 'saved' ? 1 : 0);
            const pins = await f.h.engine.withTransaction(f.h.handle, tx => orchestrationSessionRoots(tx, f.h.handle, f.base.session.sessionId));
            expect(pins.revisionIds).toContain(result.revision.revisionId);
            expect((await f.start()).revision).toEqual(result.revision); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('rehashed foreign claim, missing costs and wrong graph receipt fail the original cold proof reader', async () => {
        const f = await setup(make);
        try {
            await f.start(); const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
            const changes = [
                [controlRecordKey(f.h.handle, root.runId, 'output', sessionOutputClaimId(root)), doc => { doc.consumerRef.kind = 'rp_chat'; }],
                [controlRecordKey(f.h.handle, root.runId, 'receipt', sessionOutputClosureId(root.runId)), doc => { doc.budgetAttemptRefs = []; }],
                [controlRecordKey(f.h.handle, root.runId, 'receipt', proof.receipt.traversalReceiptRef.receiptId), doc => { doc.nodeAttemptId = createNativeId('orchestrationAttempt'); }],
            ];
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                for (const [key, change] of changes) {
                    const saved = await tx.getResource(key), doc = structuredClone(saved.doc); change(doc);
                    try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(f.authority.execution.runs.get(f.h.handle, root.runId)).rejects.toThrow(); }
                    finally { await tx.putResource(key, saved); }
                }
            });
            expect((await f.authority.execution.runs.get(f.h.handle, root.runId)).status).toBe('completed');
        } finally { await f.cleanup(); }
    });

    test('failure after terminal writes rolls back the entire Native group while preserving the original domain output and fees', async () => {
        const f = await setup(make), runs = f.authority.execution.runs, control = runs.control.bind(runs); let injected = false;
        runs.control = (handle, commandId, input, apply, ...options) => control(handle, commandId, input, async frame => {
            const result = await apply(frame);
            if (input.operation === 'output.publish') { injected = true; throw new Error('Synthetic failure after terminal writes'); }
            return result;
        }, ...options);
        try {
            await expect(f.start()).rejects.toThrow('after terminal writes'); expect(injected).toBe(true);
            const root = await runs.get(f.h.handle, f.effectRef.runId);
            expect(root.status).toBe('running'); expect(root.outputClaims).toEqual([]);
            const claim = await f.h.engine.withTransaction(f.h.handle, tx => tx.getResource(controlRecordKey(f.h.handle, root.runId, 'output', sessionOutputClaimId(root))));
            expect(claim).toBeNull();
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline.filter(item => item.content === 'Synthetic native narrator response.')).toHaveLength(1);
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each([false, true])('the resolver profile includes the original resolver costs or retained selection reuse=%s before completion', async reuse => {
        const f = await resolverTurnFixture(make, { configurePlan: configureSessionOutput });
        try {
            let interrupted = false;
            if (reuse) {
                const narrate = f.authority.executeNarrator.bind(f.authority);
                f.authority.executeNarrator = async () => { throw new Error('Original resolver selected before synthetic interruption'); };
                interrupted = await f.start().then(() => false, error => error.message.includes('synthetic interruption'));
                f.authority.executeNarrator = narrate; f.input.invocationId += ':resume';
            }
            expect(interrupted).toBe(reuse);
            const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(root.status).toBe('completed'); expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.');
            expect(f.requests).toHaveLength(2);
            const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
            expect(proof.closure.effectIds).toHaveLength(reuse ? 2 : 3);
        } finally { await f.cleanup(); }
    });
});

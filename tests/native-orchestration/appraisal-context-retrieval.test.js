import { appraisalContextRetrievalFixture, ACTOR_MEMORY, OTHER_MEMORY, HIDDEN_TRUTH } from './helpers/appraisal-context-retrieval-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readBackgroundTaskOutput } from '../../src/native/orchestration/background-task-output-contracts.js';
import { informationContext, informationSourceMessageIds, projectInformation } from '../../public/shared/native-information-runtime.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const rootOf = f => f.authority.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const controlOf = f => f.core.runs.status(f.h.handle, f.base.session.sessionId);
const computeOf = async (f, root) => (await controlOf(f)).operations[root.budgetAuthorityRef.operationId].compute;
const noActorAdoption = async f => {
    const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
    expect(snapshot.states.atri_lifecycle.domains.emotions.records).toEqual([]);
    expect(snapshot.states.atri_lifecycle.domains.relations.records).toEqual([]);
};

describe.each(CONTRACT_HARNESSES)('$name Actor appraisal Context retrieval', ({ make }) => {
    test('the actual Actor Task retrieves only granted support, keeps original citations and closes appraisal fees', async () => {
        const f = await appraisalContextRetrievalFixture(make);
        try {
            const information = informationContext(f.base, { kind: 'task', id: 'summarize' }, 'summarize');
            expect(information.actorId).toBe(f.actorId); expect(information.memory).toBe(true);
            expect(informationSourceMessageIds(f.base, information)).toEqual([f.legalMessageId]);
            expect(JSON.stringify(projectInformation(f.base, 'player', { purpose: 'display' }))).toContain(HIDDEN_TRUTH);
            expect(JSON.stringify(information)).not.toContain(HIDDEN_TRUTH);
            const result = await f.run(), root = await rootOf(f), compute = await computeOf(f, root);
            expect(result.results[0].authorityReceipt).toMatchObject({ decision: 'cognition.appraise', applied: 2 });
            expect(result.snapshot.states.atri_lifecycle.domains.emotions.records[0].value).toMatchObject({ actor: f.actorId, level: 30, appraisal: { origin: 'model' } });
            expect(result.snapshot.states.atri_lifecycle.domains.relations.records[0].value).toMatchObject({ actor: f.actorId, target: f.otherActorId, level: -5 });
            expect(result.snapshot.timeline).toEqual(f.base.timeline); expect(result.snapshot.states.atri_world_state).toEqual(f.base.states.atri_world_state);
            expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
            expect(JSON.stringify(f.calls)).toContain(ACTOR_MEMORY);
            const wire = JSON.stringify({ retrieval: f.calls, model: f.requests }).normalize('NFKC');
            for (const denied of [OTHER_MEMORY, HIDDEN_TRUTH, '沈墨怀疑有人跟踪自己。']) expect(wire).not.toContain(denied.normalize('NFKC'));
            expect(compute.attempts).toHaveLength(3); expect(compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(compute.attempts.filter(row => row.generationQuotaRef)).toHaveLength(1);
            expect(Object.values((await controlOf(f)).background).reduce((sum, row) => sum + row.count, 0)).toBe(1);
            expect(compute.localWork.filter(row => ['appraisal_parse', 'appraisal_adopt', 'index_insert', 'index_query'].includes(row.kind)).map(row => [row.kind, row.status]))
                .toEqual([['index_insert', 'settled'], ['index_query', 'settled'], ['appraisal_parse', 'settled'], ['appraisal_adopt', 'settled']]);
            const output = await f.authority.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root));
            expect(root.status).toBe('completed'); expect(output.receipt.costs.closed).toBe(true); expect(output.published.delivery.retrievalCompletions).toHaveLength(2);
            await f.cold();
            expect(await f.authority.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root))).toEqual(output);
            expect((await computeOf(f, root)).attempts).toEqual(compute.attempts);
            expect((await f.run()).results).toEqual([]); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 180000);

    test('unknown Actor retrieval usage withholds Model and adoption and preserves one charged request after cold reopen', async () => {
        const f = await appraisalContextRetrievalFixture(make, { retrievalUsage: null });
        try {
            await expect(f.run()).rejects.toThrow(); const root = await rootOf(f), compute = await computeOf(f, root);
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            expect(compute.attempts).toEqual([expect.objectContaining({ status: 'unknown' })]); expect(root.outputClaims).toEqual([]); await noActorAdoption(f);
            await f.cold(); expect((await computeOf(f, root)).attempts).toEqual(compute.attempts);
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_background_request_replayed' });
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0); await noActorAdoption(f);
        } finally { await f.cleanup(); }
    }, 180000);

    test('real Actor availability withdrawal during retrieval preserves the paid fee and withholds Model and appraisal adoption', async () => {
        const f = await appraisalContextRetrievalFixture(make);
        try {
            f.onRetrieval(async () => {
                const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId), domain = snapshot.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(item => item.id === 'availability');
                await f.core.applyLifecycleCommand(f.h.handle, snapshot.session.sessionId, { type: 'lifecycle', invocationId: 'appraisal-retrieval-revoke-actor',
                    action: { kind: 'app.command', domainId: 'availability', recordId: 'main', commandId: 'save', args: { ...domain.initial, available: false } } },
                { expectedRevisionId: snapshot.revision.revisionId });
            });
            await expect(f.run()).rejects.toThrow(); const root = await rootOf(f), compute = await computeOf(f, root);
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            expect(compute.attempts).toHaveLength(1); expect(compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 7 } });
            expect(root.outputClaims).toEqual([]); await noActorAdoption(f);
            await f.cold(); expect((await computeOf(f, root)).attempts).toEqual(compute.attempts);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).states.atri_lifecycle.domains.availability.records[0].value.available).toBe(false);
            await f.run(); expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0); await noActorAdoption(f);
        } finally { await f.cleanup(); }
    }, 180000);

    test('retrieved historical support cannot replace the original event sourceItem citations or authorize Actor writes', async () => {
        const f = await appraisalContextRetrievalFixture(make, { mutateCandidate: value => ({ ...value,
            updates: value.updates.map(update => ({ ...update, sourceItemIds: ['memories:actor-history'] })) }) });
        try {
            const result = await f.run(), root = await rootOf(f), compute = await computeOf(f, root);
            expect(result.results[0].authorityReceipt).toMatchObject({ decision: 'cognition.appraise', applied: 0 });
            expect(result.results[0].authorityReceipt.decisions.map(row => row.status)).toEqual(['rejected', 'rejected']);
            await noActorAdoption(f); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
            expect(compute.attempts).toHaveLength(3); expect(compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(root.status).toBe('completed');
            expect((await f.authority.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root))).receipt.costs.closed).toBe(true);
        } finally { await f.cleanup(); }
    }, 180000);
});

import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { appraisalModelFixture } from './helpers/appraisal-model-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { assertSourceSelector } from '../../public/shared/native-orchestration-contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const command = () => createNativeId('orchestrationCommand');
const taskRef = { taskId: 'summarize', variantId: 'default' };
const taskSelector = f => ({ ...f.sourceSelector, taskRef });

describe.each(harnesses)('$name original Session Task Plan bindings', ({ make }) => {
    test.each(['session', 'entryPoint'])('an actual appraisal and typed Narrator complete distinct Plans with a %s Task selection', async scope => {
        const f = await appraisalModelFixture(make, { afterAppraisalText: 'The observer records only the visible scene.' });
        try {
            const selected = { ...taskSelector(f), entryPointId: scope === 'entryPoint' ? f.base.session.entryPointId : null };
            const savedTask = await f.plans.saveBinding(f.h.handle, command(), { sourceSelector: selected, planRef: f.planRef, expectedVersion: null });
            const plan = structuredClone(f.plan), output = plan.definition.nodes.find(node => node.kind === 'output');
            plan.definition.nodes[0].outputs[0].type = 'text'; output.inputs[0].type = 'text'; output.capabilities = ['chat.output'];
            plan.definition.capabilityCeiling.push('chat.output');
            plan.definition.outputContract = { ...plan.definition.outputContract, kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } };
            const draft = await f.plans.create(f.h.handle, command(), plan);
            const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
            const validation = await f.plans.validate(f.h.handle, expected);
            expect(validation.status).toBe('valid');
            const { planRef } = await f.plans.publish(f.h.handle, command(), { ...expected, validationDigest: validationDigest(validation) });
            const previous = await f.plans.getBinding(f.h.handle, f.sourceSelector);
            await f.plans.saveBinding(f.h.handle, command(), { sourceSelector: f.sourceSelector, planRef, expectedVersion: previous.version });
            await f.plans.saveBinding(f.h.handle, command(), { sourceSelector: { ...f.sourceSelector, entryPointId: f.base.session.entryPointId }, planRef, expectedVersion: null });
            if (scope === 'entryPoint') await f.plans.saveBinding(f.h.handle, command(), { sourceSelector: taskSelector(f), planRef, expectedVersion: null });
            const appraisal = await f.run(), taskRunId = f.effectRef.runId;
            expect(appraisal.snapshot.states.atri_lifecycle.domains.emotions.records[0].value.level).toBe(30);
            const taskRoot = await f.authority.execution.runs.get(f.h.handle, taskRunId);
            expect(taskRoot.planRef).toEqual(f.planRef); expect(taskRoot.sourceBinding.sourceRequest.taskRef).toEqual(taskRef); expect(taskRoot.status).toBe('completed');
            const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
            await f.host.executeTurn(f.h.handle, { sessionId: current.session.sessionId, revisionId: current.revision.revisionId, invocationId: 'coexisting-narration' },
                undefined, undefined, { transaction: { transactionId: 'observe', input: {} } });
            const narrationRoot = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(narrationRoot.planRef).toEqual(planRef); expect(narrationRoot.status).toBe('completed'); expect(narrationRoot.runId).not.toBe(taskRunId);
            expect(narrationRoot.sourceBinding.sourceRequest).not.toHaveProperty('taskRef');
            expect(await f.plans.getBinding(f.h.handle, selected)).toEqual(savedTask); expect(f.requests).toHaveLength(2);
            const observer = new RunObservationService({ engine: f.h.engine, sessionCore: f.core, pollMs: 0 });
            const all = await observer.list(f.h.handle, { sourceSelector: f.sourceSelector, cursor: null, limit: 100 });
            const onlyTask = await observer.list(f.h.handle, { sourceSelector: selected, cursor: null, limit: 100 });
            expect(all.items.map(item => item.runId).toSorted()).toEqual([taskRoot.runId, narrationRoot.runId].toSorted());
            expect(onlyTask.items.map(item => item.runId)).toEqual([taskRoot.runId]);
            const view = await observer.observe(f.h.handle, { runId: taskRoot.runId, cursor: null, limit: 1 });
            expect(view.payload.source).toEqual(taskSelector(f));
        } finally { await f.cleanup(); }
    }, 120000);

    test('Task binding CAS uses the original Source inspector and rejects unknown variants or broadened references without affecting the default', async () => {
        const f = await appraisalModelFixture(make);
        try {
            const selected = taskSelector(f), before = await f.plans.getBinding(f.h.handle, f.sourceSelector);
            const body = { sourceSelector: selected, planRef: f.planRef, expectedVersion: null }, id = command();
            const first = await f.plans.saveBinding(f.h.handle, id, body);
            expect(await f.plans.saveBinding(f.h.handle, id, body)).toEqual(first);
            await expect(f.plans.saveBinding(f.h.handle, command(), body)).rejects.toMatchObject({ code: 'native_orchestration_binding_conflict' });
            for (const bad of [{ taskId: 'unknown', variantId: 'default' }, { taskId: 'summarize', variantId: 'unknown' }]) {
                await expect(f.plans.getBinding(f.h.handle, { ...selected, taskRef: bad })).rejects.toThrow();
                await expect(f.authority.execution.sourcePort.capture(f.h.handle, {
                    domain: 'native_session', sessionId: f.base.session.sessionId, branchId: f.base.revision.branchId, revisionId: f.base.revision.revisionId, taskRef: bad })).rejects.toThrow();
            }
            expect(() => assertSourceSelector({ ...selected, taskRef: { ...taskRef, actorId: f.otherActorId } })).toThrow();
            expect(() => assertSourceSelector({ ...selected, taskRef: null })).toThrow();
            expect(await f.plans.getBinding(f.h.handle, f.sourceSelector)).toEqual(before); expect(f.requests).toEqual([]);
            expect(hash(selected)).not.toBe(hash(f.sourceSelector));
        } finally { await f.cleanup(); }
    }, 60000);
});

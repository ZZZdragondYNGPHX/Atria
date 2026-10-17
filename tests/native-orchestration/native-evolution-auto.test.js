import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { nativeEvolutionAutoFixture, projectEvolutionAutoFixture } from './helpers/native-evolution-auto-fixture.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';

describe.each(CONTRACT_HARNESSES)('$name original Native automatic Evolution', ({ make }) => {
    test('the original persisted Project Task can authorize automatic configuration only for its exact Native Review consumer without spending or changing its workspace', async () => {
        const f = await projectEvolutionAutoFixture(make), handle = f.h.handle;
        try {
            expect(f.configured.policy.mode).toBe('auto'); expect(f.configured.policy.target).toEqual(f.target);
            const settings = await f.service.targets.evaluationSettings(handle, f.scope, f.subject, f.target);
            const config = await f.service.evaluator.configuration(handle, settings.runtimeRouteId, null, settings.nativePlan);
            expect(settings.nativePlan.planRef).toEqual(f.planRef);
            expect(settings.nativePlan.revision.definition.outputContract.kind).toBe('project_review');
            expect(config.route.role).toBe('role.studio');
            expect((await f.service.repository.owner(handle)).attempts).toEqual([]); expect(f.requests).toEqual([]);
            expect((await f.agent.observeTask(handle, f.projectId, f.task.taskId)).workspace).toBeNull();
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(f.planRef);
        } finally { await f.cleanup(); }
    }, 30000);

    test('automatic configuration refuses an unselected Route before job or Provider work', async () => {
        const f = await nativeEvolutionAutoFixture(make), handle = f.h.handle;
        try {
            const before = await f.service.repository.get(handle, f.scope, f.subject), requests = f.requests.length;
            const route = await f.persistence.getRuntimeRoute(handle, f.input.routeRef.runtimeRouteId);
            const other = { ...route, runtimeRouteId: createNativeId('runtimeRoute') };
            await f.persistence.saveRuntimeRoute(handle, other);
            await expect(f.service.configure(handle, { scope: f.scope, subject: f.subject, target: f.target, mode: 'auto', price: null,
                routeId: other.runtimeRouteId, expectedSequence: before.sequence })).rejects.toThrow('agent_evolution_model_route_mismatch');
            expect(await f.service.repository.get(handle, f.scope, f.subject)).toEqual(before);
            expect((await f.service.repository.owner(handle)).attempts).toEqual([]); expect(f.requests).toHaveLength(requests);
        } finally { await f.cleanup(); }
    }, 30000);

    test('an unsupported Native output profile refuses automatic evaluation before spending while its original explicit review configuration remains available', async () => {
        const f = await nativeEvolutionAutoFixture(make), handle = f.h.handle;
        try {
            const original = await f.plans.get(handle, f.planRef.planId);
            const spec = structuredClone({ definition: original.definition, dependencyPins: original.dependencyPins, viewState: original.viewState });
            spec.definition.nodes.find(node => node.kind === 'output').capabilities = [];
            spec.definition.capabilityCeiling = ['generation.send'];
            Object.assign(spec.definition.outputContract, { kind: 'result', slot: 'final' });
            const draft = await f.plans.create(handle, createNativeId('orchestrationCommand'), spec);
            const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
            const validation = await f.plans.validate(handle, expected);
            expect(validation.status).toBe('valid');
            const published = await f.plans.publish(handle, createNativeId('orchestrationCommand'), { ...expected, validationDigest: validationDigest(validation) });
            await f.plans.saveBinding(handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: published.planRef, expectedVersion: 0 });
            const choice = (await f.service.targets.catalog(handle, f.scope, f.subject)).find(choice => choice.target.fieldPath === 'limits.maxSteps');
            await f.service.declare(handle, { scope: f.scope, subject: f.subject, target: choice.target, expectedBaseHash: choice.baseHash });
            const before = await f.service.repository.get(handle, f.scope, f.subject), requests = f.requests.length;
            const input = { scope: f.scope, subject: f.subject, target: choice.target, routeId: f.input.routeRef.runtimeRouteId, price: null, expectedSequence: before.sequence };
            await expect(f.service.configure(handle, { ...input, mode: 'auto' })).rejects.toThrow('native_orchestration_evaluation_unavailable');
            expect(await f.service.repository.get(handle, f.scope, f.subject)).toEqual(before);
            expect((await f.service.repository.owner(handle)).attempts).toEqual([]); expect(f.requests).toHaveLength(requests);
            expect((await f.service.configure(handle, { ...input, mode: 'review' })).policy.mode).toBe('review');
        } finally { await f.cleanup(); }
    }, 30000);

    test('withdrawing original feedback during automatic extraction cancels the job and retains the paid or unknown attempt without writing a Plan', async () => {
        const f = await nativeEvolutionAutoFixture(make), handle = f.h.handle, requests = f.requests.length;
        f.onResponse(async () => {
            const current = await f.service.experience.inspect(handle, { scope: f.scope, subject: f.subject });
            await f.service.experience.withdraw(handle, { scope: f.scope, subject: f.subject, id: f.feedbackId, expectedSequence: current.sequence });
        });
        try {
            const started = await f.service.start(handle, { scope: f.scope, subject: f.subject, expectedSequence: f.configured.sequence }, { automatic: true });
            await expect(f.service.wait(handle, started.jobId)).rejects.toThrow();
            const doc = await f.service.reconcile(handle, { scope: f.scope, subject: f.subject });
            expect(doc.policy.mode).toBe('paused'); expect(doc.publications).toEqual([]);
            expect(doc.jobs.find(job => job.id === started.jobId).candidates).toEqual([]);
            const owner = await f.service.repository.owner(handle);
            expect(owner.attempts).toHaveLength(1); expect(owner.attempts[0].kind).toBe('extraction');
            expect(['reserved', 'unknown', 'reported']).toContain(owner.attempts[0].status);
            expect(owner.attempts[0].tokens).toBeGreaterThan(0); expect(f.requests).toHaveLength(requests + 1);
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(f.planRef);
        } finally { await f.cleanup(); }
    }, 30000);

    test.each(['plan-strategy', 'plan-prompt'])('%s executes the original isolated comparison, preserves the real gate and supports reviewed publication plus invalidation rollback', async kind => {
        const f = await nativeEvolutionAutoFixture(make, kind), handle = f.h.handle;
        try {
            expect(f.configured.policy.mode).toBe('auto');
            const initialRequests = f.requests.length, route = await f.persistence.getRuntimeRoute(handle, f.input.routeRef.runtimeRouteId);
            const draft = await f.plans.get(handle, f.planRef.planId), source = await f.chats.get(handle, f.locator.charDir, f.locator.name);
            const started = await f.service.start(handle, { scope: f.scope, subject: f.subject, expectedSequence: f.configured.sequence }, { automatic: true });
            await f.service.wait(handle, started.jobId);
            let doc = await f.service.repository.get(handle, f.scope, f.subject);
            const job = doc.jobs.find(job => job.id === started.jobId), candidate = job.candidates[0];
            expect(job.status).toBe('awaiting_review');
            expect(candidate.report).toMatchObject({ schemaVersion: 2, origin: 'host_evaluator' });
            expect(candidate.report.pairs).toHaveLength(9);
            expect(candidate.report.pairs.every(pair => ['baseline', 'candidate'].every(arm => pair[arm].error === null
                && pair[arm].checks.target_consumed && pair[arm].checks.isolation && pair[arm].refs.runIds.length))).toBe(true);
            expect(candidate.decision.eligible).toBe(false);
            expect(candidate.decision.reasons).toEqual(expect.arrayContaining(['source_unready', 'unsettled_cost']));
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(f.planRef);
            expect(await f.chats.get(handle, f.locator.charDir, f.locator.name)).toEqual(source);
            for (const pair of candidate.report.pairs) {
                doc = await f.service.repository.get(handle, f.scope, f.subject);
                const labeled = await f.service.label(handle, { scope: f.scope, subject: f.subject, jobId: job.id, candidateId: candidate.candidateId,
                    pairHash: pair.pairHash, preference: 'tie', deltas: Object.fromEntries(pair.case.behaviorDimensions.map(dimension => [dimension, 0])), expectedSequence: doc.sequence });
                expect(labeled.decision.eligible).toBe(false); expect(labeled.decision.reasons).toContain('source_unready');
            }
            doc = await f.service.repository.get(handle, f.scope, f.subject);
            expect(doc.publications).toEqual([]);
            const report = doc.jobs.find(item => item.id === job.id).candidates[0].report;
            const input = { scope: f.scope, subject: f.subject, jobId: job.id, candidateId: candidate.candidateId, expectedReportHash: hash(report) };
            await expect(f.service.publish(handle, input, { automatic: true })).rejects.toThrow('agent_evolution_review_required');
            const paid = await f.service.repository.owner(handle);
            expect(paid.attempts.every(attempt => attempt.status === 'reported' && attempt.usage.totalTokens === 20)).toBe(true);
            expect(paid.attempts).toHaveLength(f.requests.length - initialRequests);
            expect(paid.attempts.some(attempt => attempt.kind === 'judge')).toBe(true);
            expect(paid.attempts.every(attempt => attempt.cost === null)).toBe(true);
            const desiredSettings = await f.service.targets.evaluationSettings(handle, f.scope, f.subject, f.target, candidate.candidateId);
            const reviewed = await f.service.publish(handle, { ...input, review: true });
            expect(reviewed.publications[0]).toMatchObject({ status: 'published', reason: 'explicit_human_review' });
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(candidate.desired.planRef);
            expect(await f.plans.get(handle, f.planRef.planId)).toMatchObject({ definition: draft.definition, draftVersion: draft.draftVersion });
            expect(await f.persistence.getRuntimeRoute(handle, f.input.routeRef.runtimeRouteId)).toEqual(desiredSettings.nativePlan.routeOverride ?? route);
            const current = await f.service.experience.inspect(handle, { scope: f.scope, subject: f.subject });
            await f.service.experience.withdraw(handle, { scope: f.scope, subject: f.subject, id: f.feedbackId, expectedSequence: current.sequence });
            const invalidated = await f.service.reconcile(handle, { scope: f.scope, subject: f.subject });
            expect(invalidated.policy.mode).toBe('paused');
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(f.planRef);
            expect(await f.persistence.getRuntimeRoute(handle, f.input.routeRef.runtimeRouteId)).toEqual(route);
            expect((await f.service.repository.owner(handle)).attempts).toEqual(paid.attempts);
            expect(await f.chats.get(handle, f.locator.charDir, f.locator.name)).toEqual(source);
            expect(JSON.stringify(report)).not.toContain('synthetic-secret');
        } finally { await f.cleanup(); }
    }, 180000);
});

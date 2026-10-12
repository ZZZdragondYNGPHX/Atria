import { expect, jest, test } from '@jest/globals';
import { CandidateComparisonService } from '../../src/native/candidate-comparison.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { installedPredictionFixture } from './helpers/prediction-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { actionReceipts } from '../../src/native/action-receipts.js';
import { assertPredictionCapture } from '../../src/native/prediction-service.js';
import { simulationCandidateFixture } from './helpers/simulation-candidate-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { createNativeId } from '../../src/native/identity.js';

async function fixture(make = makeTempFsEngineHarness, options = {}) {
    const h = await make();
    try {
        const f = await installedPredictionFixture(h, 'route.comparison', value => {
            value.contract.taskRuntime.turn = { policy: 'authority-first', stages: [] };
            if (options.simulation) {
                const simulation = simulationCandidateFixture();
                value.contract.lifecycleRuntime = simulation.contract.lifecycleRuntime;
                value.contract.simulationRuntime = simulation.contract.simulationRuntime;
                value.contract.capabilities.push({ id: 'world-simulation', version: 1, required: true });
                value.logic.transactions.push(...simulation.logic.transactions.filter(tx => tx.origin === 'simulation'));
            }
        });
        const view = projectInformation(f.base, 'player.notes'), action = text => ({ ...f.body.request.action, input: { ...f.body.request.action.input, text } });
        const host = { sessionCore: f.core, executePrediction: jest.fn(async () => { throw new Error('No model sends authorized in this fixture'); }),
            persistence: { getRuntimeRoute: jest.fn(async () => ({ scope: 'player', executionPolicy: { computeBudget: {
                maxRequests: 1, maxTokens: 4096, localWork: { maxJobs: options.maxJobs ?? 8, maxItems: 10000, maxInputBytes: 16777216 } } } })) } };
        const service = new CandidateComparisonService({ host, ...(options.now ? { now: options.now } : {}) });
        const body = { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId, request: { viewId: 'player.notes', anchor: view.anchor,
            requestId: 'compare-actions', routeRef: { scope: 'player', runtimeRouteId: 'route.comparison' },
            candidates: [{ id: 'keep', action: action('old public note') }, { id: 'chosen', action: action('wanted note') }, { id: 'unselected', action: action('other future') }],
            goals: [{ itemId: view.items[0].id, path: ['text'], equals: 'wanted note' }] } };
        const commit = async proposal => {
            const prepared = await f.core.prepareAuthorityTurn(h.handle, f.base, { transactionId: proposal.transactionId, input: proposal.input });
            return f.core.finalizeTurn(h.handle, f.base.session.sessionId, { invocationId: 'actual-comparison-choice', authorityProof: prepared.proof,
                envelope: { schemaVersion: 1, narrative: 'The selected action happened.', outcomes: [], diagnostics: [] } }, { expectedRevisionId: f.base.revision.revisionId });
        };
        return { ...f, h, host, service, body, commit };
    } catch (error) { await h.cleanup(); throw error; }
}

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`S24 ${kind} server comparison proposes an authorized action and links its real formal receipt without publishing unselected futures`, async () => {
        const f = await fixture(make);
        try {
            const result = await f.service.prepare(f.h.handle, f.body);
            expect(result).toMatchObject({ status: 'proposed', selected: { candidateId: 'chosen', kind: 'action_proposal' },
                compute: { localWork: [{ kind: 'context_build', status: 'settled', usage: { outcome: 'completed' } }] } });
            expect(result.candidates[0]).toMatchObject({ id: 'chosen', goalsSatisfied: 1, publicChanges: 1 });
            expect(JSON.stringify(result)).not.toContain('PRIVATE'); expect(f.host.executePrediction).not.toHaveBeenCalled();
            expect(await f.core.load(f.h.handle, f.body.sessionId)).toEqual(f.base);
            expect(await f.service.current(f.h.handle, { sessionId: f.body.sessionId, comparisonId: result.comparisonId })).toEqual({ current: true });
            const nextRequest = new CandidateComparisonService({ host: { ...f.host } });
            expect(await nextRequest.current(f.h.handle, { sessionId: f.body.sessionId, comparisonId: result.comparisonId })).toEqual({ current: true });
            const actual = await f.commit(result.selected.action), receipt = actionReceipts(actual).at(-1);
            const beforeFeedback = await f.core.load(f.h.handle, f.body.sessionId);
            const feedback = await nextRequest.feedback(f.h.handle, { sessionId: f.body.sessionId, comparisonId: result.comparisonId, receiptId: receipt.receiptId });
            expect(feedback).toMatchObject({ kind: 'comparison_observation', candidateId: 'chosen', receipt: { authorityId: receipt.authorityId, inputHash: receipt.inputHash },
                deterministicPredictionError: { publicScalarDifferences: 0, exactMatch: true }, modelPredictionError: 'not_measurable' });
            expect(await f.core.load(f.h.handle, f.body.sessionId)).toEqual(beforeFeedback);
            expect(actual.timeline.at(-1).content).toBe('The selected action happened.');
            expect(actual.states.atri_lifecycle.domains.public_notes.records[0].value.text).toBe('wanted note');
            expect(JSON.stringify(actual)).not.toContain('other future'); expect(f.host.executePrediction).not.toHaveBeenCalled();
            await f.core.appendTimeline(f.h.handle, f.body.sessionId, { role: 'user', content: 'Later actual turn.' });
            await expect(f.service.feedback(f.h.handle, { sessionId: f.body.sessionId, comparisonId: result.comparisonId, receiptId: receipt.receiptId })).rejects.toThrow(/receipt_denied/);
        } finally { await f.h.cleanup(); }
    }, 30000);
}

test('S24 all user goals are mandatory and stable ties minimize public differences without treating private effects as public goals', async () => {
    const f = await fixture();
    try {
        f.body.request.goals[0].equals = 'old public note';
        f.body.request.candidates.push({ id: 'zz-equivalent', action: structuredClone(f.body.request.candidates[0].action) });
        const result = await f.service.prepare(f.h.handle, f.body);
        expect(result.selected.candidateId).toBe('keep'); expect(result.candidates[0].publicChanges).toBe(0);
        const none = structuredClone(f.body); none.request.goals[0].equals = 'unreachable';
        const abstained = await f.service.prepare(f.h.handle, none);
        expect(abstained).toMatchObject({ status: 'abstained', selected: null });
        await expect(f.service.feedback(f.h.handle, { sessionId: f.body.sessionId, comparisonId: abstained.comparisonId, receiptId: 'any' })).rejects.toThrow(/abstained/);
        expect(await f.core.load(f.h.handle, f.body.sessionId)).toEqual(f.base);
    } finally { await f.h.cleanup(); }
});

test('S24 unknown, forged, foreign, expired, private-field and over-limit comparisons fail closed before any model execution', async () => {
    let now = 1000;
    const f = await fixture(makeTempFsEngineHarness, { now: () => now });
    try {
        for (const alter of [body => { body.request.goals[0].path = ['hidden']; }, body => { body.request.goals[0].equals = 3; },
            body => { body.request.goals[0].path = ['__proto__']; }, body => { body.request.viewId = 'private'; },
            body => { body.revisionId = 'stale'; }, body => { body.request.artifact = {}; },
            body => { body.request.anchor.proof = {}; },
            body => { body.request.candidates = Array.from({ length: 9 }, (_, index) => ({ ...body.request.candidates[0], id: 'candidate' + index })); }]) {
            const changed = structuredClone(f.body); alter(changed); await expect(f.service.prepare(f.h.handle, changed)).rejects.toThrow();
        }
        const result = await f.service.prepare(f.h.handle, f.body);
        for (const [handle, id] of [['foreign', result.comparisonId], [f.h.handle, 'invented']]) await expect(f.service.current(handle,
            { sessionId: f.body.sessionId, comparisonId: id })).rejects.toThrow(/unknown/);
        now += 600001;
        await expect(f.service.current(f.h.handle, { sessionId: f.body.sessionId, comparisonId: result.comparisonId })).rejects.toThrow(/unknown/);
        expect(f.host.executePrediction).not.toHaveBeenCalled();
    } finally { await f.h.cleanup(); }
});

test('S24 actual receipt for an unselected action and caller-submitted receipt data cannot be assigned to the chosen prediction', async () => {
    const f = await fixture();
    try {
        const result = await f.service.prepare(f.h.handle, f.body), actual = await f.commit(f.body.request.candidates[2].action), receipt = actionReceipts(actual).at(-1);
        await expect(f.service.feedback(f.h.handle, { sessionId: f.body.sessionId, comparisonId: result.comparisonId, receiptId: receipt.receiptId })).rejects.toThrow(/receipt_denied/);
        await expect(f.service.feedback(f.h.handle, { sessionId: f.body.sessionId, comparisonId: result.comparisonId, receiptId: 'invented', receipt })).rejects.toThrow();
        expect(await f.core.load(f.h.handle, f.body.sessionId)).toEqual(actual);
    } finally { await f.h.cleanup(); }
});

test('S24 local comparison preparation shares the original bank and a cancelled request cannot create a proposal', async () => {
    const f = await fixture(makeTempFsEngineHarness, { maxJobs: 1 });
    try {
        const controller = new AbortController(); controller.abort();
        await expect(f.service.prepare(f.h.handle, f.body, controller.signal)).rejects.toThrow();
        const result = await f.service.prepare(f.h.handle, f.body);
        expect(result.compute.localWork).toHaveLength(1);
        const bank = await f.core.runs.status(f.h.handle, f.body.sessionId);
        await expect(f.service.prepare(f.h.handle, f.body)).rejects.toThrow(/budget/);
        expect(await f.core.runs.status(f.h.handle, f.body.sessionId)).toEqual(bank);
        expect(f.host.executePrediction).not.toHaveBeenCalled();
    } finally { await f.h.cleanup(); }
});

test('S24 explicit model predictions are captured by the original service and cannot override exact goals or become measurable outcome error', async () => {
    const f = await fixture();
    try {
        f.body.request.prediction = { taskId: f.task.id, variantId: f.variant.id,
            slotBindings: { [f.task.bindingSlotId]: { scope: 'player', runtimeRouteId: 'route.comparison' } } };
        f.host.executePrediction.mockImplementation(async (handle, input, capture) => {
            const data = assertPredictionCapture(capture, { host: f.host, handle });
            return { record: { payload: { prediction: 'An uncertain future.', assumptions: ['This is only a hypothesis.'],
                supportRefs: data.observation.items.map(item => item.id), uncertainty: { confidence: data.action.input.text === 'other future' ? 1 : 0.1, limitations: ['No observed outcome.'] } },
            requestSnapshotHash: 'a'.repeat(64), rawResultHash: 'b'.repeat(64), promptProgramRef: data.variant.prompt,
            generationProfileRef: data.variant.generation, runtimeRouteId: input.routeRef.runtimeRouteId, execution: null } };
        });
        const result = await f.service.prepare(f.h.handle, f.body);
        expect(f.host.executePrediction).toHaveBeenCalledTimes(3);
        expect(result.selected.candidateId).toBe('chosen');
        expect(result.candidates.find(item => item.id === 'unselected').prediction.uncertainty.confidence).toBe(1);
        const actual = await f.commit(result.selected.action);
        const feedback = await f.service.feedback(f.h.handle, { sessionId: f.body.sessionId, comparisonId: result.comparisonId,
            receiptId: actionReceipts(actual).at(-1).receiptId });
        expect(feedback.modelPredictionError).toBe('not_measurable');
        expect(actual.states.atri_task_results.records).toHaveLength(1);
        expect(JSON.stringify(actual)).not.toContain('An uncertain future.');
    } finally { await f.h.cleanup(); }
});

test('S24 a current revision race, pinned source mutation or private goal fails without issuing a transferable future', async () => {
    const f = await fixture();
    try {
        const original = f.core.load.bind(f.core); let reads = 0;
        const load = jest.spyOn(f.core, 'load').mockImplementation(async (...args) => {
            reads++;
            if (reads === 2) { load.mockRestore(); await f.core.appendTimeline(f.h.handle, f.body.sessionId, { role: 'user', content: 'New current turn.' }); }
            return original(...args);
        });
        await expect(f.service.prepare(f.h.handle, f.body)).rejects.toThrow(/revision_conflict/);
        expect(f.service.entries.size).toBe(0); expect(f.host.executePrediction).not.toHaveBeenCalled();
    } finally { await f.h.cleanup(); }
    const source = await fixture();
    try {
        const result = await source.service.prepare(source.h.handle, source.body), actual = await source.commit(result.selected.action);
        const open = source.core._openPackage.bind(source.core);
        jest.spyOn(source.core, '_openPackage').mockImplementation(async (...args) => {
            const installed = await open(...args);
            const sourceFiles = new Map(installed.sourceFiles); sourceFiles.set('extra.source', Buffer.from('source changed'));
            return { ...installed, sourceFiles };
        });
        await expect(source.service.feedback(source.h.handle, { sessionId: source.body.sessionId, comparisonId: result.comparisonId,
            receiptId: actionReceipts(actual).at(-1).receiptId })).rejects.toThrow(/source_stale/);
    } finally { await source.h.cleanup(); }
});

test('S24 transient comparison records are shared only by the same trusted Engine and remain unavailable to another Engine with the same owner name', async () => {
    const f = await fixture(), other = await fixture();
    try {
        const result = await f.service.prepare(f.h.handle, f.body);
        await expect(other.service.current(f.h.handle, { sessionId: f.body.sessionId, comparisonId: result.comparisonId })).rejects.toThrow(/unknown/);
        const rebuilt = new CandidateComparisonService({ host: { sessionCore: f.core, persistence: { _engine: f.h.engine } } });
        expect(await rebuilt.current(f.h.handle, { sessionId: f.body.sessionId, comparisonId: result.comparisonId })).toEqual({ current: true });
    } finally { await f.h.cleanup(); await other.h.cleanup(); }
});

test('S24 a declared Clock action can be privately compared but does not receive an invented transaction feedback receipt', async () => {
    const f = await fixture(makeTempFsEngineHarness, { simulation: true });
    try {
        f.body.request.candidates = [{ id: 'clock', action: { kind: 'clock.advance', commandId: 'advance', ticks: 4320 } }];
        f.body.request.goals[0].equals = 'advanced';
        const result = await f.service.prepare(f.h.handle, f.body);
        expect(result.selected).toMatchObject({ candidateId: 'clock', action: { kind: 'clock.advance', ticks: 4320 } });
        await expect(f.service.feedback(f.h.handle, { sessionId: f.body.sessionId, comparisonId: result.comparisonId,
            receiptId: 'invented-clock-receipt' })).rejects.toThrow(/feedback_unsupported/);
        expect(await f.core.load(f.h.handle, f.body.sessionId)).toEqual(f.base);
        expect(f.host.executePrediction).not.toHaveBeenCalled();
    } finally { await f.h.cleanup(); }
});

test('S24 real persistence default narrator budget cannot be bypassed by omitting the comparison route', async () => {
    const f = await fixture();
    try {
        const seeded = await seedGenerationProfiles({ ...f.h, endpoint: 'http://127.0.0.1:1/not-used' });
        const route = { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId],
            computeBudget: { maxRequests: 1, maxTokens: 4096, localWork: { maxJobs: 1, maxItems: 10000, maxInputBytes: 16777216 } } } };
        await seeded.persistence.saveRuntimeRoute(f.h.handle, route); f.host.persistence = seeded.persistence;
        delete f.body.request.routeRef;
        const result = await f.service.prepare(f.h.handle, f.body);
        expect(result.compute.localWork).toHaveLength(1);
        const bank = await f.core.runs.status(f.h.handle, f.body.sessionId);
        await expect(f.service.prepare(f.h.handle, f.body)).rejects.toThrow(/budget/);
        expect(await f.core.runs.status(f.h.handle, f.body.sessionId)).toEqual(bank);
        expect(f.host.executePrediction).not.toHaveBeenCalled();
    } finally { await f.h.cleanup(); }
});

test('S24 feedback retains the selected default Route and refuses changed policy without refunding earlier comparison work', async () => {
    const f = await fixture();
    try {
        const seeded = await seedGenerationProfiles({ ...f.h, endpoint: 'http://127.0.0.1:1/not-used' });
        const route = { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId],
            computeBudget: { maxRequests: 1, maxTokens: 4096, localWork: { maxJobs: 8, maxItems: 10000, maxInputBytes: 16777216 } } } };
        await seeded.persistence.saveRuntimeRoute(f.h.handle, route); f.host.persistence = seeded.persistence;
        delete f.body.request.routeRef;
        const result = await f.service.prepare(f.h.handle, f.body), actual = await f.commit(result.selected.action);
        await seeded.persistence.saveRuntimeRoute(f.h.handle, { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Another default narrator' });
        const request = { sessionId: f.body.sessionId, comparisonId: result.comparisonId, receiptId: actionReceipts(actual).at(-1).receiptId };
        expect((await f.service.feedback(f.h.handle, request)).deterministicPredictionError.exactMatch).toBe(true);
        await seeded.persistence.saveRuntimeRoute(f.h.handle, { ...route, displayName: 'Changed original route' });
        const bank = await f.core.runs.status(f.h.handle, f.body.sessionId);
        await expect(f.service.feedback(f.h.handle, request)).rejects.toThrow(/source_stale/);
        expect(await f.core.runs.status(f.h.handle, f.body.sessionId)).toEqual(bank);
        const ambiguous = { ...f.body, revisionId: actual.revision.revisionId,
            request: { ...f.body.request, anchor: projectInformation(actual, 'player.notes').anchor } };
        await expect(f.service.prepare(f.h.handle, ambiguous)).rejects.toThrow(/route_ambiguous/);
        jest.spyOn(seeded.persistence, 'listRuntimeRoutes').mockResolvedValue([{ ...route, scope: 'session' }]);
        await expect(f.service.feedback(f.h.handle, request)).rejects.toThrow(/source_stale/);
        expect(await f.core.runs.status(f.h.handle, f.body.sessionId)).toEqual(bank);
        expect(f.host.executePrediction).not.toHaveBeenCalled();
    } finally { await f.h.cleanup(); }
});

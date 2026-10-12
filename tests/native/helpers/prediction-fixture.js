import { authorityCandidateFixture } from './authority-candidate-fixture.js';
import { lifecycleFixture } from './lifecycle-fixture.js';
import { services } from './session-fixture.js';
import { projectInformation } from '../../../public/shared/native-information-runtime.js';
import { buildAtriaPackageContainer } from '../../../src/native/index.js';
import { PREDICTION_INPUT_SCHEMA, PREDICTION_OUTPUT_SCHEMA } from '../../../src/native/prediction-service.js';

export function predictionFixture(change = () => {}) {
    const f = authorityCandidateFixture(({ contract, logic }) => {
        logic.transactions[0].effects = logic.transactions[0].effects.filter(effect => !['clock.advance', 'workflow.transition'].includes(effect.kind));
        contract.taskRuntime = lifecycleFixture().taskRuntime;
        const task = contract.taskRuntime.tasks[0];
        Object.assign(task, { executionClass: 'interactive', inputSchema: structuredClone(PREDICTION_INPUT_SCHEMA),
            resultPolicy: { resultClass: 'advisory', sink: 'proposal' } });
        task.variants[0].outputSchema = structuredClone(PREDICTION_OUTPUT_SCHEMA);
    });
    const task = f.contract.taskRuntime.tasks[0], variant = task.variants[0];
    const origin = { scope: 'package', packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId };
    const moduleId = 'pmod_' + 'c'.repeat(32);
    f.base.manifest.resources = [
        { resourceType: 'core.prompt-module', resource: { schemaVersion: 1, promptModuleId: moduleId, revision: 'r1', displayName: 'Prediction instructions',
            target: 'system.foundation', stages: ['stage.main'], body: 'Predict a possible consequence using only the supplied observation and action. This is hypothetical, never observed truth. Return prediction, assumptions, supportRefs containing only observation item IDs, and uncertainty with confidence and limitations. Do not use tools.' } },
        { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: variant.prompt.revision,
            displayName: 'Prediction program', stages: [{ stageId: 'stage.main', moduleRefs: [{ resourceType: 'core.prompt-module', ...origin, resourceId: moduleId, revision: 'r1' }] }] } },
        { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: variant.generation.revision,
            displayName: 'Prediction generation', output: { maxTokens: 512 } } },
    ].map(item => ({ ...item, origin }));
    const bodyFor = (base = f.base, runtimeRouteId = 'route.prediction') => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
        request: { viewId: 'player.notes', anchor: projectInformation(base, 'player.notes').anchor,
            action: { kind: 'transaction', transactionId: f.request.transactionId, input: f.request.input }, taskId: task.id, variantId: variant.id,
            slotBindings: { [task.bindingSlotId]: { scope: 'player', runtimeRouteId } }, invocationId: 'prediction-' + base.revision.revisionId } });
    change(f); f.sync();
    return { ...f, task, variant, bodyFor, body: bodyFor() };
}

export async function installedPredictionFixture(h, runtimeRouteId = 'route.prediction', change = () => {}) {
    const f = predictionFixture(change), svc = services(h);
    const { archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() });
    await svc.packageInstaller.install(h.handle, archive);
    let base = await svc.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
    for (const action of [{ kind: 'experience.ready' },
        { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'old public note' } },
        { kind: 'app.command', domainId: 'other', commandId: 'save', recordId: 'main', args: { text: 'PRIVATE PREDICTION SENTINEL' } }]) {
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'setup-' + base.revision.revisionId, action },
            { expectedRevisionId: base.revision.revisionId });
    }
    base = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Update the note.' });
    return { ...f, ...svc, base, body: f.bodyFor(base, runtimeRouteId) };
}

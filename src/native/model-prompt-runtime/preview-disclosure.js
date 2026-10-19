import { informationContext, informationDefinition, projectInformation } from '../../../public/shared/native-information-runtime.js';
import { compileNativeContextPlan } from '../../../public/scripts/native/context-compiler.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertRequestContextPlan } from './contracts.js';
import { createNativeSessionContextProvider } from './context-providers.js';
import { GenerationError, immutable } from './execution-utils.js';

const same = (left, right) => hashNativeDocument(left ?? null) === hashNativeDocument(right ?? null);
const deny = () => { throw new GenerationError('native_generation_preview_disclosure_denied'); };

/**
 * Browser preview is a separate consumer from the model. A context grant does
 * not authorize returning private cognition in ContextPlan, PromptIR or wire.
 * This guard never redacts a request and then labels the result actual wire.
 *
 * The first supported Information case is deliberately narrow: an explicit
 * Narrator-to-player grant covering every complete context record, with no
 * extra retrieval, derivation or expression channel. All other Information
 * previews fail closed; normal model execution does not call this guard.
 */
export async function assertPreviewDisclosure(snapshot, { target = { kind: 'narrator' }, taskId, contextPlan } = {}) {
    const definition = informationDefinition(snapshot);
    if (!definition) return;
    try {
        if (taskId || target?.kind !== 'narrator' || !definition.narration || !contextPlan) deny();
        const contract = snapshot.manifest.runtime.experienceContract;
        const contextView = definition.views.find(view => view.id === definition.narration.contextViewId);
        const displayView = definition.views.find(view => view.id === definition.narration.disclosureViewId);
        if (contextView?.audience !== 'narrator' || displayView?.audience !== 'player'
            || contextView.knowledge !== false || contextView.memory === true
            || definition.narration.expression
            || contract.contextRuntime?.derivations?.length
            || contract.processingRuntime?.processors?.some(processor => processor.stage === 'context')) deny();

        // Reproject the original authority, rather than trusting caller-supplied
        // displayGrant fields, view names, summaries or similarly worded text.
        const information = informationContext(snapshot, target, undefined);
        const display = projectInformation(snapshot, displayView.id, { purpose: 'display', includeRollups: false });
        if (!information?.projection || information.projection.truncated || display.truncated) deny();
        const displayed = new Map(display.items.map(item => [item.id, item]));
        if (information.projection.items.some(item => !same(item, displayed.get(item.id)))) deny();
        if (information.projection.availability.some(item => !display.availability.some(grant => same(item, grant)))) deny();
        if (Object.entries(information.projection.anchor.scopeEpochs).some(([id, epoch]) => display.anchor.scopeEpochs[id] !== epoch)) deny();

        const actual = assertRequestContextPlan(contextPlan);
        const source = { kind: 'session', sessionId: snapshot.session.sessionId,
            revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId };
        if (!same(actual.source, source)) deny();

        // Reuse the existing compiler/provider to enumerate the authoritative
        // public-only items (including its fixed cognition policy). Large local
        // token headroom lets the actual model select a subset, never add data.
        // Unsafe dynamic channels were rejected above, before this compilation.
        const ceiling = 1048576;
        const selected = await compileNativeContextPlan(snapshot, { target, modelContextLimit: ceiling,
            responseReserve: 1, countTokens: () => 1, playerPersona: { enabled: false } });
        const provider = createNativeSessionContextProvider(async () => ({ source, plan: selected }));
        const expected = await provider.buildRequestContextPlan({ requestId: actual.requestId }, {
            model: { limits: { contextTokens: ceiling, outputTokens: 1 } }, generation: { output: { maxTokens: 1 } },
        });
        const allowed = new Map(expected.items.map(item => [item.id, item]));
        if (actual.items.some(item => !item.id || !same(item, allowed.get(item.id)))) deny();
        if (!same(actual.provenance, expected.provenance) || !same(actual.nativeSelection, expected.nativeSelection)
            || !same(actual.personaEvidence, expected.personaEvidence)) deny();
    } catch {
        // No private record, failed projection, stack or untrusted text escapes.
        deny();
    }
}

/** Preserve successful generation delivery while restricting internal evidence
 * at the Browser boundary. Re-observe on every retained-result read: a previous
 * public projection is never a portable or permanent disclosure permission. */
export async function projectGenerationResultForBrowser(host, handle, result) {
    const prepared = result?.snapshot, contextPlan = prepared?.contextPlan;
    if (!contextPlan || contextPlan.source?.kind !== 'session') return result;
    try {
        const source = contextPlan.source;
        const current = await host.sessionCore.observe(handle, source.sessionId);
        if (current.session.sessionId !== source.sessionId || current.revision.revisionId !== source.revisionId
            || current.revision.branchId !== source.branchId) deny();
        await assertPreviewDisclosure(current, { contextPlan });
        for (const round of result.skillRounds ?? []) {
            if (round?.contextPlan) await assertPreviewDisclosure(current, { contextPlan: round.contextPlan });
        }
        // A proof can await context readers. Observe again at consumption so a
        // grant/Scope/Source change during that proof cannot reuse its old read.
        const latest = await host.sessionCore.observe(handle, source.sessionId);
        if (latest.session.sessionId !== source.sessionId || latest.revision.revisionId !== source.revisionId
            || latest.revision.branchId !== source.branchId || !same(current.states, latest.states)
            || !same(current.manifest.runtime, latest.manifest.runtime)) deny();
        return result;
    } catch {
        // The model already completed. Permission failure restricts diagnostics,
        // rather than changing success into a retryable/unknown send failure.
        return immutable({
            projection: 'restricted', reason: 'native_generation_preview_disclosure_denied',
            ...(result.response === undefined ? {} : { response: result.response }),
            ...(result.routing === undefined ? {} : { routing: result.routing }),
            snapshotSummary: {
                requestId: prepared.requestId, runtimeRouteId: prepared.runtimeRouteId,
                modelProfileId: prepared.modelProfileId, connectionProfileId: prepared.connectionProfileId,
                promptProgramRef: prepared.promptProgramRef, generationProfileRef: prepared.generationProfileRef,
                inputTokens: prepared.diagnostics?.inputTokens ?? null,
            },
        });
    }
}

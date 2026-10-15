import { hashNativeDocument } from '../repositories/common.js';
import { immutable, GenerationError } from './execution-utils.js';

// Fingerprints are diagnostics for validity consumers, never a permission grant
// or evidence of a Provider cache hit. Keep semantic array order and raw text.
export function compiledRequestBinding({ resolved, contextPlan, promptIr, rendered }) {
    const semantic = {
        directives: promptIr.directives, contextSlots: promptIr.contextSlots,
        history: promptIr.history, input: promptIr.input, responseDirectives: promptIr.responseDirectives,
        tools: promptIr.tools, outputContract: promptIr.outputContract,
        ...(promptIr.prefill === undefined ? {} : { prefill: promptIr.prefill }),
    };
    const binding = {
        schemaVersion: 1,
        versions: promptIr.compilation?.versions ?? { compiler: 'injected', canonical: 'native.json.v1', layout: 'injected' },
        source: contextPlan.source,
        sourceFingerprint: hashNativeDocument({ source: contextPlan.source, items: contextPlan.items, provenance: contextPlan.provenance,
            ...(contextPlan.nativeSelection === undefined ? {} : { nativeSelection: contextPlan.nativeSelection }),
            ...(contextPlan.personaEvidence === undefined ? {} : { personaEvidence: contextPlan.personaEvidence }) }),
        targetFingerprint: resolved.pathFingerprint ?? null,
        promptProgramRef: resolved.route.promptProgramRef,
        generationProfileRef: resolved.route.generationProfileRef,
        resourceFingerprint: hashNativeDocument(resolved.resources),
        generationFingerprint: hashNativeDocument(resolved.generation),
        toolsFingerprint: hashNativeDocument(promptIr.tools),
        outputFingerprint: hashNativeDocument(promptIr.outputContract),
        historyFingerprint: hashNativeDocument(promptIr.history),
        prefixFingerprint: hashNativeDocument({ directives: promptIr.directives,
            contextSlots: promptIr.contextSlots.filter(item => item.target === 'context.before_history'),
            tools: promptIr.tools, outputContract: promptIr.outputContract }),
        contentFingerprint: hashNativeDocument(semantic),
        renderedFingerprint: rendered.wireFingerprint ?? hashNativeDocument(rendered),
    };
    return immutable({ ...binding, fingerprint: hashNativeDocument(binding) });
}

/** Identity of one final render; a digest never substitutes for a grant. */
export function compiledSendIdentity({ snapshot, resolved }) {
    const compiled = snapshot?.diagnostics?.compiledBinding;
    if (!compiled || !resolved?.pathFingerprint || typeof snapshot.requestId !== 'string' || !snapshot.requestId || snapshot.requestId !== snapshot.contextPlan?.requestId
        || snapshot.requestId !== snapshot.promptIr?.requestId || snapshot.runtimeRouteId !== resolved.route.runtimeRouteId
        || compiled.targetFingerprint !== resolved.pathFingerprint) throw new GenerationError('generation_request_identity_mismatch');
    const { fingerprint, ...binding } = compiled;
    if (hashNativeDocument(binding) !== fingerprint) throw new GenerationError('generation_request_identity_mismatch');
    const { createdAt: _time, ...stableSnapshot } = snapshot;
    return immutable({ requestId: snapshot.requestId, targetFingerprint: resolved.pathFingerprint,
        inputFingerprint: hashNativeDocument({ snapshot: stableSnapshot, routeId: resolved.route.runtimeRouteId }) });
}

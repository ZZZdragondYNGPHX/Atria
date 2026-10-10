import { hashNativeDocument } from '../repositories/common.js';
import { immutable } from './execution-utils.js';

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
        renderedFingerprint: hashNativeDocument(rendered),
    };
    return immutable({ ...binding, fingerprint: hashNativeDocument(binding) });
}

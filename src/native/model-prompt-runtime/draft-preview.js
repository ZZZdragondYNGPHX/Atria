import { assertJsonDeclaration, fields } from '../../../public/shared/native-values.js';
import { assertExactResourceRef } from './contracts.js';
import { assertVersionedModelPromptResource, getVersionedModelPromptResourceIdentity } from './resources.js';
import { checkCancellation, immutable } from './execution-utils.js';
import { hashNativeDocument } from '../repositories/common.js';

const DRAFT_TYPES = new Set(['core.prompt-program', 'core.prompt-module', 'core.generation-profile']);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const keyOf = ref => hashNativeDocument(ref);

// An ephemeral read overlay, never a writer or a new resource authority. The
// Resolver must first read and validate the original exact owned envelope.
export function prepareDraftOverrides(value) {
    const drafts = assertJsonDeclaration(value, 'Prompt drafts', 524288);
    if (!Array.isArray(drafts) || drafts.length > 32) fail('native_generation_draft_invalid');
    const replacements = new Map(), consumed = new Set();
    for (const item of drafts) {
        fields(item, ['ref', 'expectedFingerprint', 'resource'], 'Prompt draft');
        const ref = assertExactResourceRef(item.ref);
        if (!DRAFT_TYPES.has(ref.resourceType) || ref.scope === 'package') fail('native_generation_draft_owner');
        if (!/^[a-f0-9]{64}$/.test(item.expectedFingerprint || '')) fail('native_generation_draft_fingerprint_required');
        const resource = assertVersionedModelPromptResource(ref.resourceType, item.resource);
        const identity = getVersionedModelPromptResourceIdentity(ref.resourceType, resource);
        if (identity.resourceId !== ref.resourceId || identity.revision !== ref.revision) fail('native_generation_draft_identity');
        const key = keyOf(ref);
        if (replacements.has(key)) fail('native_generation_draft_duplicate');
        replacements.set(key, immutable({ ref, resource, expectedFingerprint: item.expectedFingerprint }));
    }
    return Object.freeze({
        identities: immutable([...replacements.values()].map(item => ({ ref: item.ref,
            baseFingerprint: item.expectedFingerprint, draftFingerprint: hashNativeDocument(item.resource) }))),
        resourceOverrides: async ({ ref, envelope }) => {
            const key = keyOf(ref), draft = replacements.get(key);
            if (!draft) return envelope;
            const base = assertVersionedModelPromptResource(ref.resourceType, envelope.snapshot);
            if (hashNativeDocument(base) !== draft.expectedFingerprint) fail('native_generation_draft_conflict');
            consumed.add(key);
            return { ...envelope, snapshot: draft.resource };
        },
        assertConsumed() {
            if (consumed.size !== replacements.size) fail('native_generation_draft_unreferenced');
        },
    });
}

// Redact only typed execution-state paths. Arbitrary author dictionaries, Tool
// schemas and evidence labels may legitimately use any of these field names.
function publicPromptIr(value) {
    const result = structuredClone(value);
    for (const message of result.history ?? []) delete message.providerState;
    for (const block of result.semanticBlocks ?? []) if (block.message) delete block.message.providerState;
    return result;
}

function publicWire(value) {
    const result = structuredClone(value);
    if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
    for (const key of ['previous_response_id', 'endpoint', 'headers', 'authorization', 'secretRef']) delete result[key];
    for (const key of ['messages', 'contents', 'input']) {
        if (!Array.isArray(result[key])) continue;
        result[key] = result[key].filter(message => !['reasoning', 'redacted_thinking'].includes(message?.type));
        for (const message of result[key]) {
            if (!message || typeof message !== 'object') continue;
            for (const field of ['providerState', 'encrypted_content', 'thoughtSignature']) delete message[field];
            if (Array.isArray(message.content)) message.content = message.content.filter(block => !['thinking', 'redacted_thinking', 'reasoning'].includes(block?.type));
            if (Array.isArray(message.parts)) {
                message.parts = message.parts.filter(part => part?.thought !== true);
                for (const part of message.parts) if (part && typeof part === 'object') delete part.thoughtSignature;
            }
        }
    }
    return result;
}

function observation(result, drafts) {
    if (result.preview !== true || !result.snapshot || !result.rendered) fail('native_generation_draft_preview_required');
    const snapshot = result.snapshot, diagnostics = snapshot.diagnostics;
    const binding = diagnostics?.compiledBinding;
    if (!binding) fail('native_generation_draft_identity_unavailable');
    const identity = {
        source: binding.source, sourceFingerprint: binding.sourceFingerprint,
        targetFingerprint: binding.targetFingerprint, versions: binding.versions,
        runtimeRouteId: snapshot.runtimeRouteId, modelProfileId: snapshot.modelProfileId,
        connectionProfileId: snapshot.connectionProfileId,
        promptProgramRef: snapshot.promptProgramRef, generationProfileRef: snapshot.generationProfileRef,
        // A source digest is not a permission grant: Host/ContextProvider still
        // perform their original read/currentness checks on every compilation.
    };
    const resources = diagnostics.effectiveConfig.resources.map(entry => {
        const draft = drafts.identities.find(item => keyOf(item.ref) === keyOf(entry.ref));
        const resourceFingerprint = hashNativeDocument(assertVersionedModelPromptResource(entry.ref.resourceType, entry.resource));
        return { ...entry, baseFingerprint: draft?.baseFingerprint ?? resourceFingerprint, resourceFingerprint };
    });
    return immutable({ identity, authored: {
        resources, drafts: drafts.identities,
    }, effective: {
        promptIr: publicPromptIr(snapshot.promptIr), inputTokens: diagnostics.inputTokens,
        budget: snapshot.contextPlan.budget, compilation: snapshot.promptIr.compilation ?? {}, binding,
    }, wire: publicWire(result.rendered.publicBody ?? result.rendered.body ?? null) });
}

function differences(before, after, path = '', output = []) {
    if (hashNativeDocument(before) === hashNativeDocument(after)) return output;
    const objects = before && after && typeof before === 'object' && typeof after === 'object'
        && !Array.isArray(before) && !Array.isArray(after);
    if (objects) {
        for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
            const pointer = path + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1');
            if (!(key in before)) output.push({ path: pointer, kind: 'added' });
            else if (!(key in after)) output.push({ path: pointer, kind: 'removed' });
            else differences(before[key], after[key], pointer, output);
        }
    } else output.push({ path: path || '/', kind: 'changed' });
    return output;
}

export async function previewPromptDraft(host, handle, value, signal) {
    const input = assertJsonDeclaration(value, 'Prompt draft preview', 1048576);
    fields(input, ['request', 'drafts', 'baselineDrafts'], 'Prompt draft preview');
    if (!input.request || typeof input.request !== 'object' || Array.isArray(input.request)) fail('native_generation_draft_invalid');
    const baselineDrafts = input.baselineDrafts ?? [];
    const candidate = prepareDraftOverrides(input.drafts), baseline = prepareDraftOverrides(baselineDrafts);
    const compile = async drafts => {
        checkCancellation(signal);
        const result = await host.execute(handle, input.request, signal, undefined, { preview: true, draftOverrides: drafts });
        drafts.assertConsumed();
        checkCancellation(signal);
        return observation(result, drafts);
    };
    const before = await compile(baseline), after = await compile(candidate);
    if (hashNativeDocument(before.identity) !== hashNativeDocument(after.identity)) fail('native_generation_draft_source_conflict');
    // A final observation detects source/config changes during a multi-compile
    // comparison; browser-submitted snapshots are never accepted as a baseline.
    const rechecked = await compile(prepareDraftOverrides(baselineDrafts));
    if (hashNativeDocument(before) !== hashNativeDocument(rechecked)) fail('native_generation_draft_source_conflict');
    return immutable({ schemaVersion: 1, preview: true, publication: 'unpublished', sent: false,
        baseline: before, candidate: after, diff: {
            sameSource: true, identityFingerprint: hashNativeDocument(after.identity),
            authored: differences(before.authored, after.authored),
            effective: differences(before.effective, after.effective), wire: differences(before.wire, after.wire),
        } });
}

import { snapshotAnchor, prepareAuthorityTransaction } from './authority-transaction.js';
import { loadTaskLogic } from './task-authority.js';
import { assertJsonDeclaration } from '../../public/shared/native-values.js';
import { assertTaskValue } from '../../public/shared/native-task-contract.js';
import { compileDataSchema } from '../../public/shared/native-data-schema.js';
import { hashNativeDocument } from './repositories/common.js';
import { immutable } from './model-prompt-runtime/execution-utils.js';
import { createNativeId } from './identity.js';

// HTTP hosts are short-lived. Share retry pins across Host/SessionCore instances
// for the same storage engine, not across users or independent databases. These
// are bounded execution continuations, never published mechanical authority.
const enginePins = new WeakMap();
export function authoritySelectionCache(core) {
    const engine = core._sessions?._engine ?? core;
    let pins = enginePins.get(engine);
    if (!pins) { pins = new Map(); enginePins.set(engine, pins); }
    return pins;
}
export const hasAuthorityTransactions = snapshot => Boolean(snapshot.manifest.runtime?.experienceContract?.authorityRuntime);
export const authorityFailure = code => Object.assign(new TypeError(code), { code });
export const authorityValue = value => assertJsonDeclaration(value, 'Authority Turn value', 65536);

// Only public declaration metadata crosses the resolver boundary. Never include
// validators, effects, private grants or authoring-only Resolution formulas.
export async function authorityCatalog(_base, installed) {
    const { logic } = loadTaskLogic(installed);
    return immutable(logic.transactions.filter(item => item.origin !== 'simulation').map(({ id, verb, inputSchema, intent, coalesceInput }) => ({ id, verb, inputSchema, intent,
        ...(coalesceInput ? { coalesceInput: true } : {}) })));
}
export function authoritySelection(catalog, raw, { resolver = false } = {}) {
    const value = authorityValue(raw);
    if (Object.keys(value).some(key => !['transactionId', 'input'].includes(key))) throw authorityFailure('native_authority_selection_invalid');
    const declared = catalog.find(item => item.id === value.transactionId && (!resolver || item.intent.expose));
    if (!declared) throw authorityFailure('native_authority_selection_denied');
    return immutable({ transactionId: declared.id, input: assertTaskValue(value.input, compileDataSchema(declared.inputSchema)) });
}
// Typed and narrated submissions share the same mechanical anchor. Retrying a
// failed preparation at an unchanged head cannot obtain a different RNG draw.
export function authorityPlayerEntry(core, base, selection, catalog) {
    const content = JSON.stringify({ verb: catalog.find(item => item.id === selection.transactionId).verb, input: selection.input });
    const player = structuredClone(core._newEntry(base, { role: 'user', content, metadata: { atri_authority_input: selection } }));
    const stable = hashNativeDocument({ sessionId: base.session.sessionId, branchId: base.revision.branchId,
        revisionId: base.revision.revisionId, transactionId: selection.transactionId });
    const messageId = createNativeId('message', () => stable.slice(0, 32));
    const variantId = createNativeId('variant', () => stable.slice(32));
    Object.assign(player.entry, { messageId, variantIds: [variantId], activeVariantId: variantId });
    Object.assign(player.variant, { messageId, variantId });
    return player;
}
export function resolverRequest(catalog, observation, userInput) {
    const exposed = catalog.filter(item => item.intent.expose);
    if (!exposed.length) throw authorityFailure('native_authority_catalog_empty');
    // One tool per fixed declaration, not a generic dynamic authority tool.
    const tools = exposed.map((item, index) => ({ type: 'function', function: { name: 'atri_transaction_' + index,
        description: item.intent.description, parameters: compileDataSchema(item.inputSchema) } }));
    const payload = authorityValue({ instruction: 'Select exactly one declared transaction with validated input. No state patches or prose outcomes.',
        catalog: exposed.map((item, index) => ({ tool: tools[index].function.name, transactionId: item.id, verb: item.verb })), observation, userInput });
    authorityValue({ tools, payload });
    return { tools, payload, select(response) {
        const calls = response.toolCalls ?? response.tool_calls ?? [];
        if (calls.length !== 1) throw authorityFailure('native_authority_selection_required');
        const call = calls[0]; const name = call.name ?? call.function?.name;
        const index = tools.findIndex(tool => tool.function.name === name);
        if (index < 0) throw authorityFailure('native_authority_selection_denied');
        let args = call.args ?? call.arguments ?? call.function?.arguments;
        if (typeof args === 'string') { if (Buffer.byteLength(args, 'utf8') > 65536) throw authorityFailure('native_authority_input_limit'); args = JSON.parse(args); }
        return authoritySelection(catalog, { transactionId: exposed[index].id, input: args }, { resolver: true });
    } };
}

// Private proof objects are not serializable authority. SessionCore owns their
// provenance and refuses caller-created candidates at its public finalize seam.
const preparations = new WeakMap();
export async function prepareAuthorityTurn(core, owner, base, installed, selection, player = null) {
    selection = immutable(authorityValue(selection));
    player = player ? immutable(player) : null;
    const source = player ? { ...base, timeline: [...base.timeline, player.entry], variants: [...base.variants, player.variant] } : base;
    const request = { ...selection, anchor: snapshotAnchor(source), playerMessageId: source.timeline.at(-1)?.messageId };
    const prepared = await prepareAuthorityTransaction(source, installed, request);
    const { logic } = loadTaskLogic(installed);
    if (logic.transactions.find(item => item.id === selection.transactionId)?.savePointBefore && base.states.atri_run?.mode !== 'ironman') {
        await core.createSavePoint(owner, base.session.sessionId, { expectedRevisionId: base.revision.revisionId, kind: 'auto', displayName: 'Before choice' });
    }
    const proof = Object.freeze({});
    preparations.set(proof, { core, owner, baseRevisionId: base.revision.revisionId, prepared, player, selection });
    return Object.freeze({ proof, prepared });
}
export function authorityTurnProof(core, owner, base, proof) {
    const value = preparations.get(proof);
    if (!value || value.core !== core || value.owner !== owner || value.baseRevisionId !== base.revision.revisionId
        || value.prepared.candidate.session.sessionId !== base.session.sessionId) throw authorityFailure('native_authority_proof_required');
    return value;
}
export function authorityActionRequest(prepared, selection, invocationId, revisionId, player) {
    const request = { actionId: selection.transactionId, commandId: selection.transactionId, args: {}, expectedRevisionId: revisionId,
        idempotencyKey: 'authority:' + invocationId, compensation: null, compensates: null,
        authorityId: prepared.identity, inputHash: prepared.inputHash,
        ...(prepared.receipt.execution ? { execution: prepared.receipt.execution } : {}),
        ...(prepared.receipt.artifacts ? { artifacts: prepared.receipt.artifacts } : {}), playerMessageId: prepared.receipt.playerMessageId, source: player ? 'frontend' : 'intent' };
    return { ...request, fingerprint: hashNativeDocument(request) };
}

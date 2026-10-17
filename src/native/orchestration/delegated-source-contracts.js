import { RpRunControl, rpOperationInput } from '../rp-run-control.js';
import { ConflictError } from '../../storage/errors.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { assertNativeId } from '../identity.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { sourceMessageId } from '../../../public/scripts/agents/memory/source-provenance.js';

export const delegatedRpSourcePins = plan => plan.dependencyPins.filter(pin => pin.port === 'context' && pin.resourceRef.kind === 'native_rp_message');
const denied = () => { throw new ConflictError('native_orchestration_source_stale'); };

/** Original owner-scoped Chat source. Publication pins data, never a read grant. */
export async function readDelegatedRpSource(handle, ref, rpControl, { tx } = {}) {
    assertObject(ref, ['kind', 'controlId', 'messageId', 'variantId', 'contentHash'], 'Delegated RP SourceRef');
    if (ref.kind !== 'native_rp_message' || !(rpControl instanceof RpRunControl)) denied();
    assertNativeId(ref.controlId, 'rpControl');
    if (typeof ref.messageId !== 'string' || !ref.messageId) denied();
    assertCounter(ref.variantId, 'variantId'); assertDigest(ref.contentHash, 'contentHash');
    const read = async transaction => {
        const control = await RpRunControl.prototype.status.call(rpControl, handle, ref.controlId, { tx: transaction });
        if (!control || control.restoreState !== 'ready') denied();
        const chat = await transaction.getResource({ kind: 'chat', handle, ...control.locator });
        if (chat?.header?.chat_metadata?.nativeControlId !== ref.controlId) denied();
        const indices = chat.body.flatMap((message, index) => sourceMessageId(message) === ref.messageId ? [index] : []);
        if (indices.length !== 1) denied();
        const index = indices[0], message = chat.body[index];
        if (message.is_system || message.atri_native?.messageId || typeof message.mes !== 'string') denied();
        const actual = rpOperationInput(message, index);
        if (actual.variantId !== ref.variantId || actual.contentHash !== ref.contentHash) denied();
        return { sourceRef: ref, index, role: message.is_user ? 'user' : 'assistant', content: message.mes };
    };
    return tx ? read(tx) : rpControl._engine.withTransaction(handle, read);
}

/** Parent and recipient must independently own the same exact immutable pin. */
export async function readDelegatedRpSources(handle, { parentPlan, childPlan, controlId, floor }, rpControl, options) {
    const parents = delegatedRpSourcePins(parentPlan), children = delegatedRpSourcePins(childPlan);
    if (parents.length !== children.length) denied();
    const sources = [];
    for (const pin of children) {
        if (!parents.some(parent => hash(parent.resourceRef) === hash(pin.resourceRef) && parent.integrity === pin.integrity)
            || pin.resourceRef.controlId !== controlId) denied();
        const source = await readDelegatedRpSource(handle, pin.resourceRef, rpControl, options);
        if (hash(source) !== pin.integrity || source.index > floor) denied();
        sources.push(source);
    }
    return sources;
}

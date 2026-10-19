import { SessionCore } from '../session-core.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { actorAvailability, informationContext } from '../../../public/shared/native-information-runtime.js';
import { equalNativeDocuments, hashNativeDocument as hash } from '../repositories/common.js';
import { ConflictError } from '../../storage/errors.js';
import { assertRunAccess } from '../run-control.js';

const fail = () => { throw new ConflictError('native_orchestration_context_audience_denied'); };
export const audienceContextPin = (node, pins) => node?.policy?.audiencePinId === undefined ? null
    : pins.find(pin => pin.pinId === node.policy.audiencePinId && node.dependencyPinIds.includes(pin.pinId) && pin.port === 'context');

/** An exact Source pin selects an original Information view; it never creates
 * an Actor, an exposure grant, a Memory store or a Session write permission. */
function assertAudienceRef(ref) {
    assertObject(ref, ref.anchor === 'run_source' ? ['kind', 'anchor', 'sessionId', 'audience'] : ['kind', 'sessionId', 'branchId', 'revisionId', 'audience'], 'Audience Source');
    assertObject(ref.audience, ['kind', ...(Object.hasOwn(ref.audience, 'id') ? ['id'] : [])], 'Source audience');
    if (ref.kind !== 'native_information_context'
        || !['narrator', 'actor'].includes(ref.audience.kind)
        || (ref.audience.kind === 'actor' ? typeof ref.audience.id !== 'string' || !ref.audience.id : ref.audience.id !== undefined)) fail();
}

export function projectAudienceSource(ref, snapshot) {
    assertAudienceRef(ref);
    if (snapshot.session.sessionId !== ref.sessionId || ref.anchor !== 'run_source'
        && (snapshot.revision.branchId !== ref.branchId || snapshot.revision.revisionId !== ref.revisionId)) fail();
    const information = informationContext(snapshot, ref.audience);
    if (!information?.projection || information.projection.truncated || information.projection.availability.some(item => !item.available)
        || ref.audience.kind === 'actor' && !actorAvailability(snapshot, ref.audience.id).available) fail();
    const actualRef = ref.anchor === 'run_source' ? { kind: ref.kind, sessionId: ref.sessionId,
        branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId, audience: ref.audience } : ref;
    const descriptor = { sourceRef: actualRef, information };
    // The authored policy freezes the installed original Package, including its
    // Information/Actor view definitions. Session values remain Run inputs.
    const policyDescriptor = ref.anchor === 'run_source' ? { sourceRef: ref,
        packageRef: { packageId: snapshot.session.packageId, packageVersionId: snapshot.session.packageVersionId },
        policyDigest: hash(snapshot.manifest) } : descriptor;
    return { descriptor, policyDescriptor, actualRef, snapshot, information };
}

async function readSnapshot(handle, sessionId, core) {
    const repo = core._sessions, engine = repo._engine;
    const read = () => engine.withTransaction(handle, async tx => {
        await assertRunAccess(tx, handle, sessionId, 'generate');
        return core.observe(handle, sessionId);
    });
    // Match SourcePort.capture: an already isolated original-domain read must
    // not acquire a Session lock behind the Engine transaction. Another worker
    // may hold that lock while waiting for this transaction to finish.
    return engine.hasActiveTransaction(handle) ? read() : repo.withRunLock(handle, sessionId, read);
}

export async function readAudienceSource(handle, ref, core) {
    assertAudienceRef(ref);
    if (!(core instanceof SessionCore)) fail();
    const snapshot = await readSnapshot(handle, ref.sessionId, core);
    // Publication records only the authorized projection and immutable anchor,
    // never the raw snapshot or another Actor's state.
    const source = projectAudienceSource(ref, snapshot);
    return { ...source, descriptor: source.policyDescriptor };
}

export async function readAudiencePin(handle, node, pins, core) {
    return (await readAudiencePins(handle, [node], pins, core))[0];
}

/** One current original read per Session at this boundary. Only the immutable
 * snapshot is shared; every Actor still gets its own Information admission.
 * No snapshot or authorization is reused at a later asynchronous boundary. */
export async function readAudiencePins(handle, nodes, pins, core) {
    const snapshots = new Map(), projections = new Map(), selected = [];
    for (const node of nodes) {
        const pin = audienceContextPin(node, pins);
        if (!pin) { if (node.policy.audiencePinId !== undefined) fail(); selected.push(null); continue; }
        assertAudienceRef(pin.resourceRef);
        if (!(core instanceof SessionCore)) fail();
        if (!snapshots.has(pin.resourceRef.sessionId)) {
            snapshots.set(pin.resourceRef.sessionId, await readSnapshot(handle, pin.resourceRef.sessionId, core));
        }
        const projectionKey = hash(pin.resourceRef);
        if (!projections.has(projectionKey)) {
            const source = projectAudienceSource(pin.resourceRef, snapshots.get(pin.resourceRef.sessionId));
            projections.set(projectionKey, { source, policyIntegrity: hash(source.policyDescriptor),
                descriptorIntegrity: pin.resourceRef.anchor === 'run_source' ? hash(source.descriptor) : null });
        }
        const { source, policyIntegrity, descriptorIntegrity } = projections.get(projectionKey);
        if (policyIntegrity !== pin.integrity) fail();
        selected.push({ ...source, pin, audience: pin.resourceRef.audience,
            ...(pin.resourceRef.anchor === 'run_source' ? { capture: captureProvenance(pin, source, descriptorIntegrity) } : {}) });
    }
    return selected;
}

/** Sharing is separate from graph eligibility. Every source projection must
 * be readable by the recipient, including field values and epistemic labels.
 * Missing proof yields a reference-only result, never an inferred disclosure. */
export async function audienceResultAccess(handle, producer, recipient, pins, core, recipientPins = pins) {
    const [from, to] = recipientPins === pins ? await readAudiencePins(handle, [producer, recipient], pins, core)
        : [await readAudiencePin(handle, producer, pins, core), await readAudiencePin(handle, recipient, recipientPins, core)];
    if (!from) return !to; // ordinary RP history is not an Actor grant
    if (!to || equalNativeDocuments(from.actualRef, to.actualRef)) return !!to;
    if (from.audience.kind === 'narrator' && to.audience.kind === 'actor') return false; // the RP prefix is separately narrator-scoped
    const a = from.actualRef, b = to.actualRef;
    if (a.sessionId !== b.sessionId || a.branchId !== b.branchId || a.revisionId !== b.revisionId) return false;
    const legal = new Set(to.information.projection.items.map(hash));
    // Knowledge, Memory, Expression and executable derivations have separate
    // source contracts. An Information subset alone cannot declassify them.
    const derivations = from.snapshot.manifest.runtime?.experienceContract?.contextRuntime?.derivations ?? [];
    if (from.information.knowledge || from.information.memory || from.information.narration?.expression
        || derivations.some(declaration => declaration.viewId === from.information.projection.viewId)) return false;
    return from.information.projection.items.every(item => legal.has(hash(item)));
}

/** A durable Run capture is data provenance, never a fresh read grant. */
export function audienceRunCapture(pin, source) {
    return captureProvenance(pin, source, hash(source.descriptor));
}

function captureProvenance(pin, source, integrity) {
    return { pinId: pin.pinId, policyRef: pin.resourceRef, policyIntegrity: pin.integrity,
        sourceRef: source.actualRef, integrity };
}

export function assertAudienceRunCapture(root, node, pins, input) {
    const pin = audienceContextPin(node, pins);
    if (node?.policy?.audiencePinId !== undefined && !pin) fail();
    if (pin) {
        assertAudienceRef(pin.resourceRef);
        if (!input?.audience || !equalNativeDocuments(input.audience, pin.resourceRef.audience)) fail();
    }
    if (pin?.resourceRef.anchor !== 'run_source') {
        if (input && Object.hasOwn(input, 'audienceCapture')) fail();
        return null;
    }
    const capture = input?.audienceCapture, ref = pin.resourceRef, source = root.sourceBinding;
    assertObject(capture, ['pinId', 'policyRef', 'policyIntegrity', 'sourceRef', 'integrity'], 'Run Audience capture');
    assertAudienceRef(capture.sourceRef);
    const expected = source.sourceAuthority === 'native_session' ? { kind: ref.kind, ...source.sourceRef, audience: ref.audience } : capture.sourceRef;
    if (!['native_session', 'rp_chat'].includes(source.sourceAuthority) || capture.sourceRef.anchor !== undefined
        || capture.sourceRef.sessionId !== ref.sessionId || !equalNativeDocuments(capture.sourceRef.audience, ref.audience)
        || source.sourceAuthority === 'native_session' && ref.sessionId !== source.sourceRef.sessionId
        || capture.pinId !== pin.pinId || !equalNativeDocuments(capture.policyRef, ref) || capture.policyIntegrity !== pin.integrity
        || !equalNativeDocuments(capture.sourceRef, expected) || !/^[a-f0-9]{64}$/.test(capture.integrity)
        || !equalNativeDocuments(input.audience, ref.audience)) fail();
    return capture;
}

import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { hashNativeDocument } from '../repositories/common.js';

/** Derived reference adapter for original Native deletion/GC authorities. */
export async function orchestrationPinReferences(tx, handle, reference) {
    const references = [];
    for (const kind of [K.orchestrationPlan, K.orchestrationRevision]) {
        for (const record of await tx.listResources({ kind, handle })) {
            if (hashNativeDocument(record.doc) !== record.integrity || !Array.isArray(record.doc.dependencyPins)) throw new TypeError('Corrupt orchestration dependency root');
            for (const pin of record.doc.dependencyPins) {
                const ref = pin.resourceRef;
                const matches = reference.runtimeRouteId ? ref?.scope === 'player' && ref.runtimeRouteId === reference.runtimeRouteId
                    : ref?.resourceType === reference.resourceType && ref?.resourceId === reference.resourceId
                        && (!reference.scope || ref.scope === reference.scope)
                        && (reference.revision == null || ref.revision === reference.revision)
                        && (!reference.projectId || ref.projectId === reference.projectId)
                        && (!reference.packageId || ref.packageId === reference.packageId)
                        && (!reference.packageVersionId || ref.packageVersionId === reference.packageVersionId);
                if (matches) references.push({ kind, planId: record.key.planId, planRevisionId: record.key.planRevisionId ?? null, pinId: pin.pinId });
            }
        }
    }
    return references;
}

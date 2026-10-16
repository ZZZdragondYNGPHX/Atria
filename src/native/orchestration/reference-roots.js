import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertRunRoot } from './run-repository.js';
import { checkedRecord } from './plan-repository.js';
import { assertEffectIntent } from './effect-contracts.js';

/** Retention only: these references never make an uncommitted revision readable.
 * There is no V3 retention-release authority yet, so terminal Runs and historical
 * unknown observations retain their original sources just like active Runs. */
export async function orchestrationSessionRoots(tx, handle, sessionId) {
    const roots = new Map(), references = [], revisionIds = new Set(), branchIds = new Set(), records = [];
    for (const row of await tx.listResources({ kind: K.orchestrationRun, handle })) {
        const checked = await checkedRecord(tx, row.key);
        if (!checked || checked.doc.runId !== row.key.runId) throw new TypeError('Missing or mismatched orchestration retention root');
        assertRunRoot(checked.doc, handle);
        roots.set(checked.doc.runId, checked.doc); records.push({ ...checked, key: row.key });
    }
    for (const row of await tx.listResources({ kind: K.orchestrationRecord, handle })) {
        const checked = await checkedRecord(tx, row.key), root = roots.get(row.key.runId);
        if (!checked || !root || checked.doc.runId !== root.runId) throw new TypeError('Missing orchestration record retention owner');
        if (row.key.recordType === 'effect') assertEffectIntent(checked.doc, root, row.key.recordId);
        records.push({ ...checked, key: row.key });
    }
    for (const row of records) {
        const revisions = new Set(), branches = new Set(); let mentioned = false;
        const visit = value => {
            if (!value || typeof value !== 'object') return;
            if (value.sessionId === sessionId) {
                mentioned = true;
                if (typeof value.revisionId === 'string') revisions.add(value.revisionId);
                if (typeof value.branchId === 'string') branches.add(value.branchId);
            }
            for (const child of Object.values(value)) visit(child);
        };
        visit(row.doc);
        // The original domain may have committed before its Host receipt ACK.
        // Follow that exact stable operation even while the Effect is pending.
        if (row.key.recordType === 'effect' && row.doc.actionRef?.kind === 'native_session_output'
            && row.doc.actionRef.sessionId === sessionId) {
            const root = roots.get(row.key.runId), input = row.doc.inputRef;
            const committed = await checkedRecord(tx, { kind: K.commitReceipt, handle, sessionId, commitId: input.commitId });
            if (committed) {
                const receipt = committed.doc;
                if (root.sourceBinding.sourceAuthority !== 'native_session' || receipt.schemaVersion !== 1 || receipt.status !== 'committed'
                    || receipt.sessionId !== sessionId || receipt.branchId !== root.sourceBinding.sourceRef.branchId
                    || receipt.expectedRevisionId !== root.sourceBinding.sourceRef.revisionId || receipt.commitId !== input.commitId
                    || receipt.fingerprint !== input.requestFingerprint) throw new TypeError('Invalid Session output retention receipt');
                visit(receipt);
            }
        }
        if (!mentioned) continue;
        for (const id of revisions) revisionIds.add(id);
        for (const id of branches) branchIds.add(id);
        references.push({ kind: row.key.kind, runId: row.key.runId, recordType: row.key.recordType ?? null,
            recordId: row.key.recordId ?? null, revisionIds: [...revisions].sort(), branchIds: [...branches].sort(), integrity: row.integrity });
    }
    references.sort((left, right) => hashNativeDocument(left).localeCompare(hashNativeDocument(right)));
    return { revisionIds: [...revisionIds].sort(), branchIds: [...branchIds].sort(), references, fingerprint: hashNativeDocument(references) };
}

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

// Presentation cache of original Host receipts, never an evidence authority.
const receipts = new WeakMap();
export function rememberEvidenceReceipt(runtime, result) {
    const evidenceId = result?.evidenceCapture?.evidenceId;
    const snapshot = runtime?.snapshot;
    if (!/^[a-f0-9]{64}$/.test(evidenceId || '') || !snapshot?.session || !snapshot?.revision) return;
    const rows = receipts.get(runtime) || [];
    const receipt = { evidenceId, sessionId: snapshot.session.sessionId, branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
    receipts.set(runtime, [receipt, ...rows.filter(row => row.evidenceId !== evidenceId)].slice(0, 20));
}
export function sessionEvidenceReceipts(runtime) {
    const snapshot = runtime?.snapshot;
    return (receipts.get(runtime) || []).filter(row => row.sessionId === snapshot?.session?.sessionId && row.branchId === snapshot?.revision?.branchId);
}

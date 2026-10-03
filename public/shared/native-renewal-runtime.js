// Bounded read-only deliberation projection. Hypotheses and proposed testimony
// are not permission to add structural facts. Hidden truth is never projected.
export function renewalView(snapshot) {
    const r = snapshot.states.atri_lifecycle?.lifetimes?.renewal;
    if (!r) throw new TypeError('Renewal not declared');
    return Object.values(r.active).sort((a, b) => a.id.localeCompare(b.id, 'en')).map(m => ({
        id: m.id, deadline: m.deadline, status: m.status, trigger: m.trigger, subjectId: m.subjectId, institutionId: m.institutionId,
        placeId: m.placeId, ...(m.regionId ? { regionId: m.regionId, eraId: m.eraId } : {}), hookId: m.hookId, sourceId: m.sourceId,
        nextActions: m.stage < m.path.length ? [m.path[m.stage]] : ['settle', 'record'],
        evidence: structuredClone(m.evidence), testimony: { channel: 'told_by', epistemicStatus: 'unverified', text: m.presentation },
        proposal: { operation: 'matter.act', id: m.id, presentationMaxLength: 320, structuralAuthority: 'runtime-only' },
    }));
}

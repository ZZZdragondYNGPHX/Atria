// Bounded, disclosure-safe backend view. Never exposes hidden agent loyalty,
// unreported deficits, secret incidents or mutable references to authority state.
export function enterpriseView(snapshot) {
    const s = snapshot.states.atri_lifecycle?.lifetimes, e = s?.enterprise;
    if (!e) throw new TypeError('Enterprise not declared');
    const values = x => Object.values(x).sort((a, b) => a.id.localeCompare(b.id, 'en'));
    const legal = e.identities[s.continuity.publicIdentityId];
    const view = { identity: { id: legal.id, name: legal.name, status: legal.status }, bankAccessible: e.bankIdentityId === legal.id && legal.status === 'active',
        progress: { investigation: e.progress.investigation, commerce: e.progress.commerce, occult: e.progress.occult, specializations: e.progress.knowledge.length, embodied: e.progress.embodied },
        roles: values(e.roles).filter(x => x.status === 'active').slice(0, 8).map(x => ({ id: x.id, roleId: x.roleId, obligation: x.obligation })),
        assets: values(e.assets).slice(0, 8).map(x => ({ id: x.id, placeId: x.placeId, ownerId: x.ownerId, identityId: x.identityId, titleEventId: x.titleEventId })),
        contracts: values(e.contracts).filter(x => !['revoked', 'completed'].includes(x.status)).slice(0, 8).map(x => ({ id: x.id, domain: x.domain, targetId: x.targetId, agentId: x.agentId, status: x.status, nextReview: x.nextReview, report: x.report })),
        organizations: values(e.organizations).slice(0, 4).map(x => ({ id: x.id, agenda: x.agenda, founderAgenda: x.founderAgenda, autonomy: x.autonomy, status: x.status, workforce: values(e.nodes).filter(n => n.institutionId === x.id).reduce((n, x) => n + x.workforce, 0) })) };
    const activeOrgs = view.organizations.filter(x => x.status === 'active'), workforce = activeOrgs.reduce((n, x) => n + x.workforce, 0);
    view.influence = { scale: workforce >= 100 ? 'city_institution' : activeOrgs.length ? 'local_institution' : 'low_profile', workforce, institutions: activeOrgs.length };
    return structuredClone(view);
}

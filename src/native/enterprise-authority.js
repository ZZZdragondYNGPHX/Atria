import { ENTERPRISE_OPERATIONS, ENTERPRISE_ACTIONS } from '../../public/shared/native-enterprise-contract.js';
import { people, ageAt, anniversary } from '../../public/shared/native-lifetime-runtime.js';
import { assertTaskValue } from '../../public/shared/native-task-contract.js';
import { fields } from '../../public/shared/native-values.js';
const need = (v, m) => { if (!v) throw new TypeError('Enterprise ' + m); };
const safe = n => { need(Number.isSafeInteger(n), 'integer overflow'); return n; };
const sorted = o => Object.values(o).sort((a, b) => a.id.localeCompare(b.id, 'en'));
const next = e => 'enterprise.' + e.nextId++;
const alive = p => p && !['dead', 'absent', 'missing'].includes(p.status.kind);
const active = p => p?.status.kind === 'active';
const liveInstitution = i => i && (i.status === undefined || i.status === 'active');
const livePlace = p => p && !['burned', 'demolished', 'closed'].includes(p.status);
const source = (snapshot, s, id) => s.renewal?.canonical[id]?.closed !== undefined || snapshot.states.atri_lifecycle.history?.facts[id]?.public === true;
const refs = (...ids) => ids.filter(Boolean).map(id => 'actor:' + id);
function log(e, kind, tick, sourceId, detail, isPublic = true) {
    const id = next(e); e.events[id] = { id, kind, tick, sourceId, detail, public: isPublic, refs: [] }; return id;
}
function money(e, account, delta, tick, kind, sourceId, isPublic = true) {
    const balance = account === 'treasury' ? e.reserves : e.assets[account].balance;
    need(safe(balance + delta) >= 0, 'insufficient reserves');
    if (account === 'treasury') e.reserves += delta; else e.assets[account].balance += delta;
    const id = next(e); e.movements[id] = { id, account, delta, tick, kind, sourceId, public: isPublic, refs: [] };
}
function legal(s) { const e = s.enterprise; return e.identities[s.continuity.publicIdentityId]?.status === 'active'; }
function bank(s) { return legal(s) && s.enterprise.bankIdentityId === s.continuity.publicIdentityId; }
function permission(s, p, name) { return sorted(s.enterprise.roles).some(r => r.status === 'active' && p.roles.find(x => x.id === r.roleId)?.permission === name); }
function profile(s, policy, id) {
    const e = s.enterprise; if (e.agents[id]) return e.agents[id];
    let n = policy.seed; for (const c of id) n = (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0;
    const actor = people(s)[id]; need(actor, 'agent missing');
    return e.agents[id] = { id, competence: 45 + n % 51, loyalty: 35 + Math.floor(n / 11) % 61, ambition: 20 + Math.floor(n / 101) % 76,
        interest: ['service', 'profit', 'secrecy'][n % 3], sourceId: actor.identity.origin.sourceId, refs: refs(id) };
}
export function initialEnterprise(policy) {
    const p = policy.enterprise;
    return { schemaVersion: 1, nextId: 1, reserves: p.initialReserves, bankIdentityId: policy.publicIdentityId,
        identities: { [policy.publicIdentityId]: { id: policy.publicIdentityId, actorId: policy.protagonistId, name: 'Initial public identity', since: 0, ended: null, status: 'active', method: 'authored', sourceId: p.endowmentSource, predecessorId: '', liabilities: 0, refs: refs(policy.protagonistId) } },
        progress: { investigation: 0, commerce: 0, occult: 0, knowledge: [], embodied: 0, scars: 0 }, roles: {}, assets: {}, agents: {}, organizations: {}, nodes: {}, contracts: {}, events: {}, movements: {} };
}
function title(e, a, ownerId, identityId, tick, reason, sourceId) {
    const previous = a.ownerId;
    a.ownerId = ownerId; a.identityId = identityId; a.since = tick; a.status = 'active'; if (reason !== 'regularization') a.heirId = '';
    a.titleEventId = log(e, 'ownership', tick, sourceId, { assetId: a.id, previousOwnerId: previous, ownerId, identityId, reason });
}
function alert(e, c, tick, reason) {
    if (c.status !== 'active') return;
    c.status = 'escalated'; c.report = { tick, reason, outcome: 'awaiting_authority', reportedBalance: e.assets[c.targetId]?.balance ?? 0 };
    log(e, 'escalation', tick, c.id, { contractId: c.id, reason });
}
export function syncEnterprise(snapshot, s, policy, tick) {
    if (!policy.enterprise) return;
    const e = s.enterprise, all = people(s), hero = all[policy.protagonistId];
    if (e.progress.scars < s.continuity.scars) { e.progress.embodied = 0; e.progress.scars = s.continuity.scars; }
    for (const r of sorted(e.roles)) if (r.status === 'active' && (!legal(s) || r.identityId !== s.continuity.publicIdentityId || !active(hero) || (r.institutionId && !liveInstitution(s.institutions[r.institutionId])))) { r.status = 'suspended'; r.ended = tick; }
    const currentRole = sorted(e.roles).find(r => r.status === 'active' && r.roleId === hero.career.occupation);
    if (!currentRole && sorted(e.roles).some(r => r.roleId === hero.career.occupation)) {
        const remaining = sorted(e.roles).filter(r => r.status === 'active').sort((a, b) => b.since - a.since)[0];
        hero.career = { occupation: remaining?.roleId ?? 'private citizen', institutionId: remaining?.institutionId ?? '', since: tick };
    }
    for (const a of sorted(e.assets)) {
        const place = s.renewal.places[a.placeId];
        if (['burned', 'demolished'].includes(place?.status)) { a.status = 'destroyed'; a.condition = 0; }
        if (['destroyed', 'seized'].includes(a.status)) continue;
        const owner = all[a.ownerId];
        if (owner && ['dead', 'absent'].includes(owner.status.kind) && a.status !== 'estate') {
            if (a.heirId && alive(all[a.heirId])) title(e, a, a.heirId, a.heirId, tick, 'inheritance', a.bequestSourceId);
            else { a.status = 'estate'; log(e, 'estate', tick, a.titleEventId, { assetId: a.id, ownerId: a.ownerId }); }
        } else if (s.institutions[a.ownerId] && !liveInstitution(s.institutions[a.ownerId])) a.status = 'estate';
        else if (a.ownerId === policy.protagonistId && (!legal(s) || a.identityId !== s.continuity.publicIdentityId)) a.status = 'stranded';
    }
    for (const org of sorted(e.organizations)) if (!liveInstitution(s.institutions[org.id])) org.status = 'dissolved';
    for (const c of sorted(e.contracts).filter(c => c.status === 'active')) {
        if (!legal(s) || c.identityId !== s.continuity.publicIdentityId) { alert(e, c, tick, 'legal_identity'); continue; }
        if (c.institutionId && e.organizations[c.institutionId]?.status !== 'active') { alert(e, c, tick, 'institution_unavailable'); continue; }
        if (c.officeId) {
            const office = s.offices[c.officeId], holder = office?.holderId;
            if (!holder || office.closed !== undefined || !active(all[holder])) { alert(e, c, tick, 'vacant_authority'); continue; }
            if (holder !== c.agentId) { const prior = c.agentId; c.agentId = holder; profile(s, policy, holder); log(e, 'delegate_succession', tick, c.officeId, { contractId: c.id, prior, successor: holder }); }
        } else if (!active(all[c.agentId])) { alert(e, c, tick, 'agent_unavailable'); continue; }
        if (c.domain === 'business' && (e.assets[c.targetId]?.status !== 'active' || e.assets[c.targetId].ownerId !== policy.protagonistId)) alert(e, c, tick, 'asset_unavailable');
        const grant = { business: 'trade', investigation: 'investigate', research: 'research' }[c.domain];
        if (grant && !permission(s, policy.enterprise, grant)) alert(e, c, tick, 'credential_unavailable');
    }
    // Synchronize the older Package identity projection; it is not a second authority.
    const continuity = snapshot.states.atri_lifecycle.domains[policy.enterprise.identityDomainId]?.records.find(r => r.id === 'main')?.value;
    if (continuity && continuity.public_identity_id !== s.continuity.publicIdentityId) {
        const identity = e.identities[s.continuity.publicIdentityId];
        continuity.public_identity_id = identity.id;
        continuity.public_identity_origin = { source_id: identity.sourceId, origin: 'derived', stamp: { tick: identity.since, sequence: snapshot.states.atri_lifecycle.domains[policy.chronologyDomain].records[0].value.sequence }, parent_id: identity.predecessorId };
    }
}
export function enterpriseDue(s) {
    return sorted(s.enterprise?.contracts ?? {}).filter(c => c.status === 'active').map(c => ({ tick: c.nextReview, kind: 'enterprise', id: c.id }));
}
export function resolveEnterprise(snapshot, s, policy, id, tick, api) {
    const e = s.enterprise, c = e.contracts[id]; if (!c || c.status !== 'active') return;
    syncEnterprise(snapshot, s, policy, tick); if (c.status !== 'active') return;
    const actor = people(s)[c.agentId], agent = profile(s, policy, c.agentId), org = e.organizations[c.institutionId];
    const years = c.reportYears, venue = e.assets[c.targetId];
    const skill = agent.competence - (actor.health.impairment ? 25 : 0) + (c.objective.length >= 40 ? 8 : 0);
    let outcome = 'routine', loss = 0, hidden = false;
    if (org) {
        org.reviews++;
        const head = profile(s, policy, s.offices[e.nodes[org.rootId].officeId].holderId);
        if (org.reviews >= 2 && org.agenda !== head.interest) { const previous = org.agenda; org.agenda = head.interest; log(e, 'agenda_drift', tick, c.id, { institutionId: org.id, previous, agenda: org.agenda }); }
        if (org.reviews >= 2 && org.agenda !== org.founderAgenda) org.autonomy = Math.min(3, org.autonomy + 1);
        if (org.autonomy >= 2 && org.agenda !== org.founderAgenda) { alert(e, c, tick, 'institution_resists_founder'); return; }
    }
    if (c.domain === 'business') {
        const place = s.renewal.places[venue.placeId];
        const cost = safe(years * (6 + Math.floor(place.pressure / 3)));
        if (cost > c.maxSpend) { alert(e, c, tick, 'capital_authority'); return; }
        if (venue.balance < cost) { venue.debt = safe(venue.debt + cost - venue.balance); if (venue.balance) money(e, venue.id, -venue.balance, tick, 'unpaid_obligations', c.id); venue.status = 'seized'; place.status = 'closed'; place.changed = tick; place.revision++; place.cause = c.id; log(e, 'seizure', tick, c.id, { assetId: venue.id, debt: venue.debt }); alert(e, c, tick, 'insolvency'); return; }
        money(e, venue.id, -cost, tick, 'tax_and_maintenance', c.id);
        const earnings = safe(years * Math.max(0, Math.floor((skill - 30) / 5) - place.pressure + (org?.agenda === 'profit' ? 2 : 0)));
        if (earnings) money(e, venue.id, earnings, tick, 'earned_trade', c.id);
        loss = Math.max(0, cost - earnings);
        const workforce = sorted(e.nodes).filter(n => n.institutionId === c.institutionId).reduce((n, x) => n + x.workforce, 0);
        if (org?.agenda === 'service' && workforce >= 100 && skill >= 65) place.pressure = Math.max(0, place.pressure - 1);
        venue.condition = Math.max(0, venue.condition - (skill < 60 ? years * 3 : 0));
        const corrupt = agent.ambition > agent.loyalty && c.risk > 0;
        if (corrupt) {
            const stolen = Math.min(venue.balance, years * Math.max(1, Math.floor((agent.ambition - agent.loyalty) / 5)));
            if (stolen) money(e, venue.id, -stolen, tick, 'diversion', c.id, false);
            venue.debt = safe(venue.debt + years); loss += stolen; hidden = true; outcome = 'concealed_corruption';
            log(e, 'corruption', tick, c.id, { assetId: venue.id, agentId: agent.id, stolen, debt: venue.debt }, false);
            agent.loyalty = Math.max(0, agent.loyalty - years * 2);
            if (agent.loyalty < 25) { outcome = 'betrayal'; venue.condition = Math.max(0, venue.condition - 25); place.pressure = Math.min(11, place.pressure + 3); log(e, 'betrayal', tick, c.id, { assetId: venue.id, agentId: agent.id }); hidden = false; }
        }
        if (venue.condition === 0) { venue.status = 'destroyed'; place.status = 'closed'; place.changed = tick; place.revision++; place.cause = c.id; outcome = 'business_failure'; hidden = false; }
    } else if (c.domain === 'investigation') {
        const m = s.renewal.active[c.targetId];
        if (!m) { c.status = 'completed'; return; }
        if (m.structure.anomaly !== 'none' || m.hookId || m.subjectId === policy.protagonistId) { alert(e, c, tick, 'personal_or_occult_matter'); return; }
        if (skill < 65 || (agent.ambition > agent.loyalty && c.risk > 0)) {
            s.renewal.places[m.placeId].pressure = Math.min(11, s.renewal.places[m.placeId].pressure + 3);
            s.renewal.canonical[m.id] = { ...structuredClone(m), closed: tick, outcome: 'delegated_unresolved_closure', delegateId: c.agentId, contractId: c.id };
            delete s.renewal.active[m.id]; s.renewal.completed++; outcome = 'investigation_failure';
        } else {
            for (const action of m.path.slice(m.stage)) api.renewal(snapshot, s, policy, 'matter.act', { id: m.id, action, presentation: '' }, tick, api);
            api.renewal(snapshot, s, policy, 'matter.act', { id: m.id, action: 'record', presentation: '' }, tick, api); outcome = 'investigation_resolved';
        }
        c.status = 'completed';
    } else if (c.domain === 'family') {
        const bond = s.bonds[c.targetId];
        if (bond && ['active', 'estranged'].includes(bond.state) && tick >= anniversary(c.lastPresenceAt, 10)) { bond.state = 'estranged'; outcome = 'logistics_without_presence'; }
    } else {
        if (c.prohibited.occult) outcome = 'research_restricted';
        else { s.continuity.claimBurden++; s.continuity.exposure++; alert(e, c, tick, 'occult_research_requires_protagonist'); return; }
    }
    c.reviews++; c.report = { tick, reason: '', outcome: hidden ? 'routine' : outcome, reportedBalance: venue ? venue.balance + (hidden ? loss : 0) : 0 };
    if (!hidden && (loss >= c.lossThreshold || ['betrayal', 'business_failure'].includes(outcome))) alert(e, c, tick, outcome);
    c.lastReview = tick; c.nextReview = anniversary(tick, c.reportYears);
    if (c.domain === 'investigation') c.nextReview = tick;
    log(e, 'delegated_report', tick, c.id, { contractId: c.id, outcome: c.report.outcome, agentId: c.agentId, report: c.report });
}

export function operateEnterprise(snapshot, s, policy, operation, a, tick, api) {
    need(policy.enterprise && ENTERPRISE_OPERATIONS[operation], 'policy/operation');
    operation = a.verb ?? operation;
    const e = s.enterprise, p = policy.enterprise, hero = policy.protagonistId, all = people(s);
    need(active(all[hero]), 'protagonist unavailable');
    if (operation === 'progress.learn') {
        need(s.renewal.canonical[a.sourceId]?.closed !== undefined, 'learning needs resolved case evidence');
        need(!e.progress.knowledge.some(k => k.domain === a.domain && k.sourceId === a.sourceId), 'already learned');
        e.progress[a.domain] = Math.min(p.matureRank, e.progress[a.domain] + 1);
        e.progress.embodied = Math.min(p.matureRank, e.progress.embodied + 1);
        e.progress.knowledge.push({ domain: a.domain, sourceId: a.sourceId, tick });
        if (a.domain === 'occult') { s.continuity.claimBurden++; s.continuity.exposure++; }
    } else if (operation === 'career.take') {
        const role = p.roles.find(r => r.id === a.roleId); need(role && legal(s) && source(snapshot, s, a.sourceId), 'career credential');
        need(e.progress[role.domain] >= role.minimumRank, 'career competence');
        need(!role.institutionRequired || liveInstitution(s.institutions[a.institutionId]), 'career institution');
        need(!a.institutionId || liveInstitution(s.institutions[a.institutionId]), 'career affiliation');
        need(!sorted(e.roles).some(r => r.status === 'active' && r.roleId === a.roleId), 'duplicate role');
        const id = next(e); e.roles[id] = { id, roleId: a.roleId, identityId: s.continuity.publicIdentityId, institutionId: a.institutionId, since: tick, ended: null, status: 'active', sourceId: a.sourceId, obligation: role.obligation, refs: refs(hero) };
        all[hero].career = { occupation: a.roleId, institutionId: a.institutionId, since: tick };
    } else if (operation === 'career.leave') {
        const role = e.roles[a.id]; need(role?.status === 'active', 'active role'); role.status = 'left'; role.ended = tick;
        const current = sorted(e.roles).find(r => r.status === 'active'); all[hero].career = { occupation: current?.roleId ?? 'private citizen', institutionId: current?.institutionId ?? '', since: tick };
    } else if (operation === 'identity.change') {
        need(source(snapshot, s, a.sourceId), 'identity evidence'); const prior = e.identities[s.continuity.publicIdentityId];
        if (a.mode === 'retain') { need(prior.status === 'active' && a.name.trim(), 'retained identity'); prior.name = a.name; prior.sourceId = a.sourceId; } else if (a.mode === 'replace') {
            need(a.name.trim() && e.reserves >= 40, 'identity continuity cost/name');
            money(e, 'treasury', -40, tick, 'identity_registration', a.sourceId);
            if (prior.ended === null) { prior.ended = tick; prior.status = 'retired'; }
            const id = next(e); e.identities[id] = { id, actorId: hero, name: a.name, since: tick, ended: null, status: 'active', method: a.method, sourceId: a.sourceId, predecessorId: prior.id, liabilities: 0, refs: refs(hero) };
            s.continuity.publicIdentityId = id; s.continuity.identitySince = tick;
            if (a.method === 'forged') { prior.liabilities++; e.identities[id].liabilities++; s.continuity.exposure += 3; }
            // Family/court obligations retain the former legal identity, not erased bonds.
            log(e, 'identity_continuity', tick, a.sourceId, { previousId: prior.id, identityId: id, bonds: sorted(s.bonds).filter(b => b.people.includes(hero)).map(b => b.id), method: a.method });
        } else { need(prior.status === 'active', 'identity already inactive'); prior.status = { retire: 'retired', hide: 'hidden', declare_dead: 'declared_dead' }[a.mode]; prior.ended = tick; }
    } else if (operation === 'asset.acquire') {
        const place = s.renewal.places[a.placeId];
        need(permission(s, p, 'trade') && bank(s) && livePlace(place) && source(snapshot, s, a.sourceId), 'property acquisition authority');
        need(!sorted(e.assets).some(x => x.placeId === a.placeId), 'property already titled');
        const price = p.propertyPrices[place.kind], id = next(e); money(e, 'treasury', -price, tick, 'purchase', a.sourceId);
        e.assets[id] = { id, placeId: a.placeId, ownerId: hero, identityId: s.continuity.publicIdentityId, since: tick, status: 'active', price, balance: 0, debt: 0, condition: 100, heirId: '', bequestSourceId: '', sourceId: a.sourceId, titleEventId: '', refs: ['location:' + a.placeId, ...refs(hero)] };
        title(e, e.assets[id], hero, s.continuity.publicIdentityId, tick, 'purchase', a.sourceId);
    } else if (operation === 'asset.manage') {
        need(source(snapshot, s, a.sourceId), 'property evidence');
        if (a.id === 'treasury') {
            need(a.action === 'regularize' && legal(s) && e.bankIdentityId !== s.continuity.publicIdentityId, 'bank continuity');
            money(e, 'treasury', -20, tick, 'bank_continuity', a.sourceId); e.bankIdentityId = s.continuity.publicIdentityId; s.continuity.exposure++;
        } else {
            const asset = e.assets[a.id]; need(asset && asset.ownerId === hero && !['destroyed', 'seized', 'estate'].includes(asset.status), 'property owner');
            if (a.action === 'regularize') {
                need(asset.status === 'stranded' && bank(s), 'title continuity'); money(e, 'treasury', -20, tick, 'title_continuity', a.sourceId);
                title(e, asset, hero, s.continuity.publicIdentityId, tick, 'regularization', a.sourceId); s.continuity.exposure++;
            } else {
                need(asset.status === 'active' && bank(s) && asset.identityId === s.continuity.publicIdentityId, 'property legal access');
                if (a.action === 'capitalize' || a.action === 'withdraw') { need(a.amount > 0, 'positive transfer'); const deposit = a.action === 'capitalize'; money(e, deposit ? 'treasury' : asset.id, -a.amount, tick, a.action, a.sourceId); money(e, deposit ? asset.id : 'treasury', a.amount, tick, a.action, a.sourceId); } else if (a.action === 'repair') { need(asset.condition < 100 && a.amount >= 10, 'repair need/cost'); money(e, asset.id, -a.amount, tick, 'repair', a.sourceId); asset.condition = Math.min(100, asset.condition + Math.floor(a.amount / 2)); } else {
                    need(a.otherId !== hero && (alive(all[a.otherId]) || liveInstitution(s.institutions[a.otherId])), 'beneficiary unavailable');
                    if (a.action === 'bequeath') { need(all[a.otherId], 'named heir'); asset.heirId = a.otherId; asset.bequestSourceId = a.sourceId; } else title(e, asset, a.otherId, a.otherId, tick, 'transfer', a.sourceId);
                }
            }
        }
    } else if (operation === 'organization.charter') {
        const institution = s.institutions[a.institutionId]; need(liveInstitution(institution) && institution.refs.includes('actor:' + hero) && source(snapshot, s, a.sourceId), 'player-founded organization');
        need(legal(s) && !e.organizations[institution.id] && permission(s, p, 'manage'), 'charter authority');
        const office = sorted(s.offices).find(o => o.institutionId === institution.id && o.closed === undefined); need(office, 'organization office');
        need(bank(s), 'charter finance'); money(e, 'treasury', -40, tick, 'charter_endowment', a.sourceId);
        const rootId = next(e); e.nodes[rootId] = { id: rootId, institutionId: institution.id, parentId: '', officeId: office.id, name: 'Executive', workforce: 1, since: tick, refs: ['institution:' + institution.id] };
        e.organizations[institution.id] = { id: institution.id, founderId: hero, founderAgenda: a.agenda, agenda: a.agenda, autonomy: 0, reviews: 0, rootId, status: 'active', since: tick, sourceId: a.sourceId, refs: ['institution:' + institution.id] };
        profile(s, policy, office.holderId);
    } else if (operation === 'organization.department') {
        const org = e.organizations[a.institutionId], parent = e.nodes[a.parentId];
        need(org?.status === 'active' && org.autonomy < 2 && parent?.institutionId === org.id && permission(s, p, 'manage') && a.name.trim(), 'department authority');
        const actor = all[a.leaderId]; need(active(actor) && ageAt(actor.identity.birthTick, tick) >= policy.adultAge && actor.retirementTick > tick && a.leaderId !== hero, 'department leader');
        need(!sorted(s.offices).some(o => o.holderId === actor.id), 'leader already holds office');
        let depth = 1, ancestor = parent; while (ancestor) { depth++; ancestor = e.nodes[ancestor.parentId]; } need(depth <= 4, 'hierarchy depth');
        need(bank(s), 'department finance'); money(e, 'treasury', -a.workforce, tick, 'department_endowment', org.sourceId);
        actor.career = { occupation: a.name, institutionId: org.id, since: tick };
        const officeId = next(e); s.offices[officeId] = { id: officeId, institutionId: org.id, title: a.name, holderId: '', nomineeId: actor.id, rule: 'nomination', refs: ['institution:' + org.id] }; api.succeed(s, policy, tick);
        const id = next(e); e.nodes[id] = { id, institutionId: org.id, parentId: parent.id, officeId, name: a.name, workforce: a.workforce, since: tick, refs: ['institution:' + org.id] };
    } else if (operation === 'organization.policy') {
        const org = e.organizations[a.institutionId]; need(org?.status === 'active' && permission(s, p, 'manage'), 'organization policy authority');
        org.founderAgenda = a.agenda;
        if (org.autonomy >= 2 && org.agenda !== a.agenda) log(e, 'founder_order_refused', tick, org.sourceId, { institutionId: org.id, requested: a.agenda, actual: org.agenda });
        else org.agenda = a.agenda;
    } else if (operation === 'delegate.create') {
        need(legal(s) && a.objective.trim().length >= 12 && a.escalateOccult, 'delegation policy');
        need(Boolean(a.agentId) !== Boolean(a.officeId), 'one delegate authority');
        const office = a.officeId ? s.offices[a.officeId] : null, agentId = office?.holderId ?? a.agentId, actor = all[agentId];
        need(active(actor) && actor.id !== hero && ageAt(actor.identity.birthTick, tick) >= policy.adultAge && actor.retirementTick > tick, 'delegate eligible');
        if (a.institutionId) need(e.organizations[a.institutionId]?.status === 'active' && e.organizations[a.institutionId].autonomy < 2 && (!office || office.institutionId === a.institutionId), 'delegation organization');
        if (office) need(a.institutionId && office.closed === undefined && sorted(e.nodes).some(n => n.officeId === office.id), 'office authority');
        need(!sorted(e.contracts).some(c => c.status !== 'revoked' && c.status !== 'completed' && c.domain === a.domain && c.targetId === a.targetId), 'target already delegated');
        if (a.domain === 'business') need(permission(s, p, 'trade') && e.assets[a.targetId]?.status === 'active' && e.assets[a.targetId].ownerId === hero, 'business authority');
        if (a.domain === 'investigation') need(permission(s, p, 'investigate') && s.renewal.active[a.targetId], 'investigation authority');
        if (a.domain === 'research') need(permission(s, p, 'research') && s.renewal.places[a.targetId], 'research authority');
        if (a.domain === 'family') need(s.bonds[a.targetId]?.people.includes(hero), 'family logistics boundary');
        profile(s, policy, agentId);
        const id = next(e); e.contracts[id] = { ...structuredClone(a), id, agentId, identityId: s.continuity.publicIdentityId, since: tick, lastPresenceAt: tick, lastReview: tick, nextReview: a.domain === 'investigation' ? Math.min(tick + 7 * 1440, s.renewal.active[a.targetId].deadline) : anniversary(tick, a.reportYears), status: 'active', reviews: 0, report: null, refs: refs(hero, agentId) };
    } else {
        const c = e.contracts[a.id]; need(c && c.status !== 'revoked', 'delegation missing');
        if (a.action === 'revoke') c.status = 'revoked';
        else if (a.action === 'resume') {
            need(c.status === 'escalated' && legal(s) && c.identityId === s.continuity.publicIdentityId && active(all[c.agentId]), 'resume authority');
            need(!c.institutionId || e.organizations[c.institutionId].autonomy < 2, 'organization refuses');
            need(c.domain !== 'business' || (e.assets[c.targetId]?.status === 'active' && c.maxSpend >= c.reportYears * 9), 'unresolved business boundary');
            need(c.domain !== 'research', 'protagonist-only occult decision');
            c.status = 'active'; c.nextReview = anniversary(tick, c.reportYears);
        } else {
            need(bank(s), 'audit legal authority'); money(e, 'treasury', -5, tick, 'audit', c.id);
            const revealed = new Set(sorted(e.events).filter(x => x.kind === 'audit' && x.sourceId === c.id).flatMap(x => x.detail.discovered.map(y => y.id)));
            const concealed = sorted(e.events).filter(x => x.sourceId === c.id && !x.public && !revealed.has(x.id));
            if (concealed.length) { c.status = 'active'; alert(e, c, tick, 'discovered_corruption'); }
            log(e, 'audit', tick, c.id, { contractId: c.id, discovered: concealed.map(x => ({ id: x.id, tick: x.tick, detail: structuredClone(x.detail) })), balance: e.assets[c.targetId]?.balance ?? 0 });
        }
    }
    syncEnterprise(snapshot, s, policy, tick);
}
export function validateEnterprise(snapshot, policy, { complete = false } = {}) {
    const s = snapshot.states.atri_lifecycle.lifetimes, e = s.enterprise, p = policy.enterprise;
    if (!p) { need(!e, 'undeclared state'); return; }
    need(e?.schemaVersion === 1, 'state version');
    fields(e, ['schemaVersion', 'nextId', 'reserves', 'bankIdentityId', 'identities', 'progress', 'roles', 'assets', 'agents', 'organizations', 'nodes', 'contracts', 'events', 'movements'], 'Enterprise state');
    const tick = snapshot.states.atri_lifecycle.clocks[policy.clockId], all = people(s);
    const groups = ['identities', 'roles', 'assets', 'agents', 'organizations', 'nodes', 'contracts', 'events', 'movements'];
    need(safe(e.nextId) > 0 && safe(e.reserves) >= 0 && groups.reduce((n, k) => n + Object.keys(e[k]).length, 0) <= p.maxRecords, 'record budget');
    if (complete && snapshot.states.atri_lifecycle.ready && p.identityDomainId) need(snapshot.states.atri_lifecycle.domains[p.identityDomainId]?.records.find(r => r.id === 'main')?.value.public_identity_id === s.continuity.publicIdentityId, 'identity projection');
    need(e.identities[e.bankIdentityId] && e.identities[s.continuity.publicIdentityId], 'identity pointers');
    for (const k of groups) for (const [id, x] of Object.entries(e[k])) {
        need(x.id === id && x.refs && Array.isArray(x.refs), 'record identity'); const match = /^enterprise\.(\d+)$/.exec(id); if (match) need(Number(match[1]) < e.nextId, 'allocation cursor');
        for (const f of ['tick', 'since']) if (x[f] !== undefined) need(safe(x[f]) >= 0 && x[f] <= tick, 'chronology');
    }
    for (const x of sorted(e.identities)) {
        need(x.actorId === policy.protagonistId && ['active', 'retired', 'hidden', 'declared_dead'].includes(x.status), 'identity lifecycle');
        need((x.status === 'active') === (x.ended === null) && (x.ended === null || (safe(x.ended) >= x.since && x.ended <= tick)), 'identity interval');
        if (x.predecessorId) need(e.identities[x.predecessorId]?.ended <= x.since && x.predecessorId !== x.id, 'identity succession');
    }
    need(sorted(e.identities).filter(i => i.status === 'active').length <= 1, 'overlapping public identity');
    for (const name of ['investigation', 'commerce', 'occult', 'embodied']) need(safe(e.progress[name]) >= 0 && e.progress[name] <= p.matureRank, 'mature progression cap');
    need(new Set(e.progress.knowledge.map(k => k.domain + ':' + k.sourceId)).size === e.progress.knowledge.length, 'duplicate learning');
    for (const r of sorted(e.roles)) { need(p.roles.some(x => x.id === r.roleId) && e.identities[r.identityId] && (!r.institutionId || s.institutions[r.institutionId]), 'role reference'); if (complete && r.status === 'active') need(legal(s) && r.identityId === s.continuity.publicIdentityId && active(all[policy.protagonistId]) && (!r.institutionId || liveInstitution(s.institutions[r.institutionId])), 'inactive credential'); }
    const balances = { treasury: p.initialReserves, ...Object.fromEntries(sorted(e.assets).map(x => [x.id, 0])) };
    for (const m of sorted(e.movements)) { need(Object.hasOwn(balances, m.account), 'movement account'); balances[m.account] = safe(balances[m.account] + safe(m.delta)); }
    need(balances.treasury === e.reserves, 'treasury ledger');
    for (const a of sorted(e.assets)) {
        need(s.renewal.places[a.placeId] && (all[a.ownerId] || s.institutions[a.ownerId]) && (e.identities[a.identityId] || all[a.identityId] || s.institutions[a.identityId]), 'property identities');
        need(balances[a.id] === a.balance && a.balance >= 0 && safe(a.debt) >= 0 && safe(a.condition) >= 0 && a.condition <= 100, 'property ledger');
        const event = e.events[a.titleEventId]; need(event?.kind === 'ownership' && event.detail.assetId === a.id && event.detail.ownerId === a.ownerId && event.detail.identityId === a.identityId, 'title provenance');
        need(!a.heirId || all[a.heirId], 'heir identity');
        if (complete && a.status === 'active') need(livePlace(s.renewal.places[a.placeId]) && (a.ownerId !== policy.protagonistId || (legal(s) && a.identityId === s.continuity.publicIdentityId)), 'stranded property');
    }
    need(new Set(sorted(e.assets).map(a => a.placeId)).size === Object.keys(e.assets).length, 'duplicate property title');
    for (const org of sorted(e.organizations)) need(s.institutions[org.id] && all[org.founderId] && e.nodes[org.rootId]?.institutionId === org.id && safe(org.autonomy) >= 0 && org.autonomy <= 3, 'organization identity');
    for (const n of sorted(e.nodes)) {
        need(e.organizations[n.institutionId] && s.offices[n.officeId]?.institutionId === n.institutionId && safe(n.workforce) >= 1 && n.workforce <= 10000, 'hierarchy binding');
        const seen = new Set(); let x = n;
        while (x) { need(!seen.has(x.id) && seen.size < 4, 'hierarchy cycle/depth'); seen.add(x.id); if (x.parentId) need(e.nodes[x.parentId]?.institutionId === n.institutionId, 'hierarchy parent'); x = e.nodes[x.parentId]; }
    }
    for (const agent of sorted(e.agents)) {
        need(all[agent.id] && safe(agent.competence) >= 0 && agent.competence <= 100 && safe(agent.loyalty) >= 0 && agent.loyalty <= 100 && safe(agent.ambition) >= 0 && agent.ambition <= 100 && ['service', 'profit', 'secrecy'].includes(agent.interest), 'agent state');
    }
    for (const c of sorted(e.contracts)) {
        const schema = ENTERPRISE_ACTIONS['delegate.create'];
        assertTaskValue(Object.fromEntries(Object.keys(schema.properties).map(k => [k, c[k]])), schema);
        need(['active', 'escalated', 'completed', 'revoked'].includes(c.status) && safe(c.reviews) >= 0 && safe(c.lastReview) >= c.since && c.lastReview <= tick && safe(c.lastPresenceAt) >= c.since && c.lastPresenceAt <= tick, 'contract lifecycle');
        need(all[c.agentId] && e.identities[c.identityId] && (!c.officeId || s.offices[c.officeId]) && (!c.institutionId || e.organizations[c.institutionId]), 'contract identities');
        need(safe(c.nextReview) >= c.since && c.reportYears >= 1 && c.reportYears <= 10 && c.escalateOccult === true, 'contract boundary');
        if (complete && c.status === 'active') need(c.nextReview > tick && active(all[c.agentId]) && legal(s) && c.identityId === s.continuity.publicIdentityId, 'unresolved delegated boundary');
    }
}
export function enterpriseSources(snapshot) {
    const e = snapshot.states.atri_lifecycle?.lifetimes?.enterprise; if (!e) return [];
    const out = [];
    const add = (id, value, refs = [], isPublic = true) => out.push({ id: 'enterprise.' + id, domainId: 'enterprise', recordId: id, path: ['value'], public: isPublic, refs, label: id, value });
    add('progress', e.progress); // balances are projected via approved reports, not hidden truth.
    for (const group of ['identities', 'roles', 'assets', 'organizations', 'nodes', 'contracts', 'events', 'movements']) for (const x of sorted(e[group])) add(group + '.' + x.id, x, x.refs, x.public !== false && group !== 'assets' && group !== 'contracts');
    return out;
}

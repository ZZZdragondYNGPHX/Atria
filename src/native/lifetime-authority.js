import { ENTERPRISE_OPERATIONS } from '../../public/shared/native-enterprise-contract.js';
import { initialEnterprise, operateEnterprise, syncEnterprise, enterpriseDue, resolveEnterprise, validateEnterprise } from './enterprise-authority.js';
import { initialRenewal, operateRenewal, resolveRenewalDue, validateRenewal } from './renewal-authority.js';
import { lifetimePolicy, LIFETIME_OPERATIONS } from '../../public/shared/native-lifetime-contract.js';
import { anniversary, ageAt, people } from '../../public/shared/native-lifetime-runtime.js';
import { assertTaskValue, taskId } from '../../public/shared/native-task-contract.js';
import { fields } from '../../public/shared/native-values.js';
const clone = v => structuredClone(v);
const sorted = o => Object.values(o).sort((a, b) => a.id.localeCompare(b.id, 'en'));
const next = (s, kind) => 'life.' + kind + '.' + s.nextId++;
const safe = n => { if (!Number.isSafeInteger(n)) throw new TypeError('Lifetime integer');return n; };
const need = (condition, message) => { if (!condition) throw new TypeError('Lifetime ' + message); };
const actor = (s, id) => { const p = s.people[id] ?? s.archive[id];need(p, 'actor missing');return p; };
const alive = p => !['dead', 'absent'].includes(p.status.kind);
const active = p => p.status.kind === 'active';
const adult = (p, t, policy) => alive(p) && ageAt(p.identity.birthTick, t) >= policy.adultAge;
function noise(policy, id) { let n = policy.seed;for (const c of id)n = (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0;return n % 11; }
function event(s, kind, tick, ids, detail = {}, visibility = 'public') {
    const id = next(s, 'event');s.milestones[id] = { id, kind, tick, people: ids, detail, visibility, refs: ids.map(x => 'actor:' + x) };return id;
}
function makePerson(s, policy, { id, name, birthTick, tier = 'B', institutionId = '', occupation = '', sourceId, cause }, tick) {
    need(!people(s)[id] && birthTick <= tick, 'identity/birth conflict');
    const p = { id, identity: { name, birthTick, introducedTick: tick, origin: { cause, sourceId } }, tier, status: { kind: 'active', tick },
        career: { occupation, institutionId, since: tick }, health: { impairment: '', since: tick }, route: { id: '', since: tick },
        bodyAge: ageAt(birthTick, tick), bodyAt: tick, matured: ageAt(birthTick, tick) >= policy.adultAge,
        retirementTick: anniversary(birthTick, policy.retirementAge), deathTick: anniversary(birthTick, policy.mortalityAge + noise(policy, id)),
        contacts: 0, lastContactSource: '', detail: tier === 'A' ? { residence: 'opening_hub', notes: '' } : null };
    s.people[id] = p; event(s, cause === 'birth' ? 'birth' : 'introduction', tick, [id], { birthTick, sourceId, cause });return p;
}
export function initialLifetimes(policy) {
    const s = { schemaVersion: 1, nextId: 1, resolvedTick: 0, people: {}, archive: {}, bonds: {}, kinship: {}, pregnancies: {}, institutions: {}, offices: {}, terms: {}, legacies: {}, milestones: {},
        population: { initial: policy.initialPopulation, births: 0, deaths: 0, materialized: 0, present: policy.initialPopulation },
        continuity: { protagonistId: policy.protagonistId, publicIdentityId: policy.publicIdentityId, identitySince: 0, routeAvailable: true, claimBurden: 0, exposure: 0, scars: 0, returns: 0, returnAt: null, grants: 0, nextExposureAt: null },
        work: { actors: 0, events: 0, intervals: 0 } };
    for (const p of policy.people.filter(p => !p.sourceRecordId))makePerson(s, policy, { ...p, sourceId: 'authored.' + p.id, cause: 'authored' }, 0);
    for (const o of policy.offices) {
        s.institutions[o.institutionId] ??= { id: o.institutionId, founded: 0, origin: 'authored', refs: ['institution:' + o.institutionId] }; s.offices[o.id] = { ...clone(o), holderId: '', nomineeId: '', refs: ['institution:' + o.institutionId] };if (s.people[o.holderId])seat(s, policy, s.offices[o.id], o.holderId, 0);
    }
    if (policy.renewal) s.renewal = initialRenewal(policy.renewal);
    if (policy.enterprise) s.enterprise = initialEnterprise(policy);
    return s;
}
function evidence(snapshot, s, id) {
    const h = snapshot.states.atri_lifecycle.history;
    return Boolean(people(s)[id] || s.offices[id] || s.milestones[id] || s.renewal?.canonical[id] || h?.facts[id]?.public || h?.artifacts[id] || h?.hooks[id]);
}
function compactPerson(s, p) {
    if (p.status.kind === 'active') return;
    p.detail = null;s.archive[p.id] = p;delete s.people[p.id];
}
function seat(s, policy, office, id, tick) {
    const p = actor(s, id);need(active(p) && adult(p, tick, policy) && p.career.institutionId === office.institutionId && !office.holderId, 'ineligible office');
    need(!Object.values(s.offices).some(o => o.holderId === id), 'already holds office');
    const termId = next(s, 'term'); s.terms[termId] = { id: termId, officeId: office.id, actorId: id, from: tick, to: null, reason: '', refs: ['actor:' + id, 'institution:' + office.institutionId] };
    office.holderId = id;office.nomineeId = '';event(s, 'succession', tick, [id], { officeId: office.id, termId });
}
function vacate(s, p, tick, reason) {
    for (const office of sorted(s.offices).filter(o => o.holderId === p.id)) {
        const term = Object.values(s.terms).find(t => t.officeId === office.id && t.to === null);need(term, 'open tenure');term.to = tick;term.reason = reason;office.holderId = '';
        event(s, 'vacancy', tick, [p.id], { officeId: office.id, reason });
    }
}
function succeed(s, policy, tick) {
    for (const office of sorted(s.offices).filter(o => !o.holderId && o.closed === undefined)) {
        const eligible = Object.values(s.people).filter(p => active(p) && adult(p, tick, policy) && p.retirementTick > tick && p.career.institutionId === office.institutionId && !Object.values(s.offices).some(o => o.holderId === p.id))
            .sort((a, b) => a.identity.birthTick - b.identity.birthTick || a.id.localeCompare(b.id, 'en'));
        let p = (office.rule === 'nomination' ? eligible.find(p => p.id === office.nomineeId) : null) ?? eligible[0];
        if (!p) {
            const id = next(s, 'person');p = makePerson(s, policy, { id, name: 'Successor ' + s.nextId, birthTick: anniversary(tick, -(policy.adultAge + 8 + noise(policy, id))), institutionId: office.institutionId, occupation: office.title, sourceId: office.id, cause: 'vacancy' }, tick);
            s.population.materialized++;
        }
        seat(s, policy, office, p.id, tick);
    }
}
function transfer(snapshot, s, p, tick) {
    for (const legacy of sorted(s.legacies).filter(l => l.ownerId === p.id && l.status === 'pledged')) {
        const heir = actor(s, legacy.heirId);
        if (!alive(heir)) { legacy.status = 'disputed';legacy.tick = tick;continue; }
        legacy.status = 'inherited';legacy.tick = tick;
        const eventId = event(s, 'inheritance', tick, [p.id, heir.id], { legacyId: legacy.id, sourceId: legacy.sourceId });
        if (legacy.kind === 'artifact') {
            const artifact = snapshot.states.atri_lifecycle.history.artifacts[legacy.sourceId];
            if (!artifact || ['destroyed', 'lost'].includes(artifact.status) || artifact.holderId !== p.id) { legacy.status = 'disputed';continue; }
            artifact.holderId = heir.id;
            // Native history will attach a canonical history anchor to this transition.
            legacy.transferEvent = eventId;
        }
    }
}
function endPerson(snapshot, s, policy, p, tick, reason) {
    need(p.id !== policy.protagonistId, 'use non-terminal protagonist death');need(p.status.kind !== 'dead', 'dead actor');
    p.status = { kind: reason, tick };vacate(s, p, tick, reason);event(s, reason, tick, [p.id]);
    if (reason === 'dead') {
        for (const bond of sorted(s.bonds).filter(b => ['active', 'estranged'].includes(b.state) && b.people.includes(p.id))) { bond.state = 'widowed';bond.ended = tick;event(s, 'widowhood', tick, bond.people, { bondId: bond.id }, bond.visibility); }
        transfer(snapshot, s, p, tick);
    }
    compactPerson(s, p);
}
function die(snapshot, s, policy, tick, sourceId) {
    const p = actor(s, policy.protagonistId);need(p.status.kind !== 'absent', 'already absent');
    const route = policy.routes.find(r => r.id === p.route.id) ?? policy.routes[0];
    p.status = { kind: 'absent', tick };p.route = { id: route.id, since: tick };vacate(s, p, tick, 'bodily_death');
    const c = s.continuity;c.nextExposureAt ??= anniversary(tick, 30);c.claimBurden = safe(c.claimBurden + route.claimCost);c.exposure = safe(c.exposure + route.exposureCost);c.scars++;c.returnAt = safe(tick + route.returnTicks);
    event(s, 'bodily_death', tick, [p.id], { sourceId, returnAt: c.returnAt, routeId: route.id, claimBurden: c.claimBurden });
    transfer(snapshot, s, p, tick);
}
function kinship(s, kind, parents, child, tick, visibility = 'public') {
    const id = next(s, 'kin');s.kinship[id] = { id, kind, parents: [...parents], childId: child, tick, visibility, refs: ['family:' + child, ...parents.map(p => 'actor:' + p), 'actor:' + child] };event(s, kind, tick, [...parents, child], { kinshipId: id }, visibility);
}
function parentCheck(s, policy, ids, tick) { need(ids.length > 0 && new Set(ids).size === ids.length, 'parents');for (const id of ids)need(adult(actor(s, id), tick, policy) && !['missing', 'absent'].includes(actor(s, id).status.kind), 'parent eligibility'); }

function operate(snapshot, s, policy, operation, input, tick) {
    const schema = LIFETIME_OPERATIONS[operation];need(schema, 'operation');assertTaskValue(input, schema);
    for (const [key, value] of Object.entries(input)) if ((key === 'id' || key.endsWith('Id')) && value)taskId(value);
    const a = clone(input), protagonist = actor(s, policy.protagonistId);
    need(protagonist.status.kind !== 'absent', 'must return before acting');
    if (ENTERPRISE_OPERATIONS[operation]) { operateEnterprise(snapshot, s, policy, operation, a, tick, { vacate, succeed, renewal: operateRenewal }); return; }
    if (['matter.open', 'matter.act', 'world.change'].includes(operation)) { operateRenewal(snapshot, s, policy, operation, a, tick, { vacate, succeed }); return; }
    if (operation === 'bond.form')a.people = [a.firstId, a.secondId];
    if (operation === 'family.conceive' || operation === 'family.adopt')a.parents = [a.parentId, ...(a.otherParentId ? [a.otherParentId] : [])];
    if (operation === 'person.enter') {
        need(a.name.trim() && a.birthTick <= tick && ageAt(a.birthTick, tick) >= policy.adultAge && ageAt(a.birthTick, tick) < policy.retirementAge && evidence(snapshot, s, a.sourceId), 'causal adult introduction');
        need(!a.institutionId || s.institutions[a.institutionId] && s.institutions[a.institutionId].status !== 'dissolved', 'institution');
        if (['hiring', 'recruitment'].includes(a.cause))need(s.offices[a.sourceId]?.institutionId === a.institutionId, 'institutional recruitment source');
        makePerson(s, policy, { ...a, id: next(s, 'person'), occupation: a.cause }, tick);s.population.materialized++;
    } else if (operation === 'person.promote') {
        const p = actor(s, a.id);need(p.tier === 'B' && active(p) && evidence(snapshot, s, a.sourceId) && a.sourceId !== a.id && a.sourceId !== p.lastContactSource, 'distinct sustained relevance');
        p.contacts++;p.lastContactSource = a.sourceId;if (p.contacts >= 2) { p.tier = 'A';p.detail = { residence: 'opening_hub', notes: '' };event(s, 'promotion', tick, [p.id], { sourceId: a.sourceId }); }
    } else if (operation === 'person.exit') {
        need(evidence(snapshot, s, a.sourceId), 'exit evidence');const p = actor(s, a.id);need(p.status.kind !== a.reason, 'duplicate exit');endPerson(snapshot, s, policy, p, tick, a.reason);succeed(s, policy, tick);
    } else if (operation === 'person.return') {
        const p = actor(s, a.id);need(p.status.kind === 'missing' && evidence(snapshot, s, a.sourceId) && tick < p.retirementTick, 'missing return');
        p.status = { kind: 'active', tick };s.people[p.id] = p;delete s.archive[p.id];event(s, 'return', tick, [p.id], { sourceId: a.sourceId });
    } else if (operation === 'person.career') {
        const p = actor(s, a.id);need(active(p) && adult(p, tick, policy) && a.occupation.trim() && evidence(snapshot, s, a.sourceId), 'career eligibility');
        need(!a.institutionId || Object.values(s.offices).some(o => o.institutionId === a.institutionId), 'career institution');
        vacate(s, p, tick, 'career');p.career = { occupation: a.occupation, institutionId: a.institutionId, since: tick };event(s, 'career', tick, [p.id], p.career);succeed(s, policy, tick);
    } else if (operation === 'person.health') {
        const p = actor(s, a.id);need(alive(p) && a.impairment.trim() && evidence(snapshot, s, a.sourceId), 'health source');p.health = { impairment: a.impairment, since: tick };event(s, 'impairment', tick, [p.id], { sourceId: a.sourceId });
    } else if (operation === 'bond.form') {
        need(a.consent && a.people.length >= 2 && new Set(a.people).size === a.people.length, 'relationship consent');
        for (const id of a.people)need(adult(actor(s, id), tick, policy) && !['missing', 'absent'].includes(actor(s, id).status.kind), 'relationship eligibility');
        need(!Object.values(s.bonds).some(b => b.state === 'active' && b.kind === a.kind && b.people.slice().sort().join() === a.people.slice().sort().join()), 'duplicate bond');
        const id = next(s, 'bond');s.bonds[id] = { id, people: [...a.people], kind: a.kind, state: 'active', visibility: a.visibility, from: tick, ended: null, refs: a.people.map(p => 'actor:' + p) };
        event(s, a.kind, tick, a.people, { bondId: id }, a.visibility);
        if (a.visibility === 'public' && a.people.some(p => Object.values(s.bonds).filter(b => b.state === 'active' && b.kind === 'marriage' && b.people.includes(p)).length > 1))s.continuity.exposure++;
    } else if (operation === 'bond.change') {
        const b = s.bonds[a.id];need(b && b.state !== 'widowed' && b.state !== a.state, 'bond transition');
        if (a.state === 'active') { need(a.consent, 'reconciliation consent');for (const id of b.people)need(adult(actor(s, id), tick, policy), 'bond alive'); }
        if (a.state === 'active' && s.enterprise) for (const c of Object.values(s.enterprise.contracts)) if (c.domain === 'family' && c.targetId === b.id) c.lastPresenceAt = tick;
        b.state = a.state;b.ended = a.state === 'separated' ? tick : null;event(s, a.state, tick, b.people, { bondId: b.id }, b.visibility);
    } else if (operation === 'family.conceive') {
        need(a.consent && a.name.trim(), 'parenthood consent');parentCheck(s, policy, a.parents, tick);
        need(!Object.values(s.pregnancies).some(p => p.status === 'pending' && p.parents.some(id => a.parents.includes(id))), 'existing pregnancy');
        const id = next(s, 'pregnancy');s.pregnancies[id] = { id, parents: [...a.parents], name: a.name, conceived: tick, due: safe(tick + policy.gestationTicks), status: 'pending', childId: '', refs: a.parents.map(p => 'actor:' + p) };
        event(s, 'conception', tick, a.parents, { pregnancyId: id });
    } else if (operation === 'family.adopt') {
        need(a.consent, 'adoption consent');parentCheck(s, policy, a.parents, tick);const child = actor(s, a.childId);
        need(alive(child) && ageAt(child.identity.birthTick, tick) < policy.adultAge && !a.parents.includes(child.id), 'adoptable child');
        for (const id of a.parents)need(actor(s, id).identity.birthTick < child.identity.birthTick, 'adoption chronology');
        need(!Object.values(s.kinship).some(k => k.kind === 'adoption' && k.childId === child.id && k.parents.some(p => a.parents.includes(p))), 'duplicate adoption');
        kinship(s, 'adoption', a.parents, child.id, tick, a.visibility);
    } else if (operation === 'legacy.pledge') {
        const owner = actor(s, a.ownerId), heir = actor(s, a.heirId);need(alive(owner) && alive(heir) && owner.id !== heir.id && evidence(snapshot, s, a.sourceId), 'legacy source');
        if (a.kind === 'artifact') { const item = snapshot.states.atri_lifecycle.history.artifacts[a.sourceId];need(item && item.holderId === owner.id && !['lost', 'destroyed'].includes(item.status), 'artifact ownership'); }
        if (a.kind === 'claim')need(owner.route.id, 'explicit supernatural liability');
        need(!Object.values(s.legacies).some(l => l.sourceId === a.sourceId && l.ownerId === owner.id && l.status === 'pledged'), 'conflicting testament');
        const id = next(s, 'legacy');s.legacies[id] = { id, ...clone(a), status: 'pledged', tick, transferEvent: '', refs: ['actor:' + owner.id, 'actor:' + heir.id] };event(s, 'testament', tick, [owner.id, heir.id], { legacyId: id });
    } else if (operation === 'office.nominate') {
        const office = s.offices[a.officeId], p = actor(s, a.actorId);need(office && office.rule === 'nomination' && active(p) && adult(p, tick, policy) && p.career.institutionId === office.institutionId, 'nominee eligibility');office.nomineeId = p.id;event(s, 'nomination', tick, [p.id], { officeId: office.id });
    } else if (operation === 'longevity.bind' || operation === 'longevity.offer') {
        const p = operation === 'longevity.bind' ? protagonist : actor(s, a.id), route = policy.routes.find(r => r.id === a.routeId);
        need(route && adult(p, tick, policy) && active(protagonist) && !p.route.id, 'route eligibility');
        if (operation === 'longevity.offer') {
            need(p.id !== protagonist.id && protagonist.route.id && s.continuity.grants < 2, 'rare sponsored route');
            if (!a.consent) { event(s, 'longevity_refused', tick, [p.id, protagonist.id], { routeId: route.id });return; }
            s.continuity.grants++;
        }
        if (p.id === policy.protagonistId)s.continuity.nextExposureAt = anniversary(tick, 30);
        p.bodyAge = ageAt(p.identity.birthTick, tick);p.bodyAt = tick;p.route = { id: route.id, since: tick };
        s.continuity.claimBurden += route.claimCost;s.continuity.exposure += route.exposureCost;event(s, 'longevity_bound', tick, [p.id], { routeId: route.id });
    } else if (operation === 'protagonist.die') {
        need(evidence(snapshot, s, a.sourceId), 'death evidence');die(snapshot, s, policy, tick, a.sourceId);succeed(s, policy, tick);
    }
}
function resolve(snapshot, s, policy, target) {
    need(target >= s.resolvedTick, 'clock rewind');let steps = 0;
    // Event queue is rebuilt from bounded relevant actors/milestones, never days.
    while (true) {
        const pending = enterpriseDue(s);
        for (const p of Object.values(people(s))) {
            if (p.status.kind === 'dead') continue;
            if (!p.matured)pending.push({ tick: anniversary(p.identity.birthTick, policy.adultAge), kind: 'mature', id: p.id });
            if (p.id !== policy.protagonistId && active(p))pending.push({ tick: p.retirementTick, kind: 'retire', id: p.id });
            if (p.status.kind !== 'absent') {
                const route = policy.routes.find(r => r.id === p.route.id);
                // Explicit route slows remaining mortality; no inherited immortality.
                const death = route ? safe(p.route.since + Math.max(1, p.deathTick - p.route.since) * route.agingDivisor) : p.deathTick;
                pending.push({ tick: death, kind: 'death', id: p.id });
            }
        }
        for (const p of Object.values(s.pregnancies)) if (p.status === 'pending')pending.push({ tick: p.due, kind: 'birth', id: p.id });
        if (s.continuity.nextExposureAt !== null)pending.push({ tick: s.continuity.nextExposureAt, kind: 'exposure', id: policy.protagonistId });
        if (s.continuity.returnAt !== null)pending.push({ tick: s.continuity.returnAt, kind: 'reconstruct', id: policy.protagonistId });
        const e = pending.filter(e => e.tick <= target).sort((a, b) => a.tick - b.tick || Number(a.kind === 'enterprise') - Number(b.kind === 'enterprise') || a.kind.localeCompare(b.kind, 'en') || a.id.localeCompare(b.id, 'en'))[0];
        if (!e) break;need(e.tick >= s.resolvedTick, 'overdue milestone');need(++steps <= policy.maxEvents, 'event budget');
        if (e.kind === 'enterprise') { resolveEnterprise(snapshot, s, policy, e.id, e.tick, { vacate, succeed, renewal: operateRenewal }); continue; }
        const p = e.kind === 'birth' ? null : actor(s, e.id);
        if (e.kind === 'mature') { p.matured = true;event(s, 'maturation', e.tick, [p.id]); }
        if (e.kind === 'retire')endPerson(snapshot, s, policy, p, e.tick, 'retired');
        if (e.kind === 'death') {
            if (p.id === policy.protagonistId)die(snapshot, s, policy, e.tick, 'ordinary_mortality');else endPerson(snapshot, s, policy, p, e.tick, 'dead');
        }
        if (e.kind === 'exposure') {
            const witness = Object.values(s.kinship).find(k => k.parents.includes(policy.protagonistId)) ?? Object.values(s.bonds).find(b => b.people.includes(policy.protagonistId));
            if (witness) { s.continuity.exposure++;event(s, 'documentary_exposure', e.tick, [policy.protagonistId], { sourceId: witness.id }); }
            s.continuity.nextExposureAt = anniversary(e.tick, 30);
        }
        if (e.kind === 'reconstruct') {
            p.status = { kind: 'active', tick: e.tick };p.bodyAge = policy.adultAge + 10;p.bodyAt = e.tick;
            // Reconstruction restores embodiment, not chronological identity.
            p.deathTick = safe(e.tick + (policy.mortalityAge - p.bodyAge) * 365 * 1440);p.route.since = e.tick;
            s.continuity.returnAt = null;s.continuity.returns++;event(s, 'reconstruction', e.tick, [p.id], { scars: s.continuity.scars });
        }
        if (e.kind === 'birth') {
            const pregnancy = s.pregnancies[e.id];
            if (!pregnancy.parents.some(id => alive(actor(s, id)))) { pregnancy.status = 'lost';event(s, 'pregnancy_loss', e.tick, pregnancy.parents, { pregnancyId: e.id }); } else { const id = next(s, 'person');makePerson(s, policy, { id, name: pregnancy.name, birthTick: e.tick, sourceId: e.id, cause: 'birth' }, e.tick);pregnancy.status = 'born';pregnancy.childId = id;kinship(s, 'biological', pregnancy.parents, id, e.tick); }
        }
        succeed(s, policy, e.tick);
        syncEnterprise(snapshot, s, policy, e.tick);
    }
    const years = Math.floor(target / (365.2425 * 1440)), pop = s.population;
    pop.births = safe(Math.floor(pop.initial * years * 0.03));pop.deaths = safe(Math.floor(pop.initial * years * 0.02));pop.present = safe(pop.initial + pop.births - pop.deaths - pop.materialized);need(pop.present >= 0, 'aggregate population');
    s.resolvedTick = target;s.work = { actors: Object.keys(people(s)).length, events: steps, intervals: target > 0 ? 1 : 0 };
}
export function prepareLifetimes(base, candidate, operation = null) {
    const policy = lifetimePolicy(candidate);if (!policy) return;
    const s = candidate.states.atri_lifecycle.lifetimes, now = candidate.states.atri_lifecycle.clocks[policy.clockId];
    // Authored identities materialize only once their opening source exists.
    for (const p of policy.people.filter(p => p.sourceRecordId && !people(s)[p.id])) {
        const binding = policy.actorSource;
        const value = candidate.states.atri_lifecycle.domains[binding.domainId]?.records.find(r => r.id === p.sourceRecordId)?.value;
        if (value?.[binding.identityField] === p.id) {
            const introduced = makePerson(s, policy, { ...p, name: value[binding.nameField], sourceId: binding.domainId + '.' + p.sourceRecordId, cause: 'authored' }, binding.introducedPath.reduce((v, k) => v[k], value));
            if (value[binding.aliveField] === false)endPerson(candidate, s, policy, introduced, binding.introducedPath.reduce((v, k) => v[k], value), 'dead');
        }
    }
    resolve(candidate, s, policy, now);
    resolveRenewalDue(candidate, s, policy, now);
    if (operation)operate(candidate, s, policy, operation.operation, operation.input, now);
    s.population.present = s.population.initial + s.population.births - s.population.deaths - s.population.materialized;
    for (const p of policy.people.filter(p => p.sourceRecordId)) {
        const binding = policy.actorSource, value = candidate.states.atri_lifecycle.domains[binding.domainId]?.records.find(r => r.id === p.sourceRecordId)?.value;
        if (value && people(s)[p.id]) value[binding.aliveField] = people(s)[p.id].status.kind !== 'dead';
    }
    syncEnterprise(candidate, s, policy, now);
    validateLifetimes(candidate, { complete: true });
}

export function validateLifetimes(snapshot, { complete = false } = {}) {
    const policy = lifetimePolicy(snapshot), s = snapshot.states.atri_lifecycle?.lifetimes;
    if (!policy) { need(!s, 'undeclared state');return; }
    need(s && s.schemaVersion === 1, 'state version');fields(s, ['schemaVersion', 'nextId', 'resolvedTick', 'people', 'archive', 'bonds', 'kinship', 'pregnancies', 'institutions', 'offices', 'terms', 'legacies', 'milestones', 'population', 'continuity', 'work', 'renewal', 'enterprise'], 'Lifetime state');
    need(policy.protagonistId === snapshot.manifest.actors[0].actorId, 'protagonist authority');
    const now = snapshot.states.atri_lifecycle.clocks[policy.clockId], all = people(s);safe(s.nextId);safe(s.resolvedTick);need(s.nextId > 0 && s.resolvedTick >= 0 && s.resolvedTick <= now && (!complete || s.resolvedTick === now), 'resolved clock');
    need(Object.keys(all).length <= policy.maxPeople && Object.keys(s.people).every(id => !s.archive[id]), 'actor budget/identity');
    need(Buffer.byteLength(JSON.stringify(s)) <= policy.maxBytes, 'state budget');
    for (const group of ['people', 'archive', 'bonds', 'kinship', 'pregnancies', 'institutions', 'offices', 'terms', 'legacies', 'milestones']) for (const [id, item] of Object.entries(s[group])) {
        taskId(id);need(item.id === id, 'record identity');const match = /^life\.[a-z]+\.(\d+)$/.exec(id);if (match)need(Number(match[1]) < s.nextId, 'allocation cursor');
    }
    for (const [id, p] of Object.entries(all)) {
        taskId(id);need(p.id === id && ['A', 'B'].includes(p.tier), 'actor identity/tier');
        fields(p, ['id', 'identity', 'tier', 'status', 'career', 'health', 'route', 'bodyAge', 'bodyAt', 'matured', 'retirementTick', 'deathTick', 'contacts', 'lastContactSource', 'detail'], 'Lifetime person');
        safe(p.identity.birthTick);safe(p.identity.introducedTick);safe(p.status.tick);safe(p.bodyAt);safe(p.deathTick);safe(p.retirementTick);
        need(p.identity.name.trim() && p.identity.birthTick <= p.identity.introducedTick && p.identity.introducedTick >= 0 && p.identity.introducedTick <= now && p.status.tick >= p.identity.introducedTick && p.status.tick <= now, 'birth/introduction/status chronology');
        need(['active', 'retired', 'missing', 'dead', 'absent'].includes(p.status.kind) && Number.isFinite(p.bodyAge) && p.bodyAge >= 0 && p.bodyAt <= now, 'embodiment');
        need(!p.route.id || policy.routes.some(r => r.id === p.route.id), 'route');
        need(p.id === policy.protagonistId ? p.status.kind !== 'dead' : p.status.kind !== 'absent', 'ordinary death continuity');
        need(p.retirementTick === anniversary(p.identity.birthTick, policy.retirementAge), 'retirement chronology');
        if (s.archive[id])need(!active(p) && p.detail === null, 'archive simulation fidelity');
        if (p.id !== policy.protagonistId && Object.values(s.milestones).some(e => e.kind === 'dead' && e.people.includes(id)))need(p.status.kind === 'dead', 'dead identity resurrection');
    }
    const c = s.continuity;need(c.protagonistId === policy.protagonistId && (policy.enterprise ? Boolean(s.enterprise?.identities[c.publicIdentityId]) : c.publicIdentityId === policy.publicIdentityId) && c.identitySince >= 0 && c.identitySince <= now, 'identity continuity');
    for (const key of ['claimBurden', 'exposure', 'scars', 'returns', 'grants'])need(Number.isSafeInteger(c[key]) && c[key] >= 0, 'durable cost');
    need(c.grants <= 2 && c.returns <= c.scars, 'reconstruction cost');
    need((actor(s, policy.protagonistId).status.kind === 'absent') === (c.returnAt !== null), 'return obligation');
    if (c.nextExposureAt !== null)need(Number.isSafeInteger(c.nextExposureAt) && (!complete || c.nextExposureAt > now), 'exposure chronology');
    if (c.returnAt !== null)need(Number.isSafeInteger(c.returnAt) && (!complete || c.returnAt > now), 'pending return');
    for (const b of Object.values(s.bonds)) {
        need(b.people.length >= 2 && new Set(b.people).size === b.people.length && ['active', 'estranged', 'separated', 'widowed'].includes(b.state), 'bond');
        for (const id of b.people)need(ageAt(actor(s, id).identity.birthTick, b.from) >= policy.adultAge, 'bond adulthood');
        need(b.from <= now && (b.ended === null || b.ended >= b.from && b.ended <= now), 'bond chronology');
        if (b.state === 'active')need(b.people.every(id => actor(s, id).status.kind !== 'dead'), 'dead active bond');
    }
    const parents = new Map();
    for (const k of Object.values(s.kinship)) {
        const child = actor(s, k.childId);need(k.parents.length > 0 && k.parents.length <= 2 && new Set(k.parents).size === k.parents.length && k.tick <= now, 'kinship');
        need(k.kind === 'biological' || k.kind === 'adoption', 'kinship kind');
        if (k.kind === 'biological')need(child.identity.birthTick === k.tick, 'birth fact');
        for (const id of k.parents) { const p = actor(s, id);need(p.identity.birthTick < child.identity.birthTick && ageAt(p.identity.birthTick, k.kind === 'biological' ? child.identity.birthTick : k.tick) >= policy.adultAge, 'parent chronology');parents.set(k.childId, [...(parents.get(k.childId) ?? []), id]); }
    }
    const visit = (id, seen = new Set()) => { need(!seen.has(id), 'family cycle');for (const p of parents.get(id) ?? [])visit(p, new Set([...seen, id])); };for (const id of parents.keys())visit(id);
    for (const p of Object.values(s.pregnancies)) { need(p.due === p.conceived + policy.gestationTicks && p.conceived <= now && ['pending', 'born', 'lost'].includes(p.status), 'gestation chronology');if (p.status === 'born')need(actor(s, p.childId).identity.birthTick === p.due, 'birth due'); }
    for (const o of Object.values(s.offices)) {
        need(s.institutions[o.institutionId]?.id === o.institutionId, 'institution identity');
        const terms = Object.values(s.terms).filter(t => t.officeId === o.id).sort((a, b) => a.from - b.from || a.id.localeCompare(b.id, 'en'));
        let end = -1;for (const t of terms) { const p = actor(s, t.actorId);need(t.from >= end && t.from <= now && ageAt(p.identity.birthTick, t.from) >= policy.adultAge && (t.to === null || t.to >= t.from && t.to <= now), 'tenure chronology/overlap');end = t.to ?? Infinity; }
        const open = terms.filter(t => t.to === null);need(open.length <= 1 && (!o.holderId ? open.length === 0 : open.length === 1 && open[0].actorId === o.holderId), 'office holder');
        if (o.holderId) { const p = actor(s, o.holderId);need(active(p) && p.career.institutionId === o.institutionId, 'inactive office holder'); }
    }
    for (const l of Object.values(s.legacies)) { actor(s, l.ownerId);actor(s, l.heirId);need(l.tick <= now && ['pledged', 'inherited', 'disputed'].includes(l.status), 'inheritance'); }
    for (const e of Object.values(s.milestones)) { taskId(e.id);safe(e.tick);need(e.tick >= 0 && e.tick <= now, 'milestone chronology');for (const id of e.people)actor(s, id); }
    validateRenewal(snapshot, policy);
    validateEnterprise(snapshot, policy, { complete });
    const pop = s.population;for (const value of Object.values(pop))need(Number.isSafeInteger(value) && value >= 0, 'population count');need(pop.present === pop.initial + pop.births - pop.deaths - pop.materialized, 'population accounting');
}

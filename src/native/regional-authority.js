import { reviewTravel } from '../../public/shared/native-regional-runtime.js';
import { anniversary, people } from '../../public/shared/native-lifetime-runtime.js';
import { fields } from '../../public/shared/native-values.js';
import { taskId } from '../../public/shared/native-task-contract.js';
import { spendEnterprise } from './enterprise-authority.js';
const need = (ok, message) => { if (!ok) throw new TypeError('Regional ' + message); };
const safe = n => { need(Number.isSafeInteger(n), 'integer overflow'); return n; };
const sorted = o => Object.values(o).sort((a, b) => a.id.localeCompare(b.id, 'en'));
const live = x => x && !['dissolved', 'burned', 'demolished', 'closed'].includes(x.status);
const bound = (n, min, max) => Math.max(min, Math.min(max, n));
function log(w, kind, tick, regionId, sourceId, detail, isPublic = true) {
    const id = 'regional.' + w.nextId++;
    w.events[id] = { id, kind, tick, regionId, sourceId, detail, public: isPublic, refs: ['location:' + regionId, 'era:' + w.regions[regionId].eraId] };
    w.regions[regionId].lastEventId = id; return id;
}
export function initialRegional(policy) {
    const p = policy.regional;
    return { schemaVersion: 1, nextId: 1, currentRegionId: p.openingRegionId, journey: null, events: {}, alerts: [], regions: Object.fromEntries(p.regions.map(r => [r.id, {
        ...structuredClone(r), tier: r.id === p.openingRegionId ? 'active' : 'cold', materializedAt: r.id === p.openingRegionId ? 0 : null,
        nextReview: anniversary(0, p.cadenceYears), reviews: 0, lastPresence: 0, lastEventId: '', eraId: p.eras[0].id, eraSince: 0,
        population: { initial: r.population, present: r.population, births: 0, deaths: 0, inflow: 0, outflow: 0, young: 30, workers: 60 },
        economy: 'expansion', credit: 0, war: 'peace', law: 'customary', lawSince: 0, movement: 'emerging', health: 'stable', scars: 0, occultPressure: 0,
        technology: { transport: 0, communications: 0, sanitation: 0, research: 0 }, adopted: 0,
    }])) };
}
function connected(s, id) {
    const e = s.enterprise;
    return s.regional.currentRegionId === id || sorted(e.assets).some(a => a.ownerId === s.continuity.protagonistId && s.renewal.places[a.placeId]?.regionId === id && !['destroyed', 'seized'].includes(a.status)) ||
        sorted(e.contracts).some(c => c.status === 'active' && people(s)[c.agentId]?.regionId === id) ||
        sorted(s.bonds).some(b => b.people.includes(s.continuity.protagonistId) && ['active', 'estranged'].includes(b.state) && b.people.some(x => people(s)[x]?.regionId === id)) ||
        sorted(s.renewal.active).some(m => s.renewal.places[m.placeId]?.regionId === id);
}
export function syncRegional(s, policy) {
    if (!policy.regional) return;
    const w = s.regional, here = w.currentRegionId;
    for (const x of Object.values(s.institutions)) x.regionId ??= here;
    for (const x of Object.values(s.renewal.places)) x.regionId ??= s.renewal.places[x.districtId]?.regionId ?? here;
    for (const x of Object.values(people(s))) {
        x.regionId ??= s.institutions[x.career.institutionId]?.regionId ?? here;
        // Only the rebuildable empty hot-profile stub is compacted. Never erase
        // authored notes, biography, lifetime status, offices or relationships.
        if (x.status.kind === 'active' && x.tier === 'A' && w.regions[x.regionId].tier === 'active') {
            x.detail ??= { residence: x.regionId, notes: '' }; x.detail.residence = x.regionId;
        } else if (x.detail && !x.detail.notes) x.detail = null;
    }
    for (const r of sorted(w.regions)) if (r.tier === 'cold' && connected(s, r.id)) r.tier = 'warm';
}
function materialize(s, policy, r, tick, api) {
    if (r.materializedAt !== null) return;
    const cause = r.lastEventId || 'authored.' + r.id;
    r.materializedAt = tick;
    const id = kind => 'regional.' + r.id + '.' + kind;
    for (const kind of ['district', 'location', 'business']) {
        const key = id(kind);
        need(!s.renewal.places[key], 'materialization collision');
        s.renewal.places[key] = { id: key, name: r.name + ' ' + kind, kind, districtId: kind === 'district' ? '' : id('district'), regionId: r.id,
            function: kind === 'location' && r.scars ? 'memorial-and-relief' : policy.regional.eras.find(e => e.id === r.eraId).industry,
            status: r.scars && kind === 'business' ? 'declining' : 'active', founded: 0, changed: tick, materializedAt: tick, origin: cause, pressure: r.tension, revision: 0 };
    }
    const institutionId = id('council'), officeId = id('office');
    s.institutions[institutionId] = { id: institutionId, name: r.name + ' civic council', founded: 0, materializedAt: tick, origin: cause, status: 'active', regionId: r.id, refs: ['institution:' + institutionId, 'location:' + r.id] };
    s.offices[officeId] = { id: officeId, institutionId, title: 'Regional registrar', holderId: '', nomineeId: '', rule: 'seniority', refs: ['institution:' + institutionId] };
    // Existing population becomes relevant, not newly born. Do not recreate on return.
    api.succeed(s, policy, tick);
    syncRegional(s, policy);
    log(s.regional, 'materialization', tick, r.id, cause, { priorPopulation: r.population.present, scars: r.scars, eraId: r.eraId, institutionId });
}
function era(s, policy, r, tick, sourceId) {
    const p = policy.regional, current = p.eras.findIndex(e => e.id === r.eraId), target = p.eras[current + 1];
    if (!target || Math.min(...Object.values(r.technology)) < target.threshold || r.adopted < target.threshold || r.capital < 10 || ['war', 'mobilization'].includes(r.war) || !['implemented', 'amended'].includes(r.law)) return;
    const previous = r.eraId; r.eraId = target.id; r.eraSince = tick;
    const eventId = log(s.regional, 'era', tick, r.id, sourceId, { previous, next: target.id, requirements: { technology: structuredClone(r.technology), adopted: r.adopted, capital: r.capital, law: r.law }, industry: target.industry, occult: target.occult });
    for (const place of sorted(s.renewal.places).filter(x => x.regionId === r.id && live(x))) {
        place.function = target.industry; place.changed = tick; place.revision++; place.cause = eventId;
        // Existing capital becomes less suitable; adaptation is paid through asset repair.
        const asset = sorted(s.enterprise.assets).find(a => a.placeId === place.id);
        if (asset) asset.condition = Math.max(1, asset.condition - 10);
    }
    if (r.id === s.regional.currentRegionId) s.continuity.exposure += target.recordDensity;
}
function review(snapshot, s, policy, r, tick) {
    const w = s.regional, years = policy.regional.cadenceYears, previous = r.lastEventId || 'authored.' + r.id;
    const changes = {}, before = key => structuredClone(r[key]);
    const old = Object.fromEntries(['economy', 'war', 'law', 'movement', 'health', 'technology', 'population', 'capital'].map(k => [k, before(k)]));
    r.reviews++;
    if (r.economy === 'expansion') { r.credit += 2; r.capital += 10; if (r.credit >= 4) r.economy = 'bubble'; } else if (r.economy === 'bubble') { r.economy = 'recession'; r.capital -= 12; r.tension = Math.min(6, r.tension + 2); } else if (r.economy === 'recession') { r.economy = r.capital < 15 ? 'banking_crisis' : 'recovery'; r.credit = 0; } else { r.economy = 'expansion'; r.capital += 8; r.credit = 0; }
    const warNext = { tension: 'mobilization', mobilization: 'war', war: 'armistice', armistice: 'reconstruction', reconstruction: 'peace' };
    if (r.war !== 'peace') r.war = warNext[r.war];
    else if (r.tension >= 4 && ['recession', 'banking_crisis'].includes(r.economy)) r.war = 'tension';
    if (r.war === 'war') { r.capital -= 10; r.tension = 0; }
    if (r.war === 'reconstruction') r.capital += 8;
    const laws = { customary: 'proposed', proposed: 'disputed', disputed: 'adopted', adopted: 'implemented', implemented: 'amended', amended: 'amended' };
    if (r.movement !== 'declined' || r.war !== 'peace') { r.law = laws[r.law]; if (r.law !== old.law) r.lawSince = tick; }
    const movements = { emerging: 'recruiting', recruiting: 'split', split: 'institutionalized', institutionalized: 'declined', declined: 'emerging' };
    r.movement = movements[r.movement];
    // Authored shock grammars have state prerequisites and deterministic regional variation.
    const salt = [...r.id].reduce((n, c) => n + c.charCodeAt(0), policy.seed);
    r.health = r.health !== 'stable' ? 'stable' : (r.reviews + salt) % 4 === 0 ? (r.technology.sanitation < 2 ? 'epidemic' : 'industrial_disaster') : 'stable';
    const births = Math.floor(r.population.present * years * 0.02), deaths = Math.floor(r.population.present * years * 0.015) + (r.health === 'epidemic' ? Math.floor(r.population.present / 50) : 0) + (r.war === 'war' ? Math.floor(r.population.present / 100) : 0);
    r.population.births = safe(r.population.births + births); r.population.deaths = safe(r.population.deaths + deaths); r.population.present = safe(r.population.present + births - deaths);
    if (r.health !== 'stable') { r.scars++; r.capital -= 5; }
    const destination = sorted(w.regions).filter(x => x.id !== r.id).sort((a, b) => b.capital - a.capital || a.id.localeCompare(b.id, 'en'))[0];
    if (destination && (r.war === 'war' || ['recession', 'banking_crisis'].includes(r.economy) || r.health !== 'stable')) {
        const migrants = Math.min(r.population.present, Math.floor(r.population.present / 100));
        r.population.outflow += migrants; r.population.present -= migrants; destination.population.inflow += migrants; destination.population.present += migrants;
        changes.migration = { from: r.id, to: destination.id, count: migrants };
    }
    r.population.young = r.health === 'epidemic' ? 26 : 30; r.population.workers = r.war === 'war' ? 52 : 60;
    r.capital = bound(r.capital, 0, 100);
    if (r.capital >= 15 && !['war', 'mobilization'].includes(r.war)) {
        for (const key of Object.keys(r.technology)) r.technology[key] = Math.min(8, r.technology[key] + 1);
        r.capital -= 4; r.adopted = Math.min(8, r.adopted + 1);
    }
    r.occultPressure += r.technology.research > 0 ? 1 : 0;
    if (r.occultPressure >= 3) { r.occultPressure = 0; log(w, 'occult', tick, r.id, previous, { kind: r.technology.research < 4 ? 'containment_breach' : 'standardized_countermeasures', regulation: r.law }, false); changes.occult = 'Unexplained industrial restrictions'; if (r.technology.research < 4) r.scars++; }
    for (const key of Object.keys(old)) if (JSON.stringify(old[key]) !== JSON.stringify(r[key])) changes[key] = { before: old[key], after: structuredClone(r[key]) };
    const sourceId = log(w, 'macro', tick, r.id, previous, changes);
    for (const place of sorted(s.renewal.places).filter(x => x.regionId === r.id && live(x))) {
        place.pressure = bound(place.pressure + (r.economy === 'recession' ? 2 : -1) + Number(r.war === 'war') * 3, 0, 11);
        if (r.health !== 'stable' && place.kind === 'location') { place.function = 'public-health-relief'; place.changed = tick; place.revision++; place.cause = sourceId; }
    }
    // Institutional and family state are shared across hubs, never recreated.
    for (const bond of sorted(s.bonds).filter(b => b.state === 'active' && b.people.includes(policy.protagonistId))) {
        const other = people(s)[bond.people.find(id => id !== policy.protagonistId)];
        if (other?.regionId === r.id && w.currentRegionId !== r.id && tick >= anniversary(r.lastPresence, 10)) bond.state = 'estranged';
    }
    if (connected(s, r.id) && (r.war === 'war' || r.health !== 'stable')) {
        w.alerts.push({ tick, regionId: r.id, sourceId, reason: r.war === 'war' ? 'war' : r.health }); if (w.alerts.length > 8) w.alerts.shift();
    }
    era(s, policy, r, tick, sourceId);
    r.nextReview = anniversary(tick, years);
}
export function regionalDue(s) {
    if (!s.regional) return [];
    return [...sorted(s.regional.regions).map(r => ({ tick: r.nextReview, kind: 'regional', id: r.id })), ...(s.regional.journey ? [{ tick: s.regional.journey.arrives, kind: 'arrival', id: s.regional.journey.to }] : [])];
}
export function resolveRegional(snapshot, s, policy, e, api) {
    const w = s.regional, r = w.regions[e.id];
    if (e.kind === 'regional') review(snapshot, s, policy, r, e.tick);
    else {
        const journey = w.journey, origin = w.regions[journey.from];
        if (origin.tier === 'active') origin.tier = 'warm';
        w.currentRegionId = r.id; w.journey = null; r.tier = 'active'; r.lastPresence = e.tick;
        people(s)[policy.protagonistId].regionId = r.id;
        materialize(s, policy, r, e.tick, api);
        log(w, 'arrival', e.tick, r.id, journey.sourceId, { ...journey });
    }
}
export function operateRegional(snapshot, s, policy, a, tick, api) {
    need(policy.regional, 'not declared'); need(['travel', 'fidelity', 'invest'].includes(a.verb), 'verb'); const w = s.regional, r = w.regions[a.regionId]; need(r, 'unknown region');
    if (a.verb === 'travel') {
        need(!a.tier && !a.project && !a.sourceId && !w.journey && a.regionId !== w.currentRegionId, 'travel state');
        const origin = w.regions[w.currentRegionId], reviewed = reviewTravel(s, policy, r.id, a.mode, tick);
        const { duration, disruption } = reviewed;
        spendEnterprise(s, policy, reviewed.cost, tick, 'travel', r.id);
        const sourceId = log(w, 'departure', tick, origin.id, r.lastEventId || 'authored.' + r.id, { to: r.id, mode: a.mode, duration, disruption });
        origin.lastPresence = tick; w.journey = { from: origin.id, to: r.id, departed: tick, arrives: safe(tick + duration), mode: a.mode, sourceId };
    } else if (a.verb === 'fidelity') {
        need(!a.mode && !a.project && !a.sourceId && !w.journey && ['active', 'warm', 'cold'].includes(a.tier) && a.tier !== r.tier, 'fidelity state');
        need(r.id !== w.currentRegionId || a.tier === 'active', 'cannot demote present hub');
        need(a.tier !== 'cold' || !connected(s, r.id), 'durable connections need warm resolution');
        need(a.tier !== 'active' || connected(s, r.id), 'active hub requires actual interests');
        need(a.tier !== 'active' || sorted(w.regions).filter(x => x.tier === 'active').length < policy.regional.maxActive, 'active hub budget');
        const previous = r.tier; r.tier = a.tier; if (a.tier === 'active') materialize(s, policy, r, tick, api);
        log(w, 'fidelity', tick, r.id, r.lastEventId || 'authored.' + r.id, { previous, next: r.tier });
    } else {
        need(!a.mode && !a.tier && ['transport', 'communications', 'sanitation', 'research'].includes(a.project) && !w.journey, 'investment state');
        const cause = s.renewal.canonical[a.sourceId]; need(cause?.closed !== undefined && s.renewal.places[cause.placeId]?.regionId === r.id, 'local resolved evidence required');
        const permission = a.project === 'research' ? 'research' : 'trade';
        need(sorted(s.enterprise.roles).some(role => role.status === 'active' && policy.enterprise.roles.find(x => x.id === role.roleId)?.permission === permission), 'investment authority');
        need(r.id === w.currentRegionId || connected(s, r.id), 'remote investment needs actual network');
        need(r.technology[a.project] < 8, 'project already mature');
        spendEnterprise(s, policy, 100, tick, 'regional_investment', a.sourceId); r.technology[a.project]++; r.capital = Math.min(100, r.capital + 5);
        const sourceId = log(w, 'investment', tick, r.id, a.sourceId, { project: a.project, cost: 100 }); era(s, policy, r, tick, sourceId);
    }
}
export function validateRegional(snapshot, policy) {
    const s = snapshot.states.atri_lifecycle.lifetimes, w = s.regional, p = policy.regional;
    if (!p) { need(!w, 'undeclared state'); return; }
    need(w?.schemaVersion === 1, 'state'); fields(w, ['schemaVersion', 'nextId', 'currentRegionId', 'journey', 'events', 'alerts', 'regions'], 'Regional state');
    const now = snapshot.states.atri_lifecycle.clocks[policy.clockId];
    need(Object.keys(w.events).length <= p.maxRecords && w.alerts.length <= 8, 'record budget'); need(safe(w.nextId) > 0 && w.regions[w.currentRegionId]?.tier === 'active', 'identity/current hub');
    need(sorted(w.regions).length === p.regions.length && sorted(w.regions).filter(r => r.tier === 'active').length <= p.maxActive, 'region budget');
    for (const [id, r] of Object.entries(w.regions)) {
        fields(r, ['id', 'name', 'nation', 'population', 'capital', 'tension', 'tier', 'materializedAt', 'nextReview', 'reviews', 'lastPresence', 'lastEventId', 'eraId', 'eraSince', 'economy', 'credit', 'war', 'law', 'lawSince', 'movement', 'health', 'scars', 'occultPressure', 'technology', 'adopted'], 'Regional region');
        need(r.id === id && p.regions.some(x => x.id === id) && ['active', 'warm', 'cold'].includes(r.tier) && p.eras.some(e => e.id === r.eraId), 'region identity/tier/Era');
        need(r.materializedAt === null || r.materializedAt >= 0 && r.materializedAt <= now, 'materialization date');
        need(safe(r.nextReview) > s.resolvedTick && safe(r.eraSince) <= now && r.eraSince >= 0 && r.lastPresence <= now, 'chronology');
        need(['expansion', 'bubble', 'recession', 'banking_crisis', 'recovery'].includes(r.economy) && ['peace', 'tension', 'mobilization', 'war', 'armistice', 'reconstruction'].includes(r.war) && ['customary', 'proposed', 'disputed', 'adopted', 'implemented', 'amended'].includes(r.law), 'macro phases');
        const eraEvents = sorted(w.events).filter(e => e.kind === 'era' && e.regionId === id).sort((a, b) => a.tick - b.tick);
        let prior = p.eras[0].id; for (const e of eraEvents) { need(e.detail.previous === prior && p.eras.findIndex(x => x.id === e.detail.next) === p.eras.findIndex(x => x.id === prior) + 1, 'Era history'); prior = e.detail.next; } need(r.eraId === prior, 'Era provenance');
        const pop = r.population; need(pop.initial === p.regions.find(x => x.id === id).population, 'population origin'); for (const value of Object.values(pop)) need(safe(value) >= 0, 'population');
        need(pop.present === pop.initial + pop.births - pop.deaths + pop.inflow - pop.outflow, 'population conservation');
        for (const value of Object.values(r.technology)) need(safe(value) >= 0 && value <= 8, 'technology');
        need(!r.lastEventId || w.events[r.lastEventId]?.regionId === id, 'history source');
    }
    need(sorted(w.regions).reduce((n, r) => n + r.population.inflow - r.population.outflow, 0) === 0, 'migration conservation');
    for (const [id, e] of Object.entries(w.events)) { taskId(id); need(e.id === id && Number(id.slice(9)) < w.nextId && safe(e.tick) >= 0 && e.tick <= now && w.regions[e.regionId], 'event identity/chronology'); if (e.sourceId.startsWith('regional.') && w.events[e.sourceId]) need(w.events[e.sourceId].tick <= e.tick, 'event provenance'); }
    if (w.journey) need(w.journey.from === w.currentRegionId && w.regions[w.journey.to] && w.journey.arrives > s.resolvedTick && w.journey.departed <= now && w.events[w.journey.sourceId]?.kind === 'departure', 'journey chronology');
    for (const x of [...Object.values(people(s)), ...Object.values(s.institutions), ...Object.values(s.renewal.places)]) need(w.regions[x.regionId], 'entity region');
}
export function regionalSources(snapshot) {
    const w = snapshot.states.atri_lifecycle?.lifetimes?.regional; if (!w) return [];
    const source = (id, value, refs) => ({ id: 'regional.' + id, domainId: 'regional', recordId: id, path: ['value'], public: true, refs, label: id, value });
    return [...sorted(w.events).map(e => ({ ...source(e.id, e, e.refs), public: e.public })), ...sorted(w.regions).map(r => source(r.id, r, ['location:' + r.id, 'era:' + r.eraId]))];
}

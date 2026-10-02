import { fields } from '../../public/shared/native-values.js';
import { RENEWAL_DIMENSIONS, semanticDistance } from '../../public/shared/native-renewal-contract.js';
import { people, ageAt } from '../../public/shared/native-lifetime-runtime.js';
const need = (ok, message) => { if (!ok) throw new TypeError('Renewal ' + message); };
const sorted = o => Object.values(o).sort((a, b) => a.id.localeCompare(b.id, 'en'));
const live = x => !['dissolved', 'demolished', 'burned', 'closed'].includes(x.status);
const next = r => 'renewal.' + r.nextId++;
const activeInstitution = x => !x.status || x.status === 'active';
function hash(value) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; }
export function initialRenewal(policy) {
    return { schemaVersion: 1, nextId: 1, active: {}, recent: [], canonical: {}, places: Object.fromEntries(policy.places.map(x => [x.id, { ...structuredClone(x), status: 'active', founded: 0, changed: 0, origin: 'authored', pressure: 0, revision: 0 }])),
        completed: 0, actions: 0, last: null };
}
function source(snapshot, s, id) {
    const h = snapshot.states.atri_lifecycle.history;
    return s.renewal.canonical[id] ?? h.facts[id] ?? h.artifacts[id] ?? h.hooks[id];
}
function compose(snapshot, s, policy, args, tick) {
    const r = s.renewal, p = policy.renewal, h = snapshot.states.atri_lifecycle.history;
    need(Object.keys(r.active).length < p.maxActive, 'active budget');
    const hook = args.hookId ? h.hooks[args.hookId] : null;
    need(!args.hookId || hook?.public && hook.status === 'dormant' && tick - hook.tick >= p.cooldownTicks && source(snapshot, s, hook.sourceId), 'hook not eligible');
    const actors = sorted(people(s)).filter(x => x.status.kind === 'active' && ageAt(x.identity.birthTick, tick) >= policy.adultAge);
    const institutions = sorted(s.institutions).filter(activeInstitution), places = sorted(r.places).filter(live);
    need(actors.length && institutions.length && places.length, 'no eligible world roles');
    const grammars = p.grammars.filter(g => (!args.grammarId || g.id === args.grammarId) && (!g.historyRequired || hook));
    need(grammars.length, 'grammar unavailable');
    for (let attempt = 0; attempt < 64; attempt++) {
        const salt = policy.seed + ':' + r.completed + ':' + r.nextId + ':' + attempt;
        const pick = (xs, key) => xs[hash(salt + ':' + key) % xs.length];
        const g = pick(grammars, 'grammar'), place = pick(places, 'place'), institution = pick(institutions, 'institution');
        const subject = pick(actors, 'subject'), investigator = actors.find(a => a.id === policy.protagonistId);
        need(investigator, 'protagonist unavailable');
        const family = sorted(s.kinship).find(k => k.visibility !== 'secret' && (k.childId === subject.id || k.parents.includes(subject.id)));
        if (g.requiresFamily && !family) continue;
        const artifact = hook ? h.artifacts[hook.sourceId] ?? null : null;
        need(!artifact || !['lost', 'destroyed'].includes(artifact.status), 'historical document unavailable');
        const structure = Object.fromEntries(RENEWAL_DIMENSIONS.map(d => [d, pick(g[d], d)]));
        structure.path = g.actions.join('>');
        structure.subject = family ? (family.childId === subject.id ? 'descendant' : 'parent') : Object.values(s.offices).some(o => o.holderId === subject.id) ? 'office-holder' : 'adult-resident';
        structure.roles = subject.id === investigator.id ? 'self-petition' : subject.career.institutionId === institution.id ? 'member-reviewer' : 'resident-reviewer';
        structure.institutionRole = institution.id === subject.career.institutionId ? 'internal-review' : 'external-jurisdiction';
        structure.historyRole = hook ? artifact ? 'documentary-reopening' : family ? 'family-reopening' : 'historical-reopening' : family ? 'family-present' : 'contemporary';
        if (r.recent.some(old => (tick - old.tick < p.cooldownTicks && semanticDistance(structure, old.structure) < p.minimumDistance) || semanticDistance(structure, old.structure) === 0)) continue;
        const id = next(r);
        const refs = ['actor:' + subject.id, 'institution:' + institution.id, 'location:' + place.id, ...(family ? ['family:' + family.childId] : []), ...(artifact ? ['artifact:' + artifact.id] : [])];
        const m = { id, grammarId: g.id, trigger: g.trigger, opened: tick, deadline: tick + g.responseTicks, escalated: false, status: 'investigating', structure, subjectId: subject.id, institutionId: institution.id, placeId: place.id,
            familyId: family?.id ?? '', artifactId: artifact?.id ?? '', hookId: hook?.id ?? '', sourceId: hook?.sourceId ?? '', refs,
            path: [...g.actions], evidence: [], stage: 0, presentation: '', pressureAtOpen: place.pressure };
        r.active[id] = m;r.recent.push({ tick, structure, id });if (r.recent.length > p.maxRecent)r.recent.shift();r.last = { operation: 'matter.open', id, refs, summary: g.trigger };
        return;
    }
    throw new TypeError('Renewal novelty exhausted; advance world or choose other grammar');
}
function resolveMatter(snapshot, s, m, action, tick, api) {
    const r = s.renewal, place = r.places[m.placeId];
    need(action === 'settle' || action === 'record', 'resolution action');
    const available = live(place) && activeInstitution(s.institutions[m.institutionId]);
    need(available || action === 'record', 'unavailable venue permits archival recording, not live settlement');
    // The evidence path remains usable after a witness exits, but never pretends
    // the departed witness performed another live action.
    const outcome = { id: m.id, opened: m.opened, closed: tick, structure: m.structure, subjectId: m.subjectId, institutionId: m.institutionId, placeId: m.placeId,
        escalated: m.escalated, familyId: m.familyId, artifactId: m.artifactId, hookId: m.hookId, sourceId: m.sourceId, evidence: m.evidence, outcome: m.structure.resolution, refs: [...m.refs, 'case:' + m.id] };
    if (action === 'record' || m.hookId || r.canonical[m.id]) {
        r.canonical[m.id] = outcome;
        if (m.hookId) {
            const hook = snapshot.states.atri_lifecycle.history.hooks[m.hookId];need(hook?.status === 'active' && hook.transitions.some(x => x.matterId === m.id && x.status === 'active'), 'hook already consumed');
            // prepareHistory binds both transitions to the real published event.
            outcome.hookTransitions = ['resolved'];
        }
    }
    if (available) place.pressure = (place.pressure + (m.structure.resolution.includes('restitution') ? 2 : 1)) % 12;
    r.completed++;r.last = { operation: 'matter.resolve', id: m.id, outcome: outcome.outcome, refs: m.refs, summary: m.trigger + ' Outcome: ' + outcome.outcome + '; local pressure is now ' + place.pressure + '.' };delete r.active[m.id];
}
function worldChange(snapshot, s, policy, a, tick, api) {
    const r = s.renewal, evidence = source(snapshot, s, a.sourceId);
    need(evidence && evidence.public !== false && evidence.outcome && evidence.refs?.length, 'world change needs a resolved canonical matter');
    const institution = s.institutions[a.id], place = r.places[a.id], x = institution ?? place;
    const creation = ['found', 'build', 'open_business', 'zone_district'].includes(a.operation);
    if (creation) {
        need(!a.id && a.name.trim(), 'creation identity/name');
        // A living founder and traceable patronage/case evidence, never a name-only spawn.
        const founder = people(s)[policy.protagonistId];need(founder.status.kind === 'active', 'founder unavailable');
        const id = next(r);
        if (a.operation === 'found')s.institutions[id] = { id, name: a.name, founded: tick, origin: a.sourceId, status: 'active', predecessors: [], refs: ['institution:' + id, 'actor:' + founder.id] };
        else {
            need(a.operation === 'zone_district' ? !a.otherId : r.places[a.otherId]?.kind === 'district' && live(r.places[a.otherId]), 'construction district');
            r.places[id] = { id, name: a.name, kind: a.operation === 'open_business' ? 'business' : a.operation === 'zone_district' ? 'district' : 'location', districtId: a.otherId, function: 'civic-use', status: 'active', founded: tick, changed: tick, origin: a.sourceId, pressure: 0, revision: 0 };
        }
        r.last = { operation: a.operation, id };return;
    }
    need(x, 'entity missing');
    if (institution) {
        need(activeInstitution(institution) && ['merge', 'split', 'dissolve', 'rename'].includes(a.operation), 'institution transition');
        if (a.operation === 'rename') { need(a.name.trim() && a.name !== x.name, 'rename');x.name = a.name; } else {
            const targets = [institution];
            if (a.operation === 'merge') { const other = s.institutions[a.otherId];need(other && other !== institution && activeInstitution(other), 'merge partner');targets.push(other); }
            const successors = [];
            if (a.operation !== 'dissolve') {
                need(a.name.trim(), 'successor name');
                for (let i = 0; i < (a.operation === 'split' ? 2 : 1); i++) {
                    const id = next(r);successors.push(id);s.institutions[id] = { id, name: a.name + (i ? ' East' : ''), founded: tick, origin: a.sourceId, status: 'active', predecessors: targets.map(t => t.id), refs: ['institution:' + id, ...targets.map(t => 'institution:' + t.id)] };
                }
            }
            for (const target of targets) {
                target.status = 'dissolved';target.ended = tick;target.successors = successors;target.cause = a.sourceId;
                for (const office of Object.values(s.offices).filter(o => o.institutionId === target.id)) {
                    if (office.holderId)api.vacate(s, people(s)[office.holderId], tick, 'institution-dissolved');
                    office.nomineeId = '';office.closed = tick;
                }
                for (const person of Object.values(s.people).filter(p => p.career.institutionId === target.id))person.career = { occupation: 'displaced office member', institutionId: '', since: tick };
            }
        }
    } else {
        const transitions = { expand: ['active', 'declining'], repurpose: ['active', 'declining'], rename: ['active', 'declining'], decline: ['active'], burn: ['active', 'declining'], demolish: ['active', 'declining', 'burned'], rebuild: ['burned', 'demolished'], protect: ['active', 'declining'] };
        need(transitions[a.operation]?.includes(place.status), 'geography transition');
        need(!place.protected || !['demolish', 'repurpose'].includes(a.operation), 'protected geography');
        if (['rename', 'repurpose'].includes(a.operation)) { need(a.name.trim(), 'place detail');const key = a.operation === 'rename' ? 'name' : 'function';need(place[key] !== a.name, 'place no change');place[key] = a.name; }
        place.status = ({ decline: 'declining', burn: 'burned', demolish: 'demolished', rebuild: 'active' })[a.operation] ?? place.status;
        if (a.operation === 'protect') { need(!place.protected, 'already protected');place.protected = true; }
        if (a.operation === 'expand')place.capacity = (place.capacity ?? 1) + 1;
        place.changed = tick;place.revision++;
    }
    const id = next(r);r.canonical[id] = { id, kind: 'world-change', tick, operation: a.operation, entityId: a.id, otherId: a.otherId, sourceId: a.sourceId, refs: [institution ? 'institution:' + a.id : 'location:' + a.id] };r.last = { operation: a.operation, id };
}
export function operateRenewal(snapshot, s, policy, operation, a, tick, api) {
    need(policy.renewal && s.renewal, 'not declared');
    if (operation === 'matter.open')compose(snapshot, s, policy, a, tick);
    else if (operation === 'world.change') {
        worldChange(snapshot, s, policy, a, tick, api);
        for (const institution of sorted(s.institutions).filter(x => activeInstitution(x) && x.origin === a.sourceId)) {
            if (Object.values(s.offices).some(o => o.institutionId === institution.id && o.closed === undefined)) continue;
            const id = next(s.renewal);
            s.offices[id] = { id, institutionId: institution.id, title: 'Council delegate', holderId: '', nomineeId: '', rule: 'seniority', refs: ['institution:' + institution.id] };
        }
        api.succeed(s, policy, tick);
    } else {
        const r = s.renewal, m = r.active[a.id];need(m, 'matter missing');
        if (m.stage === m.path.length)resolveMatter(snapshot, s, m, a.action, tick, api);
        else {
            need(a.action === m.path[m.stage], 'evidence path order');
            const subject = people(s)[m.subjectId];
            need(subject, 'subject identity missing');
            const unavailable = !live(r.places[m.placeId]) || !activeInstitution(s.institutions[m.institutionId]);
            const historical = subject.status.kind !== 'active' || unavailable;
            const archiveSource = unavailable ? { id: !live(r.places[m.placeId]) ? m.placeId : m.institutionId } : historical ? sorted(s.milestones).find(e => e.people.includes(subject.id) && ['retired', 'dead', 'missing'].includes(e.kind)) : null;
            need(!historical || archiveSource, 'unexplained witness absence');
            m.evidence.push({ action: a.action, tick, sourceId: archiveSource?.id ?? (m.sourceId || m.subjectId), statusAtObservation: subject.status.kind, mode: historical ? 'archival-review' : 'live-inquiry' });m.stage++;
            // This is explicitly attributed testimony, not newly invented canon.
            m.presentation = a.presentation;r.actions++;r.last = { operation: 'matter.act', id: m.id, action: a.action, refs: m.refs, summary: a.action + ': ' + (historical ? 'review archived evidence' : 'record live inquiry') };
        }
    }
    validateRenewal(snapshot, policy);
}
export function resolveRenewalDue(snapshot, s, policy, now) {
    if (!policy.renewal) return;
    for (const m of sorted(s.renewal.active)) {
        if (m.escalated || m.deadline > now) continue;
        m.escalated = true;m.status = 'escalated';
        const place = s.renewal.places[m.placeId];place.pressure = (place.pressure + 3) % 12;
        s.renewal.canonical[m.id] = { id: m.id, kind: 'missed-deadline', tick: m.deadline, outcome: 'unanswered public complaint', subjectId: m.subjectId, institutionId: m.institutionId, placeId: m.placeId, refs: [...m.refs, 'case:' + m.id] };
    }
}
export function validateRenewal(snapshot, policy) {
    const s = snapshot.states.atri_lifecycle.lifetimes, r = s.renewal, p = policy.renewal;
    if (!p) { need(!r, 'undeclared state');return; }
    if (r) fields(r, ['schemaVersion', 'nextId', 'active', 'recent', 'canonical', 'places', 'completed', 'actions', 'last'], 'Renewal state');
    need(r && r.schemaVersion === 1 && Number.isSafeInteger(r.nextId) && r.nextId > 0, 'state identity');
    need(Object.keys(r.active).length <= p.maxActive && r.recent.length <= p.maxRecent && Object.keys(r.places).length + Object.keys(s.institutions).length <= p.maxEntities, 'state budget');
    const now = snapshot.states.atri_lifecycle.clocks[policy.clockId];
    for (const n of [r.completed, r.actions])need(Number.isSafeInteger(n) && n >= 0, 'counter');
    for (const group of [r.active, r.canonical, r.places, s.institutions]) for (const id of Object.keys(group)) {
        const match = /^renewal\.(\d+)$/.exec(id);if (match)need(Number(match[1]) < r.nextId, 'allocation cursor');
    }
    for (const m of Object.values(r.active)) {
        const g = p.grammars.find(g => g.id === m.grammarId);need(g && JSON.stringify(g.actions) === JSON.stringify(m.path), 'authored action path');
        for (const d of ['truth', 'anomaly', 'stakes', 'resolution'])need(g[d].includes(m.structure[d]), 'authored structure');
        need(Number.isSafeInteger(m.deadline) && m.deadline === m.opened + g.responseTicks && typeof m.escalated === 'boolean', 'matter deadline');
        need(m.structure.path === m.path.join('>') && people(s)[m.subjectId] && s.institutions[m.institutionId] && r.places[m.placeId], 'role identity');
        need((!g.requiresFamily || m.familyId) && (!m.familyId || s.kinship[m.familyId]), 'family source');
        need(!m.artifactId || snapshot.states.atri_lifecycle.history.artifacts[m.artifactId], 'artifact source');
        need(!m.hookId || snapshot.states.atri_lifecycle.history.hooks[m.hookId]?.sourceId === m.sourceId, 'historical source');
        need(typeof m.presentation === 'string' && m.presentation.length <= 320, 'deliberation bound');
        let previous = m.opened;for (const e of m.evidence) { need(e.tick >= previous && e.tick <= now && ['live-inquiry', 'archival-review'].includes(e.mode), 'evidence chronology');previous = e.tick; }
    }
    for (const old of r.recent)need(Number.isSafeInteger(old.tick) && old.tick >= 0 && old.tick <= now && [...RENEWAL_DIMENSIONS, 'institutionRole', 'historyRole'].every(d => typeof old.structure[d] === 'string' && old.structure[d].length <= 256), 'novelty window');
    for (const x of Object.values(s.institutions)) if (x.predecessors) {
        need(x.predecessors.every(id => s.institutions[id]?.ended === x.founded && s.institutions[id]?.successors?.includes(x.id)), 'institution lineage');
    }
    for (const [id, m] of Object.entries(r.active))need(id === m.id && m.opened <= now && m.stage === m.evidence.length && m.stage <= m.path.length && p.grammars.some(g => g.id === m.grammarId), 'matter integrity');
    for (const [id, x] of Object.entries(r.places))need(id === x.id && x.founded <= x.changed && x.changed <= now && Number.isInteger(x.pressure) && x.pressure >= 0 && x.pressure < 12, 'place integrity');
    for (const x of Object.values(s.institutions)) if (!activeInstitution(x))need(!Object.values(s.offices).some(o => o.institutionId === x.id && o.holderId), 'dissolved office');
    for (const [id, x] of Object.entries(r.canonical))need(id === x.id && (x.closed ?? x.tick) <= now, 'canonical chronology');
}
export function renewalSources(snapshot) {
    const r = snapshot.states.atri_lifecycle?.lifetimes?.renewal;if (!r) return [];
    const out = [];
    for (const [id, value] of Object.entries(r.canonical).sort())out.push({ id: 'renewal.' + id, domainId: 'renewal', recordId: id, path: ['value'], public: true, refs: value.refs, label: 'World consequence ' + id, value });
    // Pressure is transient. Durable geography changes alone enter the ledger.
    for (const [id, p] of Object.entries(r.places).sort()) { const { pressure: _pressure, ...value } = p;out.push({ id: 'renewal.place.' + id, domainId: 'renewal', recordId: id, path: ['value'], public: true, refs: ['location:' + id], label: p.name, value }); }
    return out;
}

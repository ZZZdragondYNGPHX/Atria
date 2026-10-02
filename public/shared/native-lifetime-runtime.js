import { lifetimePolicy } from './native-lifetime-contract.js';
// Proleptic Gregorian, minute epoch year 1. Negative birth dates are explicit
// pre-opening history; introduction is always a separate nonnegative instant.
export function civil(tick) {
    const n = Math.floor(tick / 1440) + 306, era = Math.floor(n / 146097), d = n - era * 146097;
    const y = Math.floor((d - Math.floor(d / 1460) + Math.floor(d / 36524) - Math.floor(d / 146096)) / 365);
    const day = d - (365 * y + Math.floor(y / 4) - Math.floor(y / 100));
    const m = Math.floor((5 * day + 2) / 153), month = m + (m < 10 ? 3 : -9);
    return { year: era * 400 + y + (month <= 2 ? 1 : 0), month, day: day - Math.floor((153 * m + 2) / 5) + 1, minute: ((tick % 1440) + 1440) % 1440 };
}
export function instant({ year, month, day, minute = 0 }) {
    const y = year - (month <= 2 ? 1 : 0), era = Math.floor(y / 400), yo = y - era * 400, m = month + (month > 2 ? -3 : 9);
    const value = (era * 146097 + yo * 365 + Math.floor(yo / 4) - Math.floor(yo / 100) + Math.floor((153 * m + 2) / 5) + day - 1 - 306) * 1440 + minute;
    if (!Number.isSafeInteger(value)) throw new TypeError('Lifetime date overflow'); return value;
}
export function anniversary(birth, years) {
    const c = civil(birth); c.year += years;
    if (c.month === 2 && c.day === 29 && !(c.year % 4 === 0 && (c.year % 100 !== 0 || c.year % 400 === 0))) c.day = 28;
    return instant(c);
}
export function ageAt(birth, tick) { const years = civil(tick).year - civil(birth).year; return years - Number(anniversary(birth, years) > tick); }
export const people = state => ({ ...state.archive, ...state.people });
export function lifetimeView(snapshot, id) {
    const policy = lifetimePolicy(snapshot), s = snapshot.states.atri_lifecycle?.lifetimes;
    if (!policy || !s) throw new TypeError('Lifetimes not declared');
    const actor = people(s)[id]; if (!actor) throw new TypeError('Unknown lifetime identity');
    const now = actor.status.kind === 'dead' ? actor.status.tick : snapshot.states.atri_lifecycle.clocks[policy.clockId], route = policy.routes.find(r => r.id === actor.route.id);
    const apparent = actor.bodyAge + Math.max(0, now - actor.bodyAt) / (365.2425 * 1440 * (route?.agingDivisor ?? 1));
    return { id, name: actor.identity.name, chronologicalAge: ageAt(actor.identity.birthTick, now), apparentAge: Math.floor(apparent),
        publicIdentityAge: id === policy.protagonistId ? ageAt(s.continuity.identitySince, now) : null,
        status: actor.status.kind, tier: actor.tier, stage: ageAt(actor.identity.birthTick, now) < policy.adultAge ? 'child' : ageAt(actor.identity.birthTick, now) < policy.retirementAge ? 'adult' : 'elder',
        occupation: actor.career.occupation, institutionId: actor.career.institutionId, routeId: actor.route.id,
        continuity: id === policy.protagonistId ? structuredClone(s.continuity) : null };
}
// Stable current-source bindings plus exact milestone facts. Never bind an
// introduction to birth, nor store derived age once per advancing turn.
export function lifetimeSources(snapshot) {
    const s = snapshot.states.atri_lifecycle?.lifetimes; if (!s) return [];
    const out = [];
    const add = (key, value, refs, visible = true) => out.push({ id: 'lifetime.' + key, domainId: 'lifetimes', recordId: key, path: ['value'], public: visible, refs, label: key, value });
    for (const [id, p] of Object.entries(people(s)).sort()) {
        for (const field of ['identity', 'status', 'career', 'route', 'health']) add('person.' + id + '.' + field, p[field], ['actor:' + id]);
    }
    for (const group of ['bonds', 'kinship', 'pregnancies', 'institutions', 'offices', 'terms', 'legacies', 'milestones']) for (const [id, item] of Object.entries(s[group]).sort()) add(group + '.' + id, item, item.refs, item.visibility !== 'secret');
    add('continuity', s.continuity, ['actor:' + lifetimePolicy(snapshot).protagonistId, 'claim:longevity']);
    return out;
}

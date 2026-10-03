// Read-only, bounded projections. Never expose enterprise truth or hidden Matters.
export function regionalView(snapshot) {
    const s = snapshot.states.atri_lifecycle?.lifetimes, w = s?.regional;
    if (!w) throw new TypeError('Regional not declared');
    return { currentRegionId: w.currentRegionId, journey: structuredClone(w.journey), regions: Object.values(w.regions).sort((a, b) => a.id.localeCompare(b.id, 'en')).map(r => ({
        id: r.id, name: r.name, nation: r.nation, tier: r.tier, eraId: r.eraId, materializedAt: r.materializedAt, population: r.population.present, economy: r.economy, war: r.war, law: r.law, movement: r.movement, health: r.health, technology: structuredClone(r.technology), lastEventId: r.lastEventId,
    })), alerts: structuredClone(w.alerts.slice(-8)) };
}

// Shared calendar/route calculation for a reviewed request and its Authority write.
// A review grants no permission, predicts no outcome, and performs no mutation.
export function reviewTravel(state, policy, destination, mode, tick) {
    const w = state.regional, origin = w?.regions[w.currentRegionId], target = w?.regions[destination];
    if (!origin || !target || w.journey || origin.id === target.id) throw new TypeError('Regional travel state');
    const route = policy.regional.routes.find(x => [x.from, x.to].includes(origin.id) && [x.from, x.to].includes(target.id));
    if (!route) throw new TypeError('Regional route unavailable');
    const level = Math.min(origin.technology.transport, target.technology.transport);
    if (!(mode === 'coach' || mode === 'rail' && level >= 1 || mode === 'motor' && level >= 4)) throw new TypeError('Regional transport unavailable');
    const speed = mode === 'coach' ? 1 : mode === 'rail' ? 3 : 5;
    const eraSpeed = Math.min(...[origin, target].map(x => policy.regional.eras.find(e => e.id === x.eraId).transportDivisor));
    const disruption = [origin, target].some(x => ['war', 'mobilization'].includes(x.war) || x.health !== 'stable') ? 3 : 1;
    const duration = Math.max(1440, Math.ceil(route.days * 1440 * disruption / (speed * eraSpeed)));
    if (!Number.isSafeInteger(tick + duration)) throw new TypeError('Regional integer overflow');
    return { from: origin.id, to: target.id, origin: origin.name, destination: target.name, mode, duration, disruption, arrives: tick + duration, cost: 5 + route.days };
}

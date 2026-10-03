// Read-only, bounded projections. Never expose enterprise truth or hidden Matters.
export function regionalView(snapshot) {
    const s = snapshot.states.atri_lifecycle?.lifetimes, w = s?.regional;
    if (!w) throw new TypeError('Regional not declared');
    return { currentRegionId: w.currentRegionId, journey: structuredClone(w.journey), regions: Object.values(w.regions).sort((a, b) => a.id.localeCompare(b.id, 'en')).map(r => ({
        id: r.id, name: r.name, nation: r.nation, tier: r.tier, eraId: r.eraId, materializedAt: r.materializedAt, population: r.population.present, economy: r.economy, war: r.war, law: r.law, movement: r.movement, health: r.health, technology: structuredClone(r.technology), lastEventId: r.lastEventId,
    })), alerts: structuredClone(w.alerts.slice(-8)) };
}

export const regionalPolicy = {
    schemaVersion: 1, openingRegionId: 'eastbank', cadenceYears: 5, maxRecords: 256, maxActive: 2,
    regions: [
        { id: 'eastbank', name: 'Eastbank', nation: 'River Commonwealth', population: 10000, capital: 45, tension: 1 },
        { id: 'northreach', name: 'Northreach', nation: 'Northern Compact', population: 8000, capital: 50, tension: 0 },
        { id: 'salt_coast', name: 'Salt Coast', nation: 'Coastal League', population: 15000, capital: 35, tension: 4 },
    ],
    routes: [{ from: 'eastbank', to: 'northreach', days: 12 }, { from: 'eastbank', to: 'salt_coast', days: 20 }, { from: 'northreach', to: 'salt_coast', days: 30 }],
    eras: [
        { id: 'era.opening', label: 'Rail and fragmented registers', threshold: 0, recordDensity: 1, transportDivisor: 1, industry: 'rail-and-print', occult: 'local ritual practice' },
        { id: 'era.networked', label: 'Electrical and civic networks', threshold: 2, recordDensity: 2, transportDivisor: 2, industry: 'electricity-and-telephone', occult: 'licensed containment and occult medicine' },
        { id: 'era.regulated', label: 'Integrated industrial society', threshold: 5, recordDensity: 4, transportDivisor: 3, industry: 'radio-motor-and-public-health', occult: 'standardized industrial countermeasures' },
    ],
    grammarEras: [],
};

export function compileRegional(opening) {
    const p = structuredClone(regionalPolicy), renewal = opening.lifecycle.lifetimes.renewal;
    const base = renewal.grammars.find(g => g.id === 'document_fraud');
    const electric = { ...structuredClone(base), id: 'network_safety', trigger: 'A civic electrical network conflicts with licensed containment standards.', actions: ['inspect_grid', 'trace_license', 'test_containment'], truth: ['unsafe_network', 'forged_license'], anomaly: ['industrial_resonance', 'none'], stakes: ['public_health', 'network_access'], resolution: ['network_restitution', 'license_reform'] };
    const modern = { ...structuredClone(base), id: 'registry_surveillance', trigger: 'Integrated public records expose an old identity and disputed institutional authority.', actions: ['compare_registers', 'audit_network', 'review_authority'], truth: ['identity_collision', 'institutional_capture'], anomaly: ['archival_echo', 'none'], stakes: ['civil_identity', 'institutional_autonomy'], resolution: ['record_correction', 'authority_reform'] };
    renewal.grammars.push(electric, modern);
    p.grammarEras = [{ grammarId: electric.id, minimum: 1, maximum: 2 }, { grammarId: modern.id, minimum: 2, maximum: 2 }];
    opening.lifecycle.lifetimes.regional = p;
    return opening;
}

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

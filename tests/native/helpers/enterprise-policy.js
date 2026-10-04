export const enterprisePolicy = {
    schemaVersion: 1, maxRecords: 256, initialReserves: 1200, endowmentSource: 'authored.civil_savings', identityDomainId: '', matureRank: 3,
    propertyPrices: { location: 120, business: 240, district: 600 },
    roles: [
        { id: 'independent_verifier', permission: 'investigate', obligation: 'Preserve evidence and disclose conflicts of interest.', institutionRequired: false, minimumRank: 0, domain: 'investigation' },
        { id: 'merchant', permission: 'trade', obligation: 'Pay local taxes, honor title and maintain safe premises.', institutionRequired: false, minimumRank: 0, domain: 'commerce' },
        { id: 'administrator', permission: 'manage', obligation: 'Account to charter members and respect delegated authority.', institutionRequired: true, minimumRank: 0, domain: 'commerce' },
        { id: 'researcher', permission: 'research', obligation: 'Record Claim exposure and obey occult safety restrictions.', institutionRequired: true, minimumRank: 1, domain: 'occult' },
        { id: 'civic_official', permission: 'legal', obligation: 'Disclose assets, preserve court records and avoid self-dealing.', institutionRequired: true, minimumRank: 1, domain: 'investigation' },
    ],
};

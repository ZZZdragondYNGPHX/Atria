// Package declarations only; Native Authority/Lifecycle owns all history writes.
export function compileHistory(opening, manifest, operations) {
    const { lifecycle, logic, information } = opening;
    const actor = manifest.actors[0].actorId;
    const source = (id, domainId, path, refs, visible = true, recordId = 'main') => ({ id, domainId, recordId, path: path.split('.'), public: visible, refs, label: id.replaceAll('.', ' ') });
    lifecycle.history = { schemaVersion: 1, clockId: 'world', chronologyDomain: 'chronology',
        meaningfulDomains: lifecycle.domains.filter(d => !d.id.endsWith('_projection') && !['chronology'].includes(d.id)).map(d => d.id),
        sources: [
            source('protagonist.identity', 'continuity', 'protagonist_id', ['actor:' + actor]),
            source('public.identity', 'continuity', 'public_identity_id', ['actor:' + actor]),
            source('anchor.identity', 'entities', 'persistent_id', ['actor:entity.anchor', 'family:personal_anchor'], true, 'anchor'),
            source('claim.active', 'claims', 'active', ['actor:' + actor, 'claim:opening']),
            source('claim.seed', 'claims', 'seed', ['actor:' + actor, 'claim:opening']),
            source('case.disposition', 'settlements', 'disposition', ['case:second_death', 'institution:civil_verifier', 'location:eastbank']),
            source('case.convergence', 'settlements', 'convergence', ['case:eastbank', 'institution:civic_hearing', 'location:eastbank']),
            source('hidden.world', 'world_matters', 'convergence', ['case:eastbank'], false),
        ], hot: 8, warm: 24, cold: 32, maxDurable: 4096, maxBytes: 2097152, checkpointTurns: 64 };
    const entries = Object.entries(operations);
    const inputSchema = { type: 'object', properties: { operation: { type: 'string', maxLength: 32, enum: entries.map(([op]) => op) },
        ...Object.fromEntries(entries.map(([op, schema]) => [op.replaceAll('.', '_'), schema])) }, required: ['operation'], additionalProperties: false };
    const wait = logic.transactions.find(t => t.id === 'opening.wait');
    wait.inputSchema.properties.history = inputSchema;
    const hasHistory = entries.map(([op]) => 'args.history.operation == ' + JSON.stringify(op)).join(' || ');
    wait.resolution.cases[0].when = wait.resolution.cases[0].when.replace('args.minutes == 0', 'args.minutes == 0 && !(' + hasHistory + ')');
    wait.history = entries.map(([op, schema]) => ({ operation: op, when: 'resolution.outcome != "impossible" && args.history.operation == ' + JSON.stringify(op),
        input: Object.fromEntries(Object.keys(schema.properties).map(key => [key, { formula: 'args.history.' + op.replaceAll('.', '_') + '.' + key }])) }));
    wait.intent.description += ' Optional history records an attributed artifact, hook, marked memory or compaction.';
    information.sources.push({ id: 'history.recent', kind: 'history', semantic: 'narrative', scopeId: 'world', fields: [['summary'], ['tick'], ['year'], ['refs']] });
    // Relevance slice only: do not add the private ledger or broad archives to context.
    for (const view of information.views.filter(v => v.audience === 'narrator')) view.sources.push('history.recent');
    return opening;
}

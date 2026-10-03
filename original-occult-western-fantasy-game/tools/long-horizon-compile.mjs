// Build-time declarations only. Native Clock / Authority / SaveSystem remain owners.
export const MAX_INSTANT = Number.MAX_SAFE_INTEGER;
export const MINUTES_PER_DAY = 1440;
export const MAX_DAY = Math.floor(MAX_INSTANT / MINUTES_PER_DAY);
const F = formula => ({ formula });
const I = (minimum = 0, maximum = MAX_INSTANT) => ({ type: 'integer', minimum, maximum });
const S = (maxLength = 128, values) => ({ type: 'string', maxLength, ...(values ? { enum: values } : {}) });
const B = { type: 'boolean' };
const O = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const stampSchema = O({ tick: I(), sequence: I() });
export const provenanceSchema = O({ source_id: S(), origin: S(16, ['authored', 'introduced', 'derived']), stamp: stampSchema, parent_id: S() });
export const stanceChoices = {
    career: ['maintain', 'expand', 'research', 'public_office', 'low_activity'],
    family: ['close', 'selective', 'distance'],
    occult: ['conceal', 'investigate', 'deepen_claim', 'seek_longevity', 'suppress'],
    social: ['low_profile', 'network', 'influence'],
    wealth: ['preserve', 'invest', 'expand', 'liquidate'],
    investigation: ['normal', 'occult_only', 'inactive'],
};
export const stanceSchema = O(Object.fromEntries(Object.entries(stanceChoices).map(([key, choices]) => [key, S(32, choices)])));

// Proleptic Gregorian civil calendar: opening instant is year 1, Jan 1, 00:00.
// This is an ordinal epoch, not a claim about the setting's historical era/year.
// March-based 400-year decomposition; no wall clock, daily iteration or Date API.
export function calendarFormulas(tick = 'args.tick') {
    const day = 'floor(' + tick + ' / 1440)';
    const n = '(' + day + ' + 306)';
    const era = 'floor(' + n + ' / 146097)';
    const doe = '(' + n + ' % 146097)';
    const yoe = 'floor((' + doe + ' - floor(' + doe + ' / 1460) + floor(' + doe + ' / 36524) - floor(' + doe + ' / 146096)) / 365)';
    return { day: F(day), cycle_year: F(era + ' * 400 + ' + yoe), cycle_day: F(doe),
        minute_of_day: F(tick + ' % 1440'), week: F('floor(' + day + ' / 7) + 1') };
}

export function compileLongHorizon(opening, manifest) {
    const { logic, lifecycle, simulation, bridge } = opening;
    const D = id => lifecycle.domains.find(d => d.id === id);
    const command = (domainId, id, properties, assign) => D(domainId).commands.push({ id, argsSchema: O(properties), event: domainId + '.' + id, assign });
    const effect = (domainId, commandId, args = {}, when) => ({ kind: 'app.command', domainId, commandId, recordId: 'main', args, ...(when ? { when } : {}) });
    const readTime = { id: 'chronology', domainId: 'chronology', recordId: 'main', fields: ['tick', 'sequence'] };
    const addDomain = (id, properties, initial) => {
        lifecycle.domains.push({ id, scopeId: 'world', schemaVersion: 1, recordSchema: O(properties), initial,
            commands: [{ id: 'bootstrap', argsSchema: O({}), event: id + '.bootstrap', assign: structuredClone(initial) }],
            retention: { maxItems: 64, maxLogicalBytes: 65536, keepPinned: true, keepReferenced: true } });
        lifecycle.automations.push({ id: id + '.bootstrap', scopeId: 'world', trigger: { kind: 'experience.ready' },
            action: effect(id, 'bootstrap'), maxCatchUp: 1 });
    };
    const extend = (d, key, schema, initial) => {
        d.recordSchema.properties[key] = schema;
        d.recordSchema.required.push(key);
        d.initial[key] = initial;
        const bootstrap = d.commands.find(c => c.id === 'bootstrap');
        if (bootstrap) bootstrap.assign[key] = structuredClone(initial);
    };

    addDomain('chronology', {
        tick: I(), sequence: I(), calendar: O({ day: I(0, MAX_DAY), year: I(1), month: I(1, 12), day_of_month: I(1, 31), minute_of_day: I(0, 1439), week: I(1), season: I(1, 4), cycle_year: I(), cycle_day: I(0, 146096) }),
        era_id: S(), last_interval: O({ from: I(), requested_until: I(), resolved_until: I(), scale: I(0, 5), steps: I(0, 16), interrupted: B }),
    }, { tick: 0, sequence: 0, calendar: { day: 0, year: 1, month: 1, day_of_month: 1, minute_of_day: 0, week: 1, season: 1, cycle_year: 0, cycle_day: 306 },
        era_id: 'era.opening', last_interval: { from: 0, requested_until: 0, resolved_until: 0, scale: 0, steps: 0, interrupted: false } });
    command('chronology', 'order', {}, { sequence: F('world.sequence + 1') });
    const calendar = calendarFormulas();
    // Derive season separately to keep each formula small, sharing the compiled month.
    command('chronology', 'resolve', { tick: I(), target: I() }, {
        tick: F('args.tick'), ...Object.fromEntries(Object.entries(calendar).map(([key, value]) => ['calendar.' + key, value])),
        'last_interval.from': F('world.tick'), 'last_interval.requested_until': F('args.target'), 'last_interval.resolved_until': F('args.tick'),
        'last_interval.scale': F([1440, 10080, 43200, 129600, 525600].map(size => 'floor(min(1, (args.tick - world.tick) / ' + size + '))').join(' + ')),
        'last_interval.steps': 1, 'last_interval.interrupted': F('args.tick < args.target'),
    });
    const yoe = '(world.calendar.cycle_year % 400)';
    const doy = '(world.calendar.cycle_day - (365 * ' + yoe + ' + floor(' + yoe + ' / 4) - floor(' + yoe + ' / 100)))';
    const mp = 'floor((5 * ' + doy + ' + 2) / 153)';
    command('chronology', 'date', {}, {
        'calendar.year': F('world.calendar.cycle_year + floor(' + mp + ' / 10)'),
        'calendar.month': F(mp + ' + 3 - 12 * floor(' + mp + ' / 10)'),
        'calendar.day_of_month': F(doy + ' - floor((153 * ' + mp + ' + 2) / 5) + 1'),
    });
    command('chronology', 'season', {}, { 'calendar.season': F('ceil(world.calendar.month / 3)') });

    // Local IDs are scoped by the immutable Native sessionId and world definition ID.
    // Save import preserves sessionId; retry branches retain entity identity, not history.
    // No name/display label, array index or revision ID is used as persistent identity.
    const worldId = manifest.entryPoints[0].primaryWorldId;
    const protagonistId = manifest.actors[0].actorId;
    const entityTargets = new Map();
    for (const t of logic.transactions) for (const e of t.effects) if (e.kind === 'app.command' && e.domainId === 'entities') {
        const old = entityTargets.get(e.commandId);
        if (old && old !== e.recordId) throw new Error('Entity command must have a stable target');
        entityTargets.set(e.commandId, e.recordId);
    }
    const registry = Object.fromEntries([...new Set(entityTargets.values())].sort().map(id => [id, 'entity.' + id]));
    addDomain('continuity', { world_id: S(64), protagonist_id: S(64), public_identity_id: S(), next_entity_serial: I(1),
        public_identity_origin: provenanceSchema, registry: O(Object.fromEntries(Object.keys(registry).map(id => [id, S()]))) },
    { world_id: worldId, protagonist_id: protagonistId, public_identity_id: 'public_identity.initial', next_entity_serial: 1,
        public_identity_origin: { source_id: 'opening.identity', origin: 'authored', stamp: { tick: 0, sequence: 0 }, parent_id: protagonistId }, registry });
    command('continuity', 'identify', { tick: I(), sequence: I() }, { 'public_identity_origin.stamp': { tick: F('args.tick'), sequence: F('args.sequence') } });
    const entity = D('entities');
    extend(entity, 'persistent_id', S(), '');
    extend(entity, 'provenance', provenanceSchema, { source_id: '', origin: 'introduced', stamp: { tick: MAX_INSTANT, sequence: MAX_INSTANT }, parent_id: '' });
    for (const [commandId, recordId] of entityTargets) {
        const c = entity.commands.find(c => c.id === commandId);
        Object.assign(c.argsSchema.properties, { chronology_tick: I(), chronology_sequence: I() });
        c.argsSchema.required.push('chronology_tick', 'chronology_sequence');
        Object.assign(c.assign, { persistent_id: registry[recordId], 'provenance.source_id': 'opening.entity.' + recordId,
            'provenance.stamp.tick': F('min(world.provenance.stamp.tick, args.chronology_tick)'),
            'provenance.stamp.sequence': F('min(world.provenance.stamp.sequence, args.chronology_sequence)') });
    }
    // The pre-creation Anchor slot is not a person until the reviewed identity step.
    addDomain('long_term_stance', { policy: stanceSchema, revision: I(), changed_at: stampSchema },
        { policy: Object.fromEntries(Object.entries(stanceChoices).map(([key, choices]) => [key, choices[0]])), revision: 0, changed_at: { tick: 0, sequence: 0 } });
    command('long_term_stance', 'set', { ...stanceSchema.properties, tick: I(), sequence: I() }, {
        policy: Object.fromEntries(Object.keys(stanceChoices).map(key => [key, F('args.' + key)])),
        revision: F('world.revision + 1'), changed_at: { tick: F('args.tick'), sequence: F('args.sequence') },
    });

    // Replace the old global daily job with one interval resolver. Only the retained
    // opening-era monotone obligations are aggregated; no lifecycle or macro engine.
    const wm = D('world_matters');
    wm.recordSchema.properties.day.maximum = MAX_DAY;
    wm.recordSchema.properties.rent.maximum = MAX_INSTANT;
    delete wm.recordSchema.properties.next_tick;
    wm.recordSchema.required = wm.recordSchema.required.filter(k => k !== 'next_tick');
    delete wm.initial.next_tick;
    delete wm.commands.find(c => c.id === 'bootstrap').assign.next_tick;
    const daily = wm.commands.find(c => c.id === 'day');
    daily.argsSchema = O({ day: I(0, MAX_DAY) });
    delete daily.assign.next_tick;
    for (const value of Object.values(daily.assign)) if (value?.formula) value.formula = value.formula.replaceAll('world.day + 1', 'args.day');
    daily.assign.rent = F('world.rent + (args.day - world.day) * 10');
    const dayTx = logic.transactions.find(t => t.id === 'opening.day');
    dayTx.inputSchema = O({ tick: I(), target: I(), from: I() });
    dayTx.reads = []; // The scheduler already grants the same interval start; do not charge a redundant read.
    dayTx.effects = [effect('world_matters', 'day', { day: F('floor(args.tick / 1440)') }),
        effect('world_matters', 'missed', {}, 'args.from < 2880 && args.tick >= 2880'),
        effect('chronology', 'resolve', { tick: F('args.tick'), target: F('args.target') }), effect('chronology', 'date'), effect('chronology', 'season')];
    dayTx.receipt.projection.notice = 'Resolve one chronological interval and retained opening-era obligations. Lifecycle and macro systems are not implemented.';
    simulation.policy = { maxSteps: 3, maxDeliberations: 1, maxAdvanceTicks: MAX_INSTANT };
    simulation.jobs = [{ id: 'chronology.interval', scopeId: 'world', reads: [{ id: 'time', domainId: 'chronology', recordId: 'main', fields: ['tick'] }],
        enabled: 'reads.time.tick < clock.targetTick', due: F('clock.targetTick'), priority: 1, relevance: 'cold',
        action: { kind: 'transaction', transactionId: 'opening.day', input: { tick: F('clock.tick'), target: F('clock.requestedTick'), from: F('reads.time.tick') } } }];
    lifecycle.advances.find(a => a.id === 'advance').maxTicks = MAX_INSTANT;

    const wait = logic.transactions.find(t => t.id === 'opening.wait');
    wait.inputSchema = { ...O({ minutes: I(), attention: B, stances: stanceSchema }), required: ['minutes'] };
    const hasStance = stanceChoices.career.map(v => 'args.stances.career == ' + JSON.stringify(v)).join(' || ');
    wait.resolution.cases[0].when += ' || (args.minutes == 0 && !(' + hasStance + '))';
    wait.effects.find(e => e.kind === 'clock.advance').attention = F('args.attention == true');
    wait.effects.find(e => e.kind === 'clock.advance').when += ' && args.minutes > 0';
    wait.effects.splice(1, 0, effect('long_term_stance', 'set', {
        ...Object.fromEntries(Object.keys(stanceChoices).map(key => [key, F('args.stances.' + key)])),
        tick: F('reads.chronology.tick'), sequence: F('reads.chronology.sequence + 1'),
    }, 'resolution.outcome != "impossible" && (' + hasStance + ')'));
    wait.receipt.projection.notice = 'Advance the canonical minute clock by an open-ended span. Optional stances persist until explicitly changed; zero minutes configures stances only. Phase 1 resolves chronology and retained opening obligations, not aging or macro history.';
    wait.intent.description = wait.receipt.projection.notice;

    for (const t of logic.transactions.filter(t => t.origin !== 'simulation')) {
        t.effects.unshift(effect('chronology', 'order'));
        const entityEffects = t.effects.filter(e => e.domainId === 'entities');
        if (t === wait || t.id === 'opening.identity' || entityEffects.length) t.reads.push(structuredClone(readTime));
        for (const e of entityEffects) Object.assign(e.args, { chronology_tick: F('reads.chronology.tick'), chronology_sequence: F('reads.chronology.sequence + 1') });
        if (t.id === 'opening.identity') t.effects.push(effect('continuity', 'identify', { tick: F('reads.chronology.tick'), sequence: F('reads.chronology.sequence + 1') }, 'resolution.outcome != "impossible"'));
    }
    // Finite Pattern slots remain finite fixtures; their deadline type must not
    // forbid using a preserved slot after day 30. This is not renewable generation.
    const widenDates = value => {
        if (!value || typeof value !== 'object') return;
        if (value.type === 'integer' && value.maximum === 37) value.maximum = MAX_DAY;
        for (const child of Object.values(value)) widenDates(child);
    };
    widenDates(opening);
    // A retained public projection must use the same new date/rent ranges.
    for (const d of lifecycle.domains) {
        const schema = d.recordSchema.properties.player_obligations_projection;
        if (schema) { schema.properties.day.maximum = MAX_DAY; schema.properties.rent.maximum = MAX_INSTANT; }
    }
    // Make room for chronology ordering without raising Core's fixed 24-command
    // budget. Collapse only equivalent mutually exclusive monotone fixture writes.
    const mergeEffects = (id, commandIds, replacement) => {
        const t = logic.transactions.find(t => t.id === id);
        t.effects = t.effects.filter(e => !commandIds.includes(e.commandId));
        t.effects.splice(1, 0, replacement);
    };
    command('world_matters', 'long_mandate', { property: B, burial: B, railway: B },
        Object.fromEntries(['property', 'burial', 'railway'].map(k => ['network.' + k + '.mandate', F('world.network.' + k + '.mandate || args.' + k)])));
    mergeEffects('network.open', ['mandate_property', 'mandate_burial', 'mandate_railway'],
        effect('world_matters', 'long_mandate', Object.fromEntries(['property', 'burial', 'railway'].map(k => [k, F('args.case == "' + k + '"')])), 'resolution.outcome != "impossible"'));
    command('world_matters', 'long_manage', { company: B, accident: B, headline: B, prepare: B },
        Object.fromEntries(['company', 'accident', 'headline'].flatMap(k => [
            ['convergence.' + k + '.mandate', F('world.convergence.' + k + '.mandate || args.' + k)],
            ['convergence.' + k + '.prepared', F('world.convergence.' + k + '.prepared || (args.' + k + ' && args.prepare)')],
        ])));
    mergeEffects('convergence.manage', ['p7_manage_company', 'p7_manage_accident', 'p7_manage_headline'],
        effect('world_matters', 'long_manage', { ...Object.fromEntries(['company', 'accident', 'headline'].map(k => [k, F('args.case == "' + k + '"')])), prepare: F('args.operation == "prepare"') }, 'resolution.outcome != "impossible" && args.operation != "settle"'));
    command('claims', 'long_maintenance', { release: B, maintain: B }, {
        'catalog.active': F('world.catalog.active && !args.release'), 'catalog.applied': F('world.catalog.applied && !args.release'),
        'catalog.consulted': F('world.catalog.consulted && !args.release'), 'catalog.price_due': F('world.catalog.price_due && !args.maintain'),
    });
    mergeEffects('convergence.claim', ['p7_maintain', 'p7_release'], effect('claims', 'long_maintenance',
        { release: F('args.operation == "release"'), maintain: F('args.operation == "maintain"') },
        'resolution.outcome != "impossible" && (args.operation == "release" || args.operation == "maintain")'));

    for (const b of bridge.bindings) {
        const t = logic.transactions.find(t => t.id === b.target?.transactionId);
        if (t) b.inputSchema = t.inputSchema;
    }
    return opening;
}

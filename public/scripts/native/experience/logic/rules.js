const RULE_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) {
        deepFreeze(child, seen);
    }
    return value;
}

function normalizeOn(value, ruleId) {
    const values = typeof value === 'string' ? [value] : value;
    if (!Array.isArray(values) || values.length === 0) {
        throw new Error(`Rule '${ruleId}' requires a non-empty on event list`);
    }
    const normalized = values.map(item => String(item || '').trim());
    if (normalized.some(item => !item)) {
        throw new Error(`Rule '${ruleId}' has an invalid event type`);
    }
    return Object.freeze([...new Set(normalized)]);
}

function normalizeRule(raw, registrationIndex) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Rule definition must be an object');
    }

    const id = String(raw.id || '').trim();
    if (!RULE_ID_PATTERN.test(id)) {
        throw new Error('Rule id must match /^[a-z][a-z0-9._-]{0,63}$/');
    }
    if (raw.when !== undefined && typeof raw.when !== 'function') {
        throw new Error(`Rule '${id}' when must be a function when provided`);
    }
    if (typeof raw.emit !== 'function') {
        throw new Error(`Rule '${id}' requires emit()`);
    }

    return Object.freeze({
        id,
        on: normalizeOn(raw.on, id),
        priority: Number.isInteger(raw.priority) ? raw.priority : 0,
        when: raw.when || null,
        emit: raw.emit,
        registrationIndex,
    });
}

function normalizeRules(rules) {
    const source = Array.isArray(rules) ? rules : [];
    const seen = new Set();
    const normalized = source.map((rule, index) => normalizeRule(rule, index));
    for (const rule of normalized) {
        if (seen.has(rule.id)) throw new Error(`Duplicate rule id '${rule.id}'`);
        seen.add(rule.id);
    }
    return normalized.sort((left, right) => (
        left.priority - right.priority
        || left.id.localeCompare(right.id)
        || left.registrationIndex - right.registrationIndex
    ));
}

function normalizeEventDrafts(output, ruleId) {
    if (output === undefined || output === null) return [];
    const drafts = Array.isArray(output)
        ? output
        : (Array.isArray(output?.events) ? output.events : null);
    if (!drafts) {
        throw new Error(`Rule '${ruleId}' must return an event array, { events }, or no change`);
    }

    return drafts.map((draft, index) => {
        if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
            throw new Error(`Rule '${ruleId}' event ${index} must be an object`);
        }
        const type = String(draft.type || '').trim();
        if (!type) {
            throw new Error(`Rule '${ruleId}' event ${index} requires a type`);
        }
        const meta = draft.meta && typeof draft.meta === 'object' && !Array.isArray(draft.meta)
            ? clone(draft.meta)
            : {};
        return {
            type,
            payload: clone(draft.payload ?? {}),
            meta: {
                ...meta,
                rule: {
                    id: ruleId,
                },
            },
        };
    });
}

export function createRulesEngine(rules = [], options = {}) {
    const orderedRules = normalizeRules(rules);
    const maxDerivedEvents = Number.isInteger(options.maxDerivedEvents) && options.maxDerivedEvents > 0
        ? options.maxDerivedEvents
        : 128;
    const maxEvaluations = Number.isInteger(options.maxEvaluations) && options.maxEvaluations > 0
        ? options.maxEvaluations
        : 1024;

    async function process(initialEvents, processOptions = {}) {
        if (typeof processOptions.project !== 'function') {
            throw new Error('Rules Engine requires project(events)');
        }

        const events = clone(Array.isArray(initialEvents) ? initialEvents : []);
        const trace = [];
        let derivedCount = 0;
        let evaluationCount = 0;

        for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
            const sourceEvent = events[eventIndex];
            const matching = orderedRules.filter(rule => rule.on.includes(sourceEvent.type));

            if (matching.length === 0) continue;

            const projected = await processOptions.project(events.slice(0, eventIndex + 1));
            const state = clone(projected?.state ?? {});

            for (const rule of matching) {
                evaluationCount += 1;
                if (evaluationCount > maxEvaluations) {
                    throw new Error('Rules Engine exceeded maximum rule evaluations');
                }

                const context = Object.freeze({
                    rule: Object.freeze({ id: rule.id, priority: rule.priority }),
                    event: deepFreeze(clone(sourceEvent)),
                    state: deepFreeze(clone(state)),
                    events: deepFreeze(clone(events.slice(0, eventIndex + 1))),
                    command: processOptions.context?.command || null,
                    args: deepFreeze(clone(processOptions.context?.args ?? {})),
                    transactionId: processOptions.context?.transactionId || '',
                    rng: processOptions.context?.rng,
                });

                let matched = true;
                if (rule.when) {
                    matched = await rule.when(context);
                    if (typeof matched !== 'boolean') {
                        throw new Error(`Rule '${rule.id}' when() must return a boolean`);
                    }
                }

                if (!matched) {
                    trace.push({
                        ruleId: rule.id,
                        sourceEventType: sourceEvent.type,
                        sourceEventIndex: eventIndex,
                        status: 'condition_false',
                        emittedTypes: [],
                    });
                    continue;
                }

                const derived = normalizeEventDrafts(await rule.emit(context), rule.id);
                if (derived.length === 0) {
                    trace.push({
                        ruleId: rule.id,
                        sourceEventType: sourceEvent.type,
                        sourceEventIndex: eventIndex,
                        status: 'no_change',
                        emittedTypes: [],
                    });
                    continue;
                }

                derivedCount += derived.length;
                if (derivedCount > maxDerivedEvents) {
                    throw new Error('Rules Engine exceeded maximum derived events');
                }

                events.push(...derived);
                trace.push({
                    ruleId: rule.id,
                    sourceEventType: sourceEvent.type,
                    sourceEventIndex: eventIndex,
                    status: 'emitted',
                    emittedTypes: derived.map(event => event.type),
                });
            }
        }

        const projected = events.length > 0
            ? await processOptions.project(events)
            : { state: clone(processOptions.beforeState ?? {}) };

        return {
            events,
            state: clone(projected?.state ?? {}),
            trace,
            derivedCount,
            evaluationCount,
        };
    }

    return Object.freeze({
        process,
        listRules() {
            return orderedRules.map(rule => ({
                id: rule.id,
                on: [...rule.on],
                priority: rule.priority,
            }));
        },
    });
}

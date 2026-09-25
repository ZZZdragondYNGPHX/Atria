import { cloneGameLlmValue } from './clone.js';

const clone = cloneGameLlmValue;

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return value;
}

const OBSERVATION_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;

function normalizeProjectors(projectors) {
    if (!Array.isArray(projectors)) {
        throw new Error('World Observation projectors must be an array');
    }

    const seen = new Set();
    return projectors.map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            throw new Error('World Observation projector ' + index + ' must be an object');
        }
        const id = String(raw.id || '').trim();
        if (!OBSERVATION_ID_PATTERN.test(id)) {
            throw new Error('World Observation projector id is invalid');
        }
        if (seen.has(id)) {
            throw new Error(`Duplicate World Observation projector '${id}'`);
        }
        seen.add(id);
        if (typeof raw.select !== 'function') {
            throw new Error(`World Observation projector '${id}' requires select()`);
        }
        return Object.freeze({ id, select: raw.select });
    });
}

function sanitizeEvent(event) {
    if (!event || typeof event !== 'object') return null;
    const id = String(event.id || '').trim();
    const type = String(event.type || '').trim();
    if (!id || !type) return null;

    const commandId = String(event.meta?.command?.id || '').trim();
    const ruleId = String(event.meta?.rule?.id || '').trim();

    return {
        id,
        type,
        payload: clone(event.payload ?? {}),
        provenance: {
            ...(commandId ? { commandId } : {}),
            ...(ruleId ? { ruleId } : {}),
        },
    };
}

export function createWorldObservationProjector(options = {}) {
    const projectors = normalizeProjectors(options.projectors || []);
    const eventLimit = options.eventLimit === undefined
        ? 8
        : Number(options.eventLimit);
    if (!Number.isInteger(eventLimit) || eventLimit < 0 || eventLimit > 64) {
        throw new Error('World Observation eventLimit must be an integer between 0 and 64');
    }

    return Object.freeze({
        project(input = {}) {
            const world = deepFreeze(clone(input.world ?? {}));
            const context = deepFreeze(clone(input.context ?? {}));
            const views = {};

            for (const projector of projectors) {
                views[projector.id] = clone(projector.select(world, context));
            }

            const events = Array.isArray(input.events)
                ? input.events.map(sanitizeEvent).filter(Boolean)
                : [];
            const recentEvents = eventLimit === 0 ? [] : events.slice(-eventLimit);

            return deepFreeze({
                views,
                recentEvents,
            });
        },
        list() {
            return projectors.map(projector => projector.id);
        },
    });
}

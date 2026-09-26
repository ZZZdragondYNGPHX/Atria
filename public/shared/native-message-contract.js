// Pure browser/server presentation contracts. These snapshots confer no execution,
// persistence, template exposure, unread, Timeline or outcome authority.
export const MESSAGE_CONTRACT_LIMITS = Object.freeze({
    contentLength: 4 * 1024 * 1024,
    flowNodes: 128,
    dataDepth: 16,
    dataNodes: 4096,
    dataKeys: 64,
    dataArrayItems: 128,
    dataStringLength: 16384,
    dataCharacters: 65536,
    diagnostics: 16,
    participants: 64,
    messages: 256,
});
const LIMIT = MESSAGE_CONTRACT_LIMITS;
const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);
const LOCAL_ID = /^[a-z][a-z0-9._-]{0,63}$/;
const THREAD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function fail(label, reason) {
    throw new TypeError(label + ' ' + reason);
}

// Inspect descriptors rather than reading accessors or invoking toJSON. Accept
// ordinary JSON records across realms, but not class instances/custom prototypes.
function record(value, allowed, label, optional = []) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label, 'must be a plain record');
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && (Object.getPrototypeOf(proto) !== null
        || Object.getOwnPropertyDescriptor(Object.getOwnPropertyDescriptor(proto, 'constructor')?.value ?? {}, 'name')?.value !== 'Object')) {
        fail(label, 'must be a plain record');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > LIMIT.dataKeys) fail(label, 'has too many fields');
    for (const key of keys) {
        if (typeof key !== 'string' || BLOCKED.has(key) || (allowed && !allowed.includes(key))) {
            fail(label, 'contains an unsupported field');
        }
        const property = Object.getOwnPropertyDescriptor(value, key);
        if (!property.enumerable || !Object.hasOwn(property, 'value')) fail(label, 'requires enumerable data fields');
    }
    if (allowed) {
        for (const key of allowed) {
            if (!optional.includes(key) && !Object.hasOwn(value, key)) fail(label, 'is missing a required field');
        }
    }
    return keys;
}

function array(value, maximum, label) {
    if (!Array.isArray(value) || value.length > maximum) fail(label, 'must be a bounded array');
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1) fail(label, 'must be a dense array without extra fields');
    const result = [];
    for (let i = 0; i < value.length; i++) {
        const property = Object.getOwnPropertyDescriptor(value, String(i));
        if (!property?.enumerable || !Object.hasOwn(property, 'value')) fail(label, 'requires dense data items');
        result.push(property.value);
    }
    return result;
}

function text(value, maximum, label) {
    if (typeof value !== 'string' || value.length > maximum) fail(label, 'must be bounded text');
    return value;
}

function identifier(value, label, pattern = LOCAL_ID) {
    if (typeof value !== 'string' || !pattern.test(value) || BLOCKED.has(value)) fail(label, 'must be a local identifier');
    return value;
}

function version(value, label) {
    if (value !== 1) fail(label, 'must be 1');
    return 1;
}

function dataBudget() {
    return { nodes: 0, characters: 0, seen: new Set() };
}

function charge(budget, characters) {
    budget.characters += characters;
    if (budget.characters > LIMIT.dataCharacters) fail('Message data', 'exceeds character budget');
}

function json(value, budget, depth = 0) {
    if (depth > LIMIT.dataDepth || ++budget.nodes > LIMIT.dataNodes) fail('Message data', 'exceeds complexity budget');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        text(value, LIMIT.dataStringLength, 'Message data string');
        charge(budget, value.length);
        return value;
    }
    if (!value || typeof value !== 'object') fail('Message data', 'must contain strict JSON only');
    if (budget.seen.has(value)) fail('Message data', 'must not contain cycles');
    budget.seen.add(value);
    let result;
    if (Array.isArray(value)) {
        result = array(value, LIMIT.dataArrayItems, 'Message data array').map(item => json(item, budget, depth + 1));
    } else {
        const keys = record(value, null, 'Message data');
        result = {};
        for (const key of keys) {
            text(key, 128, 'Message data key');
            charge(budget, key.length);
            result[key] = json(value[key], budget, depth + 1);
        }
    }
    budget.seen.delete(value);
    return Object.freeze(result);
}

function projection(value, content, budget) {
    record(value, ['schemaVersion', 'flow'], 'MessageProjection');
    version(value.schemaVersion, 'MessageProjection.schemaVersion');
    text(content, LIMIT.contentLength, 'Variant.content');
    const nodes = array(value.flow, LIMIT.flowNodes, 'MessageProjection.flow');
    const ids = new Set();
    let prose = '';
    const flow = nodes.map(node => {
        record(node, null, 'Message flow node');
        const kind = Object.getOwnPropertyDescriptor(node, 'kind')?.value;
        if (kind === 'prose') {
            record(node, ['kind', 'text'], 'Prose node');
            const value = text(node.text, LIMIT.contentLength, 'Prose text');
            if (prose.length + value.length > content.length) fail('MessageProjection prose', 'must equal canonical content');
            prose += value;
            return Object.freeze({ kind: 'prose', text: value });
        }
        if (kind !== 'block') fail('Message flow node', 'has an unsupported kind');
        record(node, ['kind', 'id', 'type', 'version', 'data'], 'Block node');
        const id = identifier(node.id, 'Block id');
        if (ids.has(id)) fail('MessageProjection', 'contains duplicate block ids');
        ids.add(id);
        record(node.data, null, 'Block data');
        return Object.freeze({ kind: 'block', id, type: identifier(node.type, 'Block type'),
            version: version(node.version, 'Block version'), data: json(node.data, budget) });
    });
    if (prose !== content) fail('MessageProjection prose', 'must equal canonical content');
    return Object.freeze({ schemaVersion: 1, flow: Object.freeze(flow) });
}

/**
 * Structural validation only: block ids are unique, template types may repeat.
 * Block data is inert bounded JSON; the pinned Package template schema must
 * additionally reject undeclared types/unknown data fields at commit and load.
 * No strings are interpreted as expressions, HTML, templates or component trees.
 */
export function assertMessageProjection(value, content) {
    return projection(value, content, dataBudget());
}

export function assertOutcomeShape(value) {
    record(value, ['requestId', 'interpretation'], 'Semantic outcome');
    const requestId = identifier(value.requestId, 'Outcome request');
    const raw = value.interpretation;
    record(raw, ['decision', 'confidence', 'eventType', 'severity', 'participants', 'evidence'], 'Interpretation', ['eventType', 'severity', 'participants', 'evidence']);
    if (!['event', 'no_change'].includes(raw.decision) || typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) fail('Interpretation', 'requires semantic decision and confidence');
    const interpretation = { decision: raw.decision, confidence: raw.confidence };
    if (raw.decision === 'event') {
        interpretation.eventType = identifier(raw.eventType, 'Event type', /^[A-Za-z][A-Za-z0-9._-]{0,127}$/);
        if (raw.severity !== undefined) interpretation.severity = identifier(raw.severity, 'Severity');
        interpretation.participants = Object.freeze(array(raw.participants ?? [], 16, 'Participants').map(item => text(item, 128, 'Participant')));
    } else if (['eventType', 'severity', 'participants'].some(key => Object.hasOwn(raw, key))) fail('No change', 'cannot include event fields');
    interpretation.evidence = Object.freeze(array(raw.evidence ?? [], 8, 'Evidence').map(item => text(item, 500, 'Evidence')));
    return Object.freeze({ requestId, interpretation: Object.freeze(interpretation) });
}

/** Semantic proposals confer no authority until the pinned Package finalize path. */
export function assertTurnEnvelope(value) {
    record(value, ['schemaVersion', 'narrative', 'projection', 'outcomes', 'diagnostics'], 'TurnEnvelope', ['projection']);
    version(value.schemaVersion, 'TurnEnvelope.schemaVersion');
    const narrative = text(value.narrative, LIMIT.contentLength, 'TurnEnvelope.narrative');
    const outcomes = array(value.outcomes, 16, 'TurnEnvelope.outcomes').map(assertOutcomeShape);
    const diagnostics = array(value.diagnostics, LIMIT.diagnostics, 'TurnEnvelope.diagnostics').map(item => {
        record(item, ['code', 'message'], 'Turn diagnostic');
        return Object.freeze({ code: identifier(item.code, 'Diagnostic code'),
            message: text(item.message, 512, 'Diagnostic message') });
    });
    return Object.freeze({ schemaVersion: 1, narrative,
        ...(Object.hasOwn(value, 'projection') ? { projection: assertMessageProjection(value.projection, narrative) } : {}),
        outcomes: Object.freeze(outcomes), diagnostics: Object.freeze(diagnostics) });
}

/**
 * Read-only Conversation Thread presentation snapshot, not a canonical Timeline.
 * Scope ids are optional presentation context, never authority references.
 * Aggregate content and block-data budgets apply to the whole thread.
 */
export function assertConversationThread(value) {
    record(value, ['schemaVersion', 'threadId', 'scope', 'participants', 'messages'], 'ConversationThread');
    version(value.schemaVersion, 'ConversationThread.schemaVersion');
    const threadId = identifier(value.threadId, 'Thread id', THREAD_ID);
    record(value.scope, ['kind', 'id'], 'Thread scope', ['id']);
    if (!['session', 'world', 'scene'].includes(value.scope.kind)) fail('Thread scope', 'has an unsupported kind');
    const scope = Object.freeze({ kind: value.scope.kind,
        ...(Object.hasOwn(value.scope, 'id') ? { id: identifier(value.scope.id, 'Scope id', THREAD_ID) } : {}) });
    const participantsById = new Set();
    const participants = array(value.participants, LIMIT.participants, 'Thread participants').map(item => {
        record(item, ['id', 'label'], 'Thread participant');
        const id = identifier(item.id, 'Participant id', THREAD_ID);
        if (participantsById.has(id)) fail('Thread participants', 'contain duplicate ids');
        participantsById.add(id);
        return Object.freeze({ id, label: text(item.label, 128, 'Participant label') });
    });
    const ids = new Set();
    const budget = dataBudget();
    let length = 0;
    const messages = array(value.messages, LIMIT.messages, 'Thread messages').map(item => {
        record(item, ['id', 'participantId', 'content', 'projection'], 'Thread message', ['projection']);
        const id = identifier(item.id, 'Thread message id', THREAD_ID);
        if (ids.has(id)) fail('Thread messages', 'contain duplicate ids');
        ids.add(id);
        const participantId = identifier(item.participantId, 'Message participantId', THREAD_ID);
        if (!participantsById.has(participantId)) fail('Thread message', 'references an unknown participant');
        const content = text(item.content, LIMIT.contentLength, 'Thread message content');
        length += content.length;
        if (length > LIMIT.contentLength) fail('Thread content', 'exceeds character budget');
        return Object.freeze({ id, participantId, content,
            ...(Object.hasOwn(item, 'projection') ? { projection: projection(item.projection, content, budget) } : {}) });
    });
    return Object.freeze({ schemaVersion: 1, threadId, scope,
        participants: Object.freeze(participants), messages: Object.freeze(messages) });
}

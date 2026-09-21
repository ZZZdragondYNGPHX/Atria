import { cloneGameLlmValue } from './clone.js';

const REQUEST_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const EVENT_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
const MAX_EVENT_TYPES = 64;
const MAX_SEVERITIES = 16;
const MAX_PARTICIPANTS = 16;
const MAX_EVIDENCE = 8;

const clone = cloneGameLlmValue;

function uniqueStrings(values, label, { pattern = null, max = 64 } = {}) {
    if (!Array.isArray(values)) {
        throw new Error(label + ' must be an array');
    }
    if (values.length > max) {
        throw new Error(label + ` exceeds ${max} items`);
    }
    const output = [];
    const seen = new Set();
    for (const raw of values) {
        const value = String(raw || '').trim();
        if (!value) throw new Error(label + ' contains an empty value');
        if (pattern && !pattern.test(value)) {
            throw new Error(label + ` contains invalid value '${value}'`);
        }
        if (seen.has(value)) continue;
        seen.add(value);
        output.push(value);
    }
    return output;
}

export function normalizeEventInterpretationRequest(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Event Interpretation request must be an object');
    }
    for (const key of Object.keys(raw)) {
        if (![
            'id',
            'instruction',
            'allowedEventTypes',
            'allowedSeverities',
            'confidenceThreshold',
            'maxParticipants',
            'maxEvidence',
            'lowConfidencePolicy',
            'input',
        ].includes(key)) {
            throw new Error(`Event Interpretation request contains unknown field '${key}'`);
        }
    }

    const id = String(raw.id || '').trim();
    if (!REQUEST_ID_PATTERN.test(id)) {
        throw new Error('Event Interpretation request id is invalid');
    }
    const instruction = String(raw.instruction || '').trim();
    if (!instruction || instruction.length > 4000) {
        throw new Error('Event Interpretation request instruction is required and must be <= 4000 characters');
    }

    const allowedEventTypes = uniqueStrings(
        raw.allowedEventTypes,
        'Event Interpretation allowedEventTypes',
        { pattern: EVENT_TYPE_PATTERN, max: MAX_EVENT_TYPES },
    );
    if (allowedEventTypes.length === 0) {
        throw new Error('Event Interpretation request requires at least one allowed event type');
    }

    const allowedSeverities = raw.allowedSeverities === undefined
        ? []
        : uniqueStrings(raw.allowedSeverities, 'Event Interpretation allowedSeverities', {
            pattern: REQUEST_ID_PATTERN,
            max: MAX_SEVERITIES,
        });

    const confidenceThreshold = raw.confidenceThreshold === undefined
        ? 0.7
        : Number(raw.confidenceThreshold);
    if (!Number.isFinite(confidenceThreshold) || confidenceThreshold < 0 || confidenceThreshold > 1) {
        throw new Error('Event Interpretation confidenceThreshold must be between 0 and 1');
    }

    const maxParticipants = raw.maxParticipants === undefined
        ? 8
        : Number(raw.maxParticipants);
    if (!Number.isInteger(maxParticipants) || maxParticipants < 0 || maxParticipants > MAX_PARTICIPANTS) {
        throw new Error(`Event Interpretation maxParticipants must be between 0 and ${MAX_PARTICIPANTS}`);
    }

    const maxEvidence = raw.maxEvidence === undefined
        ? 4
        : Number(raw.maxEvidence);
    if (!Number.isInteger(maxEvidence) || maxEvidence < 0 || maxEvidence > MAX_EVIDENCE) {
        throw new Error(`Event Interpretation maxEvidence must be between 0 and ${MAX_EVIDENCE}`);
    }

    const lowConfidencePolicy = String(raw.lowConfidencePolicy || 'no_change').trim();
    if (!['no_change', 'reject'].includes(lowConfidencePolicy)) {
        throw new Error('Event Interpretation lowConfidencePolicy must be \'no_change\' or \'reject\'');
    }

    return Object.freeze({
        id,
        instruction,
        allowedEventTypes: Object.freeze(allowedEventTypes),
        allowedSeverities: Object.freeze(allowedSeverities),
        confidenceThreshold,
        maxParticipants,
        maxEvidence,
        lowConfidencePolicy,
        input: clone(raw.input ?? null),
    });
}

export function buildEventInterpretationSchema(requestInput) {
    const request = normalizeEventInterpretationRequest(requestInput);
    return {
        name: 'atria_event_interpretation',
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['decision', 'confidence'],
            properties: {
                decision: {
                    type: 'string',
                    enum: ['event', 'no_change'],
                },
                eventType: {
                    type: 'string',
                    enum: [...request.allowedEventTypes],
                },
                ...(request.allowedSeverities.length > 0 ? {
                    severity: {
                        type: 'string',
                        enum: [...request.allowedSeverities],
                    },
                } : {
                    severity: {
                        type: 'string',
                        maxLength: 64,
                    },
                }),
                participants: {
                    type: 'array',
                    maxItems: request.maxParticipants,
                    items: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 160,
                    },
                },
                evidence: {
                    type: 'array',
                    maxItems: request.maxEvidence,
                    items: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 500,
                    },
                },
                confidence: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                },
            },
        },
    };
}

function normalizeStringArray(value, label, max) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(label + ' must be an array');
    if (value.length > max) throw new Error(label + ` exceeds ${max} items`);
    return value.map((raw, index) => {
        const item = String(raw || '').trim();
        if (!item) throw new Error(label + ' item ' + index + ' is empty');
        return item;
    });
}

export function validateEventInterpretation(raw, requestInput) {
    const request = normalizeEventInterpretationRequest(requestInput);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Event Interpreter output must be an object');
    }

    const allowedKeys = new Set([
        'decision',
        'eventType',
        'severity',
        'participants',
        'evidence',
        'confidence',
    ]);
    for (const key of Object.keys(raw)) {
        if (!allowedKeys.has(key)) {
            throw new Error(`Event Interpreter output contains forbidden field '${key}'`);
        }
    }

    const decision = String(raw.decision || '').trim();
    if (!['event', 'no_change'].includes(decision)) {
        throw new Error('Event Interpreter decision must be \'event\' or \'no_change\'');
    }
    const confidence = Number(raw.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new Error('Event Interpreter confidence must be between 0 and 1');
    }
    const evidence = normalizeStringArray(raw.evidence, 'Event Interpreter evidence', request.maxEvidence);

    if (decision === 'no_change') {
        for (const field of ['eventType', 'severity', 'participants']) {
            if (raw[field] !== undefined && raw[field] !== null && raw[field] !== '') {
                throw new Error(`Event Interpreter no_change cannot include '${field}'`);
            }
        }
        return Object.freeze({
            status: 'no_change',
            accepted: false,
            interpretation: Object.freeze({
                decision: 'no_change',
                confidence,
                evidence: Object.freeze(evidence),
            }),
        });
    }

    const eventType = String(raw.eventType || '').trim();
    if (!request.allowedEventTypes.includes(eventType)) {
        throw new Error(`Event Interpreter eventType '${eventType}' is not allowed`);
    }

    const severity = raw.severity === undefined || raw.severity === null
        ? ''
        : String(raw.severity).trim();
    if (
        severity
        && request.allowedSeverities.length > 0
        && !request.allowedSeverities.includes(severity)
    ) {
        throw new Error(`Event Interpreter severity '${severity}' is not allowed`);
    }

    const participants = normalizeStringArray(
        raw.participants,
        'Event Interpreter participants',
        request.maxParticipants,
    );

    const normalized = Object.freeze({
        decision: 'event',
        eventType,
        ...(severity ? { severity } : {}),
        participants: Object.freeze(participants),
        evidence: Object.freeze(evidence),
        confidence,
    });

    if (confidence < request.confidenceThreshold) {
        if (request.lowConfidencePolicy === 'reject') {
            throw new Error(
                `Event Interpreter confidence ${confidence} is below threshold ${request.confidenceThreshold}`,
            );
        }
        return Object.freeze({
            status: 'low_confidence_no_change',
            accepted: false,
            interpretation: Object.freeze({
                decision: 'no_change',
                confidence,
                evidence: Object.freeze(evidence),
            }),
            rejectedInterpretation: normalized,
        });
    }

    return Object.freeze({
        status: 'accepted',
        accepted: true,
        interpretation: normalized,
    });
}

export function buildEventInterpreterMessages(turnContext, requestInput) {
    const request = normalizeEventInterpretationRequest(requestInput);
    if (!turnContext || typeof turnContext !== 'object') {
        throw new Error('Event Interpreter requires Turn Context');
    }

    const system = [
        'You are the Atria Event Interpreter.',
        'Classify semantic meaning only. Do not narrate.',
        'Do not calculate HP, favorability, inventory quantities, damage, probabilities, cooldowns, or any other authoritative numeric state changes.',
        'Do not propose World State patches or Event Journal writes.',
        'Choose only from the request allowed event types.',
        'Return no_change when the evidence does not justify a durable semantic event.',
        'Confidence describes semantic classification confidence only.',
    ].join('\n');

    const payload = {
        turn_id: turnContext.turnId,
        interpretation_request: {
            id: request.id,
            instruction: request.instruction,
            allowed_event_types: request.allowedEventTypes,
            allowed_severities: request.allowedSeverities,
            confidence_threshold: request.confidenceThreshold,
            input: request.input,
        },
        authoritative_observation: turnContext.observation,
        committed_events: turnContext.committedEvents,
        command_results: turnContext.commandResults,
        user_input: turnContext.userInput,
    };

    return [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) },
    ];
}

export function createEventInterpreter(options = {}) {
    const roleRouter = options.roleRouter || null;
    const generateTask = options.generateTask
        || globalThis.Atria?.getContext?.()?.generateTask;
    if (!roleRouter && typeof generateTask !== 'function') {
        throw new Error('Event Interpreter requires Runtime Role Router or generateTask()');
    }

    return Object.freeze({
        async interpret(turnContext, requestInput, requestOptions = {}) {
            const request = normalizeEventInterpretationRequest(requestInput);
            const taskRequest = {
                taskMessages: buildEventInterpreterMessages(turnContext, request),
                promptMode: 'task',
                includeCharacterCard: false,
                worldInfoSource: 'none',
                jsonSchema: buildEventInterpretationSchema(request),
                llmPresetName: requestOptions.llmPresetName || '',
                abortSignal: requestOptions.abortSignal,
                stream: false,
                temperature: requestOptions.temperature ?? 0,
                substituteMacros: false,
            };
            const routed = roleRouter
                ? await roleRouter.execute('event_interpreter', taskRequest, {
                    abortSignal: requestOptions.abortSignal,
                })
                : {
                    role: 'event_interpreter',
                    apiPresetName: requestOptions.apiPresetName || '',
                    fallbackUsed: false,
                    attempts: [],
                    result: await generateTask({
                        ...taskRequest,
                        apiPresetName: requestOptions.apiPresetName || '',
                    }),
                };
            const result = routed.result;

            const validated = validateEventInterpretation(result?.jsonData, request);
            return Object.freeze({
                requestId: request.id,
                ...validated,
                requestInfo: clone(result?.requestInfo || null),
                usage: clone(result?.usage || null),
                routing: Object.freeze({
                    role: routed.role,
                    apiPresetName: routed.apiPresetName,
                    fallbackUsed: routed.fallbackUsed === true,
                    attempts: clone(routed.attempts || []),
                }),
            });
        },
    });
}

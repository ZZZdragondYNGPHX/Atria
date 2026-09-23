import { describe, expect, jest, test } from '@jest/globals';

import {
    buildEventInterpretationSchema,
    buildEventInterpreterMessages,
    createEventInterpreter,
    normalizeEventInterpretationRequest,
    validateEventInterpretation,
} from '../../public/scripts/extensions/game-runtime/llm/event-interpreter.js';
import { createTurnContext } from '../../public/scripts/extensions/game-runtime/llm/turn-context.js';

function request(overrides = {}) {
    return {
        id: 'speech_semantics',
        instruction: 'Classify whether the statement is a threat, apology, or surrender.',
        allowedEventTypes: ['implicit_threat', 'apology', 'surrender'],
        allowedSeverities: ['low', 'medium', 'high'],
        confidenceThreshold: 0.75,
        maxParticipants: 4,
        maxEvidence: 3,
        input: {
            text: 'You will regret this.',
            participants: ['guard_02'],
        },
        ...overrides,
    };
}

function turn() {
    return createTurnContext({
        anchor: {
            sessionId: 'session_test',
            branchId: 'branch_test',
            revisionId: 'revision_test',
            eventSeq: 5,
            serial: 3,
        },
        userInput: 'You will regret this.',
        observation: {
            views: {
                scene: {
                    location: 'gate',
                    visibleEntities: ['guard_02'],
                },
            },
            recentEvents: [{
                id: 'event:4',
                type: 'ConversationStarted',
                payload: { with: 'guard_02' },
                provenance: {},
            }],
        },
    });
}

describe('R5 Event Interpreter contract', () => {
    test('normalizes a bounded semantic request and builds a closed JSON schema', () => {
        const normalized = normalizeEventInterpretationRequest(request());
        expect(normalized).toMatchObject({
            id: 'speech_semantics',
            allowedEventTypes: ['implicit_threat', 'apology', 'surrender'],
            allowedSeverities: ['low', 'medium', 'high'],
            confidenceThreshold: 0.75,
            maxParticipants: 4,
            maxEvidence: 3,
            lowConfidencePolicy: 'no_change',
        });

        const schema = buildEventInterpretationSchema(request());
        expect(schema.name).toBe('atria_event_interpretation');
        expect(schema.schema.additionalProperties).toBe(false);
        expect(schema.schema.properties.eventType.enum)
            .toEqual(['implicit_threat', 'apology', 'surrender']);
        expect(schema.schema.properties.severity.enum)
            .toEqual(['low', 'medium', 'high']);
    });

    test('accepts a typed high-confidence semantic event', () => {
        const result = validateEventInterpretation({
            decision: 'event',
            eventType: 'implicit_threat',
            severity: 'medium',
            participants: ['guard_02'],
            confidence: 0.91,
            evidence: ['You will regret this.'],
        }, request());

        expect(result).toEqual({
            status: 'accepted',
            accepted: true,
            interpretation: {
                decision: 'event',
                eventType: 'implicit_threat',
                severity: 'medium',
                participants: ['guard_02'],
                evidence: ['You will regret this.'],
                confidence: 0.91,
            },
        });
    });

    test('supports explicit no-change without creating semantic event noise', () => {
        const result = validateEventInterpretation({
            decision: 'no_change',
            confidence: 0.93,
            evidence: ['The line is neutral.'],
        }, request());

        expect(result).toEqual({
            status: 'no_change',
            accepted: false,
            interpretation: {
                decision: 'no_change',
                confidence: 0.93,
                evidence: ['The line is neutral.'],
            },
        });
    });

    test('low confidence fails closed to no-change by default', () => {
        const result = validateEventInterpretation({
            decision: 'event',
            eventType: 'implicit_threat',
            severity: 'low',
            participants: ['guard_02'],
            confidence: 0.51,
            evidence: ['Ambiguous wording.'],
        }, request());

        expect(result.status).toBe('low_confidence_no_change');
        expect(result.accepted).toBe(false);
        expect(result.interpretation).toEqual({
            decision: 'no_change',
            confidence: 0.51,
            evidence: ['Ambiguous wording.'],
        });
        expect(result.rejectedInterpretation).toMatchObject({
            decision: 'event',
            eventType: 'implicit_threat',
            confidence: 0.51,
        });
    });

    test('strict low-confidence policy can reject for retry/fallback', () => {
        expect(() => validateEventInterpretation({
            decision: 'event',
            eventType: 'apology',
            severity: 'low',
            confidence: 0.4,
        }, request({
            lowConfidencePolicy: 'reject',
        }))).toThrow(/below threshold/);
    });

    test('forbids numeric state patches and unknown semantic event types', () => {
        expect(() => validateEventInterpretation({
            decision: 'event',
            eventType: 'implicit_threat',
            severity: 'high',
            confidence: 0.99,
            hp_after: 0,
            favorability_delta: -100,
        }, request())).toThrow(/forbidden field 'hp_after'/);

        expect(() => validateEventInterpretation({
            decision: 'event',
            eventType: 'set_hp',
            confidence: 0.99,
        }, request())).toThrow(/is not allowed/);
    });

    test('no-change cannot smuggle event fields', () => {
        expect(() => validateEventInterpretation({
            decision: 'no_change',
            eventType: 'implicit_threat',
            confidence: 0.9,
        }, request())).toThrow(/no_change cannot include 'eventType'/);
    });

    test('uses generateTask JSON Schema mode and never supplies mutation tools', async () => {
        const generateTask = jest.fn(async input => ({
            jsonData: {
                decision: 'event',
                eventType: 'implicit_threat',
                severity: 'medium',
                participants: ['guard_02'],
                confidence: 0.88,
                evidence: ['You will regret this.'],
            },
            requestInfo: {
                model: 'semantic-model',
                api: 'openai',
            },
        }));
        const interpreter = createEventInterpreter({ generateTask });

        const result = await interpreter.interpret(turn(), request(), {
            apiPresetName: 'event-primary',
            llmPresetName: 'strict-semantic',
        });

        expect(result).toMatchObject({
            requestId: 'speech_semantics',
            status: 'accepted',
            accepted: true,
            interpretation: {
                decision: 'event',
                eventType: 'implicit_threat',
                confidence: 0.88,
            },
        });

        const input = generateTask.mock.calls[0][0];
        expect(input).toMatchObject({
            promptMode: 'task',
            includeCharacterCard: false,
            worldInfoSource: 'none',
            apiPresetName: 'event-primary',
            llmPresetName: 'strict-semantic',
            stream: false,
            temperature: 0,
            substituteMacros: false,
        });
        expect(input.tools).toBeUndefined();
        expect(input.jsonSchema.schema.additionalProperties).toBe(false);
        expect(input.jsonSchema.schema.properties).not.toHaveProperty('hp');
        expect(input.jsonSchema.schema.properties).not.toHaveProperty('delta');
    });

    test('prompt contains authoritative observation but no raw World mutation contract', () => {
        const messages = buildEventInterpreterMessages(turn(), request());
        expect(messages[0].content).toContain('Do not propose World State patches');
        const payload = JSON.parse(messages[1].content);
        expect(payload.authoritative_observation.views.scene.location).toBe('gate');
        expect(payload.interpretation_request.allowed_event_types)
            .toEqual(['implicit_threat', 'apology', 'surrender']);
        expect(payload).not.toHaveProperty('world');
        expect(payload).not.toHaveProperty('set_state');
    });

    test('rejects malformed interpretation requests before any model call', () => {
        expect(() => normalizeEventInterpretationRequest({
            ...request(),
            allowedEventTypes: ['set hp'],
        })).toThrow(/invalid value/);

        expect(() => normalizeEventInterpretationRequest({
            ...request(),
            confidenceThreshold: 2,
        })).toThrow(/between 0 and 1/);

        expect(() => normalizeEventInterpretationRequest({
            ...request(),
            stateWriter: true,
        })).toThrow(/unknown field/);
    });
});

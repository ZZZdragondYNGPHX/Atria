// Sanitizer contract test for the flat director profile shape.
//
// Director profiles use one flat current schema. Obsolete wrapped profile
// bodies are intentionally not upgraded after the Atria hard cutover.

import { describe, expect, test } from '@jest/globals';
import {
    createDefaultDirectorProfile,
    sanitizeDirectorProfile,
    ORCH_EXECUTION_MODE_DIRECTOR,
} from '../../../public/scripts/agents/orchestrator/director-defaults.js';

describe('director profile flat-shape contract', () => {
    test('sanitizeDirectorProfile with flat input returns flat output', () => {
        const input = {
            mode: ORCH_EXECUTION_MODE_DIRECTOR,
            mainAgent: {
                systemPrompt: 'flat-prompt',
                apiPresetName: 'flat-api',
                promptPresetName: 'flat-prompt-preset',
            },
            subAgents: [
                {
                    id: 'flat_sub',
                    description: 'a flat sub-agent',
                    systemPrompt: 'flat-sub-body',
                    apiPresetName: '',
                    promptPresetName: '',
                },
            ],
            maxRounds: 7,
            maxConcurrentSubagents: 2,
            maxTotalSubagentRuns: 9,
            tools: { chat: { read_range: true } },
            discardOnAbort: true,
        };

        const after = sanitizeDirectorProfile(input);

        expect(after.mode).toBe(ORCH_EXECUTION_MODE_DIRECTOR);
        expect(after).not.toHaveProperty('director');
        expect(after.mainAgent.systemPrompt).toBe('flat-prompt');
        expect(after.mainAgent.apiPresetName).toBe('flat-api');
        expect(after.mainAgent.promptPresetName).toBe('flat-prompt-preset');
        expect(after.subAgents).toHaveLength(1);
        expect(after.subAgents[0]).toMatchObject({
            id: 'flat_sub',
            description: 'a flat sub-agent',
            systemPrompt: 'flat-sub-body',
        });
        expect(after.maxRounds).toBe(7);
        expect(after.maxConcurrentSubagents).toBe(2);
        expect(after.maxTotalSubagentRuns).toBe(9);
        expect(after.tools.chat.read_range).toBe(true);
        // finalize forced false on every layer.
        expect(after.tools.finalize).toBe(false);
        expect(after.discardOnAbort).toBe(true);
    });

    test('obsolete wrapped input is dropped instead of upgraded', () => {
        const obsoleteWrapped = {
            mode: ORCH_EXECUTION_MODE_DIRECTOR,
            director: {
                mainAgent: { systemPrompt: 'obsolete-prompt' },
                subAgents: [{ id: 'obsolete', description: 'd', systemPrompt: 'b' }],
                maxRounds: 11,
            },
        };

        const after = sanitizeDirectorProfile(obsoleteWrapped);

        expect(after).not.toHaveProperty('director');
        expect(after.mainAgent.systemPrompt).not.toBe('obsolete-prompt');
        expect(after.subAgents.some(agent => agent.id === 'obsolete')).toBe(false);
        expect(after.maxRounds).not.toBe(11);
    });

    test('sanitizeDirectorProfile accepts current bare director sub-object', () => {
        // Character-card overrides store the current bare per-mode body.
        const bareOverride = {
            mainAgent: { systemPrompt: 'override-prompt' },
            subAgents: [
                {
                    id: 'override_sub',
                    description: 'd',
                    systemPrompt: 'b',
                    apiPresetName: '',
                    promptPresetName: '',
                },
            ],
            maxRounds: 6,
            enabled: true,
        };

        const after = sanitizeDirectorProfile(bareOverride);

        expect(after.mainAgent.systemPrompt).toBe('override-prompt');
        expect(after.maxRounds).toBe(6);
        expect(after.subAgents[0].id).toBe('override_sub');
    });

    test('createDefaultDirectorProfile returns flat shape', () => {
        const def = createDefaultDirectorProfile();
        expect(def).not.toHaveProperty('director');
        expect(def.mode).toBe(ORCH_EXECUTION_MODE_DIRECTOR);
        expect(def.mainAgent).toBeDefined();
        expect(typeof def.mainAgent.systemPrompt).toBe('string');
        expect(def.mainAgent.systemPrompt.length).toBeGreaterThan(0);
        expect(Array.isArray(def.subAgents)).toBe(true);
        expect(def.subAgents.length).toBeGreaterThan(0);
        expect(typeof def.maxRounds).toBe('number');
        expect(typeof def.maxConcurrentSubagents).toBe('number');
        expect(typeof def.maxTotalSubagentRuns).toBe('number');
        expect(def.tools).toBeDefined();
        expect(def.tools.finalize).toBe(false);
        expect(typeof def.discardOnAbort).toBe('boolean');
    });

    test('sanitizer is idempotent on flat output', () => {
        const once = sanitizeDirectorProfile(createDefaultDirectorProfile());
        const twice = sanitizeDirectorProfile(once);
        expect(twice).toEqual(once);
    });
});

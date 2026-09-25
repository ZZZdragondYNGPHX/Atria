// tests/orchestrator/custom-tool-flags.test.js
import { describe, test, expect } from '@jest/globals';
import { DEFAULT_LAYER2_CUSTOMS, sanitizeAgentToolFlags } from '../../public/scripts/agents/orchestrator/persistence.js';

// In override mode current Layer-2 built-ins receive explicit false defaults.
// These tests isolate caller-supplied custom flags, so strip built-ins before
// comparing unrelated custom entries.
function stripLayer2Defaults(custom) {
    const out = {};
    for (const [k, v] of Object.entries(custom)) {
        if (k.startsWith('memory_')) continue;
        if (k.startsWith('search_')) continue;
        out[k] = v;
    }
    return out;
}

describe('sanitizeAgentToolFlags custom namespace', () => {
    test('predecessor top-level tool bags are ignored', () => {
        const out = sanitizeAgentToolFlags({
            memory: { node_create: true },
            search: { search: true },
        }, { defaultAllOn: true });
        expect(out.custom).toEqual({});
        expect(out.memory).toBeUndefined();
        expect(out.search).toBeUndefined();
    });

    test('override mode explicitly disables all current Layer-2 built-ins', () => {
        const out = sanitizeAgentToolFlags({});
        for (const name of Object.keys(DEFAULT_LAYER2_CUSTOMS)) {
            expect(out.custom[name]).toBe(false);
        }
    });

    test('preserves custom flags verbatim', () => {
        const out = sanitizeAgentToolFlags({
            custom: { my_tool: true, another: false, weird_name: true },
        });
        expect(stripLayer2Defaults(out.custom)).toEqual({ my_tool: true, another: false, weird_name: true });
    });

    test('missing custom field becomes empty object (modulo Layer-2 default-offs)', () => {
        const out = sanitizeAgentToolFlags({});
        expect(stripLayer2Defaults(out.custom)).toEqual({});
    });

    test('non-boolean custom values coerce to boolean with only-false-disables', () => {
        const out = sanitizeAgentToolFlags({
            custom: { a: 1, b: 0, c: 'yes', d: null, e: undefined },
        });
        expect(stripLayer2Defaults(out.custom)).toEqual({ a: true, b: true, c: true, d: true, e: true });
    });

    test('non-object custom value becomes empty object (modulo Layer-2 default-offs)', () => {
        const out = sanitizeAgentToolFlags({ custom: 'not an object' });
        expect(stripLayer2Defaults(out.custom)).toEqual({});
    });
});

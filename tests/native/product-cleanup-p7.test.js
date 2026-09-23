import { afterEach, expect, jest, test } from '@jest/globals';
import { legacyPromptManager, legacyPromptNames, nativeRouteOptions } from '../../public/scripts/native/generation-compat.js';
import { nativeSessionRuntime } from '../../public/scripts/native/session-runtime.js';
afterEach(() => { nativeSessionRuntime.snapshot = null; });
test('P7 Native mode cannot inspect legacy name-based Prompt authority', () => {
    nativeSessionRuntime.snapshot = {};
    const context = { getPresetManager: jest.fn(() => { throw new Error('Legacy authority reached'); }) };
    expect(legacyPromptManager(context)).toBeNull(); expect(legacyPromptNames(context)).toEqual([]);
    expect(context.getPresetManager).not.toHaveBeenCalled(); expect(nativeRouteOptions()).toContain('disabled selected');
});
test('explicit non-Native compatibility retains normalized names without a second store', () => {
    const context = { getPresetManager: jest.fn(() => ({ getAllPresets: () => [' A ', 'A', '', 'B'] })) };
    expect(legacyPromptNames(context)).toEqual(['A', 'B']); expect(context.getPresetManager).toHaveBeenCalledWith('openai');
});

test('P7 Native Shell without a loaded Session still cannot discover legacy preset configuration', () => {
    const previous = globalThis.document; globalThis.document = { body: { dataset: { atriaShellMounted: 'true' } } };
    try {
        const context = { getPresetManager: jest.fn(() => { throw new Error('Legacy UI reached'); }) };
        expect(legacyPromptManager(context)).toBeNull(); expect(legacyPromptNames(context)).toEqual([]);
        expect(context.getPresetManager).not.toHaveBeenCalled();
    } finally { globalThis.document = previous; }
});

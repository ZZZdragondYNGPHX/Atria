import { expect, test } from '@jest/globals';
import { getSourceSettings } from '../../src/vectors/source-settings.js';
test('provider settings come exclusively from the exact authenticated Native resource', () => {
    const settings = { model: 'owned', apiKey: 'resolved', native: true };
    const request = { body: { model: 'injected', apiKey: 'injected' }, nativeRetrieval: { profile: { source: 'openai' }, settings } };
    expect(getSourceSettings('openai', request)).toBe(settings);
    expect(() => getSourceSettings('cohere', request)).toThrow('exact Native');
    expect(() => getSourceSettings('openai', { body: request.body })).toThrow('exact Native');
});

import { describe, expect, jest, test } from '@jest/globals';
import { compileBridge, validateCompiledBridge, EMPTY } from '../../src/native/frontend/bridge.js';

describe('Frontend transaction catalogue compilation', () => {
    const contract = { authorityRuntime: {}, taskRuntime: { turn: { policy: 'authority-first' } } };
    const transactions = Array.from({ length: 64 }, (_, i) => ({ id: 'step.' + i, inputSchema: EMPTY }));
    const source = { version: 1, bindings: transactions.map((t, i) => ({ id: 'step' + i, kind: 'action', target: { transactionId: t.id }, inputSchema: EMPTY, outputSchema: EMPTY })) };
    test('resolves once per bridge compilation without changing output or validation', () => {
        const provider = jest.fn(() => transactions);
        const compiled = compileBridge(source, contract, provider);
        expect(provider).toHaveBeenCalledTimes(1);
        expect(compiled).toEqual(compileBridge(source, contract, transactions));
        validateCompiledBridge(compiled, contract, provider);
        expect(provider).toHaveBeenCalledTimes(2);
        compileBridge({ version: 1, bindings: [] }, contract, provider);
        expect(provider).toHaveBeenCalledTimes(2);
    });
    test('does not retain a catalogue between calls or hide changed target contracts', () => {
        const provider = jest.fn(() => transactions);
        const compiled = compileBridge(source, contract, provider);
        provider.mockReturnValue(transactions.slice(1));
        expect(() => validateCompiledBridge(compiled, contract, provider)).toThrow(/Unknown typed Binding target/);
        expect(provider).toHaveBeenCalledTimes(2);
    });
});

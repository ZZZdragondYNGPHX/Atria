import { expect, test } from '@jest/globals';
import { M1RetryPolicy } from './m1-retry.js';
import { m1TransportKey } from './m1-transport-key.js';

test('explicit server group change preserves stopped history and persists the new failure window', () => {
    const url = 'https://fixture.invalid/v1/chat/completions', model = 'secondary';
    const oldKey = m1TransportKey(url, model), oldState = { consecutive: 4, recent: [true, true, true, true], stopped: 'm1_http_503' };
    const epochs = { secondary: { revision: 'e8b5cf99-0a16-4c83-b070-6e138107ac6c', reason: 'user_reported_server_group_change', authorizedAt: 1000 } };
    const key = m1TransportKey(url, model, epochs);
    let saved;
    const policy = new M1RetryPolicy({ snapshot: { [oldKey]: oldState }, onChange: snapshot => { saved = snapshot; } });
    expect(() => policy.assertAvailable(oldKey)).toThrow('m1_http_503');
    expect(() => policy.assertAvailable(key)).not.toThrow();
    policy.observe(key);
    expect(saved[oldKey]).toEqual(oldState);
    for (let i = 0; i < 3; i++) policy.observe(key, 'm1_http_503');
    const restored = new M1RetryPolicy({ snapshot: saved });
    expect(() => restored.assertAvailable(m1TransportKey(url, model, epochs))).toThrow('m1_http_503');
    expect(restored.state(oldKey)).toEqual(oldState);
    expect(m1TransportKey(url, 'primary', epochs)).toBe(url + ':primary');
});

test('a malformed server-change authorization does not create a new failure window', () => {
    expect(() => m1TransportKey('https://fixture.invalid', 'secondary', { secondary: { revision: 'restart', reason: 'user_reported_server_group_change', authorizedAt: 1000 } })).toThrow('invalid_transport_epoch');
});

test('explicit grading output change keeps previous failures and remains stable on restart', () => {
    const old = { revision: 'e8b5cf99-0a16-4c83-b070-6e138107ac6c', reason: 'user_reported_server_group_change', authorizedAt: 1000 };
    const epochs = { secondary: { ...old, graderOutputTokens: 8192 } };
    const key = m1TransportKey('fixture', 'secondary', epochs);
    expect(key).not.toBe(m1TransportKey('fixture', 'secondary', { secondary: old }));
    expect(key).toBe(m1TransportKey('fixture', 'secondary', JSON.parse(JSON.stringify(epochs))));
    expect(() => m1TransportKey('fixture', 'secondary', { secondary: { ...old, graderOutputTokens: 8193 } })).toThrow('invalid_transport_epoch');
});

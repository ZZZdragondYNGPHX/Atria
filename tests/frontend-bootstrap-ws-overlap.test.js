import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SCRIPT_URL = new URL('../public/script.js', import.meta.url);

describe('first-load WebSocket/bootstrap overlap', () => {
    test('starts delivery before bootstrap and waits for both before continuing', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');

        const deliveryStart = source.indexOf('deliveryReadyPromise = delivery.connect');
        const bootstrapStart = source.indexOf('const bootstrapPromise = fetchBootstrapSnapshot()');
        const bootstrapJoin = source.indexOf('const [clientVersionData, bootstrapSnapshot] = await Promise.all');
        const deliveryJoin = source.indexOf('await deliveryReadyPromise;', bootstrapJoin);

        expect(deliveryStart).toBeGreaterThanOrEqual(0);
        expect(bootstrapStart).toBeGreaterThan(deliveryStart);
        expect(bootstrapJoin).toBeGreaterThan(bootstrapStart);
        expect(deliveryJoin).toBeGreaterThan(bootstrapJoin);
    });
});

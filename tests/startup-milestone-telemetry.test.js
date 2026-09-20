import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { backendLogStore } from '../src/logging/store.js';

import {
    __startupTimingTestUtils,
    markStartupMilestone,
    startStartupPhase,
} from '../src/startup-timing.js';

describe('startup milestone telemetry', () => {
    afterEach(() => {
        __startupTimingTestUtils.clear();
        backendLogStore.clear();
        jest.restoreAllMocks();
    });

    test('emits each milestone only once', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        markStartupMilestone('test.once');
        markStartupMilestone('test.once');
        expect(log).toHaveBeenCalledTimes(1);
        const rendered = log.mock.calls[0].map(String).join(' ');
        expect(rendered).toContain('[startup]');
        expect(rendered).toContain('test.once');
        expect(backendLogStore.query({ modules: ['startup'] }).entries[0]).toMatchObject({
            category: 'milestone',
            event: 'test.once',
            source: 'structured',
        });
    });

    test('phase timer reports elapsed time', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const finish = startStartupPhase('test.phase');
        const elapsed = finish('done');
        expect(elapsed).toBeGreaterThanOrEqual(0);
        const rendered = log.mock.calls[0].map(String).join(' ');
        expect(rendered).toContain('phase test.phase');
        expect(rendered).toContain('done');
        expect(backendLogStore.query({ events: ['phase.test.phase'] }).entries[0]).toMatchObject({
            module: 'startup',
            category: 'phase',
            source: 'structured',
        });
    });

    test('critical startup path is instrumented end to end', () => {
        const serverMain = readFileSync(new URL('../src/server-main.js', import.meta.url), 'utf8');
        const bootstrap = readFileSync(new URL('../src/endpoints/bootstrap.js', import.meta.url), 'utf8');
        const ticket = readFileSync(new URL('../src/ws-ticket-router.js', import.meta.url), 'utf8');
        const delivery = readFileSync(new URL('../src/ws-delivery.js', import.meta.url), 'utf8');
        const webpackServe = readFileSync(new URL('../src/middleware/webpack-serve.js', import.meta.url), 'utf8');

        expect(serverMain).toContain("http.root.");
        expect(serverMain).toContain("http.csrf-token");
        expect(serverMain).toContain("server-main.module-evaluated");
        expect(serverMain).toContain("bootstrap.init-user-storage");
        expect(serverMain).toContain("bootstrap.init-storage");
        expect(serverMain).toContain("pre-setup.total");
        expect(serverMain).toContain("pre-setup.parallel-state");
        expect(serverMain).toContain("pre-setup.plugins");
        expect(serverMain).toContain("pre-setup.frontend-cache");
        expect(serverMain).toContain("http.asset.");
        expect(bootstrap).toContain("http.bootstrap.start");
        expect(bootstrap).toContain("http.bootstrap.done");
        expect(ticket).toContain("http.ws-ticket");
        expect(delivery).toContain("ws.connection");
        expect(webpackServe).toContain("frontend-cache source=");
        expect(webpackServe).toContain("webpack.compiler-close");
    });
});

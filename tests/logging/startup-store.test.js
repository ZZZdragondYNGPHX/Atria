import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from '@jest/globals';

import {
    STARTUP_SESSION_SCHEMA_VERSION,
    StartupSessionStore,
    compareStartupSessions,
    extractExtensionActivationTimings,
    normalizeStartupClientReport,
} from '../../src/logging/startup-store.js';
import { LogStore } from '../../src/logging/store.js';

const roots = [];
afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function makeReport(id, total = 1000, extensionTotal = 200, stage = 'ready') {
    return normalizeStartupClientReport({
        startupSessionId: id,
        stage,
        timings: {
            initJsStart: 10,
            firstLoadStart: 100,
            csrfDone: 150,
            getSettingsDone: 300,
            loaderHidden: 500,
            batch1Done: 600,
            batch2Done: 800,
            batch3Done: 900,
            appReady: total + 100,
        },
        durations: {
            'extensionActivate:demo': extensionTotal,
            'extensionScript:demo': 80,
            'extensionStyle:demo': 20,
            'extensionLocale:demo': 10,
            'extensionHook:demo': 40,
        },
        navigation: { responseEnd: 5, domInteractive: 300, loadEventEnd: 700 },
        runtime: { userAgent: 'Test Browser', platform: 'test', memoryGB: 8 },
    });
}

describe('startup diagnostics store', () => {
    test('normalizes extension timing phases without parent/child duplication', () => {
        const items = extractExtensionActivationTimings({
            'extensionActivate:a': 100,
            'extensionScript:a': 40,
            'extensionStyle:a': 20,
            'extensionLocale:a': 5,
            'extensionHook:a': 15,
        });
        expect(items).toEqual([{
            name: 'a',
            totalMs: 100,
            localeMs: 5,
            scriptMs: 40,
            styleMs: 20,
            hookMs: 15,
        }]);
    });

    test('visible is draft-only while ready persists a compact session', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-startup-store-'));
        roots.push(root);
        const filePath = path.join(root, 'startup.json');
        const logs = new LogStore({ capacity: 10 });
        logs.append({ module: 'startup', level: 'info', event: 'boot', message: 'boot' });
        const serverSnapshotProvider = () => ({
            serverBootId: 'boot-1',
            createdAt: 1,
            elapsedMs: 1234,
            runtime: { node: 'test', platform: 'test', arch: 'x64' },
            milestones: [{ name: 'module', elapsedMs: 10, timestamp: 10 }],
            phases: [{ name: 'bootstrap', durationMs: 20, timestamp: 20 }],
        });
        const store = new StartupSessionStore({ capacity: 20, filePath, logStore: logs, serverSnapshotProvider });

        const draft = store.recordClientReport({ report: makeReport('session-1', 1000, 200, 'visible'), user: 'alice', version: { pkgVersion: '2.7.0' } });
        expect(draft.stage).toBe('visible');
        expect(store.size).toBe(0);
        expect(fs.existsSync(filePath)).toBe(false);

        const completed = store.recordClientReport({ report: makeReport('session-1'), user: 'alice', version: { pkgVersion: '2.7.0', gitRevision: 'abc', gitBranch: 'main' } });
        expect(completed).toMatchObject({
            id: 'session-1',
            serverBootId: 'boot-1',
            user: 'alice',
            stage: 'ready',
            appVersion: '2.7.0',
            revision: 'abc',
            branch: 'main',
        });
        expect(completed.server.phases[0].name).toBe('bootstrap');
        expect(completed.extensions[0].scriptMs).toBe(80);
        expect(completed.linkedLogWindow.fromId).toBe(1);
        expect(store.size).toBe(1);

        const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        expect(persisted.schemaVersion).toBe(STARTUP_SESSION_SCHEMA_VERSION);
        expect(persisted.sessions).toHaveLength(1);
        expect(JSON.stringify(persisted)).not.toContain('rawLog');
    });

    test('retains only the newest 20 completed sessions across reload', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-startup-retention-'));
        roots.push(root);
        const filePath = path.join(root, 'startup.json');
        const store = new StartupSessionStore({
            capacity: 20,
            filePath,
            logStore: new LogStore({ capacity: 2 }),
            serverSnapshotProvider: () => ({
                serverBootId: 'boot',
                createdAt: 1,
                elapsedMs: 10,
                runtime: {},
                milestones: [],
                phases: [],
            }),
        });
        for (let i = 0; i < 25; i++) {
            store.recordClientReport({ report: makeReport(`s-${i}`), user: 'u' });
        }
        expect(store.size).toBe(20);
        expect(store.list({ limit: 20 }).at(-1).id).toBe('s-5');

        const reloaded = new StartupSessionStore({ capacity: 20, filePath });
        expect(reloaded.size).toBe(20);
        expect(reloaded.get('s-0')).toBeNull();
        expect(reloaded.get('s-24').id).toBe('s-24');
    });

    test('compares current client and extension timings with previous session', () => {
        const current = {
            id: 'new',
            client: { summary: { firstLoadTotalMs: 1200, extActivateMs: 300 } },
            extensions: [{ name: 'demo', totalMs: 220 }],
        };
        const previous = {
            id: 'old',
            client: { summary: { firstLoadTotalMs: 1000, extActivateMs: 250 } },
            extensions: [{ name: 'demo', totalMs: 200 }],
        };
        expect(compareStartupSessions(current, previous)).toMatchObject({
            currentId: 'new',
            previousId: 'old',
            clientDeltas: { firstLoadTotalMs: 200, extActivateMs: 50 },
            extensionDeltas: [{ name: 'demo', totalMs: 220, deltaMs: 20 }],
        });
    });
});

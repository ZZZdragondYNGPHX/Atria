import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../src/util.js';

// Native fixtures import server modules during discovery, before hooks run.
setConfigFilePath(fileURLToPath(new URL('../default/config.yaml', import.meta.url)));

// Each spec owns an isolated server/data root through e2e/_lib/server.js.
export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.e2e.js',
    testIgnore: ['**/_lib/**', '**/_fixtures/**'],
    use: {
        video: 'only-on-failure',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 4,
    fullyParallel: true,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    timeout: 120_000,
    projects: [{ name: 'e2e' }],
});

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { parse, stringify } from 'yaml';
import { reservePort } from './ports.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const SCRATCH_ROOT = resolve(REPO_ROOT, 'tests/.e2e-scratch');
const DEFAULT_CONFIG = resolve(REPO_ROOT, 'default/config.yaml');
const READY_TIMEOUT_MS = 60_000;

// Fresh data is provisioned by the real server. Explicit fixture roots remain
// supported for Native packages, multi-user scenarios and migration tests.
export async function startServer({ batchKey = 'test', scenarioId = 'default', extraEnv = {}, extraConfig = {}, useExistingDataRoot = null } = {}) {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    const scratch = mkdtempSync(resolve(SCRATCH_ROOT, `${batchKey}-${scenarioId}-`));
    const dataRoot = useExistingDataRoot ? resolve(useExistingDataRoot) : resolve(scratch, 'data');
    const configPath = resolve(scratch, 'config.yaml');
    const config = parse(readFileSync(DEFAULT_CONFIG, 'utf8'));
    config.storage.mode = 'fs';
    for (const [key, value] of Object.entries(extraConfig ?? {})) {
        const parts = key.split('.');
        let target = config;
        for (const part of parts.slice(0, -1)) target = target[part] ??= {};
        target[parts.at(-1)] = value;
    }
    writeFileSync(configPath, stringify(config));
    const port = await reservePort();
    const baseURL = `http://127.0.0.1:${port}`;
    let child;
    let exited;

    async function stop() {
        if (!child) return;
        const current = child;
        child = null;
        if (!current.pid || current.exitCode !== null || current.signalCode !== null) return;
        const done = once(current, 'exit');
        current.kill('SIGTERM');
        const timer = setTimeout(() => current.kill('SIGKILL'), 3000);
        try { await done; } finally { clearTimeout(timer); }
    }

    async function start() {
        exited = null;
        let spawnError;
        let logs = '';
        const runtime = process.env.ATRIA_RUNTIME === 'bun'
            ? (process.env.ATRIA_BUN_PATH || `${process.env.HOME}/.bun/bin/bun`)
            : process.execPath;
        child = spawn(runtime, ['server.js', `--port=${port}`, `--dataRoot=${dataRoot}`,
            `--configPath=${configPath}`, '--browserLaunchEnabled=false', '--listen=false',
            '--whitelist=127.0.0.1', '--disableCsrf=false'], {
            cwd: REPO_ROOT, env: { ...process.env, ...extraEnv, NODE_ENV: 'production' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.on('error', error => { spawnError = error; });
        child.once('exit', (code, signal) => { exited = { code, signal }; });
        for (const pipe of [child.stdout, child.stderr]) {
            pipe.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
        }
        const deadline = Date.now() + READY_TIMEOUT_MS;
        try {
            while (Date.now() < deadline) {
                if (spawnError) throw spawnError;
                if (exited) throw new Error(`Atria exited: ${JSON.stringify(exited)}\n${logs}`);
                try {
                    const response = await fetch(baseURL, { redirect: 'manual', signal: AbortSignal.timeout(1000) });
                    await response.body?.cancel();
                    if ([200, 302, 401].includes(response.status)) return;
                } catch { /* The server has not bound its port yet. */ }
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            throw new Error(`Atria did not become ready within ${READY_TIMEOUT_MS}ms\n${logs}`);
        } catch (error) {
            await stop();
            throw error;
        }
    }

    try { await start(); } catch (error) {
        rmSync(scratch, { recursive: true, force: true });
        throw error;
    }
    return { port, dataRoot, configPath, scratch, baseURL, stop,
        async restart() { await stop(); await start(); } };
}

export async function tearDownServer(handle, { removeData = true } = {}) {
    if (!handle) return;
    await handle.stop();
    if (!removeData) {
        rmSync(handle.configPath, { force: true });
        if (relative(handle.scratch, handle.dataRoot).startsWith('..')) rmSync(handle.scratch, { recursive: true, force: true });
        return;
    }
    // Caller-owned Native fixture roots inside our scratch directory may also
    // be removed; an external real-data source is never deleted here.
    for (const target of [handle.dataRoot, handle.scratch]) {
        const rel = relative(SCRATCH_ROOT, target);
        if (rel && !rel.startsWith('..')) {
            rmSync(target, { recursive: true, force: true });
        }
    }
}

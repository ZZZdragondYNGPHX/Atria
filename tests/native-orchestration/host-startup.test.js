import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createNativeId } from '../../src/native/identity.js';
import { planFixture } from './fixtures.js';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() {
    const listener = net.createServer();
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    const value = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    return value;
}

test('installed server obtains Storage ownership before boot and rejects a second HTTP port on the same root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-v3-boot-'));
    const dataRoot = path.join(root, 'data'), configPath = path.join(root, 'config.yaml');
    fs.copyFileSync(path.join(sourceRoot, 'default/config.yaml'), configPath);
    const children = [];
    function launch(listenPort) {
        const child = spawn(process.execPath, ['server.js', `--port=${listenPort}`, `--dataRoot=${dataRoot}`, `--configPath=${configPath}`, '--browserLaunchEnabled=false', '--listen=false', '--whitelist=127.0.0.1'], { cwd: sourceRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        const item = { child, output: '', exit: undefined, done: new Promise(resolve => child.once('exit', code => { item.exit = code; resolve(); })) };
        child.stdout.on('data', data => { item.output = (item.output + data).slice(-12000); });
        child.stderr.on('data', data => { item.output = (item.output + data).slice(-12000); });
        children.push(item);
        return item;
    }
    try {
        const firstPort = await port(), first = launch(firstPort);
        let ready = false;
        for (const deadline = Date.now() + 45000; Date.now() < deadline;) {
            if (first.exit !== undefined) throw new Error('First server failed: ' + first.output);
            try {
                const response = await fetch(`http://127.0.0.1:${firstPort}/`, { redirect: 'manual', headers: { Connection: 'close' }, signal: AbortSignal.timeout(1000) });
                await response.body?.cancel();
                if ([200, 302, 401].includes(response.status)) { ready = true; break; }
            } catch { /* startup in progress */ }
            await delay(200);
        }
        if (!ready) throw new Error('First server was not ready: ' + first.output);
        expect(fs.existsSync(path.join(dataRoot, 'native-host.identity'))).toBe(true);
        const endpoint = `http://127.0.0.1:${firstPort}/api/native/orchestration`;
        const denied = await fetch(endpoint + '/plans/list', { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify({ schemaVersion: 1, body: { cursor: null, limit: 10 } }) });
        expect(denied.status).toBe(403);
        await denied.body?.cancel();
        const csrf = await fetch(`http://127.0.0.1:${firstPort}/csrf-token`, { headers: { Connection: 'close' } });
        const cookie = csrf.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
        const { token } = await csrf.json();
        const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': token, Cookie: cookie, Connection: 'close' };
        const listed = await fetch(endpoint + '/plans/list', { method: 'POST', headers, body: JSON.stringify({ schemaVersion: 1, body: { cursor: null, limit: 10 } }) });
        expect(listed.status).toBe(200);
        const { hostBootId, outcome } = await listed.json();
        expect(outcome.items).toEqual([]);
        const authored = await fetch(endpoint + '/plans/create', { method: 'POST', headers: { ...headers, 'X-Atria-Host-Boot-Id': hostBootId }, body: JSON.stringify({ schemaVersion: 1, commandId: createNativeId('orchestrationCommand'), expectedHostBootId: hostBootId, body: planFixture() }) });
        expect(authored.status).toBe(200);
        expect((await authored.json()).outcome.ownerRef.handle).toBe('default-user');
        const second = launch(await port());
        let timeout;
        try { await Promise.race([second.done, new Promise(resolve => { timeout = setTimeout(resolve, 10000); })]); } finally { clearTimeout(timeout); }
        expect(second.exit).toBeDefined();
        expect(second.exit).not.toBe(0);
        expect(second.output).toContain('Native storage writer ownership is unavailable');
        const response = await fetch(`http://127.0.0.1:${firstPort}/`, { redirect: 'manual', headers: { Connection: 'close' } });
        await response.body?.cancel();
        expect([200, 302, 401]).toContain(response.status);
    } finally {
        for (const item of children) if (item.exit === undefined) { item.child.kill('SIGKILL'); await item.done; }
        fs.rmSync(root, { recursive: true, force: true });
    }
}, 60000);

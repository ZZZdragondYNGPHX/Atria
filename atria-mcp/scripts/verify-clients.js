import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { PUBLIC_TOOLS } from '../src/kernel.js';
import { redact } from '../src/policy.js';

// Optional installed-client checks. No model turn or provider request is sent.
export async function verifyClients({ repo, origin, scratch, artifacts }) {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const args = [join(root, 'src/cli.js'), '--repo', repo, '--url', origin,
        ...(process.env.ATRIA_TEST_BROWSER_CHANNEL ? ['--browser-channel', process.env.ATRIA_TEST_BROWSER_CHANNEL] : [])];
    const result = { humanApproval: 'not tested; requires actual interactive client user', claude: { status: 'not requested' }, codex: { status: 'not requested' } };
    if (process.env.ATRIA_VERIFY_CLAUDE_EXE) {
        const dir = join(scratch, 'claude-client'); await mkdir(dir);
        const env = { ...process.env, CLAUDE_CONFIG_DIR: dir };
        const config = JSON.parse(await readFile(join(root, 'examples/claude.mcp.json'), 'utf8'));
        config.mcpServers.atria.command = process.execPath; config.mcpServers.atria.args = args;
        const run = argv => execFileSync(process.env.ATRIA_VERIFY_CLAUDE_EXE, argv, { env, cwd: scratch, encoding: 'utf8', timeout: 60000, windowsHide: true });
        const version = run(['--version']).trim();
        run(['mcp', 'add-json', '--scope', 'user', 'atria', JSON.stringify(config.mcpServers.atria)]);
        const health = run(['mcp', 'get', 'atria']);
        assert.match(health, /Connected/i, health);
        result.claude = { version, status: 'real CLI startup/health connected', tools: 'not exposed by mcp get; SDK protocol tests are separate', humanApproval: 'not tested' };
    }
    if (process.env.ATRIA_VERIFY_CODEX_EXE) {
        const dir = join(scratch, 'codex-client'); await mkdir(dir);
        const template = await readFile(join(root, 'examples/codex.config.toml'), 'utf8');
        assert.match(template, /\[mcp_servers\.atria\]/);
        const config = 'model_provider = "verification"\n[model_providers.verification]\nname = "Local unavailable verification provider"\nwire_api = "responses"\nbase_url = ' + JSON.stringify(origin + '/verification-no-provider')
            + '\n[mcp_servers.atria]\ncommand = ' + JSON.stringify(process.execPath) + '\nargs = ' + JSON.stringify(args) + '\nstartup_timeout_sec = 30\ntool_timeout_sec = 90\n';
        await writeFile(join(dir, 'config.toml'), config);
        // Isolate child-client files only; never edit the developer's configuration.
        const child = spawn(process.env.ATRIA_VERIFY_CODEX_EXE, ['app-server', '--stdio'], {
            cwd: scratch, env: { ...process.env, CODEX_HOME: dir }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        });
        let sequence = 0; const pending = new Map(); let stderr = '';
        child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-12000); });
        const lines = createInterface({ input: child.stdout });
        lines.on('line', line => {
            let value; try { value = JSON.parse(line); } catch { return; }
            const request = pending.get(value.id);
            if (request) { pending.delete(value.id); clearTimeout(request.timer); value.error ? request.reject(new Error(JSON.stringify(value.error))) : request.resolve(value.result); }
        });
        const rpc = (method, params) => new Promise((resolve, reject) => {
            const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error('Client RPC timeout: ' + method)); }, 90000);
            pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
        });
        try {
            const initialized = await rpc('initialize', { clientInfo: { name: 'atria-verifier', title: 'Atria protocol verification', version: '1.0.0' }, capabilities: { experimentalApi: true, requestAttestation: false } });
            child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
            const started = await rpc('thread/start', { cwd: scratch, ephemeral: true });
            const threadId = started.thread.id;
            const inventory = await rpc('mcpServerStatus/list', { threadId });
            const server = inventory.data.find(item => item.name === 'atria');
            assert.ok(server, JSON.stringify(inventory));
            assert.deepEqual(Object.values(server.tools).map(tool => tool.name).sort(), [...PUBLIC_TOOLS].sort());
            const call = async (tool, arguments_ = {}) => {
                const value = await rpc('mcpServer/tool/call', { threadId, server: 'atria', tool, arguments: arguments_ });
                assert.notEqual(value.isError, true, JSON.stringify(value)); return value;
            };
            const status = await call('atri_status');
            const capabilities = await call('atri_capabilities');
            const read = await call('atri_read', { action: 'session.list', input: {} });
            await call('atri_browser_open');
            const shot = await call('atri_browser_screenshot');
            const image = shot.content.find(item => item.type === 'image');
            assert.equal(image.mimeType, 'image/jpeg');
            await call('atri_browser_close');
            result.codex = { initialized, status: 'real app-server MCP startup, exact 18 tools, schemas, status, discovery, READ and image content passed',
                toolCount: Object.keys(server.tools).length, statusResult: status, capabilities, read,
                image: { mimeType: image.mimeType, bytes: Buffer.from(image.data, 'base64').length }, humanApproval: 'not tested; no mutation requested' };
        } finally {
            for (const request of pending.values()) clearTimeout(request.timer);
            child.stdin.end();
            await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
            lines.close();
            await writeFile(join(artifacts, 'codex-client-stderr.log'), redact(stderr));
        }
    }
    await writeFile(join(artifacts, 'clients.json'), JSON.stringify(result, null, 2));
    return result;
}

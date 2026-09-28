import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
const exec = promisify(execFile);

export async function productFixture() {
    const root = await mkdtemp(join(tmpdir(), 'atria-mcp-test-'));
    const write = async (path, content) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); };
    await write('src/server-startup.js', `import {router as studio} from './endpoints/native-studio.js';\nexport function mount(app) {app.use('/api/native/studio', studio);}`);
    await write('src/endpoints/native-studio.js', `import express from 'express';
const router = express.Router();
router.get('/projects', (req,res) => res.json(req.query.search));
router.get('/projects/:projectId', (req,res) => res.json(req.params.projectId));
router.post('/projects', (req,res) => res.json(req.body.name));
router.get(['/redirect', '/oversize', '/nonjson', '/secrets'], (req,res) => {});
for (const method of ['snapshot', 'command']) router.post('/shared/' + method, (req,res) => {});
for (const [path, kind] of [['worlds','world'],['knowledge','knowledge']]) {
router.post(\`/\${path}/:id/promote\`, (req,res) => {});
}
router.get(variablePath, (req,res) => {});
export {router};`);
    await write('public/example.js', 'export const message = "Atria test evidence";\n');
    await write('data/private.json', '{"password":"not-for-tools"}');
    await exec('git', ['init', '--quiet', root]);
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, '-c', 'user.name=MCP Test', '-c', 'user.email=mcp@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture']);
    return { root, write, cleanup: async () => {
        const target = await realpath(root);
        const parent = await realpath(tmpdir());
        if (dirname(target).toLowerCase() !== parent.toLowerCase() || !basename(target).startsWith('atria-mcp-test-')) throw new Error('Unsafe test cleanup path');
        await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } };
}

export async function httpFixture() {
    let writes = 0;
    let redirects = 0;
    const html = `<!doctype html><html><head><title>Atria MCP fixture</title><style>
body{font:18px system-ui;background:#142125;color:#e9f6f2;margin:32px}button,input,select{font:inherit;padding:8px}main{max-width:900px}iframe{background:white;height:180px;width:90%}@media(max-width:500px){body{margin:8px}h1{font-size:24px}}
</style></head><body><main id="ready"><h1>Atria MCP browser fixture</h1><p id="auth">Not signed in</p>
<button id="login" onclick="fetch('/login',{method:'POST'}).then(()=>document.querySelector('#auth').textContent='Signed in')">Sign in test account</button>
<label>Project name <input id="name" aria-label="Project name"></label><input id="password" type="password" aria-label="Password">
<select id="mode" aria-label="Mode"><option>Desktop</option><option>Compact</option></select>
<button id="show" onclick="document.querySelector('#result').textContent='Changed frontend visible'">Show change</button><p id="result">Initial frontend</p>
<iframe title="Preview" srcdoc="<h2>Embedded Atria preview fixture</h2><button id='frame-button' onclick='this.textContent=&quot;Frame changed&quot;'>Update frame</button>"></iframe>
<a id="external" href="https://example.invalid/">External navigation</a></main>
<script>console.warn('fixture warning token=do-not-leak');fetch('/missing');</script></body></html>`;
    const server = createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const json = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
        if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(html); }
        if (url.pathname === '/login') { res.setHeader('set-cookie', 'auth=fixture-user; HttpOnly; SameSite=Strict; Path=/'); return json(200, { ok: true }); }
        if (url.pathname === '/csrf-token') { res.setHeader('set-cookie', 'csrfSession=fixture-session; HttpOnly; SameSite=Strict; Path=/'); return json(200, { token: 'fixture-token' }); }
        if (url.pathname.startsWith('/api/native/')) {
            if (!req.headers.cookie?.includes('auth=fixture-user')) return json(401, { error: 'login_required' });
            if (url.pathname.endsWith('/redirect')) { res.writeHead(302, { location: '/redirect-target' }); return res.end(); }
            if (url.pathname.endsWith('/oversize')) return json(200, { huge: 'x'.repeat(1024 * 1024 + 1) });
            if (url.pathname.endsWith('/nonjson')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<p>Not JSON</p>'); }
            if (req.method === 'POST') {
                if (req.headers['x-csrf-token'] !== 'fixture-token' || !req.headers.cookie?.includes('csrfSession=fixture-session')) return json(403, { error: 'csrf' });
                let body = ''; for await (const chunk of req) body += chunk;
                writes++;
                return json(201, { saved: JSON.parse(body), writes });
            }
            if (url.pathname === '/api/native/extensions/catalog') return json(200, { references: [{ id: 'project', description: 'fixture contract' }] });
            if (url.pathname === '/api/native/extensions/catalog/project') return json(200, { id: 'project', content: 'Exact revisions; Studio review before apply.' });
            return json(200, { projects: [{ id: 'project-1', name: 'Example' }], password: 'do-not-leak', query: url.searchParams.get('search') });
        }
        if (url.pathname === '/redirect-target') { redirects++; return json(200, {}); }
        json(404, { error: 'not_found' });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { origin: `http://127.0.0.1:${server.address().port}`, stats: () => ({ writes, redirects }), close: async () => {
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    } };
}

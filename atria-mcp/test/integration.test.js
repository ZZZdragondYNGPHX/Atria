import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { productFixture, httpFixture } from './helpers.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const unpack = result => JSON.parse(result.content.find(item => item.type === 'text').text);
async function connect(t, fixture, http, writes = false) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ATRIA_')));
    const transport = new StdioClientTransport({ command: process.execPath,
        args: [cli, '--repo', fixture.root, '--url', http.origin, ...(writes ? ['--allow-writes'] : [])], env, stderr: 'pipe' });
    let stderr = '';
    transport.stderr.on('data', bytes => { stderr += bytes; });
    const client = new Client({ name: 'atria-test-client', version: '1.0.0' });
    t.after(async () => { await client.close(); assert.equal(stderr, '', 'No protocol noise or startup errors on stderr'); });
    await client.connect(transport);
    return { client, call: (name, args = {}) => client.callTool({ name, arguments: args }) };
}

test('stdio discovery, resources, prompts and default write protection', { timeout: 120000 }, async t => {
    const fixture = await productFixture();
    const http = await httpFixture();
    t.after(fixture.cleanup); t.after(http.close);
    const { client, call } = await connect(t, fixture, http);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 15);
    assert.ok(tools.tools.some(tool => tool.name === 'atri_browser_screenshot'));
    const status = unpack(await call('atri_status'));
    assert.equal(status.writesEnabled, false);
    assert.equal(status.browser.started, false);
    assert.equal((await client.listResources()).resources.length, 2);
    assert.match((await client.readResource({ uri: 'atria://guide' })).contents[0].text, /Review -> Apply/);
    assert.match((await client.getPrompt({ name: 'atria_verify_change', arguments: { task: 'Verify frontend' } })).messages[0].content.text, /Verify frontend/);
    assert.equal(unpack(await call('atri_api_list', { query: 'projects' })).total, 3);
    assert.match(unpack(await call('atri_api_detail', { id: 'POST /api/native/studio/projects' })).source.content, /req.body.name/);
    assert.equal((await call('atri_api_request', { path: '/api/native/studio/projects', method: 'POST', body: {}, confirm: true })).isError, true);
    assert.equal((await call('atri_browser_interact', { action: 'click', selector: '#login', confirm: true })).isError, true);
    assert.equal((await call('atri_api_request', { path: '/api/native/generation/secrets' })).isError, true);
    assert.equal((await call('atri_api_request', { path: '/api/native/studio/not-discovered' })).isError, true);
    assert.equal((await call('atri_source_read', { path: 'data/private.json' })).isError, true);
    assert.equal(http.stats().writes, 0);
    // Reading API authentication failure should not claim success or disable CSRF.
    const unauthorized = await call('atri_api_request', { path: '/api/native/studio/projects' });
    assert.equal(unauthorized.isError, true);
    assert.equal(unpack(unauthorized).status, 401);
    await call('atri_browser_close');
});

test('real Chromium feedback loop, same-context auth, CSRF and protocol images', { timeout: 180000 }, async t => {
    const fixture = await productFixture();
    const http = await httpFixture();
    t.after(fixture.cleanup); t.after(http.close);
    const { call } = await connect(t, fixture, http, true);
    const open = await call('atri_browser_open', { waitFor: '#ready' });
    assert.equal(open.isError, undefined, JSON.stringify(open));
    assert.match(unpack(open).accessibility, /Atria MCP browser fixture/);
    await call('atri_browser_interact', { action: 'click', selector: '#login', confirm: true });
    const read = await call('atri_api_request', { path: '/api/native/studio/projects', query: { search: 'a&b' } });
    assert.equal(read.isError, undefined, JSON.stringify(read));
    assert.equal(unpack(read).data.password, '[REDACTED]');
    assert.equal(unpack(read).data.query, 'a&b');
    const write = await call('atri_api_request', { method: 'POST', path: '/api/native/studio/projects', body: { name: 'MCP project' }, confirm: true });
    assert.equal(unpack(write).status, 201, JSON.stringify(write));
    assert.equal(http.stats().writes, 1);
    assert.equal((await call('atri_api_request', { method: 'POST', path: '/api/native/studio/projects', body: {} })).isError, true);
    assert.equal(http.stats().writes, 1);
    assert.equal(unpack(await call('atri_reference')).data.references[0].id, 'project');
    assert.match(unpack(await call('atri_reference', { id: 'project' })).data.content, /Exact revisions/);
    for (const path of ['redirect', 'oversize', 'nonjson']) {
        assert.equal((await call('atri_api_request', { path: '/api/native/studio/' + path })).isError, true, path);
    }
    assert.equal(http.stats().redirects, 0);
    assert.equal((await call('atri_browser_open', { path: '//example.invalid' })).isError, true);
    await call('atri_browser_interact', { action: 'fill', selector: '#name', value: 'Updated project', confirm: true });
    await call('atri_browser_interact', { action: 'select', selector: '#mode', value: 'Compact', confirm: true });
    assert.equal((await call('atri_browser_interact', { action: 'fill', selector: '#password', value: 'never-send', confirm: true })).isError, true);
    assert.equal((await call('atri_browser_interact', { action: 'press', selector: '#password', value: 'A', confirm: true })).isError, true);
    assert.equal((await call('atri_browser_wait', { selector: '#ready', state: 'visible' })).isError, undefined);
    const changed = await call('atri_browser_interact', { action: 'click', selector: '#show', confirm: true });
    assert.match(unpack(changed).accessibility, /Changed frontend visible/);
    const screenshot = await call('atri_browser_screenshot');
    const image = screenshot.content.find(item => item.type === 'image');
    assert.equal(image.mimeType, 'image/jpeg');
    assert.equal(Buffer.from(image.data, 'base64').readUInt16BE(0), 0xffd8);
    assert.ok(Buffer.from(image.data, 'base64').length > 5000);
    const frameSnapshot = await call('atri_browser_snapshot', { frame: 1 });
    assert.match(unpack(frameSnapshot).accessibility, /Embedded Atria preview/);
    assert.match(unpack(await call('atri_browser_interact', { frame: 1, action: 'click', selector: '#frame-button', confirm: true })).accessibility, /Frame changed/);
    assert.ok((await call('atri_browser_screenshot', { frame: 1, selector: 'body' })).content.some(item => item.type === 'image'));
    const mobile = unpack(await call('atri_browser_resize', { width: 390, height: 844 }));
    assert.match(mobile.accessibility, /Changed frontend visible/);
    assert.match(unpack(await call('atri_browser_snapshot', { frame: 1 })).accessibility, /Frame changed/);
    assert.equal(mobile.viewport.width, 390);
    assert.ok((await call('atri_browser_screenshot')).content.some(item => item.type === 'image'));
    const reloaded = unpack(await call('atri_browser_open', { reload: true, waitFor: '#ready' }));
    assert.match(reloaded.accessibility, /Initial frontend/);
    const diagnostics = unpack(await call('atri_browser_diagnostics'));
    assert.ok(diagnostics.events.some(item => item.type === 'http-error'));
    assert.match(JSON.stringify(diagnostics), /REDACTED/);
    assert.doesNotMatch(JSON.stringify(diagnostics), /do-not-leak/);
    // Following an observed external link must be intercepted before navigation.
    await call('atri_browser_interact', { action: 'click', selector: '#external', confirm: true });
    assert.ok(unpack(await call('atri_browser_diagnostics')).events.some(item => item.type === 'blocked-navigation'));
    await call('atri_browser_open', { waitFor: '#ready' });
    await call('atri_browser_diagnostics', { clear: true });
    assert.equal(unpack(await call('atri_browser_diagnostics')).count, 0);
    await call('atri_browser_close');
    assert.equal(unpack(await call('atri_status')).browser.started, false);
});

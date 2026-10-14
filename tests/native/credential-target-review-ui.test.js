import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { chromium } from 'playwright';
import express from 'express';
import supertest from 'supertest';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { CredentialTargetAuthority, createCredentialSecretPort } from '../../src/native/model-prompt-runtime/credential-targets.js';

// This acceptance suite intentionally uses the available real browser channel.
function browserAcceptance() {
    let h, seeded, credentials, server, provider, browser, page, app, requests, sends, resolveSecret;
    beforeEach(async () => {
        h = await makeTempFsEngineHarness(); requests = []; sends = [];
        provider = createServer(async (req, res) => { sends.push({ url: req.url, authorization: req.headers.authorization });
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'loopback-fixture', object: 'model' }] })); });
        await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
        seeded = await seedGenerationProfiles({ ...h, endpoint: `http://127.0.0.1:${provider.address().port}/v1/chat/completions` });
        credentials = new CredentialTargetAuthority({ persistence: seeded.persistence });
        resolveSecret = jest.fn(async () => 'synthetic-local-only');
        const host = { persistence: seeded.persistence, library: seeded.library, secretPort: createCredentialSecretPort({ authority: credentials, resolveSecret }) };
        app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } };
            requests.push({ path: req.path, method: req.method, body: req.body }); next(); });
        app.get('/api/native/generation/secrets', (_req, res) => res.json([{ secretId: 'p4-synthetic-key', label: 'Synthetic fixture reference' }]));
        app.use('/api/native/generation', createNativeGenerationRouter(() => host, () => null));
        app.use(express.static(fileURLToPath(new URL('../../public', import.meta.url))));
        app.get('/fixture', (_req, res) => res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><main></main>'));
        server = createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        browser = await chromium.launch({ channel: process.env.ATRIA_TEST_BROWSER_CHANNEL, headless: true });
        page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
        const connection = await seeded.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
        await page.evaluate(async saved => {
            const { mountCredentialTargetReview } = await import('/scripts/native/credential-target-review.js');
            const { runtimeRequest } = await import('/scripts/native/runtime-client.js');
            const form = document.createElement('form'); document.querySelector('main').append(form);
            const input = document.createElement('input'); input.setAttribute('aria-label', 'Connection endpoint draft'); form.append(input);
            globalThis.saved = saved; globalThis.draft = structuredClone(saved); input.value = saved.endpoint;
            input.addEventListener('input', () => { globalThis.draft.endpoint = input.value; });
            const group = document.createElement('fieldset'); group.className = 'atri-runtime-group'; form.append(group);
            function node(tag, text, parent) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; parent.append(el); return el; }
            function button(text, action, parent) { const el = node('button', text, parent); el.type = 'button'; el.addEventListener('click', action); return el; }
            function notice(text, parent, error) { const el = node('p', text, parent); el.className = 'atri-runtime-notice'; el.setAttribute('role', error ? 'alert' : 'status'); return el; }
            globalThis.mountReview = (savedValue = saved) => { group.replaceChildren(); globalThis.review?.dispose();
                globalThis.review = mountCredentialTargetReview({ root: group, form, saved: savedValue, readDraft: () => globalThis.draft,
                    request: runtimeRequest, signal: new AbortController().signal, isCurrent: () => true, node, button, notice }); };
            globalThis.mountReview();
        }, connection);
    });
    afterEach(async () => { await browser?.close(); for (const instance of [server, provider].filter(Boolean)) { instance.closeAllConnections(); await new Promise(resolve => instance.close(resolve)); } await h?.cleanup(); });
    const inspection = () => page.getByRole('button', { name: 'Review credential destination', exact: true });
    const allow = () => page.getByRole('button', { name: 'Allow this credential destination', exact: true });
    const cancel = () => page.getByRole('button', { name: 'Cancel authorization', exact: true });
    const local = () => page.getByRole('checkbox', { name: 'Allow credentials to be sent to this local service' });
    const view = () => credentials.inspect(h.handle, { connectionProfileId: seeded.connection.connectionProfileId });

    test('the actual ordinary Connection workspace mounts the separate review and authorizes a saved profile without saving or sending', async () => {
        await page.evaluate(async () => {
            globalThis.review.dispose(); const body = document.querySelector('main'); body.replaceChildren();
            const { mountNativeRuntimeWorkspace } = await import('/scripts/native/runtime-workspace.js');
            globalThis.workspace = mountNativeRuntimeWorkspace({ document, body, section: 'connections',
                route: { child: { id: 'connections:' + globalThis.saved.connectionProfileId } }, host: {} });
        });
        await inspection().waitFor(); await page.getByRole('combobox', { name: 'Stored Secret' }).selectOption('p4-synthetic-key');
        await inspection().click(); await local().waitFor({ state: 'visible' }); await local().check(); await allow().click();
        await page.getByText('Exact saved credential destination authorized.', { exact: false }).waitFor();
        expect((await view()).authorized).toBe(true); expect(requests.some(row => row.method === 'PUT')).toBe(false);
        expect(resolveSecret).not.toHaveBeenCalled(); expect(sends).toHaveLength(0);
    });

    test('real DOM inspect and reject never mint; explicit local consent authorizes the exact target before a synthetic model-list probe', async () => {
        expect(await allow().isDisabled()).toBe(true); await inspection().click();
        await page.getByText('Review this saved destination.', { exact: false }).waitFor();
        expect(await allow().isDisabled()).toBe(true); expect(await local().isVisible()).toBe(true);
        expect(await page.locator('pre').textContent()).toContain('p4-synthetic-key'); expect((await view()).authorized).toBe(false);
        await cancel().click(); expect((await view()).authorized).toBe(false); expect(resolveSecret).not.toHaveBeenCalled(); expect(sends).toHaveLength(0);
        await inspection().click(); await local().waitFor({ state: 'visible' }); await local().check(); expect(await allow().isEnabled()).toBe(true);
        const observed = await view(); await allow().click();
        await page.getByText('Exact saved credential destination authorized.', { exact: false }).waitFor();
        const authorization = requests.find(row => row.path.endsWith('/credential-target/authorize'));
        expect(authorization.body).toEqual({ connectionProfileId: observed.connectionProfileId, expectedFingerprint: observed.connectionFingerprint,
            expectedTargetFingerprint: observed.targetFingerprint, expectedPermitFingerprint: observed.permitFingerprint, allowLocal: true });
        expect((await view()).authorized).toBe(true); expect(resolveSecret).not.toHaveBeenCalled(); expect(sends).toHaveLength(0);
        const connection = await seeded.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
        await supertest(app).post('/api/native/generation/connections/probe').send(connection).expect(200);
        expect(sends).toEqual([{ url: '/v1/models', authorization: 'Bearer synthetic-local-only' }]);
    });

    test('unsaved profiles and changed drafts cannot authorize; remotely changed configuration fails the original Native three-hash CAS', async () => {
        await page.evaluate(() => globalThis.mountReview(null)); await inspection().click();
        await page.getByText('Save this connection and reopen it', { exact: false }).waitFor();
        expect(requests.filter(row => row.path.endsWith('/credential-target/inspect'))).toHaveLength(0);
        await page.evaluate(() => globalThis.mountReview()); await inspection().click(); await local().waitFor({ state: 'visible' }); await local().check();
        await page.getByRole('textbox', { name: 'Connection endpoint draft' }).fill('https://changed.invalid/v1/chat/completions');
        expect(await allow().isDisabled()).toBe(true); expect((await view()).authorized).toBe(false);
        expect(requests.filter(row => row.path.endsWith('/credential-target/authorize'))).toHaveLength(0);
        await page.evaluate(() => { globalThis.draft = structuredClone(globalThis.saved); globalThis.mountReview(); });
        await inspection().click(); await local().waitFor({ state: 'visible' }); await local().check();
        const connection = await seeded.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
        await seeded.persistence.saveConnectionProfile(h.handle, { ...connection, options: { toolSchemaMode: 'string-enums' } });
        await allow().click(); await page.getByText('The saved connection or authorization changed.', { exact: false }).waitFor();
        expect(await allow().isDisabled()).toBe(true); expect((await view()).authorized).toBe(false);
        expect(requests.filter(row => row.path.endsWith('/credential-target/authorize'))).toHaveLength(1); expect(resolveSecret).not.toHaveBeenCalled(); expect(sends).toHaveLength(0);
    });

    test('saving a connection and probing an unapproved target never mint an implicit permit', async () => {
        const connection = await seeded.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
        await supertest(app).put('/api/native/generation/configuration/connections').send({ ...connection, displayName: 'Saved normally' }).expect(200);
        const current = await seeded.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
        expect((await view()).authorized).toBe(false);
        const probe = await supertest(app).post('/api/native/generation/connections/probe').send(current).expect(400);
        expect(probe.body.error).toBe('native_credential_target_approval_required'); expect((await view()).authorized).toBe(false);
        expect(resolveSecret).not.toHaveBeenCalled(); expect(sends).toHaveLength(0);
        await inspection().click(); await page.getByText('The saved connection changed.', { exact: false }).waitFor();
        expect(await allow().isDisabled()).toBe(true);
    });
}
if (process.env.ATRIA_TEST_BROWSER_CHANNEL) describe('Native credential target review in a real browser', () => { browserAcceptance(); });
// No browser installation is attempted by this opt-in acceptance suite.
// eslint-disable-next-line jest/no-disabled-tests
else describe.skip('Native credential target review requires ATRIA_TEST_BROWSER_CHANNEL', () => { browserAcceptance(); });

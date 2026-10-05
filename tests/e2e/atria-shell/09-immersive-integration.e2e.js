import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { createNativeId } from '../../../src/native/identity.js';
import { services } from '../../native/helpers/session-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession, openNativeSession, loadNativeSnapshot } from '../native-session/_helpers.js';

let server, seeded, legacy;
test.describe.configure({ mode: 'default' });
test.use({ actionTimeout: 15000 });

test.beforeAll(async () => {
    seeded = await seedNativeSessionDataRoot({ suffix: 'immersive-a5' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const dirs = { root, assets: resolve(root, 'assets') };
    const engine = new FsEngine({ directoriesByHandle: () => dirs });
    // An actual pre-Persona Session, persisted before the current server starts.
    legacy = await services({ engine, handle: seeded.handle, dirs }).core.create(seeded.handle, seeded.start);
    await engine.close();
    server = await startServer({ batchKey: 'regression', scenarioId: 'immersive-a5', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

async function boot(page, locale = 'en') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(locale => localStorage.setItem('language', locale), locale);
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: {} }));
    await page.goto(server.baseURL);
    await page.waitForFunction(() => performance.getEntriesByName('[init] complete').length > 0, null, { timeout: 45000 });
}
async function search(page, query, cached = false) {
    await page.evaluate(cached => window.Atria.shell.getShell().openCommand({ preserveError: cached }), cached);
    await page.getByRole('combobox', { name: 'Search commands' }).fill(query);
}
async function noOverflow(page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('A5 global search opens exact Persona, Knowledge and Save owners and returns the query after source retry', async ({ page }, info) => {
    await boot(page);
    const data = await page.evaluate(async knowledgeEntryId => {
        const { nativeProductClient: c } = await import('/scripts/native/product-client.js');
        const { PERSONA_EMPTY } = await import('/scripts/native/persona-ui.js');
        const content = { name: 'A5 exact player', description: 'Captured description', avatar: null, managementNotes: 'Private library note' };
        const original = await c.createPersona({ content, expectedFingerprint: PERSONA_EMPTY });
        const base = await c.createKnowledge('A5 knowledge');
        const entry = { knowledgeEntryId, content: 'A5 searchable testimony', metadata: { title: 'A5 exact lore' } };
        const knowledge = await c.commitKnowledgeRevision(base.knowledgeBaseId, { baseRevisionId: null, content: { entries: [entry] } });
        const work = (await c.listWorks())[0];
        const session = await c.startWork(work.package.packageId, { personaSelection: original.ref });
        const save = await c.createSave(session.session.sessionId, { kind: 'manual', displayName: 'A5 exact save' });
        await window.Atria.shell.getWorkspaceHost().refreshSearch();
        await c.revisePersona({ personaId: original.ref.personaId, content: { ...content, name: 'A5 latest player', description: 'Later description' }, expectedFingerprint: original.expectedFingerprint });
        return { original: original.ref, knowledge, entry, sessionId: session.session.sessionId, save };
    }, createNativeId('knowledgeEntry'));
    await search(page, 'A5 exact player', true);
    await page.locator('[data-atria-command-id^="persona."]').click();
    await expect(page.getByLabel('Persona name')).toHaveValue('A5 exact player');
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Captured description');
    await expect(page.locator('[data-atria-personas]')).toContainText(data.original.revisionId);
    await page.goBack();
    await expect(page.getByRole('combobox', { name: 'Search commands' })).toHaveValue('A5 exact player');
    await page.keyboard.press('Escape');
    await search(page, 'A5 exact lore');
    await page.locator('[data-atria-command-id^="entry."]').click();
    await expect(page.getByRole('article').filter({ hasText: 'A5 exact lore' })).toContainText('A5 searchable testimony');
    await expect(page).toHaveURL(new RegExp(data.entry.knowledgeEntryId));
    await page.goBack();
    await expect(page.getByRole('combobox', { name: 'Search commands' })).toHaveValue('A5 exact lore');
    await page.keyboard.press('Escape');
    await page.route('**/api/native/product/personas/list', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
    await search(page, 'A5 exact save');
    const status = page.locator('.atria-command-search-status');
    await expect(status).toContainText('Some results unavailable');
    await status.locator('summary').click();
    await expect(status).toContainText('Personas');
    await expect(page.locator('[data-atria-command-id^="save."]')).toHaveCount(1);
    await page.unroute('**/api/native/product/personas/list');
    await status.getByRole('button', { name: 'Retry · Personas', exact: true }).click();
    await expect(status).not.toContainText('Some results unavailable');
    await page.locator('[data-atria-command-id^="save."]').click();
    expect(await page.evaluate(() => ({ id: window.Atria.nativeSessionRuntime.snapshot.session.sessionId,
        revision: window.Atria.nativeSessionRuntime.snapshot.revision.revisionId, history: Boolean(window.Atria.nativeSessionRuntime.history) })))
        .toEqual({ id: data.sessionId, revision: data.save.revisionId, history: true });
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('search-save-history-390.png') });
    await search(page, 'Director');
    await page.locator('[data-atria-command-id^="orchestration."]').filter({ hasText: 'Director' }).click();
    await expect(page.locator('.workspace-preset-list button[aria-pressed="true"]')).toContainText('Director');
    await page.goBack();
    await expect(page.getByRole('combobox', { name: 'Search commands' })).toHaveValue('Director');
    await page.keyboard.press('Escape');
});

test('A5 existing Session remains legacy while new defaults, picker and portable Save retain exact snapshots', async ({ page }, info) => {
    await boot(page);
    const identity = await page.evaluate(async () => {
        const { nativeProductClient: c } = await import('/scripts/native/product-client.js');
        const { PERSONA_EMPTY } = await import('/scripts/native/persona-ui.js');
        const item = await c.createPersona({ expectedFingerprint: PERSONA_EMPTY,
            content: { name: 'A5 default player', description: 'A5 default description', avatar: null, managementNotes: 'A5 PRIVATE NOTE' } });
        const baseline = await c.readPersonaDefault();
        await c.setPersonaDefault({ selection: item.ref, expectedFingerprint: baseline.expectedFingerprint });
        return item;
    });
    await openNativeSession(page, legacy.session.sessionId);
    expect((await loadNativeSnapshot(page, legacy.session.sessionId)).states).not.toHaveProperty('atri_player_persona');
    const created = await createAndOpenNativeSession(page, seeded.start);
    const original = await loadNativeSnapshot(page, created.sessionId);
    expect(original.states.atri_player_persona.solo.ref).toEqual(identity.ref);
    await page.evaluate(async identity => {
        const { nativeProductClient: c } = await import('/scripts/native/product-client.js');
        const revised = await c.revisePersona({ personaId: identity.ref.personaId, expectedFingerprint: identity.expectedFingerprint,
            content: { name: 'A5 changed default', description: 'A5 changed description', avatar: identity.revision.avatar, managementNotes: identity.revision.managementNotes } });
        const baseline = await c.readPersonaDefault();
        await c.setPersonaDefault({ selection: revised.ref, expectedFingerprint: baseline.expectedFingerprint });
    }, identity);
    expect((await loadNativeSnapshot(page, created.sessionId)).states.atri_player_persona).toEqual(original.states.atri_player_persona);
    const composer = page.locator('#atria-play-composer');
    await composer.getByLabel('Message', { exact: true }).fill('A5 unsent draft');
    await composer.getByRole('button', { name: 'Choose Persona' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose Persona' });
    await picker.getByRole('button', { name: 'A5 changed default', exact: true }).click();
    await expect(picker).toHaveCount(0);
    await expect(composer.getByLabel('Message', { exact: true })).toHaveValue('A5 unsent draft');
    const selected = await loadNativeSnapshot(page, created.sessionId);
    expect(selected.states.atri_player_persona.solo.snapshot.name).toBe('A5 changed default');
    expect((await loadNativeSnapshot(page, created.sessionId, original.revision.revisionId)).states.atri_player_persona).toEqual(original.states.atri_player_persona);
    const restored = await page.evaluate(async sessionId => {
        const { nativeProductClient: c } = await import('/scripts/native/product-client.js');
        const archive = await c.exportSession(sessionId);
        const before = (await c.listPersonas({ includeArchived: true })).items.length;
        let conflict;
        try { await c.importSave(archive.data); } catch (error) { conflict = error.code; }
        if (conflict !== 'native_session_import_conflict') throw new Error('Existing Session import must require conflict review: ' + conflict);
        const unchanged = await window.Atria.nativeSessionRuntime.request('load', { sessionId });
        await c.deleteSession(sessionId);
        const imported = await c.importSave(archive.data);
        return { imported, unchanged, before, after: (await c.listPersonas({ includeArchived: true })).items.length };
    }, created.sessionId);
    expect(restored.unchanged).toEqual(selected);
    expect(restored.imported.states.atri_player_persona).toEqual(selected.states.atri_player_persona);
    expect(JSON.stringify(restored.imported)).not.toContain('A5 PRIVATE NOTE');
    expect(restored.after).toBe(restored.before);
    await openNativeSession(page, legacy.session.sessionId);
    expect(await loadNativeSnapshot(page, legacy.session.sessionId)).toEqual(legacy);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('legacy-session-390.png') });
});

test('A5 Chinese Persona controls keep real maximum font scale and picker focus across responsive boundaries', async ({ page }, info) => {
    await boot(page, 'zh-cn');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
        const control = document.getElementById('font_scale');
        control.value = control.max;
        window.$(control).trigger('input', { forced: true });
        document.documentElement.style.setProperty('--SmartThemeBlurTintColor', '#ffffff');
        window.$('#fast_ui_mode').prop('checked', true).trigger('change');
        window.Atria.shell.getWorkspaceHost().openLibrarySection('personas');
    });
    expect(await page.evaluate(async () => (await import('/scripts/power-user.js')).power_user.font_scale)).toBe(1.5);
    expect(await page.evaluate(async () => (await import('/scripts/power-user.js')).power_user.fast_ui_mode)).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
    await page.getByRole('button', { name: '新建用户设定', exact: true }).click();
    await page.getByLabel('设定姓名').fill('来自遥远群星的长期探险者');
    for (const [width, mode] of [[320, 'compact'], [719, 'compact'], [720, 'medium'], [1179, 'medium'], [1180, 'expanded']]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(page.locator('#atria-app-shell')).toHaveAttribute('data-atria-viewport', mode);
        await expect(page.getByLabel('设定姓名')).toHaveValue('来自遥远群星的长期探险者');
        await noOverflow(page);
    }
    page.once('dialog', dialog => dialog.accept());
    await createAndOpenNativeSession(page, seeded.start);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openPlay());
    await page.setViewportSize({ width: 320, height: 740 });
    const chooser = page.locator('[data-atria-persona-select]');
    await chooser.click();
    const picker = page.getByRole('dialog', { name: '选择用户设定' });
    await expect(picker.getByLabel('搜索用户设定')).toBeFocused();
    for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        expect(await picker.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Shift+Tab');
        expect(await picker.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('persona-zh-max-font-320.png') });
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(chooser).toBeFocused();
});

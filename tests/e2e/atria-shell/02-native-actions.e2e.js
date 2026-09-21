import { test, expect } from '@playwright/test';

import {
    appendConnectionProfile,
    bootstrapCustomBackend,
    disableExtensions,
    markOnboarded,
} from '../_lib/fixtures.js';
import { startMockLLM } from '../_lib/mockLLM.js';
import {
    abortGenerationViaUI,
    awaitMainUI,
    branchFromMessageViaUI,
    continueViaUI,
    deleteMessageViaUI,
    editMessageViaUI,
    getChatSnapshot,
    openOptionsAndClick,
    regenerateViaUI,
    selectCharacterProgrammatic,
    sendMessageAndAwaitReply,
    swipeRightOnLatest,
} from '../_lib/page.js';
import { startServer, tearDownServer } from '../_lib/server.js';

let server;
let mock;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    mock = await startMockLLM({ latencyMs: 1500 });
    server = await startServer({
        batchKey: 'regression',
        scenarioId: 'r7b-native-actions',
    });
    markOnboarded({ dataRoot: server.dataRoot });
    disableExtensions({
        dataRoot: server.dataRoot,
        names: ['stable-diffusion'],
    });
    bootstrapCustomBackend({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
    appendConnectionProfile({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
});

test.afterAll(async () => {
    await tearDownServer(server);
    await mock?.stop();
});

async function awaitR7BMainUI(page) {
    await awaitMainUI(page, server.baseURL);
    await page.waitForFunction(() => (
        window.Atria?.shell?.isMounted?.()
        && document.getElementById('atria-native-play-host')?.contains(document.getElementById('sheld'))
    ), null, { timeout: 15_000 });
}

async function assertSingleNativeOwnership(page) {
    const state = await page.evaluate(() => {
        const shell = document.getElementById('atria-app-shell');
        const stage = document.getElementById('atria-stage');
        const sheld = document.getElementById('sheld');
        const chat = document.getElementById('chat');
        const formSheld = document.getElementById('form_sheld');
        const sendForm = document.getElementById('send_form');
        const textarea = document.getElementById('send_textarea');
        return {
            sheld: document.querySelectorAll('#sheld').length,
            chat: document.querySelectorAll('#chat').length,
            sendForm: document.querySelectorAll('#send_form').length,
            textarea: document.querySelectorAll('#send_textarea').length,
            inShell: Boolean(shell?.contains(sheld)),
            inStage: Boolean(stage?.contains(sheld)),
            hierarchy: Boolean(
                chat?.parentElement === sheld
                && formSheld?.parentElement === sheld
                && sendForm?.parentElement === formSheld
                && sendForm?.contains(textarea),
            ),
        };
    });
    expect(state).toEqual({
        sheld: 1,
        chat: 1,
        sendForm: 1,
        textarea: 1,
        inShell: true,
        inStage: true,
        hierarchy: true,
    });
}

test.describe('R7B native Play action continuity', () => {
    test('send, continue, edit, regenerate, swipe, search, history, branch and delete stay native after reparent', async ({ page }) => {
        mock.scriptReply('*Seraphina nods.* "R7B-A: native send reached the real generation path."');
        mock.scriptReply(' "R7B-B: native continue extended the same reply."');
        mock.scriptReply('*Seraphina resets her answer.* "R7B-C: native regenerate replaced the active answer."');
        mock.scriptReply('*Seraphina tries another angle.* "R7B-D: native swipe produced another variant."');

        await awaitR7BMainUI(page);
        await selectCharacterProgrammatic(page, 'Seraphina');
        await page.waitForFunction(() => document.querySelectorAll('#chat .mes').length >= 1, null, { timeout: 10_000 });
        await assertSingleNativeOwnership(page);

        const first = await sendMessageAndAwaitReply(page, 'R7B native send check.');
        expect(first.text).toContain('R7B-A');

        const userId = first.replyId - 1;
        await editMessageViaUI(page, userId, 'R7B edited user message.');
        await expect(page.locator(`.mes[mesid="${userId}"] .mes_text`)).toContainText('R7B edited user message');

        await editMessageViaUI(page, first.replyId, 'R7B edited assistant message.');
        await expect(page.locator(`.mes[mesid="${first.replyId}"] .mes_text`)).toContainText('R7B edited assistant message');

        const beforeContinueCount = await page.locator('#chat .mes').count();
        const continued = await continueViaUI(page);
        expect(continued.text).toContain('R7B-B');
        await expect(page.locator('#chat .mes')).toHaveCount(beforeContinueCount);

        const regenerated = await regenerateViaUI(page);
        expect(regenerated.text || regenerated).toContain('R7B-C');
        await expect(page.locator('#chat .mes')).toHaveCount(beforeContinueCount);

        const swiped = await swipeRightOnLatest(page);
        await page.waitForFunction(({ id, marker }) => {
            const stop = document.getElementById('mes_stop');
            const text = document.querySelector(`.mes[mesid="${id}"] .mes_text`)?.textContent || '';
            return text.includes(marker)
                && (!stop || getComputedStyle(stop).display === 'none')
                && document.body.dataset.swiping !== 'true';
        }, { id: swiped.swipeId, marker: 'R7B-D' }, { timeout: 30_000 });
        await expect(page.locator(`.mes[mesid="${swiped.swipeId}"] .mes_text`)).toContainText('R7B-D');
        await assertSingleNativeOwnership(page);

        await openOptionsAndClick(page, 'option_search_chat');
        await expect(page.locator('#current_chat_tools_panel')).toBeVisible();
        await page.locator('#current_chat_tools_query').fill('R7B-D');
        await expect(page.locator('#chat .mes.chat_tools_match_found')).toHaveCount(1);
        await page.locator('#current_chat_tools_close').click();
        await expect(page.locator('#current_chat_tools_panel')).toBeHidden();

        await openOptionsAndClick(page, 'option_select_chat');
        await expect(page.locator('#shadow_select_chat_popup')).toBeVisible();
        await expect(page.locator('#select_chat_popup')).toBeVisible();
        await page.locator('#select_chat_cross').click();
        await expect(page.locator('#shadow_select_chat_popup')).toBeHidden();

        const beforeBranch = await getChatSnapshot(page);
        const branchAt = Number(await page.locator('#chat .last_mes').getAttribute('mesid'));
        expect(Number.isInteger(branchAt)).toBe(true);
        await branchFromMessageViaUI(page, branchAt);
        await page.waitForFunction(
            oldId => window.Atria.getContext().getCurrentChatId?.() !== oldId,
            beforeBranch.chatId,
            { timeout: 15_000 },
        );
        await assertSingleNativeOwnership(page);

        const beforeDeleteCount = await page.locator('#chat .mes').count();
        const deleteTarget = page.locator('#chat .mes[is_user="true"]').last();
        const deleteId = Number(await deleteTarget.getAttribute('mesid'));
        expect(Number.isInteger(deleteId)).toBe(true);
        await deleteMessageViaUI(page, deleteId);
        await expect(page.locator('#chat .mes')).toHaveCount(beforeDeleteCount - 1);
        await assertSingleNativeOwnership(page);
    });

    test('Stop aborts the one native generation source and the same Composer can send again', async ({ page }) => {
        mock.scriptReply(
            '*Seraphina begins a deliberately long reply for the R7B stop check. '
            + 'The lantern swings, the tide turns, and the sentence keeps going long enough to interrupt safely.',
        );
        mock.scriptReply('*Seraphina starts again.* "R7B recovery send succeeded after Stop."');

        await awaitR7BMainUI(page);
        await selectCharacterProgrammatic(page, 'Seraphina');
        await page.waitForFunction(() => document.querySelectorAll('#chat .mes').length >= 1, null, { timeout: 10_000 });
        await assertSingleNativeOwnership(page);

        await page.locator('#send_textarea').fill('R7B stop generation check.');
        await page.locator('#send_but:not(.displayNone)').waitFor({ state: 'visible', timeout: 30_000 });
        await page.evaluate(() => document.getElementById('send_but')?.click());
        await page.locator('#mes_stop').waitFor({ state: 'visible', timeout: 10_000 });
        await abortGenerationViaUI(page);
        await page.locator('#mes_stop').waitFor({ state: 'hidden', timeout: 15_000 });
        await page.waitForFunction(() => document.body.dataset.generating !== 'true', null, { timeout: 15_000 });
        await assertSingleNativeOwnership(page);

        const recovered = await sendMessageAndAwaitReply(page, 'R7B send after stop.');
        expect(recovered.text).toContain('R7B recovery send succeeded');
        await assertSingleNativeOwnership(page);
    });
});

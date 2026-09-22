import { test, expect } from '@playwright/test';

import { startServer, tearDownServer } from '../_lib/server.js';
import { startMockLLM } from '../_lib/mockLLM.js';
import { bootstrapCustomBackend } from '../_lib/fixtures.js';
import {
    abortGenerationViaUI,
    awaitMainUI,
    branchFromMessageViaUI,
    continueViaUI,
    deleteMessageViaUI,
    editMessageViaUI,
    regenerateViaUI,
    sendMessageAndAwaitReply,
    swipeRightOnLatest,
} from '../_lib/page.js';
import {
    assertR7NodesStable,
    createAndOpenNativeSession,
    loadNativeSnapshot,
    nativeRuntimeState,
    openNativeSession,
    rememberR7Nodes,
    seedNativeSessionDataRoot,
    snapshotLegacyPersistence,
    snapshotNativePersistence,
} from './_helpers.js';

const FAST_REPLIES = [
    '*The lantern bends toward the cobalt tide.* "The obsidian beacon is awake."',
    ' The lantern steadies as the second sentence arrives.',
    '*A second lantern answer arrives from the reef.* "This is the swipe alternative."',
    '*The regenerated lantern answer is colder and shorter.*',
    '*The lantern keeper reads the attached note and nods once.*',
];

let server;
let mock;
let seeded;

function sameOriginTrace(page, baseURL) {
    const trace = [];
    const origin = new URL(baseURL).origin;
    const listener = request => {
        const url = new URL(request.url());
        if (url.origin !== origin) return;
        trace.push({
            method: request.method(),
            path: url.pathname,
            body: request.postData() || '',
        });
    };
    page.on('request', listener);
    return { trace, stop: () => page.off('request', listener) };
}

function assertNoLegacyMutationRequests(trace) {
    const forbidden = trace.filter(request => {
        const path = request.path;
        return (
            /^\/api\/chats\/(save|append|patch|delete|rename|import)(?:\/|$)/.test(path)
            || /^\/api\/characters\/(create|edit|rename|delete|merge|import)(?:\/|$)/.test(path)
            || /^\/api\/worldinfo\/(edit|delete|import|create)(?:\/|$)/.test(path)
            || /^\/api\/files\/upload(?:\/|$)/.test(path)
        );
    });
    expect(forbidden, `Native session emitted legacy mutation requests: ${JSON.stringify(forbidden)}`).toEqual([]);
}

function expectStableR7Nodes(nodes) {
    for (const key of ['chat', 'textarea', 'send']) {
        expect(nodes[key]?.present, `${key} must remain mounted`).toBe(true);
        expect(nodes[key]?.same, `${key} DOM identity changed during Native projection`).toBe(true);
        expect(nodes[key]?.count, `${key} must stay unique`).toBe(1);
    }
    if (nodes.shell?.present) {
        expect(nodes.shell.same, 'R7 shell DOM identity changed during Native projection').toBe(true);
        expect(nodes.shell.count, 'R7 shell root must stay unique').toBe(1);
    }
}

function assertOpaqueIds(state) {
    expect(state.active).toBe(true);
    for (const [index, message] of state.messages.entries()) {
        expect(message.messageId, `message ${index} missing opaque Native messageId`).toBeTruthy();
        expect(message.variantIds.length, `message ${index} missing Native Variant IDs`).toBeGreaterThan(0);
        expect(message.variantIds[message.swipe_id ?? 0], `message ${index} active Variant is not bound`).toBeTruthy();
    }
}

async function waitForNativeIdle(page) {
    await page.waitForFunction(() => {
        const stop = document.querySelector('#mes_stop');
        return !stop || getComputedStyle(stop).display === 'none';
    }, { timeout: 30_000 });
    await page.waitForTimeout(150);
}

async function deleteOldestSwipeViaPicker(page) {
    await waitForNativeIdle(page);
    const counter = page.locator('#chat .last_mes .swipes-counter.swipe-picker-enabled').first();
    await counter.waitFor({ state: 'visible', timeout: 10_000 });
    await counter.click();

    const picker = page.locator('dialog.swipe_picker_popup[open]').last();
    await picker.waitFor({ state: 'visible', timeout: 10_000 });
    const row = picker.locator('.swipe_picker_block[data-swipe-id="0"]');
    const deleteButton = row.locator('.swipe_picker_delete:not(.disabled)');
    await deleteButton.waitFor({ state: 'visible', timeout: 10_000 });

    const before = (await nativeRuntimeState(page)).messages.at(-1).variantIds.length;
    await deleteButton.click();

    const confirm = page.locator('dialog.popup[open]').filter({ hasText: /delete swipe/i }).last();
    if (await confirm.isVisible().catch(() => false)) {
        await confirm.locator('.popup-button-ok').click();
    }

    await expect.poll(async () => (await nativeRuntimeState(page)).messages.at(-1).variantIds.length, {
        timeout: 20_000,
        message: 'Native Variant deletion did not persist',
    }).toBe(before - 1);

    await page.keyboard.press('Escape').catch(() => {});
}

async function attachTextFile(page, text) {
    await page.locator('#extensionsMenuButton').click();
    const attachItem = page.locator('#attachFile');
    await attachItem.waitFor({ state: 'visible', timeout: 5000 });
    await attachItem.click();
    await page.locator('#file_form_input').setInputFiles({
        name: 'n4-native-note.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(text, 'utf8'),
    });
    await page.locator('#file_form:not(.displayNone)').waitFor({ state: 'visible', timeout: 10_000 });
}

test.describe.serial('N4 Native Session live host acceptance', () => {
    test.beforeAll(async () => {
        seeded = await seedNativeSessionDataRoot({ suffix: 'live' });
        mock = await startMockLLM({ scriptedReplies: FAST_REPLIES });
        bootstrapCustomBackend({ dataRoot: seeded.dataRoot, baseURL: mock.baseURL });
        server = await startServer({
            batchKey: 'chat',
            scenarioId: 'native-session-n4-live',
            useExistingDataRoot: seeded.dataRoot,
        });
    });

    test.afterAll(async () => {
        await tearDownServer(server);
        await mock?.stop();
    });

    test('real SPA gestures persist only to Native stores and preserve R7 host identity', async ({ page }) => {
        test.setTimeout(180_000);
        await awaitMainUI(page, server.baseURL);
        await rememberR7Nodes(page);

        const legacyBefore = snapshotLegacyPersistence(server.dataRoot);
        const nativeBefore = snapshotNativePersistence(server.dataRoot);
        const requests = sameOriginTrace(page, server.baseURL);

        const opened = await createAndOpenNativeSession(page, seeded.start);
        expect(opened.sessionId).toBeTruthy();
        expectStableR7Nodes(await assertR7NodesStable(page));

        await page.evaluate(() => {
            const ctx = window.Atria.getContext();
            window.__n4StreamBinding = { id: null, ref: null };
            const handler = id => {
                window.__n4StreamBinding.id = id;
                window.__n4StreamBinding.ref = ctx.chat[id];
                try { ctx.eventSource.removeListener(ctx.eventTypes.MESSAGE_RECEIVED, handler); } catch { /* best effort */ }
            };
            ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, handler);
        });

        const requestStart = mock.requests.length;
        const first = await sendMessageAndAwaitReply(
            page,
            'N4-LORE [N4_PRE] Tell me what the beacon does when the tide rises.',
        );
        expect(first.text).toContain('LANTERN_NATIVE');

        await expect.poll(async () => page.evaluate(() => Boolean(window.__n4StreamBinding?.ref?.atri_native?.messageId)), {
            timeout: 20_000,
            message: 'streamed assistant object never received its opaque Native identity',
        }).toBe(true);
        const streamBinding = await page.evaluate(() => {
            const ctx = window.Atria.getContext();
            const binding = window.__n4StreamBinding;
            return {
                id: binding.id,
                sameObject: binding.ref === ctx.chat[binding.id],
                messageId: binding.ref?.atri_native?.messageId ?? null,
                variantIds: binding.ref?.atri_native?.variantIds ?? [],
            };
        });
        expect(streamBinding.sameObject, 'persist() replaced the streaming-owned message object').toBe(true);
        expect(streamBinding.messageId).toBeTruthy();
        expect(streamBinding.variantIds.length).toBeGreaterThan(0);

        const promptRequest = mock.requests.slice(requestStart).find(request => request.url.includes('chat/completions'));
        expect(promptRequest, 'mock LLM did not receive the Native generation request').toBeTruthy();
        const promptBody = JSON.stringify(promptRequest.body);
        expect(promptBody).toContain('N4_NATIVE_SYSTEM_PROMPT');
        expect(promptBody).toContain('N4_NATIVE_KNOWLEDGE_PAYLOAD');
        expect(promptBody).toContain('N4_PRE_APPLIED');
        expect(promptBody).not.toContain('[N4_PRE]');

        let state = await nativeRuntimeState(page);
        assertOpaqueIds(state);
        const userIndex = state.messages.findIndex(message => message.is_user);
        const assistantIndex = state.messages.length - 1;
        const originalUserId = state.messages[userIndex].messageId;
        const originalAssistantId = state.messages[assistantIndex].messageId;
        const assistantVariantAfterSend = state.messages[assistantIndex].variantIds[state.messages[assistantIndex].swipe_id];

        const continued = await continueViaUI(page);
        expect(continued.text).toContain('LANTERN_NATIVE');
        await waitForNativeIdle(page);
        await expect.poll(async () => (await nativeRuntimeState(page)).revisionId, { timeout: 20_000 }).not.toBe(opened.revisionId);
        state = await nativeRuntimeState(page);
        expect(state.messages.at(-1).messageId).toBe(originalAssistantId);
        expect(state.messages.at(-1).variantIds[state.messages.at(-1).swipe_id]).not.toBe(assistantVariantAfterSend);

        await editMessageViaUI(page, userIndex, 'N4-LORE N4_PRE_APPLIED — edited user message.');
        state = await nativeRuntimeState(page);
        expect(state.messages[userIndex].messageId).toBe(originalUserId);
        expect(state.messages[userIndex].mes).toContain('edited user message');

        await editMessageViaUI(page, assistantIndex, 'Edited assistant lantern response.');
        state = await nativeRuntimeState(page);
        expect(state.messages[assistantIndex].messageId).toBe(originalAssistantId);
        expect(state.messages[assistantIndex].mes).toContain('Edited assistant');

        const beforeSwipeCount = state.messages.at(-1).variantIds.length;
        await swipeRightOnLatest(page);
        await waitForNativeIdle(page);
        await expect.poll(async () => (await nativeRuntimeState(page)).messages.at(-1).variantIds.length, {
            timeout: 20_000,
        }).toBe(beforeSwipeCount + 1);
        state = await nativeRuntimeState(page);
        expect(state.messages.at(-1).messageId).toBe(originalAssistantId);

        const beforeRegenerateLength = state.messages.length;
        const beforeRegenerateVariants = state.messages.at(-1).variantIds.length;
        await regenerateViaUI(page);
        await waitForNativeIdle(page);
        await expect.poll(async () => (await nativeRuntimeState(page)).messages.at(-1).variantIds.length, {
            timeout: 20_000,
            message: 'regenerate did not become a Native swipe Variant',
        }).toBe(beforeRegenerateVariants + 1);
        state = await nativeRuntimeState(page);
        expect(state.messages.length, 'regenerate must not append another assistant message').toBe(beforeRegenerateLength);
        expect(state.messages.at(-1).messageId, 'regenerate must retain the Native message identity').toBe(originalAssistantId);

        await deleteOldestSwipeViaPicker(page);
        state = await nativeRuntimeState(page);
        expect(state.messages.at(-1).messageId).toBe(originalAssistantId);
        assertOpaqueIds(state);

        const attachmentText = 'N4_NATIVE_ATTACHMENT_PAYLOAD: cobalt tide attachment proof.';
        await attachTextFile(page, attachmentText);
        const attachRequestStart = mock.requests.length;
        await sendMessageAndAwaitReply(page, 'N4-LORE Read the attached Native note.');
        await waitForNativeIdle(page);
        state = await nativeRuntimeState(page);
        const attachedUserIndex = [...state.messages].map((message, index) => ({ message, index }))
            .reverse().find(item => item.message.is_user)?.index;
        expect(attachedUserIndex).toBeGreaterThanOrEqual(0);
        const attachedUser = state.messages[attachedUserIndex];
        expect(attachedUser.files.length).toBeGreaterThan(0);
        expect(attachedUser.files[0].assetId).toBeTruthy();
        expect(attachedUser.files[0].url).toMatch(/^\/api\/native\/session\/asset\//);

        const attachmentPrompt = mock.requests.slice(attachRequestStart).find(request => request.url.includes('chat/completions'));
        expect(attachmentPrompt).toBeTruthy();
        const attachmentBody = JSON.stringify(attachmentPrompt.body);
        expect(
            attachmentBody.includes('n4-native-note.txt') || attachmentBody.includes('N4_NATIVE_ATTACHMENT_PAYLOAD'),
            'Native attachment was not represented in the LLM prompt',
        ).toBe(true);

        const assetText = await page.evaluate(async url => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Native asset fetch failed (${response.status})`);
            return response.text();
        }, attachedUser.files[0].url);
        expect(assetText).toBe(attachmentText);

        state = await nativeRuntimeState(page);
        const preBranchRevisionId = state.revisionId;
        const preBranchBranchId = state.branchId;
        const branchAt = state.messages.findIndex(message => !message.is_user && message.messageId === originalAssistantId);
        expect(branchAt).toBeGreaterThanOrEqual(0);
        const fullHeadLength = state.messages.length;

        await branchFromMessageViaUI(page, branchAt);
        await expect.poll(async () => (await nativeRuntimeState(page)).branchId, {
            timeout: 20_000,
            message: 'Native branch did not become active',
        }).not.toBe(preBranchBranchId);
        const branchState = await nativeRuntimeState(page);
        const newBranchId = branchState.branchId;
        expect(branchState.messages.length).toBe(branchAt + 1);
        expect(branchState.sessionId).toBe(opened.sessionId);
        expectStableR7Nodes(await assertR7NodesStable(page));

        const historical = await openNativeSession(page, opened.sessionId, { revisionId: preBranchRevisionId });
        expect(historical.history).toBe(true);
        expect(historical.branchId, 'historical projection must use revision.branchId').toBe(preBranchBranchId);
        expect(historical.activeBranchId, 'session record should still point at the current active branch').toBe(newBranchId);
        expect(historical.branchId).not.toBe(historical.activeBranchId);
        expect((await nativeRuntimeState(page)).messages.length).toBe(fullHeadLength);

        const restoredHead = await openNativeSession(page, opened.sessionId);
        expect(restoredHead.history).toBe(false);
        expect(restoredHead.branchId).toBe(newBranchId);

        const queuedSwitch = await page.evaluate(async ({ oldBranchId, newBranchId }) => {
            const mod = await import('/script.js');
            const ctx = window.Atria.getContext();
            ctx.chat.at(-1).mes += ' N4_QUEUED_SWITCH_WRITE';
            const write = mod.nativeSessionRuntime.persist();
            const switching = mod.nativeSessionRuntime.switchBranch(oldBranchId);
            await Promise.all([write, switching]);
            const onOld = {
                branchId: mod.nativeSessionRuntime.snapshot.revision.branchId,
                failed: mod.nativeSessionRuntime.failed,
            };
            await mod.nativeSessionRuntime.switchBranch(newBranchId);
            return {
                onOld,
                branchId: mod.nativeSessionRuntime.snapshot.revision.branchId,
                text: ctx.chat.at(-1)?.mes || '',
            };
        }, { oldBranchId: preBranchBranchId, newBranchId });
        expect(queuedSwitch.onOld.branchId).toBe(preBranchBranchId);
        expect(queuedSwitch.onOld.failed).toBe(false);
        expect(queuedSwitch.branchId).toBe(newBranchId);
        expect(queuedSwitch.text).toContain('N4_QUEUED_SWITCH_WRITE');

        const beforeForcedFailure = await loadNativeSnapshot(page, opened.sessionId);
        let failedOnce = false;
        await page.route('**/api/native/session/command', async route => {
            if (!failedOnce) {
                failedOnce = true;
                await route.fulfill({
                    status: 409,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'n4_forced_stale_head' }),
                });
                return;
            }
            await route.continue();
        });

        const failure = await page.evaluate(async () => {
            const mod = await import('/script.js');
            const ctx = window.Atria.getContext();
            ctx.chat.at(-1).mes += ' N4_UNSAVED_FAILURE_MARKER';
            let firstError = '';
            let secondError = '';
            try { await mod.nativeSessionRuntime.persist(); } catch (error) { firstError = error.message; }
            try { await mod.nativeSessionRuntime.persist(); } catch (error) { secondError = error.message; }
            return { firstError, secondError, failed: mod.nativeSessionRuntime.failed };
        });
        expect(failure.firstError).toMatch(/409|reload required/i);
        expect(failure.secondError).toMatch(/not writable|reload/i);
        expect(failure.failed).toBe(true);
        await page.unroute('**/api/native/session/command');

        const afterFailedWrite = await loadNativeSnapshot(page, opened.sessionId);
        expect(afterFailedWrite.revision.revisionId).toBe(beforeForcedFailure.revision.revisionId);

        const recovered = await page.evaluate(async () => {
            const mod = await import('/script.js');
            await mod.nativeSessionRuntime.reload();
            const ctx = window.Atria.getContext();
            return {
                failed: mod.nativeSessionRuntime.failed,
                markerPresent: ctx.chat.some(message => String(message.mes || '').includes('N4_UNSAVED_FAILURE_MARKER')),
            };
        });
        expect(recovered.failed).toBe(false);
        expect(recovered.markerPresent).toBe(false);
        expectStableR7Nodes(await assertR7NodesStable(page));

        const legacyAfter = snapshotLegacyPersistence(server.dataRoot);
        const nativeAfter = snapshotNativePersistence(server.dataRoot);
        expect(legacyAfter, 'legacy chat/character/world/file stores changed during Native operations').toEqual(legacyBefore);
        expect(nativeAfter.resources, 'Native resource store must change after session operations').not.toBe(nativeBefore.resources);
        expect(nativeAfter.blobs, 'Native blob store must receive the attachment').not.toBe(nativeBefore.blobs);

        assertNoLegacyMutationRequests(requests.trace);
        expect(requests.trace.some(request => request.path === '/api/native/session/command')).toBe(true);
        expect(requests.trace.some(request => request.path === '/api/native/session/attachment')).toBe(true);
        requests.stop();

        await server.restart();
        await awaitMainUI(page, server.baseURL);
        const afterRestart = await openNativeSession(page, opened.sessionId);
        expect(afterRestart.branchId).toBe(newBranchId);
        const reloaded = await nativeRuntimeState(page);
        assertOpaqueIds(reloaded);
        expect(reloaded.messages.some(message => message.files.some(file => file.assetId))).toBe(true);
        expect(snapshotLegacyPersistence(server.dataRoot)).toEqual(legacyBefore);
    });

    test('Stop aborts a real Native generation and the runtime remains writable', async ({ page }) => {
        test.setTimeout(120_000);
        const slowSeed = await seedNativeSessionDataRoot({ suffix: 'stop' });
        const slowMock = await startMockLLM({
            scriptedReplies: [
                '*The lantern answer starts but should be aborted before it settles.*',
                '*The second lantern answer proves the Native session remained writable.*',
            ],
            latencyMs: 5000,
        });
        bootstrapCustomBackend({ dataRoot: slowSeed.dataRoot, baseURL: slowMock.baseURL });
        const slowServer = await startServer({
            batchKey: 'chat',
            scenarioId: 'native-session-n4-stop',
            useExistingDataRoot: slowSeed.dataRoot,
        });

        try {
            await awaitMainUI(page, slowServer.baseURL);
            const legacyBefore = snapshotLegacyPersistence(slowServer.dataRoot);
            const requests = sameOriginTrace(page, slowServer.baseURL);
            const opened = await createAndOpenNativeSession(page, slowSeed.start);

            await page.locator('#send_textarea').fill('Start a long Native answer that I can stop.');
            await page.locator('#send_but:not(.displayNone)').waitFor({ state: 'visible', timeout: 30_000 });
            await page.locator('#send_but').click();
            await page.waitForTimeout(700);
            await abortGenerationViaUI(page);
            await waitForNativeIdle(page);

            const stoppedState = await nativeRuntimeState(page);
            expect(stoppedState.sessionId).toBe(opened.sessionId);
            expect(stoppedState.failed).toBe(false);
            assertOpaqueIds(stoppedState);

            const followUp = await sendMessageAndAwaitReply(page, 'Now answer a short follow-up.', { timeoutMs: 30_000 });
            expect(followUp.text).toContain('LANTERN_NATIVE');
            await waitForNativeIdle(page);
            const finalState = await nativeRuntimeState(page);
            expect(finalState.failed).toBe(false);
            assertOpaqueIds(finalState);

            expect(snapshotLegacyPersistence(slowServer.dataRoot)).toEqual(legacyBefore);
            assertNoLegacyMutationRequests(requests.trace);
            expect(requests.trace.some(request => request.path === '/api/native/session/command')).toBe(true);
            requests.stop();
        } finally {
            await tearDownServer(slowServer);
            await slowMock.stop();
        }
    });
});

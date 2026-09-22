import { test, expect } from '@playwright/test';

import { startServer, tearDownServer } from '../_lib/server.js';
import { startMockLLM } from '../_lib/mockLLM.js';
import { bootstrapCustomBackend } from '../_lib/fixtures.js';
import {
    abortGenerationViaUI,
    awaitMainUI,
    branchFromMessageViaUI,
    continueViaUI,
    regenerateViaUI,
    sendMessageAndAwaitReply,
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
    '*The regenerated lantern answer is colder and shorter.*',
    '*The lantern keeper reads the attached note and nods once.*',
    '*The lantern answers the queued turn without touching old history.*',
];

let server;
let mock;
let seeded;
let mainSessionId;
let positiveHead;
let legacyBaseline;

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
    expect(forbidden, `Native Session emitted legacy mutation requests: ${JSON.stringify(forbidden)}`).toEqual([]);
}

function expectStableR7Nodes(nodes) {
    for (const key of ['sheld', 'chat', 'formSheld', 'sendForm', 'textarea']) {
        expect(nodes[key]?.present, `${key} must remain mounted`).toBe(true);
        expect(nodes[key]?.same, `${key} DOM identity changed during Native projection`).toBe(true);
        expect(nodes[key]?.count, `${key} must stay unique`).toBe(1);
    }
    if (nodes.send?.present) {
        expect(nodes.send.same, 'send button DOM identity changed during Native projection').toBe(true);
        expect(nodes.send.count).toBe(1);
    }
    if (nodes.shell?.present) {
        expect(nodes.shell.same, 'R7 shell DOM identity changed during Native projection').toBe(true);
        expect(nodes.shell.count).toBe(1);
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

async function clickCommittedEditAndConfirm(page, mesid, replacement) {
    const row = page.locator(`.mes[mesid="${mesid}"]`);
    await row.locator('.mes_edit').first().click({ force: true });
    const textarea = row.locator('.edit_textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 5000 });
    await textarea.fill(replacement);
    await row.locator('.mes_edit_done').first().click();
    await page.waitForTimeout(300);
}

async function clickCommittedDelete(page, mesid) {
    const row = page.locator(`.mes[mesid="${mesid}"]`);
    await row.locator('.mes_edit').first().click({ force: true });
    await row.locator('.mes_edit_delete').first().click({ force: true });
    await page.waitForTimeout(300);
    const cancel = row.locator('.mes_edit_cancel').first();
    if (await cancel.isVisible().catch(() => false)) await cancel.click();
}

async function clickManualSwipe(page, direction = 'left') {
    await page.evaluate(direction => {
        const selector = direction === 'left' ? '.last_mes .swipe_left' : '.last_mes .swipe_right';
        const el = document.querySelector(selector);
        if (!el) throw new Error(`${selector} not present`);
        el.click();
    }, direction);
    await page.waitForTimeout(300);
}

async function attemptSwipeDeleteViaPicker(page, swipeIndex = 0) {
    const counter = page.locator('#chat .last_mes .swipes-counter.swipe-picker-enabled').first();
    await counter.waitFor({ state: 'visible', timeout: 10_000 });
    await counter.click();
    const picker = page.locator('dialog.swipe_picker_popup[open]').last();
    await picker.waitFor({ state: 'visible', timeout: 10_000 });
    const row = picker.locator(`.swipe_picker_block[data-swipe-id="${swipeIndex}"]`);
    const del = row.locator('.swipe_picker_delete:not(.disabled)');
    await del.waitFor({ state: 'visible', timeout: 5000 });
    await del.click();

    const confirm = page.locator('dialog.popup[open]').filter({ hasText: /delete swipe/i }).last();
    if (await confirm.isVisible().catch(() => false)) {
        await confirm.locator('.popup-button-ok').click();
    }
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape').catch(() => {});
}

test.describe.serial('N4 Native Session immutable live-host acceptance', () => {
    test.beforeAll(async () => {
        seeded = await seedNativeSessionDataRoot({ suffix: 'immutable-live' });
        mock = await startMockLLM({ scriptedReplies: FAST_REPLIES });
        bootstrapCustomBackend({ dataRoot: seeded.dataRoot, baseURL: mock.baseURL });
        server = await startServer({
            batchKey: 'chat',
            scenarioId: 'native-session-n4-immutable-live',
            useExistingDataRoot: seeded.dataRoot,
        });
        legacyBaseline = snapshotLegacyPersistence(server.dataRoot);
    });

    test.afterAll(async () => {
        await tearDownServer(server);
        await mock?.stop();
    });

    test('positive: Send, Continue-as-entry, Retry-as-fork, Branch/Switch/History, attachment and prompt projection', async ({ page }) => {
        test.setTimeout(180_000);
        await awaitMainUI(page, server.baseURL);
        await rememberR7Nodes(page);
        const nativeBefore = snapshotNativePersistence(server.dataRoot);
        const requests = sameOriginTrace(page, server.baseURL);

        const opened = await createAndOpenNativeSession(page, seeded.start);
        mainSessionId = opened.sessionId;
        expectStableR7Nodes(await assertR7NodesStable(page));

        const promptStart = mock.requests.length;
        const first = await sendMessageAndAwaitReply(
            page,
            'N4-LORE [N4_PRE] Tell me what the beacon does when the tide rises.',
        );
        expect(first.text).toContain('LANTERN_NATIVE');
        await waitForNativeIdle(page);

        let state = await nativeRuntimeState(page);
        assertOpaqueIds(state);
        expect(state.messages.at(-1).is_user).toBe(false);
        const firstAssistant = state.messages.at(-1);
        const firstAssistantId = firstAssistant.messageId;
        const firstAssistantText = firstAssistant.mes;
        const branchBeforeContinue = state.branchId;

        const promptRequest = mock.requests.slice(promptStart).find(request => request.url.includes('chat/completions'));
        expect(promptRequest, 'mock LLM did not receive the Native generation request').toBeTruthy();
        const promptBody = JSON.stringify(promptRequest.body);
        expect(promptBody).toContain('N4_NATIVE_SYSTEM_PROMPT');
        expect(promptBody).toContain('N4_NATIVE_KNOWLEDGE_PAYLOAD');
        expect(promptBody).toContain('N4_PRE_APPLIED');
        expect(promptBody).not.toContain('[N4_PRE]');

        const beforeContinueLength = state.messages.length;
        await continueViaUI(page, { timeoutMs: 60_000 });
        await waitForNativeIdle(page);
        state = await nativeRuntimeState(page);
        expect(state.messages).toHaveLength(beforeContinueLength + 1);
        expect(state.messages[beforeContinueLength - 1]).toMatchObject({
            messageId: firstAssistantId,
            mes: firstAssistantText,
        });
        const continuation = state.messages.at(-1);
        expect(continuation.messageId).not.toBe(firstAssistantId);
        expect(continuation.is_user).toBe(false);

        let loaded = await loadNativeSnapshot(page, mainSessionId);
        const continuationEntry = loaded.timeline.at(-1);
        const continuationVariant = loaded.variants.find(item => item.variantId === continuationEntry.activeVariantId);
        expect(continuationVariant.metadata.provenance).toMatchObject({
            continuationOf: firstAssistantId,
            kind: 'continuation',
        });

        const preRetryRevisionId = state.revisionId;
        const preRetryBranchId = state.branchId;
        const retryTargetId = continuation.messageId;
        await regenerateViaUI(page, { timeoutMs: 60_000 });
        await waitForNativeIdle(page);
        state = await nativeRuntimeState(page);
        expect(state.branchId).not.toBe(preRetryBranchId);
        const retryBranchId = state.branchId;
        const retryAssistant = state.messages.at(-1);
        expect(retryAssistant.is_user).toBe(false);
        expect(retryAssistant.messageId).not.toBe(retryTargetId);
        expect(state.messages.some(message => message.messageId === retryTargetId)).toBe(false);

        const historicalRetrySource = await loadNativeSnapshot(page, mainSessionId, preRetryRevisionId);
        expect(historicalRetrySource.revision.branchId).toBe(preRetryBranchId);
        expect(historicalRetrySource.timeline.at(-1).messageId).toBe(retryTargetId);

        const retryRevisionId = state.revisionId;
        const retryAssistantIndex = state.messages.length - 1;
        await branchFromMessageViaUI(page, retryAssistantIndex);
        await expect.poll(async () => (await nativeRuntimeState(page)).branchId, {
            timeout: 20_000,
        }).not.toBe(retryBranchId);
        state = await nativeRuntimeState(page);
        const explicitBranchId = state.branchId;
        expect(state.messages.at(-1).messageId).toBe(retryAssistant.messageId);

        await page.evaluate(async branchId => {
            const mod = await import('/script.js');
            await mod.nativeSessionRuntime.switchBranch(branchId);
        }, retryBranchId);
        expect((await nativeRuntimeState(page)).branchId).toBe(retryBranchId);

        await page.evaluate(async branchId => {
            const mod = await import('/script.js');
            await mod.nativeSessionRuntime.switchBranch(branchId);
        }, explicitBranchId);
        expect((await nativeRuntimeState(page)).branchId).toBe(explicitBranchId);

        const history = await openNativeSession(page, mainSessionId, { revisionId: retryRevisionId });
        expect(history.history).toBe(true);
        expect(history.branchId).toBe(retryBranchId);
        expect(history.activeBranchId).toBe(explicitBranchId);
        expect(history.branchId).not.toBe(history.activeBranchId);
        const headAgain = await openNativeSession(page, mainSessionId);
        expect(headAgain.history).toBe(false);
        expect(headAgain.branchId).toBe(explicitBranchId);

        const attachmentText = 'N4_NATIVE_ATTACHMENT_PAYLOAD: cobalt tide attachment proof.';
        await attachTextFile(page, attachmentText);
        const attachmentPromptStart = mock.requests.length;
        await sendMessageAndAwaitReply(page, 'N4-LORE Read the attached Native note.');
        await waitForNativeIdle(page);
        state = await nativeRuntimeState(page);
        const attachedUser = [...state.messages].reverse().find(message => message.is_user);
        expect(attachedUser.files.length).toBeGreaterThan(0);
        expect(attachedUser.files[0].assetId).toBeTruthy();
        expect(attachedUser.files[0].url).toMatch(/^\/api\/native\/session\/asset\//);

        const attachmentPrompt = mock.requests.slice(attachmentPromptStart).find(request => request.url.includes('chat/completions'));
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

        // Queue an allowed append and a branch switch together. The switch
        // must wait for the append publication rather than racing/rebasing it.
        const branchWithQueuedAppend = (await nativeRuntimeState(page)).branchId;
        const switchTarget = retryBranchId;
        const queued = await page.evaluate(async ({ switchTarget }) => {
            const mod = await import('/script.js');
            const ctx = window.Atria.getContext();
            ctx.chat.push({
                name: 'Player',
                is_user: true,
                is_system: false,
                mes: 'N4_QUEUED_APPEND',
                extra: {},
            });
            const write = mod.nativeSessionRuntime.persist();
            const switching = mod.nativeSessionRuntime.switchBranch(switchTarget);
            await Promise.all([write, switching]);
            return {
                branchId: mod.nativeSessionRuntime.snapshot.revision.branchId,
                failed: mod.nativeSessionRuntime.failed,
            };
        }, { switchTarget });
        expect(queued).toEqual({ branchId: switchTarget, failed: false });

        await page.evaluate(async branchId => {
            const mod = await import('/script.js');
            await mod.nativeSessionRuntime.switchBranch(branchId);
        }, branchWithQueuedAppend);
        state = await nativeRuntimeState(page);
        expect(state.messages.some(message => message.mes === 'N4_QUEUED_APPEND')).toBe(true);

        await page.evaluate(async () => {
            const mod = await import('/script.js');
            await mod.nativeSessionRuntime.reload();
        });
        expectStableR7Nodes(await assertR7NodesStable(page));
        state = await nativeRuntimeState(page);
        assertOpaqueIds(state);
        positiveHead = {
            branchId: state.branchId,
            revisionId: state.revisionId,
        };

        const nativeAfter = snapshotNativePersistence(server.dataRoot);
        expect(nativeAfter.resources).not.toBe(nativeBefore.resources);
        expect(nativeAfter.blobs).not.toBe(nativeBefore.blobs);
        expect(snapshotLegacyPersistence(server.dataRoot)).toEqual(legacyBaseline);
        assertNoLegacyMutationRequests(requests.trace);
        expect(requests.trace.some(request => request.path === '/api/native/session/command')).toBe(true);
        expect(requests.trace.some(request => request.path === '/api/native/session/attachment')).toBe(true);
        requests.stop();

        // The original pre-continue branch still exists and can be loaded by
        // exact revision; this is canonical history, not a mutated message.
        const preContinueHistory = await loadNativeSnapshot(page, mainSessionId, preRetryRevisionId);
        expect(preContinueHistory.revision.branchId).toBe(branchBeforeContinue);
    });

    test('negative: committed Edit/Delete/Swipe/Swipe Delete/Variant switch/direct chat[] mutation cannot change Native authority', async ({ page }) => {
        test.setTimeout(120_000);
        await awaitMainUI(page, server.baseURL);
        await openNativeSession(page, mainSessionId);
        await rememberR7Nodes(page);

        let before = await loadNativeSnapshot(page, mainSessionId);
        const requests = sameOriginTrace(page, server.baseURL);
        let commandCount = requests.trace.filter(item => item.path === '/api/native/session/command').length;

        let state = await nativeRuntimeState(page);
        const assistantIndex = state.messages.findLastIndex(message => !message.is_user);
        const assistantText = state.messages[assistantIndex].mes;
        await clickCommittedEditAndConfirm(page, assistantIndex, 'N4_FORBIDDEN_EDIT');
        state = await nativeRuntimeState(page);
        expect(state.messages[assistantIndex].mes).toBe(assistantText);
        let after = await loadNativeSnapshot(page, mainSessionId);
        expect(after.revision.revisionId).toBe(before.revision.revisionId);
        expect(requests.trace.filter(item => item.path === '/api/native/session/command')).toHaveLength(commandCount);

        const lengthBeforeDelete = state.messages.length;
        await clickCommittedDelete(page, assistantIndex);
        state = await nativeRuntimeState(page);
        expect(state.messages).toHaveLength(lengthBeforeDelete);
        after = await loadNativeSnapshot(page, mainSessionId);
        expect(after.revision.revisionId).toBe(before.revision.revisionId);
        expect(requests.trace.filter(item => item.path === '/api/native/session/command')).toHaveLength(commandCount);

        // Open the N3-seeded two-Variant compatibility Session. N4 must render
        // it, but neither manual switch nor Swipe Delete may alter authority.
        await openNativeSession(page, seeded.compatibilitySession.sessionId);
        before = await loadNativeSnapshot(page, seeded.compatibilitySession.sessionId);
        state = await nativeRuntimeState(page);
        expect(state.messages[0].variantIds).toHaveLength(2);
        expect(state.messages[0].swipe_id).toBe(1);
        const selectedText = state.messages[0].mes;

        commandCount = requests.trace.filter(item => item.path === '/api/native/session/command').length;
        await clickManualSwipe(page, 'left');
        state = await nativeRuntimeState(page);
        expect(state.messages[0].swipe_id).toBe(1);
        expect(state.messages[0].mes).toBe(selectedText);
        after = await loadNativeSnapshot(page, seeded.compatibilitySession.sessionId);
        expect(after.revision.revisionId).toBe(before.revision.revisionId);
        expect(requests.trace.filter(item => item.path === '/api/native/session/command')).toHaveLength(commandCount);

        await attemptSwipeDeleteViaPicker(page, 0);
        state = await nativeRuntimeState(page);
        expect(state.messages[0].variantIds).toHaveLength(2);
        expect(state.messages[0].mes).toBe(selectedText);
        after = await loadNativeSnapshot(page, seeded.compatibilitySession.sessionId);
        expect(after.revision.revisionId).toBe(before.revision.revisionId);
        expect(requests.trace.filter(item => item.path === '/api/native/session/command')).toHaveLength(commandCount);

        // Simulate a third-party plugin bypassing the UI and directly changing
        // committed compatibility state. The write barrier must fail before
        // transport, leave Native authority unchanged, and require reload.
        const direct = await page.evaluate(async () => {
            const mod = await import('/script.js');
            const ctx = window.Atria.getContext();
            ctx.chat[0].swipe_id = 0;
            ctx.chat[0].mes = ctx.chat[0].swipes[0];
            let code = '';
            try {
                await mod.nativeSessionRuntime.persist();
            } catch (error) {
                code = error.code || error.message;
            }
            return { code, failed: mod.nativeSessionRuntime.failed };
        });
        expect(direct).toEqual({
            code: 'native_committed_timeline_mutation',
            failed: true,
        });
        expect(requests.trace.filter(item => item.path === '/api/native/session/command')).toHaveLength(commandCount);
        after = await loadNativeSnapshot(page, seeded.compatibilitySession.sessionId);
        expect(after.revision.revisionId).toBe(before.revision.revisionId);

        await page.evaluate(async () => {
            const mod = await import('/script.js');
            await mod.nativeSessionRuntime.reload();
        });
        state = await nativeRuntimeState(page);
        expect(state.failed).toBe(false);
        expect(state.messages[0].swipe_id).toBe(1);
        expect(state.messages[0].mes).toBe(selectedText);

        // Repeat direct mutation on canonical content, not only Variant state.
        before = await loadNativeSnapshot(page, seeded.compatibilitySession.sessionId);
        commandCount = requests.trace.filter(item => item.path === '/api/native/session/command').length;
        const contentMutation = await page.evaluate(async () => {
            const mod = await import('/script.js');
            const ctx = window.Atria.getContext();
            ctx.chat[0].mes = 'N4_FORBIDDEN_PLUGIN_REWRITE';
            ctx.chat[0].swipes[ctx.chat[0].swipe_id] = 'N4_FORBIDDEN_PLUGIN_REWRITE';
            let code = '';
            try {
                await mod.nativeSessionRuntime.persist();
            } catch (error) {
                code = error.code || error.message;
            }
            return { code, failed: mod.nativeSessionRuntime.failed };
        });
        expect(contentMutation.code).toBe('native_committed_timeline_mutation');
        expect(contentMutation.failed).toBe(true);
        expect(requests.trace.filter(item => item.path === '/api/native/session/command')).toHaveLength(commandCount);
        after = await loadNativeSnapshot(page, seeded.compatibilitySession.sessionId);
        expect(after.revision.revisionId).toBe(before.revision.revisionId);
        expect(after.timeline[0].content).toBe(selectedText);

        await page.evaluate(async () => {
            const mod = await import('/script.js');
            await mod.nativeSessionRuntime.reload();
        });

        expect(snapshotLegacyPersistence(server.dataRoot)).toEqual(legacyBaseline);
        assertNoLegacyMutationRequests(requests.trace);
        expectStableR7Nodes(await assertR7NodesStable(page));
        requests.stop();

        // Return to the positive session and prove the previous accepted HEAD
        // was not affected by compatibility-session rejection tests.
        await openNativeSession(page, mainSessionId);
        const restored = await nativeRuntimeState(page);
        expect(restored.branchId).toBe(positiveHead.branchId);
        expect(restored.revisionId).toBe(positiveHead.revisionId);
    });

    test('failure recovery: stale command cannot rebase or fall back to legacy persistence', async ({ page }) => {
        test.setTimeout(60_000);
        await awaitMainUI(page, server.baseURL);
        await openNativeSession(page, mainSessionId);
        const before = await loadNativeSnapshot(page, mainSessionId);
        const requests = sameOriginTrace(page, server.baseURL);
        let failedOnce = false;

        await page.route('**/api/native/session/command', async route => {
            if (!failedOnce) {
                failedOnce = true;
                await route.fulfill({
                    status: 409,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'native_session_head_conflict' }),
                });
                return;
            }
            await route.continue();
        });

        const result = await page.evaluate(async () => {
            const mod = await import('/script.js');
            const ctx = window.Atria.getContext();
            ctx.chat.push({
                name: 'Player',
                is_user: true,
                is_system: false,
                mes: 'N4_STALE_DRAFT',
                extra: {},
            });
            let first = '';
            let second = '';
            try { await mod.nativeSessionRuntime.persist(); } catch (error) { first = error.code || error.message; }
            try { await mod.nativeSessionRuntime.persist(); } catch (error) { second = error.code || error.message; }
            return { first, second, failed: mod.nativeSessionRuntime.failed };
        });

        expect(result.first).toBe('native_session_head_conflict');
        expect(result.second).toMatch(/not writable|reload/i);
        expect(result.failed).toBe(true);
        await page.unroute('**/api/native/session/command');

        const stored = await loadNativeSnapshot(page, mainSessionId);
        expect(stored.revision.revisionId).toBe(before.revision.revisionId);
        await page.evaluate(async () => {
            const mod = await import('/script.js');
            await mod.nativeSessionRuntime.reload();
        });
        const recovered = await nativeRuntimeState(page);
        expect(recovered.failed).toBe(false);
        expect(recovered.messages.some(message => message.mes === 'N4_STALE_DRAFT')).toBe(false);

        expect(snapshotLegacyPersistence(server.dataRoot)).toEqual(legacyBaseline);
        assertNoLegacyMutationRequests(requests.trace);
        requests.stop();
    });

    test('Stop discards an empty generation Draft and leaves HEAD at the committed post-user revision', async ({ page }) => {
        test.setTimeout(120_000);
        const slowSeed = await seedNativeSessionDataRoot({ suffix: 'stop-draft' });
        const slowMock = await startMockLLM({
            scriptedReplies: [
                '*This answer should be aborted before any useful token commits.*',
                '*The lantern answers the follow-up after the discarded draft.*',
            ],
            latencyMs: 5000,
        });
        bootstrapCustomBackend({ dataRoot: slowSeed.dataRoot, baseURL: slowMock.baseURL });
        const slowServer = await startServer({
            batchKey: 'chat',
            scenarioId: 'native-session-n4-stop-draft',
            useExistingDataRoot: slowSeed.dataRoot,
        });

        try {
            await awaitMainUI(page, slowServer.baseURL);
            const slowLegacyBaseline = snapshotLegacyPersistence(slowServer.dataRoot);
            const opened = await createAndOpenNativeSession(page, slowSeed.start);
            const requests = sameOriginTrace(page, slowServer.baseURL);

            await page.locator('#send_textarea').fill('Commit my user turn, then let me stop the Draft.');
            await page.locator('#send_but:not(.displayNone)').waitFor({ state: 'visible', timeout: 30_000 });
            await page.locator('#send_but').click();

            await expect.poll(async () => {
                const snapshot = await loadNativeSnapshot(page, opened.sessionId);
                return snapshot.timeline.at(-1)?.role;
            }, { timeout: 20_000 }).toBe('user');
            const postUser = await loadNativeSnapshot(page, opened.sessionId);
            const postUserRevisionId = postUser.revision.revisionId;

            await page.waitForTimeout(700);
            await abortGenerationViaUI(page);
            await waitForNativeIdle(page);
            await page.waitForTimeout(300);

            const stopped = await loadNativeSnapshot(page, opened.sessionId);
            expect(stopped.revision.revisionId).toBe(postUserRevisionId);
            expect(stopped.timeline.at(-1).role).toBe('user');
            expect(stopped.timeline.some(item => ['', '...'].includes(String(item.content || '').trim()))).toBe(false);

            const followUp = await sendMessageAndAwaitReply(page, 'Now answer the follow-up.', { timeoutMs: 30_000 });
            expect(followUp.text).toContain('LANTERN_NATIVE');
            await waitForNativeIdle(page);
            const final = await loadNativeSnapshot(page, opened.sessionId);
            expect(final.timeline.at(-1).role).toBe('assistant');

            expect(snapshotLegacyPersistence(slowServer.dataRoot)).toEqual(slowLegacyBaseline);
            assertNoLegacyMutationRequests(requests.trace);
            requests.stop();
        } finally {
            await tearDownServer(slowServer);
            await slowMock.stop();
        }
    });
});

import { makeTempFsEngineHarness, CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { installFixture, sessionFixture } from './helpers/session-fixture.js';
import {
    projectNativeSession,
    timelineIntents,
    projectKnowledgeEntries,
} from '../../public/scripts/native/session-projection.js';
import { NativeSessionRuntime } from '../../public/scripts/native/session-runtime.js';
import {
    NATIVE_SESSION_LIFECYCLE,
    onNativeSessionLifecycle,
    resetNativeSessionLifecycleForTesting,
} from '../../public/scripts/native/session-lifecycle.js';

describe.each(CONTRACT_HARNESSES)('N4 immutable runtime projection - $name', ({ make }) => {
    let h, f, runtime, messages, projection, reported;

    beforeEach(async () => {
        h = await make();
        f = await installFixture(h);
        const view = await f.core.create(h.handle, f.start);
        reported = [];
        runtime = new NativeSessionRuntime();
        runtime.configure({
            isGenerating: () => false,
            messages: () => messages,
            install: value => { projection = value; messages = value.chat; },
            revision: value => { projection = value; },
            error: (error, options) => reported.push({ error, options }),
        });
        runtime.request = async (path, body) => {
            if (path === 'load') return f.core.load(h.handle, body.sessionId, { revisionId: body.revisionId });
            const { command, expectedRevisionId } = body;
            if (command.type === 'fork') {
                return f.core.forkBranch(h.handle, body.sessionId, { ...command, expectedRevisionId });
            }
            if (command.type === 'retry') {
                return f.core.retryReply(h.handle, body.sessionId, {
                    messageId: command.messageId,
                    expectedRevisionId,
                });
            }
            if (command.type === 'switch') {
                return f.core.switchBranch(h.handle, body.sessionId, command.branchId, { expectedRevisionId });
            }
            if (command.type === 'restore') {
                return f.core.restoreSavePoint(h.handle, body.sessionId, command.saveId, { expectedRevisionId });
            }
            if (command.type === 'runtime') {
                return f.core.applyRuntimeCommit(h.handle, body.sessionId, {
                    commands: command.commands ?? [],
                    statePatch: command.statePatch ?? {},
                    deleteNamespaces: command.deleteNamespaces ?? [],
                }, { expectedRevisionId });
            }
            return f.core.applyTimelineCommands(h.handle, body.sessionId, command.commands, { expectedRevisionId });
        };
        await runtime.open(view.session.sessionId);
    });

    afterEach(async () => {
        resetNativeSessionLifecycleForTesting();
        await h?.cleanup();
    });

    async function appendUser(text = 'Explore') {
        messages.push({ name: 'Player', is_user: true, is_system: false, mes: text, extra: {} });
        await runtime.persist();
        return messages.at(-1);
    }

    async function generateAssistant(text = 'The harbor is quiet.') {
        expect(await runtime.prepareGeneration('normal')).toBe('normal');
        messages.push({ name: 'Actor', is_user: false, is_system: false, mes: text, extra: {} });
        await runtime.persist();
        return messages.at(-1);
    }

    test('N5 revision-backed variables and lifecycle use stable Native identities', async () => {
        const events = [];
        for (const type of Object.values(NATIVE_SESSION_LIFECYCLE)) {
            onNativeSessionLifecycle(type, event => events.push(event));
        }

        let variables = { route: 'harbor' };
        runtime.host.runtimeState = () => ({
            atri_variables: { schemaVersion: 1, values: variables },
        });

        messages.push({ name: 'Player', is_user: true, is_system: false, mes: 'Track state', extra: {} });
        await runtime.persist();

        const messageId = runtime.snapshot.timeline.at(-1).messageId;
        expect(messageId).toMatch(/^msg_[a-f0-9]{32}$/);
        expect(runtime.snapshot.states.atri_variables).toEqual({
            schemaVersion: 1,
            values: { route: 'harbor' },
        });
        const appended = events.find(event => event.type === NATIVE_SESSION_LIFECYCLE.TIMELINE_APPENDED);
        expect(appended.messageIds).toContain(messageId);
        expect(events.some(event => event.type === NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED)).toBe(true);

        variables = { route: 'market' };
        const stateOnly = await runtime.updateState('atri_variables', current => ({
            ...current,
            values: variables,
        }));
        expect(stateOnly.updated).toBe(true);
        expect(runtime.snapshot.states.atri_variables.values.route).toBe('market');

        const beforeReload = events.length;
        await runtime.reload();
        expect(events.slice(beforeReload).some(event => event.type === NATIVE_SESSION_LIFECYCLE.SESSION_LOADED)).toBe(true);

        expect(await runtime.prepareGeneration('normal')).toBe('normal');
        await runtime.finalizeStoppedGeneration();
        expect(events.some(event => event.type === NATIVE_SESSION_LIFECYCLE.DRAFT_ABORTED)).toBe(true);
    });


    test('N5 restore publishes lifecycle and reinstalls Revision-backed state projection', async () => {
        const events = [];
        for (const type of Object.values(NATIVE_SESSION_LIFECYCLE)) {
            onNativeSessionLifecycle(type, event => events.push(event));
        }

        await runtime.updateState('atri_variables', () => ({
            schemaVersion: 1,
            values: { route: 'saved' },
        }));
        const savedRevisionId = runtime.snapshot.revision.revisionId;
        const save = await f.core.createSavePoint(
            h.handle,
            runtime.snapshot.session.sessionId,
            { revisionId: savedRevisionId, kind: 'quick' },
        );

        await runtime.updateState('atri_variables', () => ({
            schemaVersion: 1,
            values: { route: 'later' },
        }));
        expect(runtime.snapshot.states.atri_variables.values.route).toBe('later');

        const beforeRestoreEvents = events.length;
        await runtime.restoreSavePoint(save.saveId);

        expect(runtime.snapshot.states.atri_variables.values.route).toBe('saved');
        expect(projection.metadata.variables.route).toBe('saved');
        const restoreEvents = events.slice(beforeRestoreEvents);
        expect(restoreEvents.map(event => event.type)).toEqual(expect.arrayContaining([
            NATIVE_SESSION_LIFECYCLE.REVISION_RESTORED,
            NATIVE_SESSION_LIFECYCLE.BRANCH_ACTIVATED,
            NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED,
        ]));
        const restoredEvent = restoreEvents.find(event => event.type === NATIVE_SESSION_LIFECYCLE.REVISION_RESTORED);
        expect(restoredEvent).toMatchObject({
            sessionId: runtime.snapshot.session.sessionId,
            revisionId: runtime.snapshot.revision.revisionId,
            branchId: runtime.snapshot.revision.branchId,
            saveId: save.saveId,
        });
        expect(restoredEvent.previousRevisionId).not.toBe(runtime.snapshot.revision.revisionId);
    });

    test('Send/generation append immutable entries and preserve opaque identities', async () => {
        const greetingId = messages[0].atri_native.messageId;
        const user = await appendUser();
        const userId = user.atri_native.messageId;
        const assistant = await generateAssistant();
        const assistantId = assistant.atri_native.messageId;

        expect(runtime.snapshot.timeline.map(item => item.content)).toEqual([
            'Opening',
            'Explore',
            'The harbor is quiet.',
        ]);
        expect(messages[0].atri_native.messageId).toBe(greetingId);
        expect(messages[1].atri_native.messageId).toBe(userId);
        expect(messages[2].atri_native.messageId).toBe(assistantId);
        expect(timelineIntents(runtime.snapshot, messages)).toEqual([]);

        const revision = runtime.snapshot.revision.revisionId;
        await runtime.reload();
        expect(runtime.snapshot.revision.revisionId).toBe(revision);
        expect(messages.map(item => item.atri_native.messageId)).toEqual([greetingId, userId, assistantId]);
    });

    test('real send lifecycle commits user revision before assistant while keeping generation Draft open', async () => {
        expect(await runtime.prepareGeneration('normal')).toBe('normal');
        expect(runtime.generation).toMatchObject({ kind: 'append' });

        messages.push({ name: 'Player', is_user: true, is_system: false, mes: 'Real UI user turn', extra: {} });
        await runtime.persist();
        const postUserRevision = runtime.snapshot.revision.revisionId;
        const userId = runtime.snapshot.timeline.at(-1).messageId;
        expect(runtime.snapshot.timeline.at(-1)).toMatchObject({ role: 'user', content: 'Real UI user turn' });
        expect(runtime.generation).toMatchObject({ kind: 'append' });

        messages.push({ name: 'Actor', is_user: false, is_system: false, mes: 'Real UI assistant reply', extra: {} });
        await runtime.persist();
        expect(runtime.snapshot.revision.revisionId).not.toBe(postUserRevision);
        expect(runtime.snapshot.timeline.at(-1)).toMatchObject({ role: 'assistant', content: 'Real UI assistant reply' });
        expect(runtime.generation).toBeNull();

        const exactPostUser = await f.core.load(h.handle, runtime.snapshot.session.sessionId, { revisionId: postUserRevision });
        expect(exactPostUser.timeline.at(-1).messageId).toBe(userId);
        expect(exactPostUser.timeline.at(-1).role).toBe('user');
    });

    test('Stop before assistant placeholder clears generation at the committed post-user revision', async () => {
        expect(await runtime.prepareGeneration('normal')).toBe('normal');

        messages.push({ name: 'Player', is_user: true, is_system: false, mes: 'Stop before assistant placeholder', extra: {} });
        await runtime.persist();
        const postUserRevision = runtime.snapshot.revision.revisionId;
        expect(runtime.generation).toMatchObject({ kind: 'append' });
        expect(runtime.snapshot.timeline.at(-1)).toMatchObject({ role: 'user', content: 'Stop before assistant placeholder' });

        await runtime.finalizeStoppedGeneration();

        expect(runtime.snapshot.revision.revisionId).toBe(postUserRevision);
        expect(runtime.snapshot.timeline.at(-1)).toMatchObject({ role: 'user', content: 'Stop before assistant placeholder' });
        expect(runtime.generation).toBeNull();
        expect(messages.at(-1).is_user).toBe(true);
    });

    test('empty assistant Draft after committed user turn is discarded without advancing HEAD', async () => {
        expect(await runtime.prepareGeneration('normal')).toBe('normal');

        messages.push({ name: 'Player', is_user: true, is_system: false, mes: 'Stop after this user turn', extra: {} });
        await runtime.persist();
        const postUserRevision = runtime.snapshot.revision.revisionId;
        expect(runtime.generation).toMatchObject({ kind: 'append' });

        messages.push({ name: 'Actor', is_user: false, is_system: false, mes: '...', extra: {} });
        await runtime.persist();

        expect(runtime.snapshot.revision.revisionId).toBe(postUserRevision);
        expect(runtime.snapshot.timeline.at(-1)).toMatchObject({ role: 'user', content: 'Stop after this user turn' });
        expect(messages.at(-1).is_user).toBe(true);
        expect(runtime.generation).toBeNull();
    });

    test('Continue keeps the committed assistant immutable and appends continuationOf entry', async () => {
        await appendUser();
        const assistant = await generateAssistant('The harbor');
        const assistantId = assistant.atri_native.messageId;
        const assistantRevision = runtime.snapshot.revision.revisionId;
        const assistantCount = runtime.snapshot.timeline.length;

        expect(await runtime.prepareGeneration('continue')).toBe('continue');
        const draft = messages.at(-1);
        draft.mes = 'The harbor is quiet.';
        draft.swipes[draft.swipe_id] = draft.mes;
        await runtime.persist();

        expect(runtime.snapshot.timeline).toHaveLength(assistantCount + 1);
        expect(runtime.snapshot.timeline[assistantCount - 1]).toMatchObject({
            messageId: assistantId,
            content: 'The harbor',
        });
        const continuation = runtime.snapshot.timeline.at(-1);
        expect(continuation.messageId).not.toBe(assistantId);
        expect(continuation.role).toBe('assistant');
        expect(continuation.content).toBe(' is quiet.');

        const activeVariant = runtime.snapshot.variants.find(item => item.variantId === continuation.activeVariantId);
        expect(activeVariant.metadata.provenance).toMatchObject({
            continuationOf: assistantId,
            kind: 'continuation',
        });

        const historical = await f.core.load(h.handle, runtime.snapshot.session.sessionId, { revisionId: assistantRevision });
        expect(historical.timeline.at(-1)).toMatchObject({ messageId: assistantId, content: 'The harbor' });
    });

    test('Retry Reply forks from exact post-user revision and appends a new assistant message', async () => {
        const originalBranch = runtime.snapshot.revision.branchId;
        const user = await appendUser('Ask again');
        const postUserRevision = runtime.snapshot.revision.revisionId;
        const userId = user.atri_native.messageId;
        const original = await generateAssistant('First answer');
        const originalMessageId = original.atri_native.messageId;
        const originalRevision = runtime.snapshot.revision.revisionId;

        expect(await runtime.prepareGeneration('regenerate')).toBe('normal');
        expect(runtime.snapshot.revision.branchId).not.toBe(originalBranch);
        expect(runtime.snapshot.timeline.at(-1)).toMatchObject({ messageId: userId, content: 'Ask again' });
        expect(runtime.snapshot.timeline.some(item => item.messageId === originalMessageId)).toBe(false);

        messages.push({ name: 'Actor', is_user: false, is_system: false, mes: 'Retry answer', extra: {} });
        await runtime.persist();
        const retry = runtime.snapshot.timeline.at(-1);
        expect(retry.role).toBe('assistant');
        expect(retry.content).toBe('Retry answer');
        expect(retry.messageId).not.toBe(originalMessageId);

        const postUser = await f.core.load(h.handle, runtime.snapshot.session.sessionId, { revisionId: postUserRevision });
        expect(postUser.timeline.at(-1).messageId).toBe(userId);
        const oldReply = await f.core.load(h.handle, runtime.snapshot.session.sessionId, { revisionId: originalRevision });
        expect(oldReply.revision.branchId).toBe(originalBranch);
        expect(oldReply.timeline.at(-1)).toMatchObject({ messageId: originalMessageId, content: 'First answer' });
    });

    test('direct committed content mutation fails closed and reload restores Native authority', async () => {
        await appendUser();
        await generateAssistant();
        const before = runtime.snapshot.revision.revisionId;
        messages.at(-1).mes = 'plugin rewrote committed history';

        await expect(runtime.persist()).rejects.toMatchObject({ code: 'native_committed_timeline_mutation' });
        expect(runtime.failed).toBe(true);
        expect(reported.at(-1)?.options).toMatchObject({ fatal: true });

        const stored = await f.core.load(h.handle, runtime.snapshot.session.sessionId);
        expect(stored.revision.revisionId).toBe(before);
        expect(stored.timeline.at(-1).content).toBe('The harbor is quiet.');

        await runtime.reload();
        expect(runtime.failed).toBe(false);
        expect(messages.at(-1).mes).toBe('The harbor is quiet.');
    });

    test('committed deletion/reorder is never translated into remove/revise commands', async () => {
        await appendUser();
        await generateAssistant();
        const before = runtime.snapshot.revision.revisionId;
        const removed = messages.splice(1, 1)[0];

        await expect(runtime.persist()).rejects.toMatchObject({ code: 'native_committed_timeline_mutation' });
        const stored = await f.core.load(h.handle, runtime.snapshot.session.sessionId);
        expect(stored.revision.revisionId).toBe(before);
        expect(stored.timeline.some(item => item.messageId === removed.atri_native.messageId)).toBe(true);

        await runtime.reload();
        const first = messages[0];
        messages[0] = messages[1];
        messages[1] = first;
        await expect(runtime.persist()).rejects.toMatchObject({ code: 'native_committed_timeline_mutation' });
    });

    test('N3 Variant compatibility data cannot be switched or deleted by the N4 runtime', async () => {
        const sessionId = runtime.snapshot.session.sessionId;
        const greeting = runtime.snapshot.timeline[0];
        await f.core.addVariant(h.handle, sessionId, greeting.messageId, {
            content: 'Alternate opening',
            metadata: {},
        }, { expectedRevisionId: runtime.snapshot.revision.revisionId });
        await runtime.reload();

        expect(messages[0].swipes).toHaveLength(2);
        expect(messages[0].swipe_id).toBe(1);
        const before = runtime.snapshot.revision.revisionId;

        messages[0].swipe_id = 0;
        messages[0].mes = messages[0].swipes[0];
        await expect(runtime.persist()).rejects.toMatchObject({ code: 'native_committed_timeline_mutation' });
        expect((await f.core.load(h.handle, sessionId)).revision.revisionId).toBe(before);

        await runtime.reload();
        messages[0].swipes.splice(0, 1);
        messages[0].swipe_info.splice(0, 1);
        messages[0].atri_native.variantIds.splice(0, 1);
        messages[0].swipe_id = 0;
        await expect(runtime.persist()).rejects.toMatchObject({ code: 'native_committed_timeline_mutation' });
        expect((await f.core.load(h.handle, sessionId)).revision.revisionId).toBe(before);
    });

    test('historical projection uses revision.branchId, stays read-only, and can fork without Variant switching', async () => {
        const oldRevision = runtime.snapshot.revision;
        const originalBranch = oldRevision.branchId;
        await appendUser('Later');
        const branch = await runtime.fork(0);

        expect(runtime.snapshot.timeline).toHaveLength(1);
        expect(runtime.snapshot.graph.at(-1).branch.forkPoint.messageId).toBe(messages[0].atri_native.messageId);

        await runtime.open(runtime.snapshot.session.sessionId, { revisionId: oldRevision.revisionId });
        expect(runtime.snapshot.session.activeBranchId).toBe(branch);
        expect(projection.branchId).toBe(originalBranch);
        expect(() => runtime.persist()).toThrow('not writable');

        const historicalFork = await runtime.fork(0);
        expect(historicalFork).not.toBe(branch);
        await runtime.switchBranch(originalBranch);
        expect(runtime.snapshot.timeline.at(-1).content).toBe('Later');
    });

    test('stale HEAD with a new Draft fails closed without legacy rebase/retry', async () => {
        await appendUser();
        await f.core.appendTimeline(h.handle, runtime.snapshot.session.sessionId, {
            role: 'assistant',
            actorId: runtime.snapshot.entryPoint.primaryActorId ?? runtime.snapshot.entryPoint.actorIds[0],
            content: 'Other writer',
        });
        messages.push({ name: 'Actor', is_user: false, is_system: false, mes: 'Stale draft', extra: {} });

        await expect(runtime.persist()).rejects.toMatchObject({ code: 'native_session_head_conflict' });
        expect(runtime.failed).toBe(true);
        await runtime.reload();
        expect(runtime.snapshot.timeline.at(-1).content).toBe('Other writer');
    });

    test('runtime command surface rejects committed mutation commands without partial publication', async () => {
        const view = runtime.snapshot;
        for (const command of [
            { type: 'remove', messageId: view.timeline[0].messageId },
            { type: 'select', messageId: view.timeline[0].messageId, variantId: view.timeline[0].activeVariantId },
            { type: 'revise', messageId: view.timeline[0].messageId, draft: { content: 'rewrite' } },
            { type: 'removeVariant', messageId: view.timeline[0].messageId, variantId: view.timeline[0].activeVariantId },
            { type: 'append', beforeMessageId: view.timeline[0].messageId, draft: { role: 'user', content: 'insert' } },
        ]) {
            await expect(f.core.applyTimelineCommands(
                h.handle,
                view.session.sessionId,
                [command],
                { expectedRevisionId: view.revision.revisionId },
            )).rejects.toThrow(/append-only/i);
            expect((await f.core.load(h.handle, view.session.sessionId)).revision.revisionId).toBe(view.revision.revisionId);
        }
    });
});

describe('N4 pure projection authority', () => {
    let h;
    beforeEach(async () => { h = await makeTempFsEngineHarness(); });
    afterEach(async () => { await h.cleanup(); });

    test('Actor prompt fields, exact Knowledge candidates and Regex derive only from installed content', async () => {
        const fixture = sessionFixture();
        fixture.manifest.actors[0].profile = { description: 'Harbor guide', personality: 'Calm', scenario: 'Moonlit pier' };
        fixture.manifest.processors = { regex: [{ scriptName: 'Display', findRegex: 'pier', replaceString: 'dock' }] };
        const f = await installFixture(h, fixture);
        const view = await f.core.create(h.handle, f.start);
        expect(projectNativeSession(view).character.data).toMatchObject({ description: 'Harbor guide', scenario: 'Moonlit pier' });
        const entries = projectKnowledgeEntries(view);
        expect(entries[0].content).toBe('Exact knowledge');
        expect(entries[0].atri_native).toMatchObject({
            knowledgeRevisionId: fixture.knowledge.revision.knowledgeRevisionId,
            knowledgeEntryId: fixture.knowledge.entries[0].knowledgeEntryId,
        });
        expect(entries[0].uid).toBe(0);
        view.knowledge.bindings[0].visibility = ['private-actor'];
        expect(projectKnowledgeEntries(view)).toEqual([]);
    });

    test('presentation-only display_text overlay is outside committed Timeline authority', async () => {
        const f = await installFixture(h);
        const view = await f.core.create(h.handle, f.start);
        const projected = projectNativeSession(view).chat;

        projected[0].extra.display_text = 'Translated presentation cache';
        expect(timelineIntents(view, projected)).toEqual([]);
    });

    test('unknown identity, path-only attachment and direct committed mutation fail closed', async () => {
        const f = await installFixture(h);
        const view = await f.core.create(h.handle, f.start);

        const unknown = projectNativeSession(view).chat;
        unknown[0].atri_native.messageId = 'message_00000000000000000000000000';
        expect(() => timelineIntents(view, unknown)).toThrow(/committed|identity/i);

        const attachment = projectNativeSession(view).chat;
        attachment[0].extra.files = [{ url: '/user/files/old.txt' }];
        try {
            timelineIntents(view, attachment);
            throw new Error('expected non-canonical attachment violation');
        } catch (error) {
            expect(error).toMatchObject({ code: 'native_committed_timeline_mutation' });
        }

        const changed = projectNativeSession(view).chat;
        changed[0].mes = 'rewritten';
        try {
            timelineIntents(view, changed);
            throw new Error('expected immutable Timeline violation');
        } catch (error) {
            expect(error).toMatchObject({ code: 'native_committed_timeline_mutation' });
        }
    });
});

import { makeTempFsEngineHarness, CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { installFixture, sessionFixture } from './helpers/session-fixture.js';
import {
    projectNativeSession,
    timelineIntents,
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

    test('N7 derived publication stages with Draft and degrades stale async work without failing Session', async () => {
        const sourceRevisionId = runtime.snapshot.revision.revisionId;
        const sourceMessage = runtime.snapshot.timeline[0];

        runtime.generation = { kind: 'append' };
        const staged = await runtime.openCommitment({
            commitmentId: 'commitment-native-test',
            content: 'Keep the harbor gate open.',
            importance: 95,
            sourceRefs: [{
                kind: 'timeline',
                messageId: sourceMessage.messageId,
                branchId: sourceMessage.branchId,
                revisionId: sourceRevisionId,
                sequence: sourceMessage.sequence,
            }],
        });
        expect(staged).toMatchObject({ ok: true, staged: true, published: false });
        expect(runtime.readState('atri_context_derived').commitments[0].commitmentId)
            .toBe('commitment-native-test');

        runtime.generation = null;
        runtime._clearStagedStates();
        const previous = runtime.snapshot;
        await runtime.updateState('atri_test_advance', current => ({ ...current, turn: 1 }));
        const stale = await runtime.appendTurnDigest({
            revisionId: previous.revision.revisionId,
            producer: 'utility',
            sourceRefs: [{
                kind: 'timeline',
                messageId: sourceMessage.messageId,
                branchId: sourceMessage.branchId,
                revisionId: previous.revision.revisionId,
                sequence: sourceMessage.sequence,
            }],
            coverage: { fromSequence: 0, toSequence: 0 },
        });
        expect(stale).toMatchObject({ ok: false, published: false, reason: 'stale_revision' });
        expect(runtime.failed).toBe(false);
    });

    test('Native Knowledge previews are detached, accepted effects are Draft-local and stale evaluations fail closed', async () => {
        await appendUser('Harbor');
        const head = runtime.snapshot.revision.revisionId;
        const preview = await runtime.evaluateKnowledge({ messages: ['Harbor'], budget: 1000 });
        expect(preview.entries).toHaveLength(1);
        expect(runtime.readState('atri_knowledge_runtime')).toBeNull();
        expect(runtime.snapshot.revision.revisionId).toBe(head);
        await runtime.prepareGeneration('normal');
        expect(await runtime.commitKnowledge(preview)).toMatchObject({ committed: true });
        expect(await runtime.commitKnowledge(preview)).toMatchObject({ reason: 'already_committed' });
        expect(runtime.snapshot.states.atri_knowledge_runtime).toBeUndefined();
        expect(runtime.readState('atri_knowledge_runtime')).not.toBeNull();
        await runtime.finalizeStoppedGeneration();
        expect(runtime.readState('atri_knowledge_runtime')).toBeNull();
        const stale = await runtime.evaluateKnowledge({ messages: ['Harbor'] });
        await appendUser('Another turn');
        expect(await runtime.commitKnowledge(stale)).toMatchObject({ reason: 'scope_changed' });
        await runtime.prepareGeneration('normal');
        const accepted = await runtime.evaluateKnowledge({ messages: ['Harbor'] });
        expect(await runtime.commitKnowledge(accepted)).toMatchObject({ committed: true });
        messages.push({ name: 'Actor', is_user: false, is_system: false, mes: 'Knowledge response', extra: {} });
        await runtime.persist();
        expect(runtime.snapshot.states.atri_knowledge_runtime).toEqual(accepted.pendingState);
        expect(runtime.snapshot.metadata?.timedWorldInfo).toBeUndefined();
    });

    test('Draft-local staged SessionState commits with accepted assistant and is discarded on Stop', async () => {
        await appendUser('Stage state');
        const postUserRevisionId = runtime.snapshot.revision.revisionId;
        expect(await runtime.prepareGeneration('normal')).toBe('normal');

        runtime.stageState('atri_world_info_events', {
            version: 1,
            baseline: { providers: {} },
        });
        expect(runtime.readState('atri_world_info_events')).toEqual({
            version: 1,
            baseline: { providers: {} },
        });

        await runtime.finalizeStoppedGeneration();
        expect(runtime.snapshot.revision.revisionId).toBe(postUserRevisionId);
        expect(runtime.readState('atri_world_info_events')).toBeNull();

        expect(await runtime.prepareGeneration('normal')).toBe('normal');
        runtime.stageState('atri_world_info_events', {
            version: 1,
            baseline: { providers: { current: true } },
        });
        messages.push({
            name: 'Actor',
            is_user: false,
            is_system: false,
            mes: 'Accepted response',
            extra: {},
        });
        await runtime.persist();
        expect(runtime.snapshot.revision.revisionId).not.toBe(postUserRevisionId);
        expect(runtime.readState('atri_world_info_events')).toEqual({
            version: 1,
            baseline: { providers: { current: true } },
        });
    });

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

    test('Stop discards draft-local runtime state and does not advance past post-user Revision', async () => {
        expect(await runtime.prepareGeneration('normal')).toBe('normal');

        messages.push({ name: 'Player', is_user: true, is_system: false, mes: 'Keep exact post-user state', extra: {} });
        await runtime.persist();
        const postUserRevision = runtime.snapshot.revision.revisionId;
        expect(runtime.snapshot.states.atri_variables).toBeUndefined();

        runtime.host.runtimeState = () => ({
            atri_variables: { schemaVersion: 1, values: { phase: 'draft-only' } },
        });
        await runtime.finalizeStoppedGeneration();

        expect(runtime.snapshot.revision.revisionId).toBe(postUserRevision);
        expect(runtime.snapshot.states.atri_variables).toBeUndefined();
        expect(projection.metadata.variables).toEqual({});
        expect(runtime.generation).toBeNull();

        const stored = await f.core.load(h.handle, runtime.snapshot.session.sessionId);
        expect(stored.revision.revisionId).toBe(postUserRevision);
        expect(stored.states.atri_variables).toBeUndefined();
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

    test('host Swipe ABI cannot fabricate committed Native Variant authority', async () => {
        const sessionId = runtime.snapshot.session.sessionId;
        expect(runtime.snapshot.timeline[0].variantIds).toHaveLength(1);
        expect(messages[0].swipes).toHaveLength(1);
        expect(messages[0].swipe_id).toBe(0);
        const before = runtime.snapshot.revision.revisionId;

        messages[0].swipes.push('forbidden host-only alternate');
        messages[0].swipe_info.push({});
        messages[0].swipe_id = 1;
        messages[0].mes = 'forbidden host-only alternate';
        await expect(runtime.persist()).rejects.toMatchObject({ code: 'native_committed_timeline_mutation' });
        expect((await f.core.load(h.handle, sessionId)).revision.revisionId).toBe(before);

        await runtime.reload();
        messages[0].atri_native.variantIds.push('variant_00000000000000000000000000');
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

    test('Actor prompt fields and Regex derive only from installed content', async () => {
        const fixture = sessionFixture();
        fixture.manifest.actors[0].profile = { description: 'Harbor guide', personality: 'Calm', scenario: 'Moonlit pier' };
        fixture.manifest.processors = { regex: [{ scriptName: 'Display', findRegex: 'pier', replaceString: 'dock' }] };
        const f = await installFixture(h, fixture);
        const view = await f.core.create(h.handle, f.start);
        expect(projectNativeSession(view).character.data).toMatchObject({ description: 'Harbor guide', scenario: 'Moonlit pier' });

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
        let attachmentError = null;
        try {
            timelineIntents(view, attachment);
        } catch (error) {
            attachmentError = error;
        }
        expect(attachmentError).toMatchObject({ code: 'native_committed_timeline_mutation' });

        const changed = projectNativeSession(view).chat;
        changed[0].mes = 'rewritten';
        let mutationError = null;
        try {
            timelineIntents(view, changed);
        } catch (error) {
            mutationError = error;
        }
        expect(mutationError).toMatchObject({ code: 'native_committed_timeline_mutation' });
    });
});

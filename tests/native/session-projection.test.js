import { makeTempFsEngineHarness, CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { installFixture, sessionFixture } from './helpers/session-fixture.js';
import { projectNativeSession, timelineIntents, projectKnowledgeEntries } from '../../public/scripts/native/session-projection.js';
import { NativeSessionRuntime } from '../../public/scripts/native/session-runtime.js';
import { createNativeId } from '../../src/native/identity.js';

// The host adapter exercises the real SessionCore; no parallel persistence implementation.
describe.each(CONTRACT_HARNESSES)('N4 runtime command projection - $name', ({ make }) => {
    let h, f, runtime, messages, projection;
    beforeEach(async () => {
        h = await make(); f = await installFixture(h);
        const view = await f.core.create(h.handle, f.start);
        runtime = new NativeSessionRuntime();
        runtime.configure({ isGenerating: () => false, messages: () => messages,
            install: value => { projection = value; messages = value.chat; }, revision: value => { projection = value; }, error: () => {} });
        runtime.request = async (path, body) => {
            if (path === 'load') return f.core.load(h.handle, body.sessionId, { revisionId: body.revisionId });
            const { command, expectedRevisionId } = body;
            if (command.type === 'fork') return f.core.forkBranch(h.handle, body.sessionId, { ...command, expectedRevisionId });
            if (command.type === 'switch') return f.core.switchBranch(h.handle, body.sessionId, command.branchId, { expectedRevisionId });
            return f.core.applyTimelineCommands(h.handle, body.sessionId, command.commands, { expectedRevisionId });
        };
        await runtime.open(view.session.sessionId);
    });
    afterEach(async () => { await h?.cleanup(); });

    test('Send/edit/Continue/swipe/select/delete/reload keep opaque message identities and exact snapshots', async () => {
        const sessionId = runtime.snapshot.session.sessionId;
        messages.push({ name: 'Player', is_user: true, is_system: false, mes: 'Explore', extra: {} });
        await runtime.persist();
        const userId = messages[1].atri_native.messageId;
        messages.push({ name: 'Actor', is_user: false, is_system: false, mes: 'The harbor', extra: {} });
        await runtime.persist();
        const assistantId = messages[2].atri_native.messageId;
        const firstReply = runtime.snapshot.revision.revisionId;
        messages[1].mes = 'Explore carefully';
        messages[2].mes += ' is quiet.';
        await runtime.persist();
        expect(runtime.snapshot.timeline.map(item => item.content)).toEqual(['Opening', 'Explore carefully', 'The harbor is quiet.']);
        expect(messages[1].atri_native.messageId).toBe(userId);
        expect(messages[2].atri_native.messageId).toBe(assistantId);
        await runtime.reload();
        const reply = messages[2];
        reply.swipes.push('A bell rings.'); reply.swipe_id = 1; reply.mes = 'A bell rings.';
        reply.swipe_info.push({ extra: {} });
        await runtime.persist();
        expect(runtime.snapshot.timeline[2].variantIds).toHaveLength(2);
        reply.swipe_id = 0; reply.mes = reply.swipes[0];
        await runtime.persist();
        expect(runtime.snapshot.timeline[2].content).toBe('The harbor is quiet.');
        messages.splice(1, 1); await runtime.persist();
        expect(runtime.snapshot.timeline.map(item => item.messageId)).toEqual([messages[0].atri_native.messageId, assistantId]);
        expect((await f.core.load(h.handle, sessionId, { revisionId: firstReply })).timeline[2].content).toBe('The harbor');
        const revision = runtime.snapshot.revision;
        await runtime.reload();
        expect(runtime.snapshot.revision).toEqual(revision);
        expect(timelineIntents(runtime.snapshot, messages)).toEqual([]);
    });

    test('historical projection uses selected revision branch, is read-only, and may fork at an exact message/variant', async () => {
        await runtime.persist();
        const oldRevision = runtime.snapshot.revision;
        const originalBranch = oldRevision.branchId;
        messages.push({ name: 'Player', is_user: true, is_system: false, mes: 'Later', extra: {} });
        await runtime.persist();
        const branch = await runtime.fork(0);
        expect(runtime.snapshot.timeline).toHaveLength(1);
        expect(runtime.snapshot.graph.at(-1).branch.forkPoint.messageId).toBe(messages[0].atri_native.messageId);
        await runtime.open(runtime.snapshot.session.sessionId, { revisionId: oldRevision.revisionId });
        expect(runtime.snapshot.session.activeBranchId).toBe(branch);
        expect(projection.branchId).toBe(originalBranch);
        expect(() => runtime.persist()).toThrow('not writable');
        const fork = await runtime.fork(0);
        expect(fork).not.toBe(branch);
        expect(runtime.snapshot.graph).toHaveLength(3);
        await runtime.switchBranch(originalBranch);
        expect(runtime.snapshot.timeline.at(-1).content).toBe('Later');
    });

    test('concurrent intents serialize and stale HEAD fails closed without legacy retry', async () => {
        await runtime.persist();
        messages.push({ name: 'Player', is_user: true, is_system: false, mes: 'One', extra: {} });
        await Promise.all([runtime.persist(), runtime.persist()]);
        expect(runtime.snapshot.timeline).toHaveLength(2);
        await f.core.appendTimeline(h.handle, runtime.snapshot.session.sessionId, { role: 'user', content: 'Other writer' });
        messages[1].mes = 'Stale';
        await expect(runtime.persist()).rejects.toMatchObject({ code: 'native_session_head_conflict' });
        expect(runtime.failed).toBe(true);
        expect(() => runtime.persist()).toThrow('not writable');
        await runtime.reload();
        expect(runtime.snapshot.timeline.at(-1).content).toBe('Other writer');
        await runtime.persist();
    });

    test('invalid command batches publish no partial revision and deletion retains immutable history', async () => {
        const view = runtime.snapshot;
        await expect(f.core.applyTimelineCommands(h.handle, view.session.sessionId, [
            { type: 'append', draft: { role: 'user', content: 'Never committed' } },
            { type: 'remove', messageId: createNativeId('message') },
        ])).rejects.toThrow();
        expect((await f.core.load(h.handle, view.session.sessionId)).revision).toEqual(view.revision);
        await f.core.applyTimelineCommands(h.handle, view.session.sessionId, [{ type: 'remove', messageId: view.timeline[0].messageId }]);
        expect((await f.core.load(h.handle, view.session.sessionId)).timeline).toEqual([]);
        expect((await f.core.load(h.handle, view.session.sessionId, { revisionId: view.revision.revisionId })).timeline).toHaveLength(1);
    });

    test('deleting an inactive swipe does not change the selected content or overwrite history', async () => {
        await runtime.persist();
        const message = messages[0];
        message.swipes.push('Alternate'); message.swipe_id = 1; message.mes = 'Alternate'; message.swipe_info.push({ extra: {} });
        await runtime.persist();
        const prior = runtime.snapshot.revision.revisionId;
        runtime.removeSwipe(0, 0); message.swipes.splice(0, 1); message.swipe_info.splice(0, 1); message.swipe_id = 0;
        await runtime.persist();
        expect(runtime.snapshot.timeline[0].content).toBe('Alternate');
        expect(runtime.snapshot.timeline[0].variantIds).toHaveLength(1);
        expect((await f.core.load(h.handle, runtime.snapshot.session.sessionId, { revisionId: prior })).timeline[0].variantIds).toHaveLength(2);
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
        expect(entries[0].atri_native).toMatchObject({ knowledgeRevisionId: fixture.knowledge.revision.knowledgeRevisionId,
            knowledgeEntryId: fixture.knowledge.entries[0].knowledgeEntryId });
        expect(entries[0].uid).toBe(0); // ephemeral only
        view.knowledge.bindings[0].visibility = ['private-actor'];
        expect(projectKnowledgeEntries(view)).toEqual([]); // N6 target-aware compilation is not faked here.
    });
    test('unknown IDs and path-only attachments cannot reconstruct Native authority', async () => {
        const f = await installFixture(h); const view = await f.core.create(h.handle, f.start);
        const { chat } = projectNativeSession(view);
        chat[0].atri_native.messageId = createNativeId('message');
        expect(() => timelineIntents(view, chat)).toThrow('Unknown');
        const again = projectNativeSession(view).chat;
        again[0].extra.files = [{ url: '/user/files/old.txt' }];
        expect(() => timelineIntents(view, again)).toThrow('assetId');
    });
});

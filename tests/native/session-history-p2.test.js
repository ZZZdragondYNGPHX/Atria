import { describe, expect, jest, test } from '@jest/globals';
import { buildBranchGraphModel, branchTimeline, deriveReplyVariants, createReplyVariantFacade, HISTORY_LIMIT } from '../../public/scripts/native/reply-variants.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { NativeProductService } from '../../src/native/product-service.js';
import { createNativeId } from '../../src/native/identity.js';

const revision = (id, parent, branch, message) => ({ revisionId: id, parentRevisionId: parent, branchId: branch, createdAt: Number(id.slice(1)), timelineHead: message ? { messageId: message, variantId: 'birth_' + message } : null });
function metadata() {
    return { sessionId: 'session_test', activeBranchId: 'b2', headRevisionId: 'r6', branches: [
        { branchId: 'b1', parentBranchId: null, headRevisionId: 'r3', createdAt: 1 },
        { branchId: 'b2', parentBranchId: 'b1', forkRevisionId: 'r1', headRevisionId: 'r6', createdAt: 4 },
    ], revisions: [revision('r1', null, 'b1', 'user'), revision('r2', 'r1', 'b1', 'one'), revision('r3', 'r2', 'b1', 'one'),
        revision('r4', 'r3', 'b2', 'user'), revision('r5', 'r4', 'b2', 'two'), revision('r6', 'r5', 'b2', 'two')],
    messages: [
        { messageId: 'user', branchId: 'b1', role: 'user', sequence: 0, preview: 'Ask' },
        { messageId: 'one', branchId: 'b1', role: 'assistant', sequence: 1, preview: 'First' },
        { messageId: 'two', branchId: 'b2', role: 'assistant', sequence: 1, preview: 'Second' },
    ] };
}

function service(f) {
    return new NativeProductService({ packageRepo: f.packageRepo, sessionRepo: f.sessionRepo, sessionCore: f.core,
        worldRepo: {}, knowledgeRepo: f.knowledgeRepo, savePointRepo: f.savePointRepo, packageInstaller: f.packageInstaller,
        saveSystem: f.saveSystem, projectStore: {} });
}

describe('P2 lightweight branch / reply facade', () => {
    test('real history uses one Timeline scan, no snapshots, and restores immutable replies with full branch state', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h), start = await f.core.create(h.handle, f.start), id = start.session.sessionId;
            const user = await f.core.appendTimeline(h.handle, id, { role: 'user', content: 'Choose' });
            const first = await f.core.appendTimeline(h.handle, id, { role: 'assistant', content: '<b>' + '\u{1f642}'.repeat(400) });
            const birth = first.timeline.at(-1), originalBranch = first.session.activeBranchId;
            await f.core.updateState(h.handle, id, { atri_test: { value: 1 } });
            await f.core.retryReply(h.handle, id, { messageId: birth.messageId });
            const second = await f.core.appendTimeline(h.handle, id, { role: 'assistant', content: 'Alternative' });
            await f.core.updateState(h.handle, id, { atri_test: { value: 2 } });
            const scan = jest.spyOn(f.sessionRepo, 'listTimeline'), snapshots = jest.spyOn(f.core, 'load');
            const history = await service(f).getSessionHistory(h.handle, id);
            expect(scan).toHaveBeenCalledTimes(1); expect(scan).toHaveBeenCalledWith(h.handle, id); expect(snapshots).not.toHaveBeenCalled();
            const firstMeta = history.messages.find(item => item.messageId === birth.messageId);
            expect(Array.from(firstMeta.preview)).toHaveLength(280); expect(firstMeta).not.toHaveProperty('content'); expect(firstMeta).not.toHaveProperty('metadata');
            const model = buildBranchGraphModel(history), replies = deriveReplyVariants(model, { messageId: second.timeline.at(-1).messageId });
            expect(replies.count).toBe(2); expect(replies.previous.messageId).toBe(birth.messageId);
            expect(replies.selected.isCurrent).toBe(true); expect(replies.previous.isDetached).toBe(true);
            expect(branchTimeline(model, second.session.activeBranchId).some(item => item.revisionId === first.revision.revisionId)).toBe(false);
            const switched = await f.core.switchBranch(h.handle, id, originalBranch);
            expect(switched.timeline.at(-1)).toEqual(birth); expect(switched.states.atri_test).toEqual({ value: 1 });
            const switchedModel = buildBranchGraphModel(await service(f).getSessionHistory(h.handle, id));
            expect(deriveReplyVariants(switchedModel, { messageId: birth.messageId }).count).toBe(2);
            expect(deriveReplyVariants(switchedModel, { messageId: birth.messageId }).selected.isCurrent).toBe(true);
            // A user edit at the same predecessor is not a Reply Variant.
            await f.core.forkBranch(h.handle, id, { revisionId: user.revision.revisionId });
            await f.core.appendTimeline(h.handle, id, { role: 'user', content: 'Different question' });
            const withUserBranch = buildBranchGraphModel(await service(f).getSessionHistory(h.handle, id));
            expect(deriveReplyVariants(withUserBranch, { messageId: birth.messageId }).count).toBe(2);
            expect(birth.variantIds).toEqual([birth.activeVariantId]);
        } finally { await h.cleanup(); }
    });

    test('birth/state/switch revisions deduplicate, exclude user heads and expose boundaries', () => {
        const source = metadata(); const before = JSON.stringify(source);
        const model = buildBranchGraphModel(source);
        const result = deriveReplyVariants(model, { messageId: 'one', revisionId: 'r2', branchId: 'b1' });
        expect(result).toMatchObject({ count: 2, index: 0, previous: null, detached: true });
        expect(result.selected).toMatchObject({ revisionId: 'r2', variantId: 'birth_one', isOrigin: true, isDetached: true });
        expect(result.next).toMatchObject({ revisionId: 'r5', branchId: 'b2', isCurrent: true });
        expect(branchTimeline(model, 'b2').map(item => item.revisionId)).toEqual(['r6', 'r5', 'r4', 'r1']);
        expect(deriveReplyVariants(model, { messageId: 'user' }).count).toBe(0);
        expect(deriveReplyVariants(model, { messageId: 'unknown' }).next).toBeNull();
        expect(JSON.stringify(source)).toBe(before);
    });

    test('nested retries use the original user anchor and switches do not inherit other branches', () => {
        const history = metadata();
        history.branches.push({ branchId: 'b3', parentBranchId: 'b2', forkRevisionId: 'r4', headRevisionId: 'r8', createdAt: 7 });
        history.revisions.push(revision('r7', 'r6', 'b3', 'user'), revision('r8', 'r7', 'b3', 'three'), revision('r9', 'r8', 'b1', 'one'));
        history.messages.push({ messageId: 'three', branchId: 'b3', role: 'assistant', sequence: 1 });
        history.branches[0].headRevisionId = 'r9'; history.headRevisionId = 'r9'; history.activeBranchId = 'b1';
        const model = buildBranchGraphModel(history);
        expect(deriveReplyVariants(model, { messageId: 'three' }).count).toBe(3);
        expect(branchTimeline(model, 'b1').map(item => item.revisionId)).toEqual(['r9', 'r3', 'r2', 'r1']);
        expect(deriveReplyVariants(model, { messageId: 'one' }).items.filter(item => item.isCurrent).map(item => item.messageId)).toEqual(['one']);
    });

    test('unknown roles and multi-message gaps never guess alternate replies', () => {
        const history = metadata(); delete history.messages;
        expect(deriveReplyVariants(buildBranchGraphModel(history), { messageId: 'one' }).count).toBe(0);
        history.messages = metadata().messages; history.messages[2].sequence = 5;
        expect(deriveReplyVariants(buildBranchGraphModel(history), { messageId: 'one' }).count).toBe(1);
    });

    test('cycle/dangling graphs are either strict errors or bounded diagnostics, never executable targets', async () => {
        const history = metadata(); history.revisions[0].parentRevisionId = 'r2';
        expect(() => buildBranchGraphModel(history)).toThrow('cycle');
        const model = buildBranchGraphModel(history, { tolerant: true });
        expect(model.ordered).toHaveLength(6); expect(model.issues.length).toBeGreaterThan(0);
        const facade = createReplyVariantFacade({ sessionId: history.sessionId, loadHistory: async () => history, onInspect: jest.fn() });
        await facade.load(); expect(facade.capabilities({ revisionId: 'r2' })).toEqual({});
        await expect(facade.inspect({ revisionId: 'r2' })).rejects.toThrow('unavailable');
        history.revisions[0].parentRevisionId = 'absent';
        expect(() => buildBranchGraphModel(history)).toThrow('unavailable');
        expect(buildBranchGraphModel(history, { tolerant: true }).ordered).toHaveLength(6);
        history.branches[0].parentBranchId = 'b2';
        expect(buildBranchGraphModel(history, { tolerant: true }).branches.every(item => item.issues.includes('cycle'))).toBe(true);
    });

    test('metadata limits, missing heads, malformed payloads and duplicate IDs fail predictably', () => {
        expect(() => buildBranchGraphModel(null)).toThrow('metadata');
        expect(() => buildBranchGraphModel({ branches: [], revisions: Array(HISTORY_LIMIT + 1).fill({}) })).toThrow('limit');
        const history = metadata(); history.revisions.push(history.revisions[0]);
        expect(() => buildBranchGraphModel(history)).toThrow('metadata');
        history.revisions.pop(); history.branches[1].headRevisionId = 'absent';
        expect(buildBranchGraphModel(history, { tolerant: true }).branchById.get('b2').issues).toContain('missing-head');
    });

    test('facade deduplicates metadata requests, navigates without I/O and delegates exact commands', async () => {
        const source = metadata(), loadHistory = jest.fn(async () => source), onInspect = jest.fn(), onSwitchBranch = jest.fn(), onRetry = jest.fn(), onFork = jest.fn();
        const context = { sessionId: source.sessionId, revisionId: 'r6', branchId: 'b2', tailMessageId: 'two', canWrite: true };
        const facade = createReplyVariantFacade({ sessionId: source.sessionId, loadHistory, getContext: () => context, onInspect, onSwitchBranch, onRetry, onFork });
        await Promise.all([facade.load(), facade.load()]);
        const replies = facade.replies({ messageId: 'two' });
        expect(facade.preview(replies.previous).message.preview).toBe('First');
        expect(loadHistory).toHaveBeenCalledTimes(1);
        await facade.inspect(replies.previous);
        expect(onInspect).toHaveBeenCalledWith({ sessionId: source.sessionId, revisionId: 'r2', branchId: 'b1', messageId: 'one' });
        expect(onSwitchBranch).not.toHaveBeenCalled();
        await facade.switchBranch(replies.previous); expect(onSwitchBranch).toHaveBeenCalledWith('b1', expect.objectContaining({ revisionId: 'r2' }));
        await facade.load(); await facade.retry({ revisionId: 'r6' });
        expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'two', revisionId: 'r6' }));
        await facade.load(); context.isHistory = true;
        await expect(facade.retry({ revisionId: 'r6' })).rejects.toThrow('unavailable');
        context.canFork = true; await facade.fork({ revisionId: 'r2' });
        expect(onFork).toHaveBeenCalledWith(expect.objectContaining({ revisionId: 'r2', branchId: 'b1' }));
    });

    test('concurrent commands, stale/foreign contexts, failures and dispose are fenced', async () => {
        let finish; const context = { revisionId: 'r6', branchId: 'b2', tailMessageId: 'two', canWrite: true };
        const facade = createReplyVariantFacade({ sessionId: 'session_test', loadHistory: async () => metadata(), getContext: () => context,
            onRetry: () => new Promise(resolve => { finish = resolve; }), onFork: jest.fn() });
        await facade.load(); const pending = facade.retry({ revisionId: 'r6' });
        await expect(facade.fork({ revisionId: 'r2' })).rejects.toThrow('unavailable'); finish(); await pending;
        await facade.load(); context.revisionId = 'r7';
        expect(facade.capabilities({ revisionId: 'r6' }).retry).toBe(false);
        context.sessionId = 'foreign'; expect(facade.capabilities({ revisionId: 'r2' }).fork).toBe(false);
        await expect(facade.load()).rejects.toThrow('unavailable');
        facade.dispose(); await expect(facade.load()).rejects.toThrow('closed');
    });

    test('timeouts are retryable and late responses cannot replace a refreshed model', async () => {
        const timeout = createReplyVariantFacade({ sessionId: 'session_test', loadHistory: () => new Promise(() => {}), timeoutMs: 5 });
        await expect(timeout.load()).rejects.toThrow('timed out'); timeout.dispose();
        let finish; const loadHistory = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(metadata());
        const facade = createReplyVariantFacade({ sessionId: 'session_test', loadHistory });
        const old = facade.load(); await Promise.resolve(); const current = await facade.load({ refresh: true });
        finish(metadata()); await expect(old).rejects.toThrow('changed');
        expect(facade.model).toBe(current); expect(loadHistory).toHaveBeenCalledTimes(2);
    });

    test('product history excludes unreferenced messages and skips inventory for empty history', async () => {
        const f = { packageRepo: {}, sessionRepo: { getHistory: jest.fn(async () => metadata()), listTimeline: jest.fn(async () => [...metadata().messages, { messageId: 'orphan', content: 'private' }]) },
            core: {}, knowledgeRepo: {}, savePointRepo: {}, packageInstaller: {}, saveSystem: {} };
        const result = await service(f).getSessionHistory('u', createNativeId('session'));
        expect(result.messages.some(item => item.messageId === 'orphan')).toBe(false);
        f.sessionRepo.getHistory.mockResolvedValue({ revisions: [], branches: [] }); f.sessionRepo.listTimeline.mockClear();
        expect((await service(f).getSessionHistory('u', createNativeId('session'))).messages).toEqual([]);
        expect(f.sessionRepo.listTimeline).not.toHaveBeenCalled();
    });
});

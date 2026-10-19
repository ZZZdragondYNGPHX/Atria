import { resolverTurnFixture } from './helpers/resolver-turn-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

describe.each(CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name)))('$name original resolver producer identity', ({ make }) => {
    test.each(['json-capture', 'json-selection', 'role', 'request-id', 'source', 'json-quota'])('%s refuses before local compilation, role charge or HTTP', async fault => {
        const f = await resolverTurnFixture(make), original = f.authority.executeResolver.bind(f.authority);
        try {
            f.authority.executeResolver = args => {
                if (fault === 'json-capture') args = { ...args, resolverCapture: structuredClone(args.resolverCapture) };
                if (fault === 'json-selection') args = { ...args, selection: structuredClone(args.selection) };
                if (fault === 'role') args = { ...args, request: { ...args.request, role: 'narrator' } };
                if (fault === 'request-id') args = { ...args, request: { ...args.request, requestId: args.input.invocationId } };
                if (fault === 'source') args = { ...args, base: { ...args.base, timeline: args.base.timeline.map((row, index) => index === args.base.timeline.length - 1 ? { ...row, content: 'Forged resolver input.' } : row) } };
                if (fault === 'json-quota') args = { ...args, quotaProof: structuredClone(args.quotaProof) };
                return original(args);
            };
            await expect(f.start()).rejects.toThrow();
            expect(f.requests).toHaveLength(0);
            const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            const op = control.operations[hash({ lane: 'turn', anchor: { branchId: f.base.revision.branchId, revisionId: f.base.revision.revisionId } })];
            expect(op.total).toBe(0); expect(op.compute).toBeUndefined();
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(f.base.revision);
        } finally { await f.cleanup(); }
    });

    test('a foreign narrator route scope refuses in preflight before the resolver or Run exists', async () => {
        const f = await resolverTurnFixture(make); let preparations = 0;
        const original = f.authority.prepareResolver.bind(f.authority);
        try {
            f.authority.prepareResolver = args => { preparations++; return original(args); };
            f.input.routeRef.scope = 'package';
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_turn_route_mismatch' });
            expect(preparations).toBe(0); expect(f.requests).toHaveLength(0); expect(f.effectRef).toBeUndefined();
            expect(Object.values((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations).filter(op => op.compute)).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('a selection without original V3 retention facts cannot create a pretend completed resolver', async () => {
        const f = await resolverTurnFixture(make);
        try {
            const user = f.base.timeline.at(-1), anchor = { branchId: f.base.revision.branchId, revisionId: f.base.revision.revisionId };
            await f.core.runs.selection(f.h.handle, f.base.session.sessionId, anchor,
                hash({ player: user.messageId, typed: null, userInput: user.content }), f.selection);
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_resolver_retention_unavailable' });
            expect(f.requests).toHaveLength(0); expect(f.effectRef).toBeUndefined();
            const op = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[hash({ lane: 'turn', anchor })];
            expect(op.total).toBe(0); expect(op.compute).toBeUndefined();
        } finally { await f.cleanup(); }
    });

    test('a no-quota Authority Package is explicitly unavailable before paid resolver work', async () => {
        const f = await resolverTurnFixture(make, { changeSource: ({ contract }) => {
            delete contract.generationBudget;
            contract.capabilities = contract.capabilities.filter(item => item.id !== 'generation-budget');
        } });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_turn_scope_unavailable' });
            expect(f.requests).toHaveLength(0); expect(f.effectRef).toBeUndefined();
            expect(Object.values((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations).filter(op => op.compute)).toEqual([]);
        } finally { await f.cleanup(); }
    });
});

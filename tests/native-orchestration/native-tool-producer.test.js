import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { nativeToolFixture } from './helpers/native-tool-producer-fixture.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readNativeToolOutput } from '../../src/native/orchestration/native-tool-output-contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { CredentialTargetAuthority } from '../../src/native/model-prompt-runtime/credential-targets.js';
import { skillEntryKey } from '../../public/shared/extension-contract.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

describe.each(CONTRACT_HARNESSES)('$name original Tool producer', ({ make }) => {
    test.each(['tool', 'resource'])('published MCP %s produces exact receipt-bound advisory Result and fresh cold consumption', async operation => {
        const f = await nativeToolFixture(make, 'mcp', { operation });
        try {
            expect(f.calls).toEqual([]); expect(f.secretReads).toEqual([]);
            const prepared = await f.prepare(); expect(prepared.status).toBe('ready'); expect(f.calls).toEqual([]);
            expect(await f.dispatch(prepared)).toMatchObject({ status: 'completed', accepted: false });
            const root = await f.authority.execution.runs.get(f.h.handle, prepared.runId);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readNativeToolOutput(tx, f.h.handle, root));
            expect(hash(output.result.payload)).toBe(output.completion.evidence.resultHash);
            expect(output.result.envelope.audienceConstraint.kind).toBe('session_tool');
            expect(output.completion.costs.closed).toBe(true);
            const calls = f.calls.length, bank = await f.original.core.runs.status(f.h.handle, f.base.session.sessionId);
            await f.cold({ reopen: true });
            expect(await f.dispatch(prepared)).toMatchObject({ status: 'completed' });
            const consumed = await f.consume(prepared);
            expect(consumed).toMatchObject({ status: 'complete', advisory: true, result: output.result });
            expect(consumed.grantDigest).not.toBe(output.result.envelope.audienceConstraint.grantDigest);
            expect(f.calls).toHaveLength(calls); expect(await f.original.core.runs.status(f.h.handle, f.base.session.sessionId)).toEqual(bank);
            expect(f.errors).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test.each(['read', 'files'])('selected pinned Skill %s uses the original bank and completion proof without network', async operation => {
        const f = await nativeToolFixture(make, 'skill', { operation });
        try {
            const prepared = await f.prepare();
            expect(await f.dispatch(prepared)).toMatchObject({ status: 'completed' });
            const consumed = await f.consume(prepared);
            expect(consumed.result.envelope.audienceConstraint.kind).toBe('session_tool');
            const expectedBodies = { read: { content: expect.stringContaining('Text, never Host code.') },
                files: { files: [expect.objectContaining({ path: 'SKILL.md' })] } };
            expect(consumed.result.payload).toMatchObject(expectedBodies[operation]);
            expect(f.calls).toEqual([]); expect(f.secretReads).toEqual([]);
            const settings = await f.extensions.settings(f.h.handle), value = structuredClone(settings.value);
            value.skills[skillEntryKey({ scope: f.ref.input.scope, name: f.ref.input.name })] = { paths: { narrative: 'off' } };
            await f.extensions.saveSettings(f.h.handle, value, settings.revision);
            await expect(f.consume(prepared)).rejects.toMatchObject({ code: 'native_orchestration_native_tool_unavailable' });
        } finally { await f.cleanup(); }
    });

    test('A2A accepted is an exact original receipt, remains unknown, and is never resent cold', async () => {
        const f = await nativeToolFixture(make, 'a2a');
        try {
            const prepared = await f.prepare(), sent = await f.dispatch(prepared);
            expect(sent).toMatchObject({ status: 'unknown', effectStatus: 'confirmed', accepted: true, remoteCompleted: false, resultRef: null });
            expect(f.calls.filter(row => row.method === 'SendMessage')).toHaveLength(1);
            const root = await f.authority.execution.runs.get(f.h.handle, prepared.runId);
            expect(root.status).toBe('running'); expect(root.outputClaims).toEqual([]);
            const bank = await f.original.core.runs.status(f.h.handle, f.base.session.sessionId), calls = f.calls.length;
            await f.cold({ reopen: true });
            expect(await f.dispatch(prepared)).toMatchObject({ status: 'unknown', accepted: true });
            await expect(f.consume(prepared)).rejects.toMatchObject({ code: 'native_orchestration_native_tool_stale' });
            expect(f.calls).toHaveLength(calls); expect(await f.original.core.runs.status(f.h.handle, f.base.session.sessionId)).toEqual(bank);
        } finally { await f.cleanup(); }
    });

    test('lost MCP response preserves charged unknown and cold observation never sends again', async () => {
        const f = await nativeToolFixture(make, 'mcp', { hook: async (body, req) => {
            if (body.method === 'tools/call') { req.socket.destroy(); return true; } return false;
        } });
        try {
            const prepared = await f.prepare(); expect(await f.dispatch(prepared)).toMatchObject({ status: 'unknown', effectStatus: 'dispatching' });
            expect(f.calls.filter(row => row.method === 'tools/call')).toHaveLength(1);
            const bank = await f.original.core.runs.status(f.h.handle, f.base.session.sessionId), calls = f.calls.length;
            await f.cold({ reopen: true });
            expect(await f.dispatch(prepared)).toMatchObject({ status: 'unknown' });
            await expect(f.consume(prepared)).rejects.toMatchObject({ code: 'native_orchestration_native_tool_stale' });
            expect(f.calls).toHaveLength(calls); expect(await f.original.core.runs.status(f.h.handle, f.base.session.sessionId)).toEqual(bank);
        } finally { await f.cleanup(); }
    });

    test('human Source advance after preparation rejects dispatch and preserves the new revision', async () => {
        const f = await nativeToolFixture(make);
        try {
            const prepared = await f.prepare(), bank = await f.original.core.runs.status(f.h.handle, f.base.session.sessionId);
            const human = await f.original.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'New human data' }, { expectedRevisionId: f.base.revision.revisionId });
            await expect(f.dispatch(prepared)).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            expect((await f.original.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(human.revision);
            const now = await f.original.core.runs.status(f.h.handle, f.base.session.sessionId);
            for (const [key, value] of Object.entries(bank.operations)) expect(now.operations[key].compute).toEqual(value.compute);
            expect(f.calls).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('cold Result consumption refuses a changed Source and keeps a legitimate change inside its final budget await', async () => {
        const f = await nativeToolFixture(make);
        try {
            const prepared = await f.prepare(); expect(await f.dispatch(prepared)).toMatchObject({ status: 'completed' });
            await f.cold({ reopen: true });
            const budget = f.authority.execution.budgetPort, original = budget.assertCurrent.bind(budget);
            let human = null;
            budget.assertCurrent = async (...args) => {
                await original(...args);
                if (!human) human = await f.original.core.appendTimeline(f.h.handle, f.base.session.sessionId,
                    { role: 'user', content: 'Human edit during the original budget check' }, { expectedRevisionId: f.base.revision.revisionId });
            };
            const calls = f.calls.length;
            await expect(f.consume(prepared)).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            expect((await f.original.core.observe(f.h.handle, f.base.session.sessionId)).revision.revisionId).toBe(human.revision.revisionId);
            await expect(f.consume(prepared)).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            expect(f.calls).toHaveLength(calls);
        } finally { await f.cleanup(); }
    });

    test('current original allowlist change denies dispatch before any network or new charge', async () => {
        const f = await nativeToolFixture(make);
        try {
            const prepared = await f.prepare(), bank = await f.original.core.runs.status(f.h.handle, f.base.session.sessionId);
            const route = await f.seeded.persistence.getRuntimeRoute(f.h.handle, f.descriptor.runtimeRouteId);
            await f.seeded.persistence.saveRuntimeRoute(f.h.handle, { ...route, executionPolicy: { ...route.executionPolicy, mcp: { ...route.executionPolicy.mcp, toolNames: [] } } });
            await expect(f.dispatch(prepared)).rejects.toThrow(); expect(f.calls).toEqual([]);
            expect(await f.original.core.runs.status(f.h.handle, f.base.session.sessionId)).toEqual(bank);
        } finally { await f.cleanup(); }
    });

    test('publication rejects agent or unowned action pins without Effect/Tool/bank work', async () => {
        const f = await nativeToolFixture(make);
        try {
            const before = await f.original.core.runs.status(f.h.handle, f.base.session.sessionId);
            for (const change of [plan => { plan.definition.nodes[0].kind = 'agent'; plan.definition.nodes[0].policy = { agentPinId: plan.dependencyPins[0].pinId }; }, plan => { plan.definition.nodes[0].dependencyPinIds = []; }]) {
                const plan = structuredClone(f.plan); change(plan);
                const draft = await f.authoring.plans.create(f.h.handle, createNativeId('orchestrationCommand'), plan);
                const report = await f.authoring.plans.validate(f.h.handle, { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash });
                expect(report.status).toBe('invalid');
            }
            expect(f.calls).toEqual([]); expect(await f.original.core.runs.status(f.h.handle, f.base.session.sessionId)).toEqual(before);
            expect(await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))).toEqual([]);
            for (const ref of [{ ...f.ref, risk: 'R3' }, { ...f.ref, operation: 'write' }]) {
                await expect(f.authoring.dependencies.inspect(f.h.handle, { pinId: 'denied', port: 'tool', resourceRef: ref })).rejects.toThrow();
            }
        } finally { await f.cleanup(); }
    });

    test('original Secret target approval remains required before resolution and is usable when granted', async () => {
        const f = await nativeToolFixture(make, 'mcp', { auth: 'secret' });
        try {
            const denied = await f.prepare(); expect(await f.dispatch(denied)).toMatchObject({ status: 'unknown' });
            expect(f.calls).toEqual([]); expect(f.secretReads).toEqual([]);
            const credentials = new CredentialTargetAuthority({ persistence: f.host.persistence }), view = await credentials.inspect(f.h.handle, { connectionProfileId: f.connection.connectionProfileId });
            await credentials.authorize(f.h.handle, { connectionProfileId: f.connection.connectionProfileId, expectedFingerprint: view.connectionFingerprint,
                expectedTargetFingerprint: view.targetFingerprint, expectedPermitFingerprint: view.permitFingerprint, allowLocal: true });
            const allowed = await f.prepare(); expect(await f.dispatch(allowed)).toMatchObject({ status: 'completed' });
            expect(f.secretReads).toHaveLength(1); expect(f.calls.every(row => row.authorization === 'Bearer synthetic-secret')).toBe(true);
        } finally { await f.cleanup(); }
    });
});

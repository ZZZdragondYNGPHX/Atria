import { jest } from '@jest/globals';
import http from 'node:http';
import express from 'express';
import supertest from 'supertest';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { assertProcessingRuntime, presentationText } from '../../public/shared/native-processing-contract.js';
import { processPackageText } from '../../src/native/processing-runtime.js';
import { projectPresentation } from '../../public/shared/native-frontend-host.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { createNativeSessionContextProvider } from '../../src/native/model-prompt-runtime/context-providers.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';
import { sessionFixture } from './helpers/session-fixture.js';
import { createNativeId } from '../../src/native/identity.js';

const pipeline = processors => assertProcessingRuntime({ schemaVersion: 1, processors });
const trim = { id: 'trim', stage: 'output', kind: 'trim' };
test.each([
    { ...trim, stage: 'unknown' }, { ...trim, kind: 'eval' }, { ...trim, patch: {} },
    { ...trim, kind: 'replace', find: '', replacement: 'x' },
    { ...trim, kind: 'script', stage: 'presentation', source: 'format.ts' },
    { ...trim, kind: 'script', source: '../escape.js' },
])('rejects invalid, executable presentation or unbounded routing declarations %#', item => {
    expect(() => pipeline([item])).toThrow();
});
test('capability, IDs and processing order are fixed; literal replacement is bounded', async () => {
    const runtime = pipeline([trim, { id: 'replace', stage: 'output', kind: 'replace', find: 'x', replacement: ' x ' }]);
    expect((await processPackageText(null, runtime, 'output', ' x ', 'request')).text).toBe(' x ');
    expect(() => pipeline([trim, trim])).toThrow();
    expect(() => assertNativeExperienceContract({ schemaVersion: 1, capabilities: [], dataResources: [], processingRuntime: runtime })).toThrow();
    await expect(processPackageText(null, pipeline([{ id: 'huge', stage: 'output', kind: 'replace', find: 'x', replacement: 'x'.repeat(65536) }]), 'output', 'xx', 'request')).rejects.toThrow('huge:output');
});
test('context processing transforms only visible historical text before selection/token counting', async () => {
    const f = sessionFixture(); const branchId = createNativeId('branch'), revisionId = createNativeId('revision');
    const snapshot = { manifest: f.manifest, revision: { revisionId, branchId }, states: {}, knowledge: { bindings: [], snapshots: [] },
        timeline: [{ messageId: 'm1', role: 'user', content: 'history original', branchId },
            { messageId: 'm2', role: 'assistant', content: 'historical response', branchId },
            { messageId: 'm3', role: 'user', content: 'current input', branchId }] };
    snapshot.manifest.runtime = { experienceContract: { processingRuntime: pipeline([{ ...trim, stage: 'context' }]) } };
    const before = structuredClone(snapshot);
    const countTokens = jest.fn(value => String(value).includes('expanded history') ? 100000 : 1);
    const processContext = jest.fn(async (text, source) => ({ text: 'expanded history', evidence: [{ processorId: 'expand', stage: 'context', source }] }));
    const plan = await compileNativeContextPlan(snapshot, { countTokens, processContext, modelContextLimit: 4096, responseReserve: 128 });
    expect(processContext).toHaveBeenCalledTimes(1);
    expect(countTokens.mock.calls.some(([text]) => text === 'expanded history')).toBe(true);
    expect(plan.included.some(item => item.content === 'expanded history')).toBe(false);
    expect(plan.rejected.some(item => item.metadata?.processing?.[0].processorId === 'expand')).toBe(true);
    expect(snapshot).toEqual(before);
    await expect(compileNativeContextPlan(snapshot, { modelContextLimit: 4096, responseReserve: 128 })).rejects.toThrow('Processing host');
    const runtime = pipeline([{ id: 'history-script', stage: 'context', kind: 'script', source: 'history.ts' }]);
    snapshot.manifest.runtime.experienceContract.processingRuntime = runtime;
    const installed = { sourceFiles: new Map([['history.ts', Buffer.from('export default {transform({text}) { return "Derived: "+text; }}')]]) };
    const actual = await compileNativeContextPlan(snapshot, { countTokens: () => 1, modelContextLimit: 4096, responseReserve: 128,
        processContext: (text, source) => processPackageText(installed, runtime, 'context', text, source) });
    const provider = createNativeSessionContextProvider(async () => ({ source: { kind: 'session', sessionId: createNativeId('session'), branchId, revisionId }, plan: actual }));
    const context = await provider.buildRequestContextPlan({ requestId: 'preview' }, { model: { limits: { contextTokens: 4096, outputTokens: 128 } }, generation: { output: { maxTokens: 128 } } });
    const history = context.items.find(item => item.kind === 'context.history');
    expect(history.content.content).toContain('Derived:');
    expect(history.provenance.find(item => item.source === 'native.processing').ref).toContain('history-script');
});
test('fixed script output enters one Authority CAS and derived presentation leaves canonical history intact', async () => {
    const h = await makeTempFsEngineHarness(); let server; let modelText = '  model candidate  ';
    try {
        server = http.createServer(async (req, res) => {
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ choices: [{ message: { content: body.tools?.length ? '' : modelText,
                ...(body.tools?.length ? { tool_calls: [{ id: 'call', type: 'function', function: { name: body.tools[0].function.name, arguments: '{"text":"updated"}' } }] } : {}) } }] }));
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const configure = f => {
            f.logic.transactions[0].effects = f.logic.transactions[0].effects.filter(item => item.kind !== 'workflow.transition');
            f.contract.capabilities.push({ id: 'processing', version: 1, required: true });
            f.contract.processingRuntime = pipeline([trim, { id: 'format', stage: 'output', kind: 'script', source: 'processing.ts' },
                { id: 'display', stage: 'presentation', kind: 'replace', find: 'model candidate', replacement: 'formatted display' }]);
            f.installed.sourceFiles.set('processing.ts', Buffer.from('export default { transform({text,stage}) { if(stage!=="output" || text==="bad") throw Error("private"); return text+" (accepted)"; } }'));
        };
        const f = await authorityTurnFixture(h, 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions', configure);
        const before = structuredClone(f.base);
        const commit = jest.spyOn(f.core._sessions, 'commitSnapshot');
        const next = await f.host.executeTurn(h.handle, f.input, undefined, undefined, { transaction: f.selection });
        expect(commit).toHaveBeenCalledTimes(1);
        expect(next.timeline.at(-1).content).toBe('model candidate (accepted)');
        const trace = next.states.atri_task_results.records.at(-1).provenance.find(item => item.processing);
        expect(trace.processing.map(item => item.processorId)).toEqual(['trim', 'format']);
        expect(trace.processing[1].execution).toMatchObject({ source: 'processing.ts', stage: 'transform' });
        expect(trace.processing[1].inputHash).not.toBe(trace.processing[1].outputHash);
        expect(projectPresentation(next).at(-1)).toMatchObject({ content: 'model candidate (accepted)', displayContent: 'formatted display (accepted)' });
        expect((await f.core.load(h.handle, next.session.sessionId)).timeline.at(-1).content).toBe('model candidate (accepted)');
        expect((await f.host.executeTurn(h.handle, f.input, undefined, undefined, { transaction: f.selection })).revision).toEqual(next.revision);
        expect(commit).toHaveBeenCalledTimes(1);
        expect(before.timeline.at(-1).content).toBe('Update the note.');
        modelText = 'bad';
        await expect(f.host.executeTurn(h.handle, { sessionId: next.session.sessionId, revisionId: next.revision.revisionId, invocationId: 'bad-output', slotBindings: {} }, undefined, undefined, { transaction: f.selection })).rejects.toThrow('native_processing_failed');
        expect((await f.core.load(h.handle, next.session.sessionId)).states).toEqual(next.states);
        expect(commit).toHaveBeenCalledTimes(1);
    } finally {
        if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
        await h.cleanup();
    }
});
test('script failure, async output and unavailable source fail with safe stage evidence', async () => {
    const runtime = pipeline([{ id: 'bad', stage: 'output', kind: 'script', source: 'bad.ts' }]);
    for (const source of ['export default {transform(){throw Error("private input");}}', 'export default {async transform(){return "late";}}', 'export default {transform(){return {patch:{coins:100}};}}']) {
        await expect(processPackageText({ sourceFiles: new Map([['bad.ts', Buffer.from(source)]]) }, runtime, 'output', 'candidate', 'request')).rejects.toMatchObject({ code: 'native_processing_failed', processorId: 'bad', stage: 'output' });
    }
    expect(presentationText(pipeline([{ id: 'safe', stage: 'presentation', kind: 'trim' }]), ' <script> 100 coins </script> ')).toBe('<script> 100 coins </script>');
});
test('generation HTTP reports safe Processor/stage evidence without exception input or source payload', async () => {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { profile: { handle: 'owner' } }; next(); });
    app.use(createNativeGenerationRouter(() => ({ executeTurn: async () => {
        throw Object.assign(new TypeError('PRIVATE INPUT'), { code: 'native_processing_failed', processorId: 'format', stage: 'output' });
    } })));
    const response = await supertest(app).post('/turn').send({}).expect(400);
    expect(response.body).toEqual({ error: 'native_processing_failed', details: { resourceId: 'format', field: 'output' } });
});

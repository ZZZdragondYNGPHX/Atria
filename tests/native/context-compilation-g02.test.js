import { afterEach, expect, test } from '@jest/globals';
import { createServer } from 'node:http';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument, serializeNativeDocument } from '../../src/native/repositories/common.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function serverFixture() {
    const requests = [];
    const server = createServer(async (req, res) => {
        let wire = ''; for await (const bytes of req) wire += bytes;
        requests.push({ wire, body: JSON.parse(wire) });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'Fresh fixture prose.' } }], usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    return { requests, endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` };
}
async function projectFixture() {
    const server = await serverFixture();
    const h = await makeTempFsEngine(); cleanups.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: server.endpoint, roles: ['studio'] });
    const projectId = createNativeId('project');
    const project = { source: { project: { projectId }, package: {}, resources: [] }, revision: { revision: 'r1' } };
    const host = new NativeGenerationHost({ ...seeded, studio: { getProject: async () => project },
        providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'g02-synthetic-key' } });
    const request = { role: 'studio', projectId, revision: 'r1', requestId: 'g02-project', messages: [{ role: 'user', content: 'Review this task.' }] };
    return { ...seeded, ...server, h, project, host, request };
}
const binding = result => result.snapshot.diagnostics.compiledBinding;

test('Project actual transport has stable bytes across request IDs and schema key insertion order, but preserves tool and history order', async () => {
    const f = await projectFixture();
    const tool = properties => ({ type: 'function', function: { name: 'inspect', parameters: { type: 'object', properties, required: ['a', 'z'] } } });
    const a = { type: 'string' }, z = { type: 'number' };
    const first = await f.host.execute(f.h.handle, { ...f.request, tools: [tool({ z, a })] });
    const second = await f.host.execute(f.h.handle, { ...f.request, requestId: 'g02-project-next', tools: [tool({ a, z })] });
    expect(f.requests[0].wire).toBe(f.requests[1].wire);
    expect(f.requests[0].wire).toBe(serializeNativeDocument(f.requests[0].body));
    expect(binding(first)).toEqual(binding(second));
    expect(binding(first).renderedFingerprint).toBe(hashNativeDocument({ endpoint: f.endpoint, body: f.requests[0].body }));
    const other = { type: 'function', function: { name: 'other', parameters: { type: 'object' } } };
    const before = await f.host.execute(f.h.handle, { ...f.request, requestId: 'ordered-1', tools: [tool({ a, z }), other],
        messages: [{ role: 'assistant', content: 'Previous.' }, { role: 'user', content: 'Current.' }] });
    const after = await f.host.execute(f.h.handle, { ...f.request, requestId: 'ordered-2', tools: [other, tool({ a, z })],
        messages: [{ role: 'user', content: 'Current.' }, { role: 'assistant', content: 'Previous.' }] });
    expect(binding(before).toolsFingerprint).not.toBe(binding(after).toolsFingerprint);
    expect(binding(before).historyFingerprint).not.toBe(binding(after).historyFingerprint);
    expect(f.requests.at(-1).body.tools.map(item => item.function.name)).toEqual(['other', 'inspect']);
});

test('Native Session consumes separate exact identity, expression and narration modules without altering authorized facts', async () => {
    const server = await serverFixture();
    const h = await makeTempFsEngineHarness(); cleanups.push(() => h.cleanup());
    const f = await authorityTurnFixture(h, server.endpoint);
    const refs = [];
    for (const [target, body] of [['system.character', 'Identity: Ada protects her family.'], ['system.character', 'Ada expression: terse, never assigned to other characters.'],
        ['system.style', 'Narration: {{param.narration}}. Do not choose the player action.']]) {
        const module = { ...f.seeded.module, promptModuleId: createNativeId('promptModule'), target, body };
        await f.seeded.library.commit(h.handle, 'core.prompt-module', module);
        refs.push({ scope: 'library', resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: 'r1' });
    }
    await f.seeded.library.commit(h.handle, 'core.prompt-program', { ...f.seeded.prompt, revision: 'creative',
        parameters: { narration: { type: 'string', default: 'third person, slow pace' } }, stages: [{ stageId: 'stage.main', moduleRefs: refs }] });
    const route = { ...f.seeded.routes[0], promptProgramRef: { ...f.seeded.routes[0].promptProgramRef, revision: 'creative' } };
    await f.seeded.persistence.saveRuntimeRoute(h.handle, route);
    const request = { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId, role: 'narrator', requestId: 'g02-rp-1' };
    const slow = await f.host.execute(h.handle, request);
    const fast = await f.host.execute(h.handle, { ...request, requestId: 'g02-rp-2', prompt: { parameters: { narration: 'first person, fast pace' } } });
    const moduleSegments = result => result.snapshot.promptIr.compilation.segments.filter(item => item.kind === 'prompt.module');
    const slowSegments = moduleSegments(slow), fastSegments = moduleSegments(fast);
    expect(slowSegments.filter(item => item.target === 'system.character')).toEqual(fastSegments.filter(item => item.target === 'system.character'));
    expect(slow.snapshot.contextPlan).toEqual({ ...fast.snapshot.contextPlan, requestId: slow.snapshot.contextPlan.requestId });
    expect(binding(slow).sourceFingerprint).toBe(binding(fast).sourceFingerprint);
    expect(binding(slow).contentFingerprint).not.toBe(binding(fast).contentFingerprint);
    expect(server.requests.at(-1).wire).toContain('Identity: Ada protects her family.');
    expect(server.requests.at(-1).wire).toContain('first person, fast pace');
    expect(server.requests.at(-1).wire).not.toContain('PRIVATE READ SENTINEL');
    expect(await f.core.load(h.handle, request.sessionId)).toEqual(f.base);
    expect(server.requests).toHaveLength(2);
});

test('Dynamic input changes complete binding without changing exact module segment identity; source revisions remain bound and stale requests fail', async () => {
    const f = await projectFixture();
    const first = await f.host.execute(f.h.handle, f.request);
    const next = await f.host.execute(f.h.handle, { ...f.request, requestId: 'new-turn', messages: [{ role: 'user', content: 'Different task.' }] });
    expect(first.snapshot.promptIr.compilation.segments.filter(item => item.kind === 'prompt.module'))
        .toEqual(next.snapshot.promptIr.compilation.segments.filter(item => item.kind === 'prompt.module'));
    expect(binding(first).contentFingerprint).not.toBe(binding(next).contentFingerprint);
    f.project.revision.revision = 'r2';
    await expect(f.host.execute(f.h.handle, { ...f.request, requestId: 'stale' })).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
    const restored = await f.host.execute(f.h.handle, { ...f.request, requestId: 'r2', revision: 'r2' });
    expect(binding(first).sourceFingerprint).not.toBe(binding(restored).sourceFingerprint);
    expect(f.requests).toHaveLength(3);
});

test('Exact module revision and output contract invalidate compiled binding while stable resource identity survives', async () => {
    const f = await projectFixture();
    const before = await f.host.execute(f.h.handle, f.request, undefined, undefined, { preview: true });
    await f.library.commit(f.h.handle, 'core.prompt-module', { ...f.module, revision: 'r2', body: 'Changed exact behavior.' });
    await f.library.commit(f.h.handle, 'core.prompt-program', { ...f.prompt, revision: 'r2', stages: [{ stageId: 'stage.main',
        moduleRefs: [{ ...f.prompt.stages[0].moduleRefs[0], revision: 'r2' }] }] });
    await f.persistence.saveRuntimeRoute(f.h.handle, { ...f.routes[0], promptProgramRef: { ...f.routes[0].promptProgramRef, revision: 'r2' } });
    const after = await f.host.execute(f.h.handle, f.request, undefined, undefined, { preview: true });
    const segment = value => value.snapshot.promptIr.compilation.segments.find(item => item.kind === 'prompt.module');
    expect(segment(before).identity).toBe(segment(after).identity);
    expect(segment(before).contentFingerprint).not.toBe(segment(after).contentFingerprint);
    expect(binding(before).resourceFingerprint).not.toBe(binding(after).resourceFingerprint);
    const structured = await f.host.execute(f.h.handle, { ...f.request, outputContract: { type: 'json_schema', json_schema: {
        name: 'result', schema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] } } } }, undefined, undefined, { preview: true });
    expect(binding(after).outputFingerprint).not.toBe(binding(structured).outputFingerprint);
    expect(f.requests).toHaveLength(0);
});

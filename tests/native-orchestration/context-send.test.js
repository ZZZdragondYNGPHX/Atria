import { createServer } from 'node:http';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { sessionFixture, services } from '../native/helpers/session-fixture.js';
import { informationFixture } from '../native/helpers/information-fixture.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { prepareControllerOwnerRoot } from './fixtures.js';

const grantDigest = 'a'.repeat(64);
const limits = { maxRequests: 4, maxTokens: 32000, localWork: { maxJobs: 32, maxItems: 100, maxInputBytes: 16777216 } };

async function fixture(make) {
    const h = await make(), seen = [], errors = [];
    let allowed = true, reply = async () => {};
    const server = createServer(async (request, response) => {
        try {
            let body = ''; for await (const chunk of request) body += chunk;
            seen.push(JSON.parse(body)); await reply();
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Synthetic actor response' } }],
                usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } }));
        } catch (error) { errors.push(error); response.writeHead(500); response.end('{}'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await prepareControllerOwnerRoot(h.dirs.root);
    attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
    const f = { ...sessionFixture(), ...services(h) }, actorId = f.manifest.actors[0].actorId;
    f.manifest.runtime = { experienceContract: informationFixture(actorId, f.worldId) };
    const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
    await f.packageInstaller.install(h.handle, archive);
    let base = await f.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
    let serial = 0;
    const write = async (domainId, recordId, overrides) => {
        base = await f.core.applyLifecycleCommand(h.handle, base.session.sessionId,
            { type: 'lifecycle', invocationId: 'context-send-' + ++serial, action: { kind: 'app.command', domainId, recordId, commandId: 'save',
                args: { ...f.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === domainId).initial, ...overrides } } },
            { expectedRevisionId: base.revision.revisionId });
    };
    await write('availability', 'main', { available: true });
    await write('beliefs', 'mine', { text: 'ACTOR PRIVATE RUMOR', status: 'believed', channel: 'rumor' });
    await write('memories', 'mine', { text: 'NARRATOR ONLY MEMORY' });
    const request = { requestId: 'context-send', role: 'narrator', sessionId: base.session.sessionId, revisionId: base.revision.revisionId };
    const binding = { sourceAuthority: 'native_session', sourceRef: { sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId } };
    const context = new ContextPort({ sessionCore: f.core, authorizeContext: async () => ({ allowed, grantDigest }),
        contextOptions: { countTokens: text => Math.max(1, Math.ceil(String(text).length / 4)) } });
    const compiled = await context.compile(h.handle, { ownerRef: { handle: h.handle }, sourceBinding: { ...binding, bindingDigest: hashNativeDocument(binding) },
        audience: { kind: 'actor', id: actorId }, taskPurpose: 'actor-cognition', grantDigest, inputRefs: [], tokenBudget: { modelContextLimit: 16000, responseReserve: 512 } });
    const seeded = await seedGenerationProfiles({ ...h, endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` });
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0],
        executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: limits } });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, providers: { 'provider.openai-compatible': createHttpGenerationProvider() },
        secretPort: { resolveSecret: async () => 'synthetic-secret' } });
    const budget = new BudgetPort({ sessionCore: f.core }), authorityRef = await budget.authorityFor(h.handle, { domain: 'native_session', sessionId: base.session.sessionId });
    const effectId = createNativeId('orchestrationEffect'), childRunId = createNativeId('orchestrationRun');
    await budget.reserveChild(h.handle, { authorityRef, parentReservationId: null, childRunId, ceiling: limits, limits });
    const bank = budget.sendBank(h.handle, { authorityRef, reservationId: childRunId, limits, effectId, firstOrdinal: 0 });
    const execute = () => host.execute(h.handle, request, undefined, undefined, { orchestrationSend: { bank, context: { port: context, compiled } } });
    return { h, bank, seen, errors, execute, revoke: () => { allowed = false; },
        move: () => write('beliefs', 'mine', { text: 'Changed actor source' }), onReply: callback => { reply = callback; },
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.engine.close(); await h.cleanup(); } };
}

// Actual local HTTP requests with original persistent Session banks/compiler.
// Grant callback is controlled: this proves gate enforcement, not production
// Plan delegation admission or a real-provider semantic leakage guarantee.
describe.each(CONTRACT_HARNESSES)('$name ContextPort GenerationHost HTTP boundary', ({ make }) => {
    test('the actual provider body uses Actor selection instead of the wider Narrator default', async () => {
        const f = await fixture(make);
        try {
            await f.execute();
            expect(f.errors).toEqual([]); expect(f.seen).toHaveLength(1);
            expect(JSON.stringify(f.seen[0])).toContain('ACTOR PRIVATE RUMOR');
            expect(JSON.stringify(f.seen[0])).not.toContain('NARRATOR ONLY MEMORY');
        } finally { await f.cleanup(); }
    });

    test.each(['grant', 'source'])('%s revoked after budget admission prevents any HTTP send', async reason => {
        const f = await fixture(make);
        try {
            const admit = f.bank.admit;
            f.bank.admit = async input => { const fact = await admit(input); if (reason === 'grant') f.revoke(); else await f.move(); return fact; };
            await expect(f.execute()).rejects.toThrow();
            expect(f.seen).toHaveLength(0); expect(f.errors).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test.each(['grant', 'source'])('%s revoked during HTTP response cannot be consumed as an authorized result', async reason => {
        const f = await fixture(make);
        try {
            f.onReply(() => reason === 'grant' ? f.revoke() : f.move());
            await expect(f.execute()).rejects.toThrow();
            expect(f.seen).toHaveLength(1); expect(f.errors).toEqual([]);
        } finally { await f.cleanup(); }
    });
});

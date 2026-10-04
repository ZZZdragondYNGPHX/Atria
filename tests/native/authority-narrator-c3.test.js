import http from 'node:http';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';

function narrator(f) {
    const t = lifecycleFixture().taskRuntime.tasks[0]; t.id = 'narrate'; t.executionClass = 'turn_blocking';
    t.inputSchema = { type: 'object', properties: { stages: { type: 'array', items: { type: 'object', properties: {}, additionalProperties: false }, maxItems: 4 } }, required: ['stages'], additionalProperties: false };
    t.context = ['input', 'projection', 'world']; t.resultPolicy = { resultClass: 'presentation', sink: 'artifact' };
    t.variants[0].outputSchema = { type: 'string', maxLength: 256 };
    f.contract.taskRuntime.tasks = [t]; f.contract.taskRuntime.slots = [{ id: 'structured', requiredCapabilities: [] }]; f.contract.taskRuntime.turn.narratorTaskId = 'narrate';
    f.contract.informationRuntime.sources.push({ id: 'private.other', kind: 'application', semantic: 'truth', scopeId: 'session', domainId: 'other', fields: [['text']] });
    f.contract.informationRuntime.views.push({ id: 'private.task', audience: 'task', taskId: 'narrate', sources: ['private.other'], exposure: ['context'], knowledge: false, memory: false, maxItems: 32, maxCharacters: 4096 });
    f.logic.transactions[0].effects.find(item => item.domainId === 'other').args.text = 'OTHER CANDIDATE PRIVATE';
    f.base.manifest.resources = [
        { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: t.variants[0].prompt.resourceId, revision: 'r1', displayName: 'Narrator', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
        { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: t.variants[0].generation.resourceId, revision: 'r1', displayName: 'Narrator', output: { maxTokens: 128 } } },
    ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId } }));
}
describe('C3 declared Narrator Task boundary', () => {
    let h, f, server, seen, payload;
    beforeEach(async () => {
        h = await makeTempFsEngineHarness(); seen = []; payload = 'Safe declared narration.';
        server = http.createServer(async (req, res) => {
            const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = JSON.parse(Buffer.concat(chunks)); seen.push(body);
            const message = body.tools?.length ? { content: '', tool_calls: [{ id: 'choose', type: 'function', function: { name: body.tools[0].function.name, arguments: JSON.stringify(f.selection.input) } }] }
                : { content: JSON.stringify(payload) };
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message }] }));
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        f = await authorityTurnFixture(h, 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions', narrator);
        f.input.slotBindings = { structured: { scope: 'player', runtimeRouteId: f.seeded.routes[0].runtimeRouteId } };
    });
    afterEach(async () => { if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); await h?.cleanup(); });
    test('declared Narrator receives candidate Narrator projection, not private Task/world context', async () => {
        const next = await f.host.executeTurn(h.handle, f.input);
        expect(next.timeline.at(-1).content).toBe(payload);
        expect(seen).toHaveLength(2); expect(seen[1].response_format).toBeDefined();
        expect(JSON.stringify(seen[1])).toContain('visible new note'); expect(JSON.stringify(seen[1])).toContain('Note action resolved.');
        expect(JSON.stringify(seen)).not.toContain('OTHER CANDIDATE PRIVATE'); expect(JSON.stringify(seen)).not.toContain('PRIVATE READ SENTINEL');
        expect(JSON.stringify(seen)).not.toContain('Authoritative current Native world');
    });
    test.each(['', { narrative: 'mechanical mutation', outcomes: [{ patch: true }] }])('invalid Narrator payload never publishes %j', async value => {
        payload = value;
        await expect(f.host.executeTurn(h.handle, f.input)).rejects.toThrow();
        const current = await f.core.load(h.handle, f.base.session.sessionId);
        expect(current.revision).toEqual(f.base.revision); expect(current.states).toEqual(f.base.states);
    });
    test('private preparation clones accepted input and draft; later caller mutation cannot alter the proof', async () => {
        const selection = structuredClone(f.selection); const proof = await f.core.prepareAuthorityTurn(h.handle, f.base, selection);
        selection.transactionId = 'changed'; selection.input.amount = 999;
        const next = await f.core.finalizeTurn(h.handle, f.base.session.sessionId, { invocationId: 'proof', authorityProof: proof.proof,
            envelope: { schemaVersion: 1, narrative: 'Bounded', outcomes: [], diagnostics: [] } }, { expectedRevisionId: f.base.revision.revisionId });
        expect(next.states.atri_action_receipts.receipts[0].actionId).toBe(f.selection.transactionId);
        expect(next.states.atri_lifecycle.clocks.world).toBe(1);
    });
});

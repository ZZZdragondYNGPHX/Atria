import { jest, test, expect } from '@jest/globals';
import { createServer } from 'node:http';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';
import { AgentEvidenceRepository } from '../../src/native/agent-intelligence/evidence-repository.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { cancelSessionMaintenance } from '../../src/native/session-maintenance.js';
import { beginHostCapture } from '../../src/native/agent-intelligence/host-capture.js';

test('an unavailable diagnostic record does not block a normal RP turn or replay its model request', async () => {
    const h = await makeTempFsEngine(); let requests = 0;
    const server = createServer(async (req, res) => {
        for await (const _chunk of req) { /* Consume the request body. */ }
        requests++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'The story continues.' } }], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let begin, fixture;
    try {
        const f = fixture = await authorityTurnFixture(h, `http://127.0.0.1:${server.address().port}/v1/chat/completions`);
        begin = jest.spyOn(AgentEvidenceRepository.prototype, 'begin').mockRejectedValue(new Error('Diagnostic storage unavailable'));
        const result = await f.host.executeTurn(h.handle, f.input, undefined, undefined, { transaction: f.selection });
        expect(result.timeline.at(-1).content).toBe('The story continues.');
        expect(result.evidenceCapture.status).toBe('failed');
        expect((await f.core.load(h.handle, f.input.sessionId)).timeline.at(-1).content).toBe('The story continues.');
        await f.host.executeTurn(h.handle, f.input, undefined, undefined, { transaction: f.selection });
        expect(requests).toBe(1);
    } finally {
        await Promise.allSettled([...nativeTaskScheduler.operations.values()].filter(operation => operation.owner === h.handle && operation.handle).map(operation => operation.handle.result));
        if (fixture) cancelSessionMaintenance(fixture.sessionRepo, h.handle, fixture.input.sessionId);
        begin?.mockRestore(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup();
    }
});

test('capture keeps attempt events in memory and persists the final trace once', async () => {
    const repository = { begin: jest.fn().mockResolvedValue({ evidenceId: 'local-evidence' }), update: jest.fn().mockResolvedValue({}) };
    const capture = await beginHostCapture(repository, 'owner', { domain: 'rp_session', sessionId: 'session' }, 'local-run');
    await capture.attempt({ type: 'model.started', eventId: 'first' });
    await capture.attempt({ type: 'model.started', eventId: 'second' });
    expect(repository.update).not.toHaveBeenCalled();
    await capture.fail(false);
    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(repository.update.mock.calls[0][2].status).toBe('failed');
});

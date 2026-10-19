import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));

describe.each(harnesses)('$name original Project JSON completion proof', ({ make }) => {
    test.each([false, true])('the original wrapper binds exact text and tool calls=%s without granting a Task tool', async calls => {
        const f = await projectModelFixture(make, calls ? { responseBody: () => ({ id: 'project-tool-response', status: 'completed',
            output: [{ id: 'project-tool-item', type: 'function_call', status: 'completed', call_id: 'project-tool-call', name: 'atri_agent_get_project', arguments: '{}' }],
            usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } }) } : {});
        const generate = ModelPort.prototype.generate; let checked = false;
        ModelPort.prototype.generate = async function (...args) {
            const result = await generate.apply(this, args), ref = f.effects[0];
            const inspect = value => ModelPort.prototype.inspectResultCompletion.call(this, f.h.handle, { ...ref, result: value });
            const proof = await inspect(result);
            const payload = { text: result.generated.response.text, toolCalls: result.generated.response.toolCalls.map(({ id, name, args }) => ({ id, name, args })) };
            expect(proof).toMatchObject({ outputType: 'json', payloadHash: hash(payload), sourceBinding: { sourceAuthority: 'project' } });
            for (const copy of [{ ...result }, structuredClone(result), {}]) await expect(inspect(copy)).rejects.toThrow('native_orchestration_model_result_completion_required');
            // The completion result is frozen; its generated payload cannot be swapped.
            expect(Object.isFrozen(result)).toBe(true);
            expect(() => { result.generated = { ...result.generated, response: { ...result.generated.response, toolCalls: [] } }; }).toThrow(TypeError);
            checked = true;
            expect((await inspect(result)).payloadHash).toBe(proof.payloadHash);
            return result;
        };
        try {
            const outcome = await f.run().then(value => ({ value }), error => ({ error }));
            // An unlisted tool call is refused by generation before any completion proof.
            if (calls) { expect(outcome.error?.code).toBe('generation_response_invalid'); expect(checked).toBe(false); }
            else { if (outcome.error) throw outcome.error; expect(checked).toBe(true); }
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.filter(attempt => attempt.kind === 'generation').flatMap(attempt => attempt.calls)).toEqual([]);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision); expect(f.requests).toHaveLength(1);
        } finally { ModelPort.prototype.generate = generate; await f.cleanup(); }
    });
});

import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';

const expected = { owner: 'owner', anchor: { projectId: 'project', taskId: 'task' }, kind: 'model_task', executionClass: 'interactive',
    resources: ['original-model'], key: 'project-parent', fingerprint: 'original-task' };
const child = (key, run) => ({ kind: expected.kind, executionClass: expected.executionClass, resources: expected.resources, key, fingerprint: key,
    fresh: async () => true, finalize: async value => value, run });

test('original Scheduler proves a suspended child control chain without making that control witness an active Model permit', async () => {
    const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1, timeoutMs: 3000 });
    const outerExpected = { ...expected, key: 'held-project-child', fingerprint: 'held-project-child' };
    const innerExpected = { ...expected, key: 'original-frozen-branch', fingerprint: 'original-frozen-branch' };
    let leafBoundary;
    const operation = scheduler.submit({ ...expected, retry: false, fresh: async () => true, finalize: async value => value,
        run: async parent => scheduler.withResourceHandoff(parent, expected, child(outerExpected.key, async heldChild => {
            expect(scheduler.assertFanoutChildBoundary(parent, expected, heldChild, outerExpected).operationId).toBe(heldChild.operationId);
            const result = await scheduler.withResourceHandoff(heldChild, outerExpected, child(innerExpected.key, async leaf => {
                leafBoundary = leaf;
                expect(scheduler.assertFanoutChildControlBoundary(parent, expected, heldChild, outerExpected).operationId).toBe(heldChild.operationId);
                expect(() => scheduler.assertActiveBoundary(heldChild, outerExpected)).toThrow('operation_boundary_denied');
                expect(() => scheduler.assertFanoutChildBoundary(parent, expected, heldChild, outerExpected)).toThrow('operation_boundary_denied');
                expect(scheduler.assertFanoutChildBoundary(heldChild, outerExpected, leaf, innerExpected).operationId).toBe(leaf.operationId);
                expect(() => scheduler.assertFanoutChildControlBoundary(parent, expected, heldChild, { ...outerExpected, resources: ['new-model'] })).toThrow();
                expect(() => scheduler.assertFanoutChildControlBoundary(parent, expected, {}, outerExpected)).toThrow();
                expect(() => scheduler.assertFanoutChildControlBoundary(parent, expected, leaf, innerExpected)).toThrow('operation_handoff_denied');
                return 'original branch result';
            }));
            expect(scheduler.assertFanoutChildBoundary(parent, expected, heldChild, outerExpected).operationId).toBe(heldChild.operationId);
            return result;
        })) });
    await expect(operation.result).resolves.toBe('original branch result');
    expect(() => scheduler.assertActiveBoundary(leafBoundary, innerExpected)).toThrow();
    expect(scheduler.running.size).toBe(0); expect(scheduler.suspended.size).toBe(0);
});

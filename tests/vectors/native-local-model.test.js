import { expect, jest, test } from '@jest/globals';

const events = [];
jest.unstable_mockModule('../../src/transformers.js', () => ({ getPipeline: async (_task, model) => {
    events.push('load:' + model);
    return async text => {
        events.push('start:' + model);
        await new Promise(resolve => setTimeout(resolve, 2));
        events.push('end:' + model);
        if (text === 'fail') throw new Error('inference failed');
        return { data: [1, 2] };
    };
} }));
const { getTransformersVector } = await import('../../src/vectors/embedding.js');
test('exact local model switches wait for current inference and recover after failure', async () => {
    const results = await Promise.allSettled([getTransformersVector('fail', 'model-a'), getTransformersVector('success', 'model-b')]);
    expect(results.map(item => item.status)).toEqual(['rejected', 'fulfilled']);
    expect(results[1].value).toEqual([1, 2]);
    expect(events).toEqual(['load:model-a', 'start:model-a', 'end:model-a', 'load:model-b', 'start:model-b', 'end:model-b']);
});

import { expect, jest, test } from '@jest/globals';
import { WebLlmVectorProvider } from '../../public/scripts/native/retrieval/webllm.js';

function fixture() {
    const engines = [];
    const sdk = {
        ModelType: { embedding: 1 },
        prebuiltAppConfig: { model_list: [{ model_id: 'a', model_type: 1 }, { model_id: 'b', model_type: 1 }, { model_id: 'chat', model_type: 0 }] },
        CreateMLCEngine: jest.fn(async () => {
            const engine = { unload: jest.fn(), embeddings: { create: jest.fn(async ({ input }) => ({ data: input.map((_, index) => ({ index, embedding: [index + 1, 0] })).reverse() })) } };
            engines.push(engine); return engine;
        }),
    };
    return { engines, sdk, provider: new WebLlmVectorProvider({ loadSdk: async () => sdk, gpu: () => ({}) }) };
}

test('browser embeddings use the owned SDK and unload before switching exact models', async () => {
    const { provider, sdk, engines } = fixture();
    expect((await provider.getModels()).map(item => item.model_id)).toEqual(['a', 'b']);
    expect(await provider.embedTexts(['one', 'two'], 'a')).toEqual([[1, 0], [2, 0]]);
    await provider.embedTexts(['three'], 'a');
    expect(sdk.CreateMLCEngine).toHaveBeenCalledTimes(1);
    await provider.embedTexts(['four'], 'b');
    expect(engines[0].unload).toHaveBeenCalledTimes(1);
    expect(sdk.CreateMLCEngine).toHaveBeenLastCalledWith('b');
});

test('unavailable GPU, unsupported model and aborted operations do not infer', async () => {
    const { provider, sdk } = fixture();
    const abort = new AbortController(); abort.abort();
    await expect(provider.embedTexts(['one'], 'a', { signal: abort.signal })).rejects.toThrow();
    await expect(provider.embedTexts(['one'], 'chat')).rejects.toMatchObject({ code: 'native_retrieval_browser_model_invalid' });
    provider.gpu = () => null;
    await expect(provider.embedTexts(['one'], 'a')).rejects.toMatchObject({ code: 'native_retrieval_browser_unavailable' });
    expect(sdk.CreateMLCEngine).not.toHaveBeenCalled();
});

test('queued model changes wait for inference and recover after an unload failure', async () => {
    const { provider, engines } = fixture();
    await provider.embedTexts(['one'], 'a');
    let release;
    engines[0].embeddings.create.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = provider.embedTexts(['two'], 'a');
    await Promise.resolve();
    const next = provider.embedTexts(['three'], 'b');
    expect(engines[0].unload).not.toHaveBeenCalled();
    release({ data: [{ index: 0, embedding: [2] }] });
    expect(await first).toEqual([[2]]); await next;
    engines[1].unload.mockRejectedValueOnce(new Error('unload failed'));
    await expect(provider.embedTexts(['four'], 'a')).rejects.toThrow('unload failed');
    expect(await provider.embedTexts(['five'], 'a')).toEqual([[1, 0]]);
});

test('malformed inference results cannot enter a Native vector collection', async () => {
    const { provider, engines } = fixture();
    await provider.embedTexts(['one'], 'a');
    engines[0].embeddings.create.mockResolvedValueOnce({ data: [{ index: 1, embedding: [NaN] }] });
    await expect(provider.embedTexts(['two'], 'a')).rejects.toThrow('Invalid browser embedding result');
});

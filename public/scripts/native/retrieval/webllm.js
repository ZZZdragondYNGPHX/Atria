// Native browser embedding authority; no extension API or global inference object.
export class WebLlmVectorProvider {
    constructor({ loadSdk = () => import('../../../lib.webllm.bundle.js'), gpu = () => globalThis.navigator?.gpu } = {}) {
        this.loadSdk = loadSdk; this.gpu = gpu; this.engine = null; this.model = null; this.queue = Promise.resolve();
    }
    async getModels() {
        const sdk = await this.loadSdk();
        return sdk.prebuiltAppConfig.model_list.filter(item => item.model_type === sdk.ModelType.embedding);
    }
    embedTexts(texts, modelId, { signal } = {}) {
        const task = async () => {
            signal?.throwIfAborted();
            if (!this.gpu()) throw Object.assign(new Error('This browser does not support WebGPU. Select another Native Retrieval provider.'), { code: 'native_retrieval_browser_unavailable' });
            if (!this.engine || this.model !== modelId) {
                const previous = this.engine; this.engine = null; this.model = null;
                await previous?.unload();
                const sdk = await this.loadSdk(); signal?.throwIfAborted();
                const record = sdk.prebuiltAppConfig.model_list.find(item => item.model_id === modelId && item.model_type === sdk.ModelType.embedding);
                if (!record) throw Object.assign(new Error('Select a supported WebLLM embedding model in Runtime Retrieval.'), { code: 'native_retrieval_browser_model_invalid' });
                this.engine = await sdk.CreateMLCEngine(modelId); this.model = modelId;
            }
            signal?.throwIfAborted();
            const result = await this.engine.embeddings.create({ model: modelId, input: texts, encoding_format: 'float' });
            signal?.throwIfAborted();
            const rows = [...(result.data || [])].sort((a, b) => a.index - b.index);
            if (rows.length !== texts.length || rows.some((row, i) => row.index !== i || !Array.isArray(row.embedding) || !row.embedding.length || row.embedding.some(value => !Number.isFinite(value)))) throw new Error('Invalid browser embedding result');
            return rows.map(row => row.embedding);
        };
        const pending = this.queue.then(task, task); this.queue = pending.catch(() => {}); return pending;
    }
}

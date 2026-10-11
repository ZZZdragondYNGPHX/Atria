import { getPipeline } from '../transformers.js';
const TASK = 'feature-extraction';
let pending = Promise.resolve();

/**
 * Gets the vectorized text in form of an array of numbers.
 * @param {string} text - The text to vectorize
 * @returns {Promise<number[]>} - The vectorized text in form of an array of numbers
 */
export async function getTransformersVector(text, model, { compute, signal } = {}) {
    // A process shares one pipeline per task. Keep inference and a possible
    // model switch together so another exact profile cannot dispose it mid-call.
    const next = pending.catch(() => {}).then(async () => {
        signal?.throwIfAborted(); await compute?.assertCurrent();
        const ticket = await compute?.beforeLocalWork({ items: 1, inputBytes: Buffer.byteLength(text, 'utf8'),
            indexPath: 'transformers:' + (model || 'configured-default'), kind: 'embedding_local' });
        const started = performance.now(), cpu = process.cpuUsage(); let outcome = 'failed';
        try {
            signal?.throwIfAborted(); await compute?.assertCurrent();
            const pipe = await getPipeline(TASK, model);
            signal?.throwIfAborted(); await compute?.assertCurrent();
            const result = await pipe(text, { pooling: 'mean', normalize: true });
            const vector = Array.from(result.data);
            signal?.throwIfAborted(); await compute?.assertCurrent();
            outcome = 'completed';
            return vector;
        } finally {
            const used = process.cpuUsage(cpu);
            await compute?.settleLocalWork(ticket, { wallMs: performance.now() - started, cpuUserMicros: used.user,
                cpuSystemMicros: used.system, cpuScope: 'process', outcome: signal?.aborted ? 'cancelled' : outcome });
            if (outcome === 'completed') { signal?.throwIfAborted(); await compute?.assertCurrent(); }
        }
    });
    pending = next;
    return next;
}

/**
 * Gets the vectorized texts in form of an array of arrays of numbers.
 * @param {string[]} texts - The texts to vectorize
 * @returns {Promise<number[][]>} - The vectorized texts in form of an array of arrays of numbers
 */
export async function getTransformersBatchVector(texts, model, options) {
    const result = [];
    for (const text of texts) {
        result.push(await getTransformersVector(text, model, options));
    }
    return result;
}

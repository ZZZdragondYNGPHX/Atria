import { getPipeline } from '../transformers.js';
const TASK = 'feature-extraction';
let pending = Promise.resolve();

/**
 * Gets the vectorized text in form of an array of numbers.
 * @param {string} text - The text to vectorize
 * @returns {Promise<number[]>} - The vectorized text in form of an array of numbers
 */
export async function getTransformersVector(text, model, { compute, signal } = {}) {
    return (await getTransformersBatchVector([text], model, { compute, signal }))[0];
}

/** One original text batch shares model initialization and one local-work job. */
export async function getTransformersBatchVector(texts, model, { compute, signal } = {}) {
    if (!texts.length) return [];
    // A process shares one pipeline per task. Keep inference and a possible
    // model switch together so another exact profile cannot dispose it mid-call.
    const next = pending.catch(() => {}).then(async () => {
        signal?.throwIfAborted(); await compute?.assertCurrent();
        const ticket = await compute?.beforeLocalWork({ items: texts.length, inputBytes: texts.reduce((bytes, text) => bytes + Buffer.byteLength(text, 'utf8'), 0),
            indexPath: 'transformers:' + (model || 'configured-default'), kind: 'embedding_local' });
        const started = performance.now(), cpu = process.cpuUsage(); let outcome = 'failed';
        try {
            signal?.throwIfAborted(); await compute?.assertCurrent();
            const pipe = await getPipeline(TASK, model);
            signal?.throwIfAborted(); await compute?.assertCurrent();
            const vectors = [];
            for (const text of texts) {
                signal?.throwIfAborted(); await compute?.assertCurrent();
                const result = await pipe(text, { pooling: 'mean', normalize: true });
                vectors.push(Array.from(result.data));
                signal?.throwIfAborted(); await compute?.assertCurrent();
            }
            outcome = 'completed';
            return vectors;
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

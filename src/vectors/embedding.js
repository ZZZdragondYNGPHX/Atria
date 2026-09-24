import { getPipeline } from '../transformers.js';
const TASK = 'feature-extraction';
let pending = Promise.resolve();

/**
 * Gets the vectorized text in form of an array of numbers.
 * @param {string} text - The text to vectorize
 * @returns {Promise<number[]>} - The vectorized text in form of an array of numbers
 */
export async function getTransformersVector(text, model) {
    // A process shares one pipeline per task. Keep inference and a possible
    // model switch together so another exact profile cannot dispose it mid-call.
    const next = pending.catch(() => {}).then(async () => {
        const pipe = await getPipeline(TASK, model);
        const result = await pipe(text, { pooling: 'mean', normalize: true });
        return Array.from(result.data);
    });
    pending = next;
    return next;
}

/**
 * Gets the vectorized texts in form of an array of arrays of numbers.
 * @param {string[]} texts - The texts to vectorize
 * @returns {Promise<number[][]>} - The vectorized texts in form of an array of arrays of numbers
 */
export async function getTransformersBatchVector(texts, model) {
    const result = [];
    for (const text of texts) {
        result.push(await getTransformersVector(text, model));
    }
    return result;
}

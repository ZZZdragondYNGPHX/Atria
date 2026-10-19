// Existing wire batch size; each batch still needs its own original admission.
export function embeddingBatches(texts) {
    const batchSize = 10;
    return Array.from({ length: Math.ceil(texts.length / batchSize) }, (_, i) => texts.slice(i * batchSize, (i + 1) * batchSize));
}

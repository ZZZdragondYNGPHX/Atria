// Deterministic derived features. The owner is the existing proof-bound Corpus
// cache; request visibility/time/state filtering and DF remain live at ranking.
const indexes = new WeakMap();
export const memoryTerms = text => {
    const words = String(text || '').normalize('NFKC').toLowerCase().match(/[a-z0-9_]+|\p{Script=Han}/gu) || [];
    return words.flatMap((word, index) => /\p{Script=Han}/u.test(word) && /\p{Script=Han}/u.test(words[index + 1] || '')
        ? [word, word + words[index + 1]] : [word]);
};
export function memoryBag(text) {
    const words = memoryTerms(text), counts = new Map();
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
    return { length: words.length, counts };
}
export function prepareMemoryRanking(corpus, previous) {
    const bags = new Map(), postings = new Map(), adjacency = new Map();
    let prepared = 0, reused = 0, bytes = 0;
    for (const doc of corpus.documents) {
        const prior = previous?.bags.get(doc.id);
        const bag = prior?.text === doc.text ? prior.bag : memoryBag(doc.text);
        if (prior?.text === doc.text) reused++; else prepared++;
        bags.set(doc.id, { text: doc.text, bag });
        bytes += doc.id.length * 2 + 64;
        for (const term of bag.counts.keys()) {
            if (!postings.has(term)) postings.set(term, new Set());
            postings.get(term).add(doc.id); bytes += term.length * 2 + 48;
        }
        if (doc.kind === 'relation') for (const id of [doc.sourceEntityId, doc.targetEntityId]) {
            if (!adjacency.has(id)) adjacency.set(id, []);
            adjacency.get(id).push(doc.id); bytes += 32;
        }
    }
    return { bags, postings, adjacency, bytes, prepared, reused };
}
export function attachMemoryRanking(corpus, index) { indexes.set(corpus, index); return corpus; }
export function memoryRankingIndex(corpus) { return indexes.get(corpus); }

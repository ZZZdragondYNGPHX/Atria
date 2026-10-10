// SPDX-License-Identifier: AGPL-3.0-or-later
const commitment = /承诺|答应|约定|归还|履行|\b(promise|commitment|return|owe)\b/iu;
const pronoun = /[他她它](?:们)?|那件事|这件事|这样|那时|\b(he|she|they|it|that)\b/iu;

/** Seeds come only from the already legal short-lived source/scene projection. */
export function memoryQuerySeeds(query, entities, sceneText = '') {
    const text = String(query || '').normalize('NFKC');
    const userInput = text.match(/^User input: ([^\n]*)/u)?.[1] ?? text;
    const reference = pronoun.test(userInput);
    const scene = reference ? String(sceneText).slice(-600) : '';
    const actors = entities.filter(e => e.type === 'Character' && [e.canonicalName, ...e.aliases].some(name => name && scene.includes(name)));
    const aliasSeeds = actors.length === 1 ? [actors[0].canonicalName, ...actors[0].aliases] : [];
    const seekingCommitment = commitment.test(userInput);
    const seedText = [userInput, ...aliasSeeds, scene, seekingCommitment ? '承诺 答应 约定 归还 尚未履行' : ''].filter(Boolean).join('\n');
    return { userInput, seedText, reference, unresolvedReference: reference && actors.length !== 1,
        actorSeeds: actors.map(e => e.id), commitment: seekingCommitment, sceneSeeded: Boolean(scene),
        // Query projection only: does not create a Goal or establish recollection.
        producer: 'hybrid-query-v1' };
}

export function memorySemanticHints(text) {
    const positive = String(text).replace(/没有(?:新增)?承诺|无(?:新增)?承诺|没有(?:新增)?约定|\bno new promises?\b/giu, '');
    return { commitment: commitment.test(positive),
        epistemic: /相信|信以为|认为|\bbeliev/iu.test(text) ? 'belief_source'
            : /告诉|听说|传言|据说|\brumou?r|\bhearsay/iu.test(text) ? 'exposure_source'
                : /声称|说法|\bclaims?\b/iu.test(text) ? 'assertion_source' : 'historical_source' };
}

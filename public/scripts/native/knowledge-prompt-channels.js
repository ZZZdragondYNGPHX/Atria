/** Transitional prompt-channel boundary for the shared generation assembler.
 * Native candidates, selection and lifecycle never enter the World Info ABI. */
export function nativeKnowledgePromptChannels(evaluation) {
    const before = evaluation.before.map(item => item.content);
    const after = evaluation.after.map(item => item.content);
    const source = item => ({ id: item.identity, content: item.content,
        sourceVersion: item.knowledgeRevisionId,
        knowledge: { knowledgeBindingId: item.knowledgeBindingId, knowledgeBaseId: item.knowledgeBaseId,
            knowledgeRevisionId: item.knowledgeRevisionId, knowledgeEntryId: item.knowledgeEntryId,
            source: item.source, target: item.target, activationReason: item.activationReason } });
    return {
        nativeKnowledge: evaluation,
        worldInfoString: [...before, ...after].join('\n'),
        worldInfoBeforeEntries: before, worldInfoAfterEntries: after,
        worldInfoBefore: before.join('\n'), worldInfoAfter: after.join('\n'),
        worldInfoExamples: [], worldInfoDepth: [], anBefore: [], anAfter: [], outletEntries: {},
        worldInfoProvenance: {
            worldInfoBeforeEntries: evaluation.before.map(source), worldInfoAfterEntries: evaluation.after.map(source),
            worldInfoExamples: [], worldInfoDepth: [], anBefore: [], anAfter: [], outletEntries: {},
        },
    };
}

const S = maxLength => ({ type: 'string', maxLength });
const b = value => ({ schema: { type: 'boolean' }, value });
const s = (value = '', max = 2048) => ({ schema: S(max), value });
export const state = {
    showStatus:b(true),busy: b(true), loading: b(true), error: s(), notice: s(),
    draft: s('', 8192), draftTarget: s('', 128), draftStale: b(false),
    initialized: b(false), unresolved: b(false), canSubmit: b(false), submitDisabled: b(true),
    generationText: s('', 65536), generationState: s('idle', 32),
    narration: s('', 65536), acknowledged: s('', 2048),
};

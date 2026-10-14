// Reuse the owning Skill repository's reads. A compile preview must not call
// pin(), which creates durable .history files even when no model is sent.
export function createPreviewSkillRepository(repository) {
    const current = async ({ scope, name, version }) => {
        const entry = await repository.get(name, scope);
        if (!entry || entry.installedHash !== version) throw Object.assign(new Error('Skill changed during preview'), { code: 'native_generation_preview_skill_stale' });
        return entry;
    };
    return {
        ...repository,
        pin: async ({ scope, name, expectedHash }) => {
            await current({ scope, name, version: expectedHash });
            return { scope, name, version: expectedHash };
        },
        readFile: async ({ version, ...input }) => {
            await current({ ...input, version });
            const result = await repository.readFile(input);
            await current({ ...input, version });
            return result;
        },
    };
}

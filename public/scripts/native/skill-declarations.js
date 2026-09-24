export function skillDeclarationId(value) {
    const id = typeof value === 'string' ? value : value?.skillId ?? value?.id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(id)) {
        throw new TypeError('Each Skill declaration needs a valid Skill ID.');
    }
    if (typeof value === 'object' && value.skillId && value.id && value.skillId !== value.id) {
        throw new TypeError('Skill declaration IDs must agree.');
    }
    return id;
}

/** Preserve plugin fields and the existing string/object declaration shapes. */
export function validateSkillDeclarations(value) {
    if (!Array.isArray(value)) throw new TypeError('Skill declarations must be a list.');
    const ids = value.map(skillDeclarationId);
    if (new Set(ids).size !== ids.length) throw new TypeError('Skill declarations must not repeat a Skill ID.');
    return value;
}

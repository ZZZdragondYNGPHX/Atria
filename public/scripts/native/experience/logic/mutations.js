// Authoring shorthand lowers to the existing Command -> Event -> Reducer IR.
// Paths are fixed by the author; neither UI args nor a model can choose a root.
export function lowerDeclarativeMutations(raw) {
    if (raw.schemaVersion !== 2) throw new Error('Mutations require declarative logic schemaVersion 2');
    for (const key of Object.keys(raw)) if (!['schemaVersion', 'commands', 'reducers', 'rules', 'interpretations', 'mutations'].includes(key)) throw new Error('Unknown logic v2 field');
    if (!Array.isArray(raw.mutations) || raw.mutations.length > 128) throw new Error('Invalid mutations');
    const commands = [...(raw.commands ?? [])]; const reducers = [...(raw.reducers ?? [])];
    for (const mutation of raw.mutations) {
        if (!mutation || typeof mutation !== 'object' || Array.isArray(mutation)) throw new Error('Invalid mutation');
        for (const key of Object.keys(mutation)) if (!['id', 'argsSchema', 'validators', 'assign', 'event'].includes(key)) throw new Error('Unknown mutation field');
        if (typeof mutation.id !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(mutation.id)) throw new Error('Invalid mutation id');
        if (typeof mutation.event !== 'string' || !/^[a-z][a-z0-9._-]{0,127}$/.test(mutation.event)) throw new Error('Invalid mutation event');
        if (commands.some(item => item.id === mutation.id) || reducers.some(item => item.type === mutation.event)) throw new Error('Mutation identity collision');
        if (!mutation.argsSchema || mutation.argsSchema.type !== 'object' || mutation.argsSchema.additionalProperties !== false) throw new Error('Mutation args require a closed object schema');
        if (!mutation.assign || typeof mutation.assign !== 'object' || Array.isArray(mutation.assign) || !Object.keys(mutation.assign).length) throw new Error('Mutation requires fixed assignments');
        const payload = Object.fromEntries(Object.keys(mutation.argsSchema.properties ?? {}).map(key => {
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) throw new Error('Invalid mutation arg');
            return [key, { formula: 'args.' + key }];
        }));
        if (/rng\./.test(JSON.stringify(mutation))) throw new Error('Mutation shorthand must be deterministic');
        commands.push({ id: mutation.id, argsSchema: mutation.argsSchema, validators: mutation.validators ?? [], events: [{ type: mutation.event, payload }] });
        reducers.push({ type: mutation.event, payloadSchema: mutation.argsSchema, assign: mutation.assign });
    }
    return { commands, reducers, rules: raw.rules ?? [], interpretations: raw.interpretations ?? [] };
}

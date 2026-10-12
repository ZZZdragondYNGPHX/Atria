const immutableCopy = value => {
    const freeze = item => {
        if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); }
        return item;
    };
    return freeze(JSON.parse(JSON.stringify(value)));
};

const authored = new Set(['description', 'personality', 'scenario']);
const expression = new Set(['examples', 'mes_example', 'systemPrompt', 'postHistoryInstructions']);

// Exact installed author definitions only. Dynamic Session state is not an input.
export function projectActorDefinition(snapshot, actorId = snapshot.entryPoint.primaryActorId ?? snapshot.entryPoint.actorIds[0]) {
    if (!actorId || !snapshot.entryPoint.actorIds.includes(actorId)) return null;
    const actors = snapshot.manifest.actors.filter(actor => actor.actorId === actorId);
    if (actors.length !== 1) throw new TypeError('Selected Actor definition must be unique');
    const actor = actors[0], profile = actor.profile ?? {};
    return immutableCopy({ schemaVersion: 1,
        source: { packageId: snapshot.manifest.packageId, packageVersionId: snapshot.manifest.packageVersionId,
            entryPointId: snapshot.entryPoint.entryPointId, actorId },
        identity: { actorId, displayName: actor.displayName, ...(actor.role == null ? {} : { role: actor.role }) },
        authored: Object.fromEntries(Object.entries(profile).filter(([key]) => authored.has(key))),
        expression: Object.fromEntries(Object.entries(profile).filter(([key]) => expression.has(key))),
        scopedRaw: Object.fromEntries(Object.entries(profile).filter(([key]) => !authored.has(key) && !expression.has(key))),
    });
}

export function legacyActorText(definition, packageName) {
    const stable = definition?.authored ?? {}, voice = definition?.expression ?? {};
    return structuredClone({ name: definition?.identity.displayName ?? packageName, description: stable.description ?? '',
        personality: stable.personality ?? '', scenario: stable.scenario ?? '', mes_example: voice.examples ?? voice.mes_example ?? '',
        first_mes: '', alternate_greetings: [], system_prompt: voice.systemPrompt ?? '',
        post_history_instructions: voice.postHistoryInstructions ?? '', extensions: {} });
}

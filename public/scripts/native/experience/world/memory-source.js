function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

export function buildGameEventMemorySource(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new Error('Game Event memory source requires an event object');
    }
    const eventId = String(event.id || '').trim();
    const type = String(event.type || '').trim();
    const branchId = String(event.branchId || '').trim();
    if (!eventId || !type || !branchId) {
        throw new Error('Game Event memory source requires event id, type and Native branchId');
    }
    const commandId = String(event?.meta?.command?.id || '').trim();
    const payload = clone(event.payload ?? {});
    const content = JSON.stringify({
        eventId,
        type,
        payload,
        branchId,
        ...(commandId ? { commandId } : {}),
    });

    return Object.freeze({
        id: 'game-event:' + eventId,
        kind: 'game_event',
        eventId,
        branchId,
        fingerprint: JSON.stringify([
            eventId,
            type,
            payload,
            branchId,
            commandId,
        ]),
        content,
    });
}

export function listGameEventMemorySources(journal) {
    return Object.freeze(
        (journal?.events || []).map(buildGameEventMemorySource),
    );
}

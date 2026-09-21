import { getGameBranchId, isGameBranchPathCompatible } from './branch.js';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

export function buildGameEventMemorySource(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new Error('Game Event memory source requires an event object');
    }
    const eventId = String(event.id || '').trim();
    const type = String(event.type || '').trim();
    if (!eventId || !type) {
        throw new Error('Game Event memory source requires event id and type');
    }
    const branchPath = Array.isArray(event.branchPath) ? [...event.branchPath] : [];
    const branchId = String(event.branchId || getGameBranchId(branchPath));
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
            branchPath,
            commandId,
        ]),
        content,
    });
}

export function listActiveGameEventMemorySources(journal, activeBranchPath) {
    const branchPath = Array.isArray(activeBranchPath) ? [...activeBranchPath] : [];
    return Object.freeze(
        (journal?.events || [])
            .filter(event => isGameBranchPathCompatible(event?.branchPath || [], branchPath))
            .map(buildGameEventMemorySource),
    );
}

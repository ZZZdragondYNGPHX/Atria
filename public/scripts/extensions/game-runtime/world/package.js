import { assertValidWorldState } from './schema.js';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

export function loadGameWorldDefinition(packageState, options = {}) {
    const snapshot = options.nativeRuntime?.snapshot ?? packageState?.snapshot;
    if (!snapshot) throw new Error('Native Game World requires an active Native Session snapshot');

    const stateRoot = snapshot.states?.atri_world_state;
    if (!stateRoot || typeof stateRoot !== 'object') {
        throw new Error('Native Session is missing atri_world_state');
    }

    const requestedWorldId = packageState?.runtime?.primaryWorldId ?? stateRoot.primaryWorldId ?? null;
    if (!requestedWorldId) {
        const initialState = clone(stateRoot.initialState ?? {});
        const schema = { type: 'object' };
        assertValidWorldState(initialState, schema);
        return Object.freeze({
            worldId: null,
            worldRevisionId: null,
            schema,
            baseline: clone(initialState),
        });
    }

    const packaged = snapshot.worlds?.find(item => item?.world?.worldId === requestedWorldId);
    const slot = stateRoot.worlds?.[requestedWorldId];
    if (!packaged || !slot || slot.worldRevisionId !== packaged.revision.worldRevisionId) {
        throw new Error('Native Game World dependency does not match the Session PackageVersion');
    }

    const schema = clone(packaged.revision.schema ?? { type: 'object' });
    const baseline = clone(packaged.revision.baseline ?? {});
    assertValidWorldState(slot.state, schema);
    return Object.freeze({
        worldId: requestedWorldId,
        worldRevisionId: packaged.revision.worldRevisionId,
        schema,
        baseline,
    });
}

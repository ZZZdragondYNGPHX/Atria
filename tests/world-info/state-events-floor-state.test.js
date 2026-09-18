import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { createFloorStateWithDeps } from '../../public/scripts/floor-state.js';
import {
    buildWorldInfoEventRuntimeState,
    fingerprintWorldInfoStateSnapshot,
    snapshotWorldInfoStateProviders,
} from '../../public/scripts/atri-world-info-state-events.js';

function targetKey(target) {
    if (!target || typeof target !== 'object') return '';
    if (target.is_group) return `g:${String(target.id ?? '')}`;
    return `c:${String(target.avatar_url ?? '')}/${String(target.file_name ?? '')}`;
}

function makeStore(currentTargetRef) {
    const partitions = new Map();
    const partitionFor = target => {
        const resolved = target || currentTargetRef.value;
        const key = targetKey(resolved);
        if (!partitions.has(key)) partitions.set(key, new Map());
        return partitions.get(key);
    };
    return {
        async getChatState(ns, options) {
            const value = partitionFor(options?.target).get(String(ns).toLowerCase());
            return { ok: true, state: value == null ? null : structuredClone(value) };
        },
        async updateChatState(ns, updater, options) {
            const part = partitionFor(options?.target);
            const key = String(ns).toLowerCase();
            const current = part.get(key) ?? null;
            const next = await updater(current == null ? null : structuredClone(current));
            if (next == null) part.delete(key);
            else part.set(key, structuredClone(next));
            return { ok: true, state: part.get(key) ?? null, updated: true };
        },
        async deleteChatState(ns, options) {
            partitionFor(options?.target).delete(String(ns).toLowerCase());
            return { ok: true };
        },
        rawFor(target) {
            return partitionFor(target);
        },
    };
}

async function buildObjectPatchOperationsAsync(prev, next) {
    const { compare } = await import('../../public/scripts/util/fast-json-patch.js');
    return compare(prev ?? {}, next ?? {});
}

function msg(swipeId = 0) {
    return { swipe_id: swipeId, mes: 'fixture' };
}

function snapshot(place) {
    return snapshotWorldInfoStateProviders([{
        providerId: 'mvu',
        status: 'ready',
        fields: [{ path: ['scene', 'place'], value: place }],
    }]);
}

function makeFixture() {
    const sourceTarget = { is_group: false, avatar_url: 'hero.png', file_name: 'main' };
    const targetTarget = { is_group: false, avatar_url: 'hero.png', file_name: 'branch' };
    const currentTargetRef = { value: sourceTarget };
    const chatRef = { value: [msg(0), msg(0)] };
    const store = makeStore(currentTargetRef);
    const deps = {
        getChatState: store.getChatState.bind(store),
        updateChatState: store.updateChatState.bind(store),
        deleteChatState: store.deleteChatState.bind(store),
        buildObjectPatchOperationsAsync,
        getChat: () => chatRef.value,
    };
    const floorState = createFloorStateWithDeps({ namespace: 'atri_world_info_events' }, deps);
    return { floorState, store, chatRef, currentTargetRef, sourceTarget, targetTarget };
}

describe('W-03b transition baseline FloorState lifecycle', () => {
    test('switching to another swipe rolls back a baseline committed on the old swipe', async () => {
        const f = makeFixture();
        const tavern = snapshot('tavern');
        const clocktower = snapshot('clocktower');

        const seeded = buildWorldInfoEventRuntimeState({}, null, tavern, { floor: 0, swipeId: 0 });
        expect((await f.floorState.update(() => seeded, { floor: 0, swipeId: 0 })).ok).toBe(true);

        const transitioned = buildWorldInfoEventRuntimeState(
            seeded,
            tavern,
            clocktower,
            { floor: 1, swipeId: 0 },
        );
        expect((await f.floorState.update(() => transitioned, { floor: 1, swipeId: 0 })).ok).toBe(true);
        expect(fingerprintWorldInfoStateSnapshot((await f.floorState.get()).state.baseline))
            .toBe(fingerprintWorldInfoStateSnapshot(clocktower));

        f.chatRef.value[1] = msg(1);
        await f.floorState.__handleMessageSwiped();
        await f.floorState.ready();

        const rolledBack = (await f.floorState.get()).state;
        expect(fingerprintWorldInfoStateSnapshot(rolledBack.baseline))
            .toBe(fingerprintWorldInfoStateSnapshot(tavern));
        expect(rolledBack.transition).toBeNull();
    });

    test('branch inherits only baseline commits at or before the branch point', async () => {
        const f = makeFixture();
        const tavern = snapshot('tavern');
        const clocktower = snapshot('clocktower');

        const seeded = buildWorldInfoEventRuntimeState({}, null, tavern, { floor: 0, swipeId: 0 });
        await f.floorState.update(() => seeded, { floor: 0, swipeId: 0 });
        const transitioned = buildWorldInfoEventRuntimeState(
            seeded,
            tavern,
            clocktower,
            { floor: 1, swipeId: 0 },
        );
        await f.floorState.update(() => transitioned, { floor: 1, swipeId: 0 });

        await f.floorState.__handleBranchCreated({
            mesId: 0,
            sourceTarget: f.sourceTarget,
            targetTarget: f.targetTarget,
        });

        f.currentTargetRef.value = f.targetTarget;
        f.chatRef.value = [msg(0)];
        await f.floorState.__handleChatChanged();

        const branchState = (await f.floorState.get()).state;
        expect(fingerprintWorldInfoStateSnapshot(branchState.baseline))
            .toBe(fingerprintWorldInfoStateSnapshot(tavern));
        expect(branchState.transition).toBeNull();
        expect(f.store.rawFor(f.targetTarget).has('atri_world_info_events__floor_log')).toBe(true);
    });
});


describe('W-03b startup registration contract', () => {
    test('World Info startup registers the event FloorState before any event scan', () => {
        const source = readFileSync(
            new URL('../../public/scripts/world-info.js', import.meta.url),
            'utf8',
        );
        const start = source.indexOf('export function initWorldInfo() {');
        expect(start).toBeGreaterThanOrEqual(0);
        const nextExport = source.indexOf('\nexport ', start + 1);
        const body = source.slice(start, nextExport > start ? nextExport : start + 6000);
        expect(body).toContain('getWorldInfoEventFloorState()');
        expect(body).toContain('Failed to register event FloorState during init');
    });
});

import { describe, expect, test } from '@jest/globals';

import { createGameLlmRuntime } from '../../public/scripts/extensions/game-runtime/llm/runtime.js';

function makeSession() {
    let state = {
        hp: 10,
        inCombat: true,
        secretSeed: 999,
    };
    let journal = {
        nextSeq: 2,
        events: [
            {
                id: 'event:1',
                seq: 1,
                type: 'CombatStarted',
                payload: { enemy: 'guard' },
                branchPath: [0, 1],
                meta: {
                    command: { id: 'start_combat', transactionId: 'tx:1' },
                },
            },
            {
                id: 'event:other',
                seq: 99,
                type: 'HiddenBranchEvent',
                payload: { secret: true },
                branchPath: [0, 2],
            },
        ],
    };

    return {
        getState: () => structuredClone(state),
        getJournal: () => structuredClone(journal),
        getBranchPath: () => [0, 1],
        getCommands: () => [
            {
                id: 'attack',
                description: 'Attack the current enemy',
                argsSchema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
                llm: { expose: true },
            },
            {
                id: 'internal_debug',
                argsSchema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
            },
        ],
        setState(next) {
            state = structuredClone(next);
        },
        setJournal(next) {
            journal = structuredClone(next);
        },
    };
}

describe('R5 Game LLM Runtime vertical slice', () => {
    test('builds active-branch Observation and filters Command tools from it', async () => {
        const session = makeSession();
        const runtime = createGameLlmRuntime({
            worldSession: session,
            observationProjectors: [
                {
                    id: 'player',
                    select: world => ({ hp: world.hp }),
                },
                {
                    id: 'combat',
                    select: world => ({ active: world.inCombat }),
                },
            ],
            commandVisibility: {
                attack: context => context.observation.views.combat.active === true,
            },
        });

        const observation = runtime.buildObservation();

        expect(observation.views).toEqual({
            player: { hp: 10 },
            combat: { active: true },
        });
        expect(observation.recentEvents.map(event => event.type))
            .toEqual(['CombatStarted']);
        expect(JSON.stringify(observation)).not.toContain('secretSeed');
        expect(JSON.stringify(observation)).not.toContain('HiddenBranchEvent');

        const catalog = await runtime.getCommandTools({ observation });
        expect(catalog.tools.map(tool => tool.commandId)).toEqual(['attack']);
        expect(catalog.trace).toContainEqual({
            commandId: 'internal_debug',
            status: 'not_exposed',
        });
    });

    test('UI command result stays on the same Turn Context and refreshes authoritative Observation', () => {
        const session = makeSession();
        const runtime = createGameLlmRuntime({
            worldSession: session,
            observationProjectors: [{
                id: 'player',
                select: world => ({ hp: world.hp }),
            }],
        });

        const turn = runtime.beginTurn({
            origin: 'ui_action',
            serial: 5,
        });

        expect(turn.resolution.intentResolver).toBe('skipped');
        expect(turn.observation.views.player.hp).toBe(10);

        session.setState({
            hp: 7,
            inCombat: true,
            secretSeed: 999,
        });
        session.setJournal({
            nextSeq: 3,
            events: [
                {
                    id: 'event:1',
                    seq: 1,
                    type: 'CombatStarted',
                    payload: { enemy: 'guard' },
                    branchPath: [0, 1],
                },
                {
                    id: 'event:2',
                    seq: 2,
                    type: 'DamageDealt',
                    payload: { amount: 3 },
                    branchPath: [0, 1],
                    meta: {
                        command: { id: 'attack', transactionId: 'tx:2' },
                    },
                },
            ],
        });

        const advanced = runtime.applyCommandResult(turn, {
            status: 'committed',
            commandId: 'attack',
            command: {
                id: 'attack',
                args: {},
            },
            events: [{
                id: 'event:2',
                type: 'DamageDealt',
                payload: { amount: 3 },
                branchPath: [0, 1],
            }],
            afterState: { hp: 7, inCombat: true, secretSeed: 999 },
        });

        expect(advanced.turnId).toBe(turn.turnId);
        expect(advanced.resolution).toEqual({
            intentResolver: 'skipped',
            eventInterpreter: 'not_requested',
            reason: 'typed_ui_command',
        });
        expect(advanced.resolvedCommands).toEqual([{
            id: 'attack',
            args: {},
        }]);
        expect(advanced.commandResults).toHaveLength(1);
        expect(advanced.committedEvents).toHaveLength(1);
        expect(advanced.observation.views.player.hp).toBe(7);
        expect(JSON.stringify(advanced.observation)).not.toContain('secretSeed');
    });
});

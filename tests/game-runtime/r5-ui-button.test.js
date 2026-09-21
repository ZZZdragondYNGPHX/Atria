/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { createGameLlmRuntime } from '../../public/scripts/extensions/game-runtime/llm/runtime.js';
import { createGameTurnController } from '../../public/scripts/extensions/game-runtime/llm/turn-controller.js';
import { advanceTurnContext } from '../../public/scripts/extensions/game-runtime/llm/turn-context.js';
import { activateGamePackageUi } from '../../public/scripts/extensions/game-runtime/ui/live.js';

async function settle(predicate) {
    for (let index = 0; index < 30; index += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw new Error('UI action did not settle');
}

describe('R5 declarative UI button full turn pipeline', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <main id="sheld">
                <div id="chat"></div>
                <div id="form_sheld">
                    <div id="send_form"></div>
                </div>
            </main>
            <aside id="left-nav-panel"></aside>
            <aside id="right-nav-panel"></aside>
        `;
    });

    test('button -> typed Command -> World commit -> Narrator final prose', async () => {
        let state = { door: 'closed' };
        const journal = { nextSeq: 1, events: [] };
        let dispatchCount = 0;
        const worldSession = {
            getState: () => structuredClone(state),
            getJournal: () => structuredClone(journal),
            getBranchPath: () => [0, 0],
            getInterpretationMappings: () => [],
            getCommands: () => [{
                id: 'open_door',
                description: 'Open the door',
                argsSchema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
                llm: { expose: true },
            }],
            validateCommand(id, args) {
                const ok = id === 'open_door' && Object.keys(args || {}).length === 0;
                return { ok, errors: ok ? [] : ['invalid'], args: ok ? {} : null };
            },
            async dispatchCommandInternal(id, args) {
                if (!this.validateCommand(id, args).ok) throw new Error('invalid command');
                dispatchCount += 1;
                state = { door: 'open' };
                const event = {
                    id: 'event:1',
                    seq: 1,
                    type: 'DoorOpened',
                    payload: {},
                    branchPath: [0, 0],
                    branchId: 'swipes:0.0',
                    meta: { command: { id: 'open_door' } },
                };
                journal.events = [event];
                journal.nextSeq = 2;
                return {
                    status: 'committed',
                    committed: true,
                    commandId: 'open_door',
                    command: { id: 'open_door', args: {} },
                    events: [structuredClone(event)],
                    afterState: structuredClone(state),
                };
            },
            async simulateCommandInternal() {
                return { status: 'simulated', committed: false };
            },
        };

        const runtime = createGameLlmRuntime({
            worldSession,
            observationProjectors: [{
                id: 'scene',
                select: world => ({ door: world.door }),
            }],
            memoryBridge: {
                async recall() {
                    return { status: 'empty', packet: null, query: 'door' };
                },
            },
            narrativeCoordinator: {
                async produce(turn) {
                    expect(turn.observation.views.scene.door).toBe('open');
                    return {
                        producer: 'narrator',
                        finalProse: 'The door opens.',
                        turn: advanceTurnContext(turn, {
                            narrative: {
                                status: 'final',
                                producer: 'narrator',
                                text: 'The door opens.',
                            },
                        }),
                    };
                },
            },
            memoryIngestion: {
                async ingest(turn) {
                    return {
                        status: 'ingested',
                        update: { status: 'ingested' },
                        turn,
                    };
                },
            },
        });
        const controller = createGameTurnController({
            adapter: {
                async createAttemptBranch() {
                    return { branchPath: [0, 0] };
                },
            },
        });

        let finalized = null;
        const dispatchCommand = async (commandId, args) => {
            const turn = runtime.beginTurn({ origin: 'ui_action' });
            finalized = await controller.submit(turn, {
                execute: ({ turn: attemptTurn, signal, transition }) => (
                    runtime.completeUiActionTurn({
                        commandId,
                        args,
                        turnContext: attemptTurn,
                        abortSignal: signal,
                        transition,
                    })
                ),
            });
            return finalized;
        };

        const fetchImpl = jest.fn(async url => {
            expect(url).toBe('/api/card-app/hero/ui/hud.html');
            return {
                ok: true,
                status: 200,
                async text() {
                    return '<button id="open-door" data-atria-command="open_door">Open</button>';
                },
            };
        });

        const session = await activateGamePackageUi({
            charId: 'hero',
            manifest: {
                id: 'r5.ui',
                ui: {
                    mode: 'component',
                    entry: 'ui/hud.html',
                    surface: 'chat.header',
                },
            },
        }, worldSession, {
            document,
            fetchImpl,
            dispatchCommand,
        });

        const button = document.getElementById('open-door');
        button.click();
        await settle(() => button.dataset.atriaCommandState === 'success');

        expect(dispatchCount).toBe(1);
        expect(state).toEqual({ door: 'open' });
        expect(finalized).toMatchObject({
            phase: 'finalized',
            active: true,
        });
        expect(finalized.result.turn.narrative).toEqual({
            status: 'final',
            producer: 'narrator',
            text: 'The door opens.',
        });

        await session.dispose();
    });
});

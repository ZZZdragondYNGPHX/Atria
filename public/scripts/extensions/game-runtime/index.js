import { loadGameLogicDefinition } from './logic/package.js';
import {
    getModelRuntimeConfig as readModelRuntimeConfig,
    getRuntimeRoleConfig as readRuntimeRoleConfig,
    setRuntimeRoleConfig as writeRuntimeRoleConfig,
    ensureModelRuntimeConfig,
} from './llm/model-runtime-config.js';
import {
    buildNarrativeContract,
    createNarrativeCoordinator,
    createNarrator,
} from './llm/narrative.js';
import { createGameOrchestratorBridge } from './llm/orchestrator-bridge.js';
import { createRuntimeRoleRouter } from './llm/roles.js';
import { createGameLlmRuntime } from './llm/runtime.js';
import { createGameTurnController } from './llm/turn-controller.js';
import { listActiveGameEventMemorySources } from './world/memory-source.js';
import { resolveGamePackageAssetUrl } from './manifest.js';
import { GAME_PACKAGE_STATUS, loadGamePackage } from './package-loader.js';
import { activateGamePackageUi } from './ui/live.js';
import { createGameWorldSession } from './world/session.js';

const MODULE_NAME = 'game-runtime';
export const GAME_PACKAGE_CHANGED_EVENT = 'atria:game-package-changed';

const atriaContext = Atria.getContext();
const eventSource = atriaContext.eventSource;
const eventTypes = atriaContext.eventTypes;
const getRequestHeaders = atriaContext.getRequestHeaders;
const getContext = Atria.getContext;
const registerExtensionApi = atriaContext.registerExtensionApi;
const extensionSettings = atriaContext.extensionSettings;
const saveSettingsDebounced = atriaContext.saveSettingsDebounced;

let revision = 0;
let currentWorldSession = null;
let currentUiSession = null;
let currentLlmSession = null;
let currentTurnController = null;
let currentNarrator = null;
let currentRoleRouter = null;
let currentOrchestratorBridge = null;
let currentNarrativeCoordinator = null;
let currentTurnRecipes = null;
let currentPackage = Object.freeze({
    status: GAME_PACKAGE_STATUS.NONE,
    active: false,
    charId: '',
    manifest: null,
    errors: [],
});

function getRuntimeSettingsRoot() {
    extensionSettings[MODULE_NAME] ||= {};
    ensureModelRuntimeConfig(extensionSettings[MODULE_NAME]);
    return extensionSettings[MODULE_NAME];
}

export function getModelRuntimeConfig() {
    return structuredClone(readModelRuntimeConfig(getRuntimeSettingsRoot()));
}

export function getRuntimeRoleConfig(role) {
    return structuredClone(readRuntimeRoleConfig(getRuntimeSettingsRoot(), role));
}

export function setRuntimeRoleConfig(role, patch = {}) {
    const next = writeRuntimeRoleConfig(getRuntimeSettingsRoot(), role, patch);
    saveSettingsDebounced?.();
    return structuredClone(next);
}

function disposeRuntimeSystems() {
    currentLlmSession = null;
    currentTurnController = null;
    currentNarrator = null;
    currentRoleRouter = null;
    currentOrchestratorBridge = null;
    currentNarrativeCoordinator = null;
    currentTurnRecipes = null;
}

function createRuntimeSystems(worldSession) {
    if (!worldSession) return null;

    const roleRouter = createRuntimeRoleRouter({
        generateTask: atriaContext.generateTask,
        getRoleConfig: role => readRuntimeRoleConfig(getRuntimeSettingsRoot(), role),
    });
    const orchestratorBridge = createGameOrchestratorBridge({
        context: atriaContext,
        getWorldState: () => worldSession.getState(),
        getJournal: () => worldSession.getJournal(),
    });
    const narrator = createNarrator({ roleRouter });
    const narrativeCoordinator = createNarrativeCoordinator({
        narrator,
        orchestratorBridge,
        getWorldState: () => worldSession.getState(),
        getJournal: () => worldSession.getJournal(),
    });
    const llmSession = createGameLlmRuntime({
        worldSession,
        context: atriaContext,
        roleRouter,
        narrativeCoordinator,
        getOrchestrationMode: () => orchestratorBridge.getMode(),
        generateTask: atriaContext.generateTask,
    });

    const attemptBranches = new Map();
    const turnController = createGameTurnController({
        adapter: {
            async createAttemptBranch({ attemptIndex }) {
                const base = typeof worldSession.getChatBranchPathInternal === 'function'
                    ? worldSession.getChatBranchPathInternal()
                    : worldSession.getBranchPath();
                return {
                    branchPath: [...base, attemptIndex],
                    variantId: 'attempt:' + attemptIndex,
                };
            },
            async prepareAttempt({ attemptId, branch }) {
                attemptBranches.set(attemptId, [...branch.branchPath]);
                await worldSession.switchBranchPathInternal?.(branch.branchPath);
            },
            async activateAttempt({ attemptId, branch }) {
                attemptBranches.set(attemptId, [...branch.branchPath]);
                await worldSession.switchBranchPathInternal?.(branch.branchPath);
            },
            async activateAttemptBranch({ attemptId, branch }) {
                attemptBranches.set(attemptId, [...branch.branchPath]);
                await worldSession.switchBranchPathInternal?.(branch.branchPath);
            },
            async deactivateAttempt({ restoreAttemptId }) {
                const restore = restoreAttemptId
                    ? attemptBranches.get(restoreAttemptId)
                    : null;
                if (restore) {
                    await worldSession.switchBranchPathInternal?.(restore);
                } else {
                    await worldSession.clearBranchOverrideInternal?.();
                }
            },
            async restoreBeforeTurn() {
                await worldSession.clearBranchOverrideInternal?.();
            },
        },
    });

    return {
        roleRouter,
        narrator,
        orchestratorBridge,
        narrativeCoordinator,
        llmSession,
        turnController,
        recipes: new Map(),
    };
}

function getCurrentCharacterPackageId() {
    const context = getContext();
    const characterId = context?.characterId;
    if (characterId === null || characterId === undefined) return '';
    const avatar = String(context?.characters?.[characterId]?.avatar || '').trim();
    return avatar.endsWith('.png') ? avatar.slice(0, -4) : avatar;
}

function publishPackageState(next) {
    currentPackage = Object.freeze({
        ...next,
        errors: Object.freeze([...(next?.errors || [])]),
    });

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent(GAME_PACKAGE_CHANGED_EVENT, {
            detail: {
                status: currentPackage.status,
                active: currentPackage.active,
                charId: currentPackage.charId,
                manifest: currentPackage.manifest,
                errors: [...currentPackage.errors],
            },
        }));
    }
}

async function disposeCurrentUi() {
    const session = currentUiSession;
    currentUiSession = null;
    if (session?.dispose) {
        try {
            await session.dispose();
        } catch (error) {
            console.warn(`[${MODULE_NAME}] Failed to dispose Game UI`, error);
        }
    }
}

async function exitCurrentGameUi() {
    await disposeCurrentUi();
    return true;
}

function stopCurrentGeneration() {
    const context = getContext();
    try {
        context?.abortController?.abort?.();
    } catch (error) {
        console.warn(`[${MODULE_NAME}] Failed to abort generation controller`, error);
    }

    const stopButton = globalThis.document?.getElementById?.('mes_stop');
    if (stopButton && typeof stopButton.click === 'function') {
        stopButton.click();
    }
    return true;
}

async function disableCurrentPackageForSession() {
    revision += 1;
    await disposeCurrentUi();
    currentWorldSession = null;
    disposeRuntimeSystems();
    publishPackageState({
        ...currentPackage,
        active: false,
        errors: [
            ...currentPackage.errors,
            'Game Package disabled for the current session by host recovery.',
        ],
    });
    return true;
}

function openGameDiagnostics() {
    const button = globalThis.document?.getElementById?.('server_logs_button');
    if (button && typeof button.click === 'function') {
        button.click();
        return true;
    }
    console.warn(`[${MODULE_NAME}] Diagnostics control is unavailable`);
    return false;
}

export async function reloadGamePackage() {
    const loadRevision = ++revision;
    const charId = getCurrentCharacterPackageId();
    let next = await loadGamePackage(charId, {
        headers: getRequestHeaders(),
    });

    if (loadRevision !== revision) {
        return currentPackage;
    }

    let nextWorldSession = null;
    let nextUiSession = null;
    let nextRuntimeSystems = null;
    if (next.status === GAME_PACKAGE_STATUS.READY) {
        try {
            const logicDefinition = await loadGameLogicDefinition(next, {
                headers: getRequestHeaders(),
            });
            nextWorldSession = await createGameWorldSession({
                packageState: next,
                context: atriaContext,
                getChat: () => getContext()?.chat || [],
                headers: getRequestHeaders(),
                commands: logicDefinition.commands,
                reducers: logicDefinition.reducers,
                rules: logicDefinition.rules,
                interpretations: logicDefinition.interpretations,
            });
            nextRuntimeSystems = createRuntimeSystems(nextWorldSession);
            nextUiSession = await activateGamePackageUi(next, nextWorldSession, {
                headers: getRequestHeaders(),
                hostActions: {
                    exitGameUi: exitCurrentGameUi,
                    stopGeneration: stopCurrentGeneration,
                    disablePackage: disableCurrentPackageForSession,
                    openDiagnostics: openGameDiagnostics,
                },
            });
        } catch (error) {
            await nextUiSession?.dispose?.();
            nextUiSession = null;
            nextWorldSession = null;
            nextRuntimeSystems = null;
            next = {
                status: GAME_PACKAGE_STATUS.INVALID,
                active: false,
                charId,
                manifest: null,
                errors: [
                    'Game Runtime initialization failed: ' + (error?.message || String(error)),
                ],
            };
        }
    }

    if (loadRevision !== revision) {
        await nextUiSession?.dispose?.();
        return currentPackage;
    }

    await disposeCurrentUi();
    disposeRuntimeSystems();
    currentWorldSession = nextWorldSession;
    currentUiSession = nextUiSession;
    currentLlmSession = nextRuntimeSystems?.llmSession || null;
    currentTurnController = nextRuntimeSystems?.turnController || null;
    currentNarrator = nextRuntimeSystems?.narrator || null;
    currentRoleRouter = nextRuntimeSystems?.roleRouter || null;
    currentOrchestratorBridge = nextRuntimeSystems?.orchestratorBridge || null;
    currentNarrativeCoordinator = nextRuntimeSystems?.narrativeCoordinator || null;
    currentTurnRecipes = nextRuntimeSystems?.recipes || null;
    publishPackageState(next);

    if (next.status === GAME_PACKAGE_STATUS.INVALID) {
        console.warn(`[${MODULE_NAME}] Rejected invalid Game Package for ${charId}`, next.errors);
    } else if (next.status === GAME_PACKAGE_STATUS.ERROR) {
        console.error(`[${MODULE_NAME}] Failed to load Game Package for ${charId}`, next.errors);
    } else if (next.status === GAME_PACKAGE_STATUS.READY) {
        console.info(`[${MODULE_NAME}] Activated package ${next.manifest.id}@${next.manifest.version} for ${charId}`);
    }

    return currentPackage;
}

async function syncCurrentWorldBranch() {
    const session = currentWorldSession;
    if (!session) return null;

    try {
        const result = await session.syncBranch();
        currentUiSession?.refresh?.();
        return result;
    } catch (error) {
        if (session !== currentWorldSession) return null;
        currentWorldSession = null;
        disposeRuntimeSystems();
        await disposeCurrentUi();
        publishPackageState({
            ...currentPackage,
            status: GAME_PACKAGE_STATUS.ERROR,
            active: false,
            errors: [
                'World Runtime branch replay failed: ' + (error?.message || String(error)),
            ],
        });
        console.error(`[${MODULE_NAME}] World branch replay failed`, error);
        return null;
    }
}

export function getGamePackageState() {
    return {
        ...currentPackage,
        errors: [...currentPackage.errors],
        manifest: currentPackage.manifest ? structuredClone(currentPackage.manifest) : null,
    };
}

export function isGamePackageActive() {
    return currentPackage.status === GAME_PACKAGE_STATUS.READY && currentPackage.active === true;
}

export function resolveGameAsset(relativePath) {
    if (!isGamePackageActive() || !currentPackage.charId) {
        throw new Error('No active Game Package');
    }
    return resolveGamePackageAssetUrl(currentPackage.charId, relativePath);
}

export function getWorldState() {
    return currentWorldSession ? currentWorldSession.getState() : null;
}

export function getWorldJournal() {
    return currentWorldSession ? currentWorldSession.getJournal() : null;
}

export function getWorldBranchPath() {
    return currentWorldSession ? currentWorldSession.getBranchPath() : [];
}

export function getAuthoritativeMemorySources() {
    if (!currentWorldSession) return [];
    return listActiveGameEventMemorySources(
        currentWorldSession.getJournal(),
        currentWorldSession.getBranchPath(),
    );
}

export function getLlmRuntimeState() {
    return {
        active: Boolean(currentLlmSession),
        roles: getModelRuntimeConfig().roles,
        packageId: currentPackage.manifest?.id || '',
        branchPath: getWorldBranchPath(),
    };
}

export async function submitGameFreeText(input = {}) {
    if (!currentLlmSession || !currentTurnController) {
        throw new Error('No active Game LLM Runtime');
    }
    const userInput = String(input.userInput || '').trim();
    if (!userInput) throw new Error('submitGameFreeText requires userInput');

    const baseTurn = currentLlmSession.beginTurn({
        origin: 'free_text',
        userInput,
        recentChat: input.recentChat || [],
        constraints: input.constraints || [],
    });
    currentTurnRecipes?.set(baseTurn.turnId, {
        kind: 'free_text',
        input: structuredClone({
            ...input,
            userInput,
        }),
    });
    return currentTurnController.submit(baseTurn, {
        execute: ({ turn, signal, transition }) => currentLlmSession.completeFreeTextTurn({
            ...input,
            userInput,
            turnContext: turn,
            abortSignal: signal,
            transition,
        }),
    });
}

export async function submitGameUiAction(input = {}) {
    if (!currentLlmSession || !currentTurnController) {
        throw new Error('No active Game LLM Runtime');
    }
    const commandId = String(input.commandId || '').trim();
    if (!commandId) throw new Error('submitGameUiAction requires commandId');

    const baseTurn = currentLlmSession.beginTurn({
        origin: 'ui_action',
        recentChat: input.recentChat || [],
        constraints: input.constraints || [],
    });
    currentTurnRecipes?.set(baseTurn.turnId, {
        kind: 'ui_action',
        input: structuredClone({
            ...input,
            commandId,
        }),
    });
    return currentTurnController.submit(baseTurn, {
        execute: ({ turn, signal, transition }) => currentLlmSession.completeUiActionTurn({
            ...input,
            commandId,
            turnContext: turn,
            abortSignal: signal,
            transition,
        }),
    });
}

export function stopGameAttempt(attemptId) {
    return currentTurnController?.stop(attemptId) || false;
}

export async function undoGameTurn(turnId) {
    return currentTurnController?.undo(turnId) || false;
}

export async function deleteGameAssistantResult(attemptId) {
    if (!currentTurnController) return false;
    return currentTurnController.deleteAssistantResult(attemptId);
}

export async function retryGameTurn(turnId, overrides = {}) {
    if (!currentTurnController || !currentLlmSession) {
        throw new Error('No active Game Turn Controller');
    }
    const recipe = currentTurnRecipes?.get(String(turnId || ''));
    if (!recipe) throw new Error(`No retry recipe for Turn '${String(turnId || '')}'`);
    const input = {
        ...structuredClone(recipe.input),
        ...structuredClone(overrides),
    };

    return currentTurnController.retryTurn(turnId, {
        execute: ({ turn, signal, transition }) => (
            recipe.kind === 'ui_action'
                ? currentLlmSession.completeUiActionTurn({
                    ...input,
                    turnContext: turn,
                    abortSignal: signal,
                    transition,
                })
                : currentLlmSession.completeFreeTextTurn({
                    ...input,
                    turnContext: turn,
                    abortSignal: signal,
                    transition,
                })
        ),
    });
}

export async function switchGameVariant(attemptId) {
    if (!currentTurnController) throw new Error('No active Game Turn Controller');
    return currentTurnController.switchVariant(attemptId);
}

export async function rewriteGameNarrative(attemptId, input = {}) {
    if (!currentTurnController || !currentNarrator) {
        throw new Error('No active Game Narrative Runtime');
    }
    const instruction = String(input.instruction || '').trim();
    return currentTurnController.rewriteNarrative(attemptId, {
        producer: input.producer,
        rewrite: async (turn) => {
            const producer = String(turn.narrative?.producer || 'narrator');
            if (producer === 'director') {
                if (!currentOrchestratorBridge) {
                    throw new Error('Director rewrite requires Orchestrator bridge');
                }
                const contract = structuredClone(buildNarrativeContract(turn));
                if (instruction) {
                    contract.hardConstraints = [
                        ...(contract.hardConstraints || []),
                        'Rewrite Narrative instruction: ' + instruction,
                    ];
                }
                const directed = await currentOrchestratorBridge.runDirector(turn, {
                    contract,
                    abortSignal: input.abortSignal,
                });
                return directed.finalProse;
            }

            const contract = structuredClone(buildNarrativeContract(turn));
            if (instruction) {
                contract.hardConstraints = [
                    ...(contract.hardConstraints || []),
                    'Rewrite Narrative instruction: ' + instruction,
                ];
            }
            const narrated = await currentNarrator.narrate(turn, {
                contract,
                abortSignal: input.abortSignal,
            });
            return narrated.finalProse;
        },
    });
}

export function getGameTurn(turnId) {
    return currentTurnController?.getTurn(turnId) || null;
}

export function getGameAttempt(attemptId) {
    return currentTurnController?.getAttempt(attemptId) || null;
}

eventSource.on(eventTypes.CHAT_CHANGED, () => {
    void reloadGamePackage();
});

for (const structuralEvent of [
    eventTypes.MESSAGE_SWIPED,
    eventTypes.MESSAGE_SWIPE_DELETED,
    eventTypes.MESSAGE_DELETED,
    eventTypes.CHAT_BRANCH_CREATED,
].filter(Boolean)) {
    eventSource.on(structuralEvent, () => {
        void syncCurrentWorldBranch();
    });
}

registerExtensionApi(MODULE_NAME, {
    reloadPackage: reloadGamePackage,
    getPackageState: getGamePackageState,
    isActive: isGamePackageActive,
    resolveAsset: resolveGameAsset,
    getWorldState,
    getWorldJournal,
    getWorldBranchPath,
    getAuthoritativeMemorySources,
    getModelRuntimeConfig,
    getRuntimeRoleConfig,
    setRuntimeRoleConfig,
    getLlmRuntimeState,
    submitFreeText: submitGameFreeText,
    submitUiAction: submitGameUiAction,
    stopAttempt: stopGameAttempt,
    undoTurn: undoGameTurn,
    deleteAssistantResult: deleteGameAssistantResult,
    retryTurn: retryGameTurn,
    switchVariant: switchGameVariant,
    rewriteNarrative: rewriteGameNarrative,
    getTurn: getGameTurn,
    getAttempt: getGameAttempt,
    exitUi: exitCurrentGameUi,
    disableForSession: disableCurrentPackageForSession,
});

queueMicrotask(() => {
    void reloadGamePackage();
});

console.info(`[${MODULE_NAME}] Foundation loaded`);

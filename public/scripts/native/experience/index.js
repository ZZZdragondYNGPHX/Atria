import { createReplyVariantController } from '../reply-variants.js';
import { executeFirstPartyGeneration } from '../generation-compat.js';
import { nativeGenerationActive } from '../generation-client.js';
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
import { loadGameObservationDefinitions } from './llm/declarative-observations.js';
import { createGameLlmRuntime } from './llm/runtime.js';
import { createGameTurnController } from './llm/turn-controller.js';
import { listGameEventMemorySources } from './world/memory-source.js';
import { GAME_PACKAGE_STATUS, loadNativeGamePackage } from './package-loader.js';
import { activateNativeExperienceRuntime } from './ui/live.js';
import { createGameWorldSession } from './world/session.js';
import {
    NATIVE_SESSION_LIFECYCLE,
    onNativeSessionLifecycle,
} from '../session-lifecycle.js';
import { nativeProductClient } from '../product-client.js';
import { nativeSessionRuntime } from '../session-runtime.js';
import { createNativeUiStateStorage } from '../ui-state-storage.js';

const MODULE_NAME = 'game-runtime';
export const GAME_PACKAGE_CHANGED_EVENT = 'atria:game-package-changed';

const atriaContext = Atria.getContext();
const eventSource = atriaContext.eventSource;
const eventTypes = atriaContext.eventTypes;
const getRequestHeaders = atriaContext.getRequestHeaders;
const getContext = Atria.getContext;
const registerCapabilityApi = atriaContext.registerCapabilityApi;
const capabilitySettings = atriaContext.capabilitySettings;
const saveSettingsDebounced = atriaContext.saveSettingsDebounced;

let revision = 0;
let currentWorldSession = null;
let currentUiSession = null;
let currentReplyController = null;
let currentLlmSession = null;
let currentTurnController = null;
let currentNarrator = null;
let currentOrchestratorBridge = null;
let currentTurnRecipes = null;
let currentPackage = Object.freeze({
    status: GAME_PACKAGE_STATUS.NONE,
    active: false,
    sessionId: '',
    descriptor: null,
    runtime: null,
    errors: [],
});

function getRuntimeSettingsRoot() {
    capabilitySettings[MODULE_NAME] ||= {};
    ensureModelRuntimeConfig(capabilitySettings[MODULE_NAME]);
    return capabilitySettings[MODULE_NAME];
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
    currentOrchestratorBridge = null;
    currentTurnRecipes = null;
}

function createRuntimeSystems(worldSession, options = {}) {
    if (!worldSession) return null;

    const roleRouter = createRuntimeRoleRouter(nativeGenerationActive() ? {
        executeGeneration: (role, request) => executeFirstPartyGeneration(atriaContext, role, request),
    } : {
        generateTask: request => executeFirstPartyGeneration(atriaContext, 'narrator', request),
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
        observationProjectors: options.observationProjectors || [],
        getOrchestrationMode: () => orchestratorBridge.getMode(),
        generateTask: request => executeFirstPartyGeneration(atriaContext, 'narrator', request),
    });

    const attemptBranches = new Map();
    const turnBases = new Map();

    async function ensureBranch(branchId) {
        if (nativeSessionRuntime.snapshot?.revision?.branchId === branchId) return;
        await nativeSessionRuntime.switchBranch(branchId);
    }

    async function publishAttemptNarrative({ turnId, attemptId, turn }) {
        const prose = String(turn?.narrative?.text || '').trim();
        if (!prose) return null;
        const liveContext = getContext();
        await liveContext.addMessages({
            name: liveContext.name2 || 'Assistant',
            mes: prose,
            is_user: false,
            is_system: false,
            extra: {
                atria_game_turn_id: turnId,
                atria_game_attempt_id: attemptId,
            },
        });
        await nativeSessionRuntime.persist();
        return nativeSessionRuntime.snapshot?.timeline?.at(-1)?.messageId ?? null;
    }

    const turnController = createGameTurnController({
        adapter: {
            async createAttemptBranch({ turnId, attemptId, kind, baseAnchor }) {
                if (!nativeSessionRuntime.active) {
                    throw new Error('Game Turn attempt requires an active Native Session');
                }
                turnBases.set(turnId, structuredClone(baseAnchor));
                const forked = await nativeSessionRuntime.forkRevision(baseAnchor.revisionId, {
                    displayName: 'Game ' + String(kind || 'attempt'),
                });
                const branch = {
                    sessionId: forked.session.sessionId,
                    branchId: forked.revision.branchId,
                    revisionId: forked.revision.revisionId,
                };
                if (attemptId) attemptBranches.set(attemptId, branch);
                return branch;
            },
            async prepareAttempt({ turnId, attemptId, branch }) {
                attemptBranches.set(attemptId, structuredClone(branch));
                turnBases.set(turnId, turnBases.get(turnId) || structuredClone(branch));
                await ensureBranch(branch.branchId);
            },
            async activateAttempt({ turnId, attemptId, branch, turn }) {
                attemptBranches.set(attemptId, structuredClone(branch));
                await ensureBranch(branch.branchId);
                await publishAttemptNarrative({ turnId, attemptId, turn });
            },
            async activateAttemptBranch({ attemptId, branch }) {
                attemptBranches.set(attemptId, structuredClone(branch));
                await ensureBranch(branch.branchId);
            },
            async deactivateAttempt({ turnId, restoreAttemptId }) {
                const restore = restoreAttemptId ? attemptBranches.get(restoreAttemptId) : null;
                const base = turnBases.get(turnId);
                const target = restore || base;
                if (target?.branchId) await ensureBranch(target.branchId);
            },
            async restoreBeforeTurn({ turnId }) {
                const base = turnBases.get(turnId);
                if (base?.branchId) await ensureBranch(base.branchId);
            },
            async deleteAssistantResult({ turnId }) {
                const base = turnBases.get(turnId);
                if (base?.branchId) await ensureBranch(base.branchId);
            },
            async replaceNarrative() {
                throw new Error('Committed Native narrative cannot be edited in place; retry the Turn to create a new Branch');
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
                sessionId: currentPackage.sessionId,
                descriptor: currentPackage.descriptor,
                experience: currentPackage.descriptor?.experience ?? null,
                errors: [...currentPackage.errors],
            },
        }));
    }
}

async function disposeCurrentUi() {
    currentReplyController?.dispose(); currentReplyController = null;
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

async function saveCurrentGameSession() {
    const sessionId = String(
        currentPackage.sessionId
        || nativeSessionRuntime.snapshot?.session?.sessionId
        || '',
    ).trim();
    if (!sessionId) throw new Error('No active Native Session to save');
    return nativeProductClient.createSave(sessionId, { kind: 'quick' });
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
    const sessionId = nativeSessionRuntime.active
        ? String(nativeSessionRuntime.snapshot?.session?.sessionId || '')
        : '';
    let next = await loadNativeGamePackage(sessionId, { headers: getRequestHeaders() });
    if (loadRevision !== revision) return currentPackage;

    let nextWorldSession = null;
    let nextRuntimeSystems = null;
    if (next.status === GAME_PACKAGE_STATUS.READY && next.active) {
        try {
            next = { ...next, snapshot: nativeSessionRuntime.snapshot };
            const [logicDefinition, observationProjectors] = await Promise.all([
                loadGameLogicDefinition(next, { headers: getRequestHeaders() }),
                loadGameObservationDefinitions(next, { headers: getRequestHeaders() }),
            ]);
            nextWorldSession = await createGameWorldSession({
                packageState: next,
                nativeRuntime: nativeSessionRuntime,
                commands: logicDefinition.commands,
                reducers: logicDefinition.reducers,
                rules: logicDefinition.rules,
                interpretations: logicDefinition.interpretations,
            });
            nextRuntimeSystems = createRuntimeSystems(nextWorldSession, { observationProjectors });
        } catch (error) {
            nextWorldSession = null;
            nextRuntimeSystems = null;
            next = {
                status: GAME_PACKAGE_STATUS.INVALID,
                active: false,
                sessionId,
                descriptor: null,
                runtime: null,
                errors: ['Game Runtime initialization failed: ' + (error?.message || String(error))],
            };
        }
    }

    if (loadRevision !== revision) return currentPackage;
    await disposeCurrentUi();
    disposeRuntimeSystems();
    currentWorldSession = nextWorldSession;
    currentLlmSession = nextRuntimeSystems?.llmSession || null;
    currentTurnController = nextRuntimeSystems?.turnController || null;
    currentNarrator = nextRuntimeSystems?.narrator || null;
    currentOrchestratorBridge = nextRuntimeSystems?.orchestratorBridge || null;
    currentTurnRecipes = nextRuntimeSystems?.recipes || null;

    if (next.status === GAME_PACKAGE_STATUS.READY && next.active) {
        try {
            currentReplyController = createReplyVariantController({
                getContext() {
                    const snapshot = nativeSessionRuntime.snapshot;
                    return { sessionId: snapshot?.session.sessionId, revisionId: snapshot?.revision.revisionId,
                        branchId: snapshot?.revision.branchId, tailMessageId: snapshot?.timeline.at(-1)?.messageId,
                        isHistory: nativeSessionRuntime.history, busy: Boolean(nativeSessionRuntime.generation || nativeSessionRuntime.host?.isGenerating?.()),
                        canWrite: nativeSessionRuntime.active && !nativeSessionRuntime.history && !nativeSessionRuntime.failed,
                        canFork: nativeSessionRuntime.active && !nativeSessionRuntime.failed };
                },
                onInspect: target => nativeSessionRuntime.open(target.sessionId, { revisionId: target.revisionId }),
                onSwitchBranch: branchId => nativeSessionRuntime.switchBranch(branchId),
                onRetry: () => getContext().generate('regenerate'),
                onFork: target => nativeSessionRuntime.forkRevision(target.revisionId),
            });
            currentUiSession = await activateNativeExperienceRuntime(next, currentWorldSession, {
                headers: getRequestHeaders(),
                mountReplyVariants: (element, anchor) => currentReplyController?.mount(element, anchor),
                getSnapshot: () => nativeSessionRuntime.snapshot,
                isBusy: () => Boolean(nativeSessionRuntime.generation || nativeSessionRuntime.failed || nativeSessionRuntime.host?.isGenerating?.()),
                isActiveTail: anchor => !nativeSessionRuntime.history && !nativeSessionRuntime.generation
                    && nativeSessionRuntime.snapshot?.session.sessionId === anchor.sessionId
                    && nativeSessionRuntime.snapshot?.revision.branchId === anchor.branchId
                    && nativeSessionRuntime.snapshot?.timeline.at(-1)?.activeVariantId === anchor.variantId,
                renderProse(text, node, index) {
                    const message = getContext().chat[index];
                    node.innerHTML = atriaContext.messageFormatting(text, message.name, message.is_system, message.is_user, index);
                },
                async onForkAction(anchor, blockId, actionId, state, extra) {
                    const snapshot = nativeSessionRuntime.snapshot;
                    if (snapshot.session.sessionId !== anchor.sessionId || snapshot.revision.branchId !== anchor.branchId
                        || nativeSessionRuntime.generation) throw new Error('Message action anchor changed');
                    const index = snapshot.timeline.findIndex(entry => entry.messageId === anchor.messageId && entry.activeVariantId === anchor.variantId);
                    if (index < 0) throw new Error('Message action anchor is unavailable');
                    await nativeSessionRuntime.fork(index);
                    if (!currentUiSession?.executeMessageAction) throw new Error('Message presentation is unavailable after fork');
                    return currentUiSession.executeMessageAction(anchor, blockId, actionId, state, extra);
                },
                createStateStorage(definition, packageState, messageType) {
                    const snapshot = nativeSessionRuntime.snapshot;
                    return createNativeUiStateStorage({ packageId: packageState.descriptor.packageId, entryPointId: packageState.descriptor.entryPointId,
                        stateVersion: messageType ? definition.stateVersion + ':message:' + messageType : definition.stateVersion, sessionId: snapshot.session.sessionId, branchId: snapshot.revision.branchId,
                        settings: getRuntimeSettingsRoot, save: saveSettingsDebounced });
                },
                hostActions: {
                    exitExperience: exitCurrentGameUi,
                    stopGeneration: stopCurrentGeneration,
                    save: saveCurrentGameSession,
                    openDiagnostics: openGameDiagnostics,
                },
            });
        } catch (error) {
            currentReplyController?.dispose(); currentReplyController = null;
            currentWorldSession = null;
            disposeRuntimeSystems();
            currentUiSession = null;
            next = {
                status: GAME_PACKAGE_STATUS.INVALID,
                active: false,
                sessionId,
                descriptor: next.descriptor,
                runtime: next.runtime,
                errors: ['Experience Runtime initialization failed: ' + (error?.message || String(error))],
            };
        }
    }
    publishPackageState(next);

    const identity = next.descriptor
        ? next.descriptor.packageId + '@' + next.descriptor.packageVersionId
        : sessionId || 'none';
    if (next.status === GAME_PACKAGE_STATUS.INVALID) {
        console.warn(`[${MODULE_NAME}] Rejected Native Game Runtime for ${identity}`, next.errors);
    } else if (next.status === GAME_PACKAGE_STATUS.ERROR) {
        console.error(`[${MODULE_NAME}] Failed to load Native Game Runtime for ${identity}`, next.errors);
    } else if (next.status === GAME_PACKAGE_STATUS.READY && next.active) {
        console.info(
            `[${MODULE_NAME}] Activated Native ${next.descriptor.experience.mode} Experience ${identity}`,
        );
    }
    return currentPackage;
}

async function syncCurrentWorldRevision() {
    const session = currentWorldSession;
    if (!session) return null;
    if (currentPackage.runtime?.experience?.componentModelVersion === 2) return reloadGamePackage();

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
                'Native Game Runtime revision sync failed: ' + (error?.message || String(error)),
            ],
        });
        console.error(`[${MODULE_NAME}] Native Game Runtime revision sync failed`, error);
        return null;
    }
}

export function getGamePackageState() {
    return {
        status: currentPackage.status,
        active: currentPackage.active,
        sessionId: currentPackage.sessionId,
        descriptor: currentPackage.descriptor ? structuredClone(currentPackage.descriptor) : null,
        runtime: currentPackage.runtime ? structuredClone(currentPackage.runtime) : null,
        errors: [...currentPackage.errors],
    };
}

export function isGamePackageActive() {
    return currentPackage.status === GAME_PACKAGE_STATUS.READY && currentPackage.active === true;
}

export function getWorldState() {
    return currentWorldSession ? currentWorldSession.getState() : null;
}

export function getWorldJournal() {
    return currentWorldSession ? currentWorldSession.getJournal() : null;
}

export function getWorldBranchIdentity() {
    if (!currentWorldSession) return null;
    return {
        sessionId: currentWorldSession.getSessionId(),
        branchId: currentWorldSession.getBranchId(),
        revisionId: currentWorldSession.getRevisionId(),
    };
}

export function getAuthoritativeMemorySources() {
    return currentWorldSession
        ? listGameEventMemorySources(currentWorldSession.getJournal())
        : [];
}

export function getLlmRuntimeState() {
    return {
        active: Boolean(currentLlmSession),
        roles: getModelRuntimeConfig().roles,
        packageId: currentPackage.descriptor?.packageId || '',
        packageVersionId: currentPackage.descriptor?.packageVersionId || '',
        entryPointId: currentPackage.descriptor?.entryPointId || '',
        branch: getWorldBranchIdentity(),
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
    if (!nativeSessionRuntime.active) void reloadGamePackage();
});

onNativeSessionLifecycle(NATIVE_SESSION_LIFECYCLE.SESSION_LOADED, () => reloadGamePackage());
onNativeSessionLifecycle(NATIVE_SESSION_LIFECYCLE.REVISION_COMMITTED, () => {
    if (currentPackage.runtime?.experience?.componentModelVersion !== 2) return;
    // A presentation failure must not turn a successful authority commit into
    // a failed write or trigger an automatic duplicate transaction.
    void currentReplyController?.invalidate().catch(error => console.error('Native reply refresh failed', error));
    try { currentUiSession?.refresh?.(); } catch (error) { console.error('Native UI revision refresh failed', error); }
});
for (const lifecycle of [
    NATIVE_SESSION_LIFECYCLE.BRANCH_ACTIVATED,
    NATIVE_SESSION_LIFECYCLE.REVISION_RESTORED,
]) {
    onNativeSessionLifecycle(lifecycle, () => syncCurrentWorldRevision());
}

registerCapabilityApi(MODULE_NAME, {
    reloadPackage: reloadGamePackage,
    getPackageState: getGamePackageState,
    isActive: isGamePackageActive,
    getWorldState,
    getWorldJournal,
    getWorldBranchIdentity,
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
    stopGeneration: stopCurrentGeneration,
    openDiagnostics: openGameDiagnostics,
    disableForSession: disableCurrentPackageForSession,
});

queueMicrotask(() => {
    void reloadGamePackage();
});

console.info(`[${MODULE_NAME}] Foundation loaded`);

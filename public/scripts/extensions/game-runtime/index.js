import { loadGameLogicDefinition } from './logic/package.js';
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

let revision = 0;
let currentWorldSession = null;
let currentUiSession = null;
let currentPackage = Object.freeze({
    status: GAME_PACKAGE_STATUS.NONE,
    active: false,
    charId: '',
    manifest: null,
    errors: [],
});

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
    currentWorldSession = nextWorldSession;
    currentUiSession = nextUiSession;
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
    exitUi: exitCurrentGameUi,
    disableForSession: disableCurrentPackageForSession,
});

queueMicrotask(() => {
    void reloadGamePackage();
});

console.info(`[${MODULE_NAME}] Foundation loaded`);

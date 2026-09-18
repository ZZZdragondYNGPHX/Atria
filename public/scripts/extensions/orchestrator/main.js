// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)
// Implementation source: Toolify: Empower any LLM with function calling capabilities. (https://github.com/funnycups/Toolify)

const __ctx = Atria.getContext();
const extension_prompt_roles = __ctx.constants.promptRoles;

const saveSettingsDebounced = __ctx.saveSettingsDebounced;
const extension_settings = __ctx.extensionSettings;
const getContext = Atria.getContext;
const registerExtensionApi = __ctx.registerExtensionApi;

import { buildLastUserAnchor, compactStageOutputs, normalizeNodeOutputForSnapshot } from './anchors.js';
import { i18n, i18nFormat, registerLocaleData } from './i18n.js';

import { executionConfigText, digestExecutionConfig, getOrchestrationOutcome } from './execution-mode-contract.js';

import { AGENDA_PLANNER_TOOL, AGENDA_RESULT_TOOL, CAPSULE_INJECT_POSITION_SCHEMA_VERSION, ORCH_ALLOWED_GENERATION_TYPES, ORCH_EXECUTION_MODE_AGENDA, ORCH_EXECUTION_MODE_DIRECTOR, ORCH_EXECUTION_MODE_LOOP, defaultSettings } from './defaults.js';
import {
    isAbortError,
    isAbortSignalLike,
    linkAbortSignals,
    throwIfAborted,
} from './abort-utils.js';

import { cloneDefault } from './spec-schema.js';

import { applyProfileWorldInfoFilter, buildActivatedEntryKeysFromPayload } from './lorebook-filter.js';
import {
    clearCapsulePrompt,
    injectCapsuleToPayload,
    migrateLegacyCapsuleInjectPosition,
    normalizeCapsuleInjectPosition,
} from './capsule-injection.js';
import {
    ensureDirectorPureSyntheticPreset,
    applyDirectorPresetSwap,
    restoreDirectorPresetSwap,
} from './director-preset-swap.js';
import {
    clearCurrentRun,
    finishRun,
    getCurrentRun,
    startRun,
    recordMemoryRecall,
} from './run-state/store.js';
import { openWorkspace, configureWorkspace, destroyWorkspace, initWorkspace as initRunPanel } from './workspace/panel.js';
import { resolveWorkspaceProfile, getWorkspaceLibrary } from './workspace/host-presets.js';
import { renderPresetHelpButton } from '../preset-help.js';
import { createPresetAuthoring } from './workspace/authoring.js';
import { createMemoryWorkspace } from './workspace/memory.js';
import { updatePresetLibrary } from '../../lib/agent-workspace/presets.js';

import { canReuseLatestOrchestrationSnapshot, clearCacheForChatChange, getActiveSnapshot, getChatKey, getCurrentAvatar, getLatestOrchestrationEntry, loadOrchestratorChatState, refreshActiveSnapshotFromCache, refreshOrchestratorStateAfterStructuralEvent, storeCompletedOrchestrationSnapshot } from './snapshot-cache.js';
import { sanitizeConnectionProfileName, renderConnectionProfileOptions, renderOpenAIPresetOptions } from './agent-resolution.js';

import { runAgendaOrchestration } from './agenda-runtime.js';
import { runSpecOrchestration, buildNodeToolSet } from './spec-runtime.js';
import { runLoopOrchestration, attachNotesFloorState } from './loop-runtime.js';
import { handleDirectorDispatch } from './director-runtime.js';

import { createContentPayloadCache } from './director-content-payload.js';
import { executeLoopTool, getEnabledToolSchemas } from './loop-tools.js';
import { buildMainAgentToolSchemas, buildSubAgentToolSchemas } from './director-tools.js';
import {
    registerOrchestrationTool,
    unregisterOrchestrationTool,
    listExtensionTools,
    bridgeSillyTavernTool,
    unbridgeSillyTavernTool,
    listAvailableSillyTavernTools,
    rehydrateBridgedSillyTavernTools,
} from './register-custom-tool.js';
import { registerSkillOrchestrationTools } from './skill-orchestration-tools.js';

import { mountNotesPanel } from './notes-panel.js';

import { registerSkillEmbedLifecycle } from '../../skills/embed-lifecycle.js';
import { maybeAttachSkillsToOrchPresetExport, maybeAttachSkillsToPresetExport } from '../../skills/embed-export-hook.js';
// Note: `ORCH_EXECUTION_MODE_LOOP` is canonically defined in defaults.js
// (alongside the other mode literals) and re-exported by persistence.js
// for callers that want it bundled with `sanitizeLoopProfile`. We import
// from defaults.js so character-overrides.js / editor-state.js share one
// import path; persistence also supplies the shared tool flag resolution.
import { sanitizeLoopProfile, resolveAgentToolFlags, hasAnyToolEnabled } from './persistence.js';

import { collectResolvedSkillsForOrchPreset } from './collect-active-skills.js';

import { configureRuntimeCheckpoints, listRuntimeCheckpoints, cancelRuntimeCheckpoint } from './runtime-checkpoints.js';

if (typeof __ctx.getCurrentUserHandle === 'function') {
    configureRuntimeCheckpoints({ getScope: () => getContext().getCurrentUserHandle() });
}

const MODULE_NAME = 'orchestrator';
const ORCH_RESULT_EVENT = 'atria.orchestrator.result';
const UI_BLOCK_ID = 'orchestrator_settings';

// Expose the orchestrator custom-tool API surface to other extensions via
// `getContext().getExtensionApi('orchestrator')`. Matches the three-layer
// exposure contract documented in register-custom-tool.js: ES-module import
// (Layer 1), getExtensionApi (Layer 2), and ctx (Layer 3) all resolve to the
// same function references.
registerExtensionApi(MODULE_NAME, {
    recordMemoryRecall,
    listRuntimeCheckpoints,
    cancelRuntimeCheckpoint,
    registerOrchestrationTool,
    unregisterOrchestrationTool,
    listExtensionTools,
    bridgeSillyTavernTool,
    unbridgeSillyTavernTool,
    listAvailableSillyTavernTools,
    listWorkspacePresets: () => getWorkspaceLibrary(getSettings()).presets.map(({ id, name, mode }) => ({ id, name, mode })),
    getPresetBinding: (scope, subjectId) => structuredClone(getWorkspaceLibrary(getSettings()).bindings.entries.find(entry => entry.scope === scope && entry.subjectId === subjectId) || null),
    setPresetBinding: (scope, subjectId, presetId) => {
        const settings = getSettings();
        settings.agentWorkspace = updatePresetLibrary(getWorkspaceLibrary(settings), { type: 'bind', scope, subjectId, presetId });
        saveSettingsDebounced(); return true;
    },
    // Skill-export bridge: walks a portable orchestrator payload's agent
    // surface and returns the union of skills any agent in the preset
    // can see, grouped by source scope. Used by the skills embed-export
    // hook to bundle all "active" skills into an orch-preset export
    // (see `public/scripts/skills/embed-export-hook.js`).
    collectResolvedSkillsForOrchPreset,
});
// Module-scope cache for the director content payload captured at
// GENERATE_TAKEOVER_DISPATCH. Director's main + sub agents read from this
// to build their taskMessages — single source of truth across the whole
// session. See `director-content-payload.js`.
const directorContentCache = createContentPayloadCache();

const DIRECTOR_TAKEOVER_GEN_TYPES = new Set(['normal', 'regenerate', 'swipe', 'continue']);
let orchInFlight = false;
let activeRunInfoToast = null;
let activeOrchRunAbortController = null;

export function ensureSettings() {
    if (!extension_settings[MODULE_NAME] || typeof extension_settings[MODULE_NAME] !== 'object') {
        extension_settings[MODULE_NAME] = {};
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[MODULE_NAME][key] === undefined) {
            extension_settings[MODULE_NAME][key] = cloneDefault(value);
        }
    }
    for (const key of ['presetLibraries', 'activePresetIds', 'presetLibrariesMigrationDone', 'chatOverrides', 'loopProfile', 'directorProfile', 'agendaProfile', 'spec', 'presets', 'executionMode', 'singleAgentModeEnabled', 'singleAgentSystemPrompt', 'singleAgentUserPromptTemplate']) {
        delete extension_settings[MODULE_NAME][key];
    }
    getWorkspaceLibrary(extension_settings[MODULE_NAME]);
    delete extension_settings[MODULE_NAME].agentRuntimeV2;
    delete extension_settings[MODULE_NAME].plainTextFunctionCallMode;
    delete extension_settings[MODULE_NAME].agendaPlannerPrompt;
    extension_settings[MODULE_NAME].llmNodeApiPresetName = sanitizeConnectionProfileName(extension_settings[MODULE_NAME].llmNodeApiPresetName || '');
    if (!String(extension_settings[MODULE_NAME].llmNodePresetName || '').trim()) {
        extension_settings[MODULE_NAME].llmNodePresetName = String(extension_settings[MODULE_NAME].llmNodePromptPresetName || '').trim();
    }
    extension_settings[MODULE_NAME].includeWorldInfoWithPreset = extension_settings[MODULE_NAME].includeWorldInfoWithPreset !== false;
    if (extension_settings[MODULE_NAME].aiSuggestApiPresetName !== undefined) {
        extension_settings[MODULE_NAME].requestApiPresetName ||= String(extension_settings[MODULE_NAME].aiSuggestApiPresetName || '');
        delete extension_settings[MODULE_NAME].aiSuggestApiPresetName;
    }
    if (extension_settings[MODULE_NAME].aiSuggestPresetName !== undefined) {
        extension_settings[MODULE_NAME].requestLlmPresetName ||= String(extension_settings[MODULE_NAME].aiSuggestPresetName || '');
        delete extension_settings[MODULE_NAME].aiSuggestPresetName;
    }
    if (extension_settings[MODULE_NAME].aiSuggestSystemPrompt !== undefined) {
        extension_settings[MODULE_NAME].requestSystemPrompt ||= String(extension_settings[MODULE_NAME].aiSuggestSystemPrompt || '');
        delete extension_settings[MODULE_NAME].aiSuggestSystemPrompt;
    }
    extension_settings[MODULE_NAME].requestApiPresetName = sanitizeConnectionProfileName(extension_settings[MODULE_NAME].requestApiPresetName || '');
    if (!String(extension_settings[MODULE_NAME].requestLlmPresetName || '').trim()) {
        extension_settings[MODULE_NAME].requestLlmPresetName = String(extension_settings[MODULE_NAME].aiSuggestPromptPresetName || '').trim();
    }
    // Drop legacy API selector fields. API routing now comes from connection profile only.
    delete extension_settings[MODULE_NAME].llmNodeApi;
    delete extension_settings[MODULE_NAME].aiSuggestApi;
    delete extension_settings[MODULE_NAME].llmNodeResponseLength;
    delete extension_settings[MODULE_NAME].aiSuggestResponseLength;
    delete extension_settings[MODULE_NAME].llmNodePromptPresetName;
    delete extension_settings[MODULE_NAME].aiSuggestPromptPresetName;
    delete extension_settings[MODULE_NAME].maxCapsuleChars;
    delete extension_settings[MODULE_NAME].saveTarget;
    const hasCapsuleInjectPositionSchemaVersion = Object.prototype.hasOwnProperty.call(
        extension_settings[MODULE_NAME],
        'capsuleInjectPositionSchemaVersion',
    );
    if (!hasCapsuleInjectPositionSchemaVersion) {
        extension_settings[MODULE_NAME].capsuleInjectPosition = migrateLegacyCapsuleInjectPosition(
            extension_settings[MODULE_NAME].capsuleInjectPosition,
        );
    }
    extension_settings[MODULE_NAME].capsuleInjectPosition = normalizeCapsuleInjectPosition(
        extension_settings[MODULE_NAME].capsuleInjectPosition,
    );
    extension_settings[MODULE_NAME].capsuleInjectPositionSchemaVersion = CAPSULE_INJECT_POSITION_SCHEMA_VERSION;
    extension_settings[MODULE_NAME].capsuleInjectDepth = Math.max(
        0,
        Math.floor(Number(extension_settings[MODULE_NAME].capsuleInjectDepth) || 0),
    );
    {
        const role = Number(extension_settings[MODULE_NAME].capsuleInjectRole);
        const allowedRoles = [extension_prompt_roles.SYSTEM, extension_prompt_roles.USER, extension_prompt_roles.ASSISTANT];
        extension_settings[MODULE_NAME].capsuleInjectRole = allowedRoles.includes(role)
            ? role
            : extension_prompt_roles.SYSTEM;
    }
    delete extension_settings[MODULE_NAME].capsuleRenderFormat;
    extension_settings[MODULE_NAME].capsuleCustomInstruction = String(extension_settings[MODULE_NAME].capsuleCustomInstruction || '').trim();
    for (const key of ['requestSystemPrompt', 'iterModePromptLoop', 'iterModePromptDirector', 'iterModePromptAgenda', 'iterModePromptSpec']) delete extension_settings[MODULE_NAME][key];
    extension_settings[MODULE_NAME].toolCallRetryMax = Math.max(
        0,
        Math.floor(Number(extension_settings[MODULE_NAME].toolCallRetryMax) || 0),
    );
    extension_settings[MODULE_NAME].rpmLimit = Math.max(
        0,
        Math.floor(Number(extension_settings[MODULE_NAME].rpmLimit) || 0),
    );
    extension_settings[MODULE_NAME].nodeIterationMaxRounds = Math.max(
        1,
        Math.floor(Number(extension_settings[MODULE_NAME].nodeIterationMaxRounds) || 0),
    );
    extension_settings[MODULE_NAME].reviewRerunMaxRounds = Math.max(
        0,
        Math.floor(Number(extension_settings[MODULE_NAME].reviewRerunMaxRounds) || 0),
    );
}

function buildOrchestratorResultEventPayload(context, payload, status, options = {}) {
    const generationType = String(payload?.type || 'normal').trim().toLowerCase() || 'normal';
    const chatKey = String(getChatKey(context) || '');
    const includeSnapshot = Boolean(options.includeSnapshot);
    const activeSnapshot = getActiveSnapshot();
    const snapshot = includeSnapshot && activeSnapshot && typeof activeSnapshot === 'object'
        ? activeSnapshot
        : null;
    const sameChatSnapshot = snapshot && String(snapshot.chatKey || '') === chatKey
        ? snapshot
        : null;
    const entry = sameChatSnapshot ? getLatestOrchestrationEntry(context) : null;

    return {
        module: MODULE_NAME,
        event: ORCH_RESULT_EVENT,
        status: String(status || 'unknown'),
        generationType,
        chatKey,
        at: new Date().toISOString(),
        anchorPlayableFloor: Number(entry?.anchorPlayableFloor || 0),
        anchorHash: String(sameChatSnapshot?.anchorHash || ''),
        capsuleText: String(entry?.injectedText || ''),
        stageOutputs: sameChatSnapshot && Array.isArray(sameChatSnapshot.stageOutputs)
            ? structuredClone(sameChatSnapshot.stageOutputs)
            : [],
        reviewRerunCount: Number(options.reviewRerunCount || 0),
        reason: String(options.reason || ''),
        note: String(options.note || ''),
        error: String(options.error || ''),
    };
}

async function emitOrchestratorResultEvent(context, payload, status, options = {}) {
    if (!context?.eventSource || typeof context.eventSource.emit !== 'function') {
        return;
    }
    const eventPayload = buildOrchestratorResultEventPayload(context, payload, status, options);
    try {
        await context.eventSource.emit(ORCH_RESULT_EVENT, eventPayload);
    } catch (error) {
        console.warn(`[${MODULE_NAME}] Failed to emit result event`, error);
    }
}

/**
 * Persist a user-edited or rebuilt active snapshot through the floor-state
 * binding. Re-derives the anchor's chatIndex / swipeId from the live chat
 * so the commit lands at the same (floor, swipeId) as the original
 * orchestration. Returns false when the anchored user message has been
 * deleted or replaced — the caller should treat that as a soft error.
 */

function shouldRunOrchestrationForPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return false;
    }
    if (payload.dryRun === true) {
        return false;
    }
    const type = String(payload.type || '').trim().toLowerCase();
    if (!ORCH_ALLOWED_GENERATION_TYPES.has(type)) {
        return false;
    }
    return true;
}

function abortActiveOrchestratorRun() {
    const run = getCurrentRun();
    if (run?.mode === 'director' && run.status === 'running') {
        (run.stopFn || run.abortFn)?.();
    }
    if (activeOrchRunAbortController && !activeOrchRunAbortController.signal.aborted) {
        activeOrchRunAbortController.abort();
    }
    clearRunInfoToast();
}

export function getEffectiveProfile(context) {
    return resolveWorkspaceProfile(extension_settings[MODULE_NAME], {
        character: getCurrentAvatar(context), conversation: getChatKey(context),
    });
}

function currentExecutionConfig(context, profile = getEffectiveProfile(context)) {
    return executionConfigText(profile, getSettings(), profile.presetId);
}

export async function runOrchestration(context, payload, messages, profile) {
    if (profile.orchestrationPlan) payload = { ...payload, agentRuntimeV2: true };
    const activeOrchPresetName = profile.name || '';

    if (String(profile?.mode || '') === ORCH_EXECUTION_MODE_LOOP) {
        // Loop mode: single-agent tool-call loop. The dispatcher sanitizes
        // here (rather than in the upstream `getEffectiveProfile` pipeline)
        // because spec/agenda/single profiles all share `sanitizeProfile`,
        // while V3 loop has its own canonical sanitizer that lives next to
        // its data. Loop runtime returns its own envelope shape; main.js
        // adapts it back to the spec-shaped `{ stageOutputs, ... }` so the
        // post-run capsule path (`buildCapsule` → `injectCapsuleToPayload`
        // → `storeCompletedOrchestrationSnapshot`) is reused unchanged.
        const loopProfile = { ...sanitizeLoopProfile(profile), orchestrationPlan: profile.orchestrationPlan };
        const loopRun = await runLoopOrchestration(context, payload, loopProfile, {
            settings: extension_settings[MODULE_NAME],
            activeOrchPresetName,
        });
        const capsuleText = String(loopRun?.capsule || '').trim();
        const stageOutputs = capsuleText
            ? [{
                id: 'loop',
                mode: 'serial',
                nodes: [{ node: 'finalize', output: capsuleText }],
            }]
            : [];
        return {
            stageOutputs,
            previousNodeOutputs: new Map(),
            runtimeTrace: loopRun?.runtimeTrace || null,
            status: loopRun?.status || 'completed',
            reviewRerunCount: 0,
        };
    }
    if (String(profile?.mode || '') === ORCH_EXECUTION_MODE_AGENDA || String(profile?.source || '') === 'agenda') {
        return runAgendaOrchestration(context, payload, messages, profile, { activeOrchPresetName });
    }
    return runSpecOrchestration(context, payload, messages, profile, { activeOrchPresetName });
}

function getFinalStageSnapshot(stageOutputs) {
    const compact = compactStageOutputs(stageOutputs);
    if (!Array.isArray(compact) || compact.length === 0) {
        return null;
    }
    const last = compact[compact.length - 1];
    if (!last || !Array.isArray(last.nodes)) {
        return null;
    }
    return {
        id: String(last.id || `stage_${compact.length}`),
        mode: String(last.mode || 'serial').toLowerCase() === 'parallel' ? 'parallel' : 'serial',
        nodes: last.nodes
            .map(node => ({
                node: String(node?.node || ''),
                output: normalizeNodeOutputForSnapshot(node?.output),
            }))
            .filter(node => node.node),
    };
}

function extractNodeInjectionText(nodeOutput) {
    if (Array.isArray(nodeOutput)) return nodeOutput.map(item => extractNodeInjectionText(item?.value)).filter(Boolean).join('\n\n');
    if (typeof nodeOutput === 'string') {
        const text = String(nodeOutput);
        return text.trim() ? text : '';
    }
    return '';
}

function buildCapsule(stageOutputs, customInstructionOverride) {
    const finalStage = getFinalStageSnapshot(stageOutputs);
    const settings = extension_settings[MODULE_NAME];
    const overrideTrimmed = typeof customInstructionOverride === 'string'
        ? customInstructionOverride.trim()
        : '';
    const customInstruction = overrideTrimmed
        || String(settings?.capsuleCustomInstruction || '').trim();
    const finalTexts = Array.isArray(finalStage?.nodes)
        ? finalStage.nodes
            .map(node => extractNodeInjectionText(node?.output))
            .filter(Boolean)
        : [];
    const body = finalTexts.length <= 1
        ? (finalTexts[0] || '')
        : finalTexts.join('\n\n');
    if (!body) {
        return '';
    }
    if (!customInstruction) {
        return body;
    }
    return `${customInstruction}\n\n${body}`;
}

async function onWorldInfoFinalized(payload) {
    const context = getContext();
    const runChatKey = getChatKey(context);
    const settings = extension_settings[MODULE_NAME];

    if (!settings.enabled) {
        return;
    }
    if (!shouldRunOrchestrationForPayload(payload)) {
        return;
    }
    // Apply per-preset world book filter before any downstream reads.
    // This mutates payload's WI arrays in place; ST core re-reads them
    // downstream (via {...worldInfoResolution, ...payload}), then joins
    // and passes to prepareOpenAIMessages — covers all four modes
    // (spec/agenda/loop/director) with one hook.
    //
    // Applies only to the current turn's WI join; upstream stage/agent
    // outputs from earlier in the same run are unaffected — filter changes
    // take effect from the next turn.
    let preFilterProfile = null;
    try {
        preFilterProfile = getEffectiveProfile(context);
        const preFilter = preFilterProfile?.lorebookFilter;
        if (preFilter) {
            applyProfileWorldInfoFilter(payload, preFilter);
        }
    } catch (err) {
        console.warn('[orchestrator] applyProfileWorldInfoFilter failed', err);
    }
    // The host checks this request-local gate after all WI listeners settle.
    // Only successful guidance releases it; cancellation/errors/early exits
    // must not silently fall through to an unplanned prose request.
    let agendaGate = preFilterProfile?.mode === ORCH_EXECUTION_MODE_AGENDA
        ? (payload.generationBlocked = { source: MODULE_NAME, status: 'pending' }) : null;
    if (orchInFlight) {
        return;
    }
    if (isAbortSignalLike(payload?.signal) && payload.signal.aborted) {
        await loadOrchestratorChatState(context);
        clearCapsulePrompt(context);
        refreshActiveSnapshotFromCache(context);
        await emitOrchestratorResultEvent(context, payload, 'cancelled', {
            reason: 'generation_aborted_before_orchestration',
            note: 'Generation was aborted before orchestration started.',
            includeSnapshot: false,
        });
        updateUiStatus(i18n('Generation aborted. Skipped orchestration.'));
        return;
    }
    orchInFlight = true;
    const pluginAbortController = new AbortController();
    activeOrchRunAbortController = pluginAbortController;
    const linkedAbort = linkAbortSignals(payload?.signal, pluginAbortController.signal);
    // Capture the World Info entries activated for this turn so loop mode's
    // `lorebook_search` can dedup them out of its results — those entries
    // are already injected into the main model context, so re-surfacing
    // them in the loop agent would waste a round. Set is keyed by
    // `${world}.${uid}`, the same shape main-flow World Info uses
    // internally (`world-info.js` builds it from `allActivatedEntries`).
    //
    // Fix: payload.allActivatedEntries has never existed on ST core's
    // wiFinalizedPayload (only worldInfoResolution.activatedEntries does).
    // Previous read was always undefined, silently disabling
    // lorebook_search's dedup. Use the correct source now.
    const activatedEntryKeys = buildActivatedEntryKeysFromPayload(payload);
    const runMeta = {
        activatedEntryKeys,
        // Reference to the in-flight wiFinalizedPayload so loop's
        // `lorebook_force_activate` (and any future force-injection tool)
        // can mutate the same payload `script.js` is about to
        // `joinWorldInfoEntries` on. The push must happen inside the
        // synchronous emit() frame — i.e. inside the loop's tool-call
        // loop, which runs to completion before this `onWorldInfoFinalized`
        // handler returns. Push after emit returns has no effect because
        // join has already materialized worldInfoBefore/After strings.
        wiFinalizedPayload: payload,
        lorebookFilter: preFilterProfile?.lorebookFilter || { bookPattern: '', entryPattern: '' },
    };
    const orchestrationPayload = linkedAbort.signal && linkedAbort.signal !== payload?.signal
        ? {
            ...payload,
            signal: linkedAbort.signal,
            __atriaOrchGenerationSignal: payload?.signal || null,
            __atriaRun: runMeta,
        }
        : {
            ...payload,
            __atriaRun: runMeta,
        };
    let stopRequestedByUser = false;
    let resolveStopRequest = null;
    const stopRequestPromise = new Promise((resolve) => {
        resolveStopRequest = () => {
            if (stopRequestedByUser) {
                return;
            }
            stopRequestedByUser = true;
            if (!pluginAbortController.signal.aborted) {
                pluginAbortController.abort();
            }
            resolve({ stopped: true });
        };
    });

    // Thread `resolveStopRequest` through the payload so the runtime
    // that eventually calls `startRun()` (loop-runtime / spec-runtime /
    // agenda-runtime / director dispatch) can register it as the run's
    // `stopFn`. The run panel's Stop button then takes the same fast
    // unwind path the toast Stop button already uses (Promise.race in
    // main.js short-circuits with 'cancelled by user' immediately),
    // instead of waiting for the LLM sender to reject and the runtime
    // catch block to reach `finishRun`.
    orchestrationPayload.__atriaResolveStopRequest = resolveStopRequest;

    try {
        await loadOrchestratorChatState(context);
        throwIfAborted(orchestrationPayload?.signal, 'Orchestration aborted.');
        const profile = getEffectiveProfile(context);
        if (!agendaGate && profile?.mode === ORCH_EXECUTION_MODE_AGENDA) {
            agendaGate = payload.generationBlocked = { source: MODULE_NAME, status: 'pending' };
        }
        // Director mode produces the assistant message body itself via
        // the GENERATE_TAKEOVER_DISPATCH hook — it does not run on the
        // capsule-injection pipeline. Exit early so we don't try to
        // execute a director profile through the spec/agenda/loop
        // runtimes (which would crash on `profile.presets`).
        if (String(profile?.mode || '') === ORCH_EXECUTION_MODE_DIRECTOR) {
            clearCapsulePrompt(context);
            return;
        }
        const messages = structuredClone(Array.isArray(payload?.coreChat) ? payload.coreChat : []);
        if (messages.length === 0) {
            clearCapsulePrompt(context);
            refreshActiveSnapshotFromCache(context);
            await emitOrchestratorResultEvent(context, payload, 'cancelled', {
                reason: 'empty_messages',
                note: 'Skipped orchestration because there are no playable messages.',
                includeSnapshot: false,
            });
            return;
        }
        const chatKey = getChatKey(context);
        const anchor = buildLastUserAnchor(context, messages);
        const configText = currentExecutionConfig(context, profile);
        const executionIdentity = await digestExecutionConfig(configText);
        const isCurrent = () => getChatKey(getContext()) === chatKey
            && getSettings().enabled
            && !orchestrationPayload?.signal?.aborted
            // Preset edits/binding changes apply to the next run. This run keeps
            // its admitted definition; host target/settings changes still invalidate it.
            && currentExecutionConfig(getContext(), profile) === configText;
        const assertCurrent = () => {
            if (!isCurrent()) {
                const error = new Error('Orchestration target or configuration changed.');
                error.name = 'AbortError';
                throw error;
            }
        };
        assertCurrent();
        if (canReuseLatestOrchestrationSnapshot(chatKey, anchor, executionIdentity)) {
            const capsuleText = String(getActiveSnapshot()?.capsuleText || '').trim();
            if (capsuleText) {
                // Director mode produces the assistant message directly via
                // the takeover hook — there is no capsule to inject. Skip
                // here to avoid polluting the prompt with stale text on the
                // reused-snapshot path.
                if (profile?.mode !== ORCH_EXECUTION_MODE_DIRECTOR) {
                    injectCapsuleToPayload(payload, capsuleText, settings);
                }
                throwIfAborted(orchestrationPayload?.signal, 'Orchestration aborted.');
                await emitOrchestratorResultEvent(context, payload, 'reused', {
                    includeSnapshot: true,
                    note: 'Reused previous orchestration snapshot.',
                });
                updateUiStatus(i18n('Orchestrator completed.'));
                clearRunInfoToast();
                if (agendaGate) delete payload.generationBlocked;
                return;
            }
        }
        updateUiStatus(i18n('Orchestrator running...'));
        showRunInfoToast(i18n('Orchestrator running...'), {
            stopLabel: i18n('Stop'),
            onStop: () => {
                resolveStopRequest?.();
            },
        });

        const orchestrationTask = runOrchestration(context, orchestrationPayload, messages, profile);
        void orchestrationTask.catch((error) => {
            if (!stopRequestedByUser) {
                return;
            }
            if (!isAbortError(error, orchestrationPayload?.signal)) {
                console.warn(`[${MODULE_NAME}] Orchestration finished after user stop`, error);
            }
        });
        const raced = await Promise.race([
            orchestrationTask.then(finalRun => ({ stopped: false, finalRun })),
            stopRequestPromise,
        ]);
        if (raced?.stopped) {
            if (agendaGate) agendaGate.status = 'cancelled';
            clearCapsulePrompt(context);
            await emitOrchestratorResultEvent(context, payload, 'cancelled', {
                reason: 'user_stopped',
                note: 'Orchestration cancelled by user before completion.',
                includeSnapshot: false,
            });
            updateUiStatus(i18n('Orchestrator cancelled by user.'));
            return;
        }
        const finalRun = raced?.finalRun;
        throwIfAborted(orchestrationPayload?.signal, 'Orchestration aborted.');

        assertCurrent();
        const outcome = getOrchestrationOutcome(finalRun);
        if (outcome === 'failed' || outcome === 'cancelled') {
            const error = new Error(`Orchestration ended with ${outcome}.`);
            if (outcome === 'cancelled') error.name = 'AbortError';
            throw error;
        }
        const capsuleText = buildCapsule(finalRun.stageOutputs || [], profile?.capsule_inject?.customInstruction);
        if (agendaGate && !String(capsuleText || '').trim()) throw new Error('Agenda finalizer produced no guidance.');
        throwIfAborted(orchestrationPayload?.signal, 'Orchestration aborted.');
        // Partial results retain the legacy injection behavior, but never become
        // successful cache entries. A later attempt must be able to finish.
        if (outcome === 'completed') {
            await storeCompletedOrchestrationSnapshot(context, anchor, capsuleText, finalRun.stageOutputs || [], executionIdentity, isCurrent);
        }
        assertCurrent();
        injectCapsuleToPayload(payload, capsuleText, settings);
        ensureUi();
        throwIfAborted(orchestrationPayload?.signal, 'Orchestration aborted.');
        await emitOrchestratorResultEvent(context, payload, outcome, {
            includeSnapshot: outcome === 'completed',
            reviewRerunCount: Number(finalRun?.reviewRerunCount || 0),
        });
        updateUiStatus(i18n(outcome === 'budget_exhausted' ? 'Budget reached. Partial guidance was used; the task is not complete.' : 'Orchestrator completed.'));
        clearRunInfoToast();
        if (agendaGate) delete payload.generationBlocked;
    } catch (error) {
        if (agendaGate) agendaGate.status = isAbortError(error, orchestrationPayload?.signal) ? 'cancelled' : 'failed';
        if (getChatKey(getContext()) !== runChatKey) return;
        if (isAbortError(error, orchestrationPayload?.signal)) {
            clearCapsulePrompt(context);
            const generationAborted = Boolean(isAbortSignalLike(payload?.signal) && payload.signal.aborted);
            updateUiStatus(generationAborted
                ? i18n('Generation aborted. Skipped orchestration.')
                : i18n('Orchestrator cancelled by user.'));
            await emitOrchestratorResultEvent(context, payload, 'cancelled', {
                reason: generationAborted ? 'generation_aborted' : 'orchestration_cancelled',
                note: generationAborted
                    ? 'Generation aborted before orchestration completed.'
                    : 'Orchestration cancelled by user.',
                includeSnapshot: false,
            });
            clearRunInfoToast();
            return;
        }
        clearCapsulePrompt(context);
        console.warn(`[${MODULE_NAME}] Orchestration failed`, error);
        const failText = i18nFormat('Orchestrator failed: ${0}', agendaGate ? 'Agenda could not complete. See debug logs.' : String(error?.message || error));
        updateUiStatus(failText);
        clearRunInfoToast();
        await emitOrchestratorResultEvent(context, payload, 'failed', {
            reason: 'runtime_error',
            error: String(error?.message || error),
            includeSnapshot: false,
        });
        notifyError(failText);
    } finally {
        linkedAbort.cleanup();
        if (activeOrchRunAbortController === pluginAbortController) {
            activeOrchRunAbortController = null;
        }
        if (getChatKey(getContext()) === runChatKey) clearRunInfoToast();
        orchInFlight = false;
    }
}

async function onMessageDeleted(_chatLength, _details) {
    // Floor-state is settled by core before this listener fires (via
    // settleMessageDeleted). Tail-deletes naturally drop their snapshots
    // from the data namespace; for middle deletes — which shift every
    // higher floor's chat-array index down by one — floor-tagged commits
    // come out of sync, but the consume-time check in
    // `pickLatestValidSnapshot` filters them via anchorHash + is_user.
    // We just refresh the cache and the UI here.
    const context = getContext();
    const { activeChanged, mapChanged } = await refreshOrchestratorStateAfterStructuralEvent(context);
    if (activeChanged || mapChanged) {
        clearCapsulePrompt(context);
    }
    ensureUi();
}

async function onMessageEdited(_messageId, _mutationMeta = null) {
    // Floor-state has no MESSAGE_EDITED settle path — edits don't change
    // chat structure, only message content. The active snapshot is
    // content-bound by `anchorHash`, so a stale entry is detected at
    // consume time and naturally rejected. The data namespace is left
    // as-is; orphan entries get reaped when the owning floor is itself
    // deleted or overwritten.
    const context = getContext();
    const { activeChanged } = await refreshOrchestratorStateAfterStructuralEvent(context);
    if (activeChanged) {
        clearCapsulePrompt(context);
    }
    ensureUi();
}

function notifyError(message) {
    if (typeof toastr !== 'undefined') {
        toastr.error(String(message));
    }
}

function getSettings() {
    return extension_settings[MODULE_NAME];
}

function updateUiStatus(text) {
    jQuery('#atri_orch_status').text(String(text || ''));
}

function showRunInfoToast(message, { stopLabel = '', onStop = null } = {}) {
    if (typeof toastr === 'undefined') {
        return;
    }
    if (activeRunInfoToast) {
        toastr.clear(activeRunInfoToast);
        activeRunInfoToast = null;
    }
    activeRunInfoToast = toastr.info(String(message || ''), '', {
        timeOut: 0,
        extendedTimeOut: 0,
        tapToDismiss: false,
        closeButton: true,
        progressBar: false,
    });
    if (activeRunInfoToast && typeof onStop === 'function') {
        const toastBody = activeRunInfoToast.find('.toast-message');
        if (toastBody.length > 0) {
            const button = jQuery('<button type="button" class="menu_button menu_button_small atria-toast-stop-button"></button>');
            button.text(String(stopLabel || i18n('Stop')));
            button.on('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                button.prop('disabled', true);
                const toastElement = button.closest('.toast');
                clearRunInfoToast();
                if (toastElement && toastElement.length > 0) {
                    toastElement.remove();
                }
                onStop();
            });
            toastBody.append(button);
        }
    }
}

function clearRunInfoToast() {
    if (typeof toastr === 'undefined' || !activeRunInfoToast) {
        return;
    }
    toastr.clear(activeRunInfoToast);
    activeRunInfoToast = null;
}

function ensureUi() {
    const host = document.querySelector('#extensions_settings2');
    if (!host || document.getElementById(UI_BLOCK_ID)) return;

    const section = document.createElement('section');
    section.id = UI_BLOCK_ID;
    section.className = 'extension_container';

    const drawer = document.createElement('div');
    drawer.className = 'inline-drawer';
    const toggle = document.createElement('div');
    toggle.className = 'inline-drawer-toggle inline-drawer-header';
    const title = document.createElement('b');
    title.textContent = i18n('Agent & Memory');
    const icon = document.createElement('div');
    icon.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down down';
    toggle.append(title, icon);
    drawer.append(toggle);

    const content = document.createElement('div');
    content.className = 'inline-drawer-content';
    drawer.append(content);
    section.append(drawer);

    if (!document.getElementById('agent-memory-workspace-css')) {
        const css = document.createElement('link'); css.id = 'agent-memory-workspace-css'; css.rel = 'stylesheet';
        css.href = new URL('./workspace/panel.css', import.meta.url).href; document.head.append(css);
    }
    const intro = document.createElement('p'); intro.className = 'agent-memory-intro';
    intro.textContent = i18n('Open Atria Workspace to configure orchestration, monitor runs and manage long-term memory.'); content.append(intro);

    const workspace = document.createElement('button'); workspace.type = 'button'; workspace.className = 'menu_button';
    workspace.textContent = i18n('Open Atria Workspace'); workspace.addEventListener('click', () => openWorkspace('Orchestration')); content.append(workspace);

    const status = document.createElement('p'); status.id = 'atri_orch_status'; status.setAttribute('role', 'status'); content.append(status);
    const notes = document.createElement('div'); content.append(notes); host.append(section);
    void mountNotesPanel(notes, getContext());
}

jQuery(() => {
    const context = getContext();
    registerLocaleData();
    configureWorkspace({
        renderPresets: createPresetAuthoring({ getSettings, save: saveSettingsDebounced, renderPresetHelp: renderPresetHelpButton,
            renderProfileOptions: (kind, value, inherited) => kind === 'api'
                ? renderConnectionProfileOptions(value, i18n(inherited ? 'Use workspace default' : '(Current API config)'))
                : renderOpenAIPresetOptions(getContext(), value, i18n(inherited ? 'Use workspace default' : '(Current preset)')),
            getTools: (preset, agent) => {
                const plan = preset.planTemplate;
                const options = plan.metadata?.hostAdapters?.atria || {};
                // Read schemas only: opening the editor must never compile custom tool bodies.
                const customToolRegistry = new Map((options.customTools || []).map(tool => [tool.name, { schema: { type: 'function', function: { name: tool.name, description: tool.description } } }]));
                const config = agent.metadata?.hostAdapters?.atria || {};
                const tools = [];
                for (const node of plan.nodes.filter(node => node.agentId === agent.id)) {
                    if (preset.mode === 'loop') tools.push(...getEnabledToolSchemas({ ...options, ...config }, customToolRegistry).map(schema => schema.function));
                    if (preset.mode === 'spec' || preset.mode === 'agenda') {
                        const flags = resolveAgentToolFlags(preset.mode === 'spec' ? node.metadata?.nodeSpec?.tools : config.tools, options.defaultTools || null, null);
                        if (hasAnyToolEnabled(flags)) tools.push(...getEnabledToolSchemas({ tools: flags }, customToolRegistry).filter(schema => schema.function.name !== 'finalize').map(schema => schema.function));
                        if (preset.mode === 'spec') tools.push(...buildNodeToolSet(node.metadata?.nodeSpec || {}, { isFinalStage: node.metadata?.isFinalStage }).map(schema => schema.function));
                        else tools.push({ name: node.nodeId === 'planner' ? AGENDA_PLANNER_TOOL : AGENDA_RESULT_TOOL });
                    }
                    if (preset.mode === 'director') {
                        const build = node.nodeId === plan.output.ownerNodeId ? buildMainAgentToolSchemas : buildSubAgentToolSchemas;
                        tools.push(...build({ subAgents: plan.nodes.filter(item => item.nodeId !== plan.output.ownerNodeId),
                            tools: resolveAgentToolFlags(config.tools, options.tools) || {}, customToolRegistry }).map(schema => schema.function));
                    }
                }
                return tools;
            },
            getScope: () => ({ character: getCurrentAvatar(getContext()), conversation: getChatKey(getContext()) }) }),
        renderMemory: createMemoryWorkspace({ getContext }),
    });
    initRunPanel();
    ensureSettings();
    getWorkspaceLibrary(getSettings());
    saveSettingsDebounced();
    ensureDirectorPureSyntheticPreset(context);
    void rehydrateBridgedSillyTavernTools(extension_settings[MODULE_NAME]);
    // Register skill_list / skill_read / skill_search on the orchestrator's
    // Layer-2 extension registry so `executeLoopTool` can dispatch them.
    // The same tools are also registered on the ToolManager (via
    // `registerSkillAgentTools` at app boot) for non-orchestrator callers;
    // this registration is what makes them reachable inside the orchestrator.
    try {
        registerSkillOrchestrationTools();
    } catch (err) {
        console.warn(`[${MODULE_NAME}] failed to register skill orchestration tools:`, err);
    }
    // Hook skills embed lifecycle: character/preset embed import dialog +
    // cascade-delete on character/preset removal. Listens on context's
    // own event bus, idempotent.
    try {
        registerSkillEmbedLifecycle({ context, t: i18n });
    } catch (err) {
        console.warn(`[${MODULE_NAME}] failed to register skill embed lifecycle:`, err);
    }
    // Hook preset export: when the user clicks Export, ask whether to bundle
    // the preset-scope skills into the JSON before download fires. The hook
    // listens on OAI_PRESET_EXPORT_READY which carries `{data, presetName}`
    // (aligned with OAI_PRESET_IMPORT_READY); we mutate `data` in place to
    // attach `extensions.atria.embedded_skills_source`. `presetName` is the
    // real slot name so the hook resolves the correct preset-scope skills
    // even under card-bound selection (where oai_settings.preset_settings_openai
    // is stale global).
    if (context.eventTypes?.OAI_PRESET_EXPORT_READY) {
        context.eventSource.on(context.eventTypes.OAI_PRESET_EXPORT_READY, async ({ data, presetName } = {}) => {
            try {
                await maybeAttachSkillsToPresetExport({ context, data, presetName, t: i18n });
            } catch (err) {
                console.warn(`[${MODULE_NAME}] preset export skills attachment failed:`, err);
            }
        });
    }
    // Hook orch-preset export: analogous to the OAI hook above but keyed
    // by (mode, preset name) derived from the payload's `mode` +
    // `profile.name`. Fires on ORCH_PRESET_EXPORT_READY from Task 6.
    if (context.eventTypes?.ORCH_PRESET_EXPORT_READY) {
        context.eventSource.on(context.eventTypes.ORCH_PRESET_EXPORT_READY, async (payload) => {
            try {
                await maybeAttachSkillsToOrchPresetExport({ context, payload, t: i18n });
            } catch (err) {
                console.warn(`[${MODULE_NAME}] orch-preset export skills attachment failed:`, err);
            }
        });
    }
    // Hook chat-completion preset deletion: an orchestrator preset entry
    // (loop, agenda planner/agent, director main/sub, spec preset) can
    // hold an opaque `promptPresetName` pointing at a chat-completion
    // preset by name. When that preset is deleted upstream, the runtime
    // silently falls back to the global orchestration prompt preset via
    // agent-preset-resolver, so the user's intent is lost without a
    // warning. Clear the references at delete time so the fallback is a
    // deliberate default, not a mystery. Only openai-family presets are
    // relevant — other apiIds don't feed the chat-completion pipeline.
    if (context.eventTypes?.PRESET_DELETED) {
        context.eventSource.on(context.eventTypes.PRESET_DELETED, async ({ apiId, name } = {}) => {
            try {
                if (apiId !== 'openai') return;
                const deletedName = String(name || '');
                if (!deletedName) return;

                let mutatedSettings = false;
                const settings = extension_settings[MODULE_NAME];
                if (settings && typeof settings === 'object') {
                    if (String(settings.llmNodePresetName || '') === deletedName) {
                        settings.llmNodePresetName = '';
                        mutatedSettings = true;
                    }
                    if (String(settings.requestLlmPresetName || '') === deletedName) {
                        settings.requestLlmPresetName = '';
                        mutatedSettings = true;
                    }
                    for (const preset of getWorkspaceLibrary(settings).presets) {
                        for (const agent of preset.planTemplate.agents) {
                            if (agent.modelProfile?.promptPresetName === deletedName) {
                                agent.modelProfile.promptPresetName = ''; mutatedSettings = true;
                            }
                        }
                    }
                }
                if (mutatedSettings) saveSettingsDebounced();
            } catch (err) {
                console.warn(`[${MODULE_NAME}] PRESET_DELETED purge failed:`, err?.message || err);
            }
        });
    }
    clearCapsulePrompt(context);
    void loadOrchestratorChatState(context).finally(() => ensureUi());

    if (context.eventTypes.GENERATION_WORLD_INFO_FINALIZED) {
        context.eventSource.on(context.eventTypes.GENERATION_WORLD_INFO_FINALIZED, onWorldInfoFinalized);
    }
    // Pre-composition hook for director-mode synthetic preset swap.
    // Fires at script.js:7146 (await emit), so an async handler that
    // shows a user-confirm popup is awaited end-to-end before compose
    // runs. Applies only for the four generation types director takes
    // over — quiet / impersonate / dryRun must not be touched.
    //
    // The swap routes through a registered synthetic preset
    // (`orchestrator:director-pure`), not in-place key replacement on
    // oai_settings. If the apply throws (user cancelled at the
    // unsaved-changes prompt), the throw bubbles out of `await emit`
    // and stops Generate.
    if (context.eventTypes.GENERATION_AFTER_COMMANDS) {
        context.eventSource.on(context.eventTypes.GENERATION_AFTER_COMMANDS, async (type, _params, dryRun) => {
            if (dryRun) return;
            if (!extension_settings[MODULE_NAME]?.enabled) return;
            if (!DIRECTOR_TAKEOVER_GEN_TYPES.has(String(type || ''))) return;
            const profile = getEffectiveProfile(getContext());
            if (!profile || String(profile.mode || '') !== ORCH_EXECUTION_MODE_DIRECTOR) return;
            await applyDirectorPresetSwap(getContext());
        });
    }
    // Safety-net restores. Primary restore happens at the top of the
    // GENERATE_TAKEOVER_DISPATCH handler below; these catch any path
    // where Generate ends or aborts without reaching the takeover
    // dispatch (network failure mid-compose, user abort before
    // composition completes, slash-command bail-out, etc.). The
    // restore function is idempotent so duplicate fires are safe.
    if (context.eventTypes.GENERATION_ENDED) {
        context.eventSource.on(context.eventTypes.GENERATION_ENDED, () => {
            try { restoreDirectorPresetSwap(getContext()); } catch (_) { /* best-effort */ }
        });
    }
    if (context.eventTypes.GENERATION_STOPPED) {
        context.eventSource.on(context.eventTypes.GENERATION_STOPPED, () => {
            try { restoreDirectorPresetSwap(getContext()); } catch (_) { /* best-effort */ }
        });
    }
    // Director-mode subscriber: when the active profile runs in director
    // mode, claim the takeover handle so the orchestrator produces the
    // assistant message body directly (instead of injecting a capsule
    // and letting the main LLM write the body). Subscription is registered
    // unconditionally — the handler returns synchronously without claiming
    // when the active profile is in any other mode.
    if (context.eventTypes.GENERATE_TAKEOVER_DISPATCH) {
        context.eventSource.on(context.eventTypes.GENERATE_TAKEOVER_DISPATCH, async (eventData) => {
            // Re-resolve the live context on every dispatch. The init-time
            // closure's `context.chatId` is a snapshot frozen at ST startup
            // (getContext returns a plain object with `chatId` materialized
            // from `characters[this_chid].chat`, not a getter), so using it
            // for `getChatKey` makes the trace bind to the wrong chat and
            // the popup later fails to look it up. Same reason
            // `onWorldInfoFinalized` calls `getContext()` per event.
            const context = getContext();
            try {
                // Restore oai_settings before doing anything else.
                // The synthetic preset swap was applied at
                // GENERATION_AFTER_COMMANDS so that the messages now
                // sitting on eventData.generateData.prompt (composed
                // at script.js:8144) are free of preset-level prompt
                // items. Composition is complete by the time this
                // event fires, so the swap has done its job and the
                // user's settings must be back in place before the
                // director loop spins up its agents (whose preset
                // lookup happens by name and is unrelated to
                // oai_settings).
                restoreDirectorPresetSwap(context);

                if (!extension_settings[MODULE_NAME]?.enabled) return;

                const profile = getEffectiveProfile(context);
                if (!profile) return;
                // Bail early when the active profile is not director —
                // we used to fall through and `acquirePlaceholderMessageId`
                // would push an empty assistant bubble before the
                // downstream `handleDirectorDispatch` early-returns
                // because of the mode mismatch. That left a stray empty
                // assistant message at the bottom of the chat for every
                // spec / agenda / loop turn. The dispatch event must be
                // a no-op for non-director profiles.
                if (String(profile.mode || '') !== ORCH_EXECUTION_MODE_DIRECTOR) {
                    return;
                }

                // Capture the GENERATE_TAKEOVER_DISPATCH eventData reference
                // (not a messages snapshot) so the cache resolves
                // `eventData.generateData.prompt` lazily on each get().
                // CHAT_COMPLETION_SETTINGS_READY is emitted from the takeover
                // branch in script.js *after* this listener runs (the order
                // is forced by the takeover protocol — core can only know a
                // takeover happened by emitting dispatch first). A
                // chat-completion hook firing in that later emit may replace
                // `generate_data.prompt` with a new array (e.g.
                // ST-Prompt-Template's @INJECT splicing); lazy resolution
                // ensures director agents reading the cache later in the
                // turn see that replacement.
                // ST's Generate() stores the chat-completion messages array
                // on `generate_data.prompt` — legacy name carried over from
                // the text-completion path (`prepareOpenAIMessages` returns
                // `[chat, counts]` and script.js:8162 does
                // `generate_data = { prompt: prompt }`).
                if (Array.isArray(eventData?.generateData?.prompt)) {
                    directorContentCache.set({ eventData });
                } else {
                    console.warn(`[${MODULE_NAME}] GENERATE_TAKEOVER_DISPATCH missing generateData.prompt — director will run with empty story context`);
                    directorContentCache.clear();
                }

                const settings = extension_settings[MODULE_NAME];

                // Main agent and sub-agents both decide chunk-level
                // streaming from the per-call preset's `stream_openai`
                // flag (probed via context.isStreamingPresetEnabled).
                // When true, the dispatcher consumes the generateTaskStream
                // channel and forwards deltas via opts.onChunk so director-
                // runtime can push the live text into the reasoning fold
                // as it arrives; when false, plain generateTask returns
                // the terminal payload in one shot. The two paths return
                // identical assistantText + toolCalls.
                const generateTaskRouter = async ({ onChunk, ...opts } = {}) => {
                    const streamChunks = typeof context?.isStreamingPresetEnabled === 'function'
                        && context.isStreamingPresetEnabled(opts?.llmPresetName || '');
                    if (streamChunks) {
                        const { stream, result } = context.generateTaskStream(opts);
                        if (typeof onChunk === 'function') {
                            (async () => {
                                try {
                                    for await (const chunk of stream) {
                                        try { onChunk(chunk); } catch (_) { /* best-effort */ }
                                    }
                                } catch (_) { /* errors surface through `result` */ }
                            })();
                        }
                        return await result;
                    }
                    return await context.generateTask(opts);
                };

                // Resolve target message id for director-runtime's handle
                // seed. The kernel (script.js takeover branch) owns chat-
                // array mutation in production via its own setOnUpdate
                // listener — placeholder push, DOM bubble render,
                // message_updated emits, post-generation pipeline,
                // saveReply routing all live in the kernel now. This
                // acquirer just points at the slot the takeover will
                // write into so the handle's originalText / originalReasoning
                // come from the right source:
                //   - chat tail is assistant → reuse it (regenerate /
                //     continue / swipe — kernel preserves that slot)
                //   - chat tail is user or chat empty → kernel will
                //     allocate a fresh bottom slot at `chat.length`;
                //     handing director-runtime that future index makes
                //     originalText / originalReasoning default to '' via
                //     undefined chat lookup, which is correct for `normal`.
                const acquirePlaceholderMessageId = async () => {
                    const lastIdx = context.chat.length - 1;
                    const last = lastIdx >= 0 ? context.chat[lastIdx] : null;
                    if (last && last.is_user === false) {
                        return lastIdx;
                    }
                    return context.chat.length;
                };

                // Open the run-panel store for this director turn. abortFn
                // calls ST's stopGeneration() — same effect as the user
                // pressing the global stop button. abortController.signal
                // (which director-runtime consumes via eventData.abortSignal)
                // goes aborted and the run unwinds.
                //
                // `stopFn` is the fast-unwind path the run-panel Stop button
                // prefers over raw `abortFn`. Director does NOT run through
                // the `Promise.race([orchestrationTask, stopRequestPromise])`
                // in onWorldInfoFinalized (that wrapper early-returns for
                // director mode at main.js:1116) and its
                // `handleDirectorDispatch` returns synchronously while a
                // background IIFE keeps running the tool-call loop — so
                // `finishRun` is buried inside that IIFE's `finally { await
                // handle.complete; ... }` and only fires whenever the loop
                // actually reaches a terminal state (which can be
                // arbitrarily late when the LLM sender is stuck or the
                // current round is waiting on a local tool). Without a
                // `stopFn` the panel's Stop button falls back to raw
                // `abortFn` and the RUN_FINISHED event that clears the
                // header bar / freezes the timer / hides the stop button
                // never fires until the background IIFE settles, leaving
                // the panel visibly "stopping" long after the user's
                // message-send button already flipped back to send.
                //
                // Fix: fire the underlying abort AND immediately fold the
                // panel run to `aborted` so `_renderRunFinished` runs and
                // the header/timer/button converge with the user's intent
                // right away. director-runtime's finally block later calls
                // `finishRun` again with the resolved handle status; the
                // second call throws in `ensureRunningMatchesId` when the
                // run has since been replaced/cleared and the caller's
                // existing try/catch swallows it (see
                // director-runtime.js:311 "store may already be cleared").
                // When the run is still in place, the second `finishRun`
                // just overwrites status/endedAt with the real terminal
                // state and re-emits RUN_FINISHED — the panel handler is
                // idempotent (rerunning _renderRunFinished with the same
                // run only refreshes the elapsed number and re-hides the
                // already-hidden stop button).
                let directorRunId;
                directorRunId = startRun({
                    mode: 'director',
                    chatKey: getChatKey(context),
                    abortFn: () => { try { getContext().stopGeneration(); } catch (_) { /* best-effort */ } },
                    stopFn: () => {
                        try { getContext().stopGeneration(); } catch (_) { /* best-effort */ }
                        try {
                            finishRun({
                                runId: directorRunId,
                                status: 'aborted',
                                error: 'user_stopped',
                            });
                        } catch (_) { /* run may already have settled */ }
                    },
                });

                await handleDirectorDispatch(eventData, {
                    profile,
                    chat: context.chat,
                    acquirePlaceholderMessageId,
                    getContentPayload: () => directorContentCache.get(),
                    generateTask: generateTaskRouter,
                    generateTaskStreamForMainAgent: generateTaskRouter,
                    // Sub-agent dispatcher receives the raw streaming
                    // provider plus a `(presetName) => boolean` probe and
                    // picks per dispatch whether to pipe chunks into the
                    // reasoning-fold section (preset `stream_openai: true`)
                    // or hand the section the terminal text in one shot
                    // (preset `stream_openai: false`).
                    generateTaskStream: typeof context?.generateTaskStream === 'function'
                        ? (opts) => context.generateTaskStream(opts)
                        : null,
                    isStreamingPresetEnabled: typeof context?.isStreamingPresetEnabled === 'function'
                        ? (presetName) => Boolean(context.isStreamingPresetEnabled(presetName))
                        : null,
                    executeLoopTool: (name, args, deps) => executeLoopTool(name, args, deps),
                    runId: directorRunId,
                    settings,
                    // Notes adapter context — same shape loop-runtime
                    // mounts. Lets sub-agents see persisted notes via the
                    // "## Open Notes" block prepended to their system
                    // prompts. Re-read on every sub dispatch so notes
                    // written by an earlier sub-agent in this session
                    // show up for later ones.
                    contextForNotes: await (async () => {
                        // Base the overlay on the extension context via
                        // prototype chain so `attachNotesFloorState` ->
                        // `getNotesFloorStateInstance` can reach the live
                        // `createFloorState` factory. A bare `{}` here
                        // makes the adapter open as null (the loader
                        // throws "createFloorState API is unavailable"
                        // and falls through to the catch). The director
                        // dispatcher rebuilds the per-tool-call ctx via
                        // `Object.create(contextForNotes)` so prototype-
                        // side ST APIs (e.g. `updateChatState`) remain
                        // reachable — Layer-2 tools that lazily open
                        // chat-scoped state (memory-graph's session)
                        // depend on this. Mirrors loop-runtime's
                        // `attachToolContext`.
                        const notesCtx = Object.create(context);
                        await attachNotesFloorState(notesCtx);
                        return notesCtx;
                    })(),
                    // memory-graph's session is opened lazily inside its
                    // Layer-2 tools (per-ctx WeakMap cache) — orchestrator
                    // no longer threads one. Sub-agent dispatcher's
                    // executeLoopTool sees the ctx and the memory_* exec
                    // wrappers open / cache the session on first call.
                    // Visible failure surface. Director takes over the
                    // GENERATE path, so ST core's sender never gets to
                    // toast on its behalf — we have to do it here when
                    // the loop blows up (e.g. backend 500 mid-stream).
                    notifyError: (msg) => {
                        try {
                            if (typeof toastr === 'object' && typeof toastr?.error === 'function') {
                                toastr.error(String(msg || 'Unknown error'), 'Orchestrator (director)');
                            }
                        } catch (_) { /* toast is best-effort */ }
                    },
                });
            } catch (err) {
                console.warn(`[${MODULE_NAME}] GENERATE_TAKEOVER_DISPATCH handler failed:`, err);
            }
        });
    }
    if (context.eventTypes.MESSAGE_DELETED) {
        context.eventSource.on(context.eventTypes.MESSAGE_DELETED, onMessageDeleted);
    }
    if (context.eventTypes.MESSAGE_EDITED) {
        context.eventSource.on(context.eventTypes.MESSAGE_EDITED, onMessageEdited);
    }
    if (context.eventTypes.PRESET_CHANGED) {
        context.eventSource.on(context.eventTypes.PRESET_CHANGED, (event) => {
            if (String(event?.apiId || '') === 'openai') {
                ensureUi();
            }
        });
    }
    const connectionProfileEvents = [
        context.eventTypes.CONNECTION_PROFILE_LOADED,
        context.eventTypes.CONNECTION_PROFILE_CREATED,
        context.eventTypes.CONNECTION_PROFILE_DELETED,
        context.eventTypes.CONNECTION_PROFILE_UPDATED,
    ].filter(Boolean);
    for (const eventName of connectionProfileEvents) {
        context.eventSource.on(eventName, () => ensureUi());
    }
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
        const liveContext = getContext();
        abortActiveOrchestratorRun();
        clearCacheForChatChange();
        const run = getCurrentRun();
        if (run && run.status === 'running' && typeof run.abortFn === 'function') {
            try { run.abortFn(); } catch (_) { /* best effort */ }
            try {
                finishRun({ runId: run.runId, status: 'aborted', error: 'chat changed' });
            } catch (_) { /* state may already be clean */ }
        }
        clearCurrentRun();
        destroyWorkspace(); initRunPanel();
        clearCapsulePrompt(liveContext);
        void loadOrchestratorChatState(liveContext).finally(() => ensureUi());
    });

    // Host character changes invalidate open editors and guarded Memory views.
    const characterRefreshEvents = [
        context.eventTypes?.CHARACTER_REPLACED,
        context.eventTypes?.CHARACTER_FIELDS_UPDATED,
        context.eventTypes?.CHARACTER_EDITED,
    ].filter(Boolean);
    for (const eventName of characterRefreshEvents) {
        context.eventSource.on(eventName, () => { destroyWorkspace(); initRunPanel(); ensureUi(); });
    }
});

/**
 * Floor-state adapter for the orchestrator extension.
 *
 * Atria persists orchestration snapshots only in the current
 * `atri_orchestrator_anchors` FloorState namespace. Namespace migration is
 * intentionally not supported: predecessor product state is ignored by the
 * hard cutover.
 *
 * Each commit is tagged with the anchored user floor/swipe so FloorState
 * structural handlers can invalidate stale snapshots automatically.
 */

import {
    isStoredOrchestrationSnapshotValidForMessages,
    normalizeAnchorPlayableFloor,
    normalizeOrchestrationSnapshot,
} from './anchors.js';
import { DEFAULT_LOOP_SYSTEM_PROMPT } from './loop-default-prompt.js';
import { sanitizeCustomTools } from './custom-tools-sanitize.js';
import { seedDefaultCustomToolsIfNeeded } from './seed-default-custom-tools.js';
import { sanitizeLorebookFilter } from './lorebook-filter.js';

const STATE_NAMESPACE = 'atri_orchestrator_anchors';

/**
 * Loop execution mode marker (V3 profile schema). Lives next to
 * `ORCH_EXECUTION_MODE_SPEC` / `ORCH_EXECUTION_MODE_AGENDA` defined in
 * `defaults.js`; we keep the loop literal here because the loop profile's
 * canonical sanitizer (`sanitizeLoopProfile`) is colocated with the
 * floor-state binding it ultimately persists into.
 */
export const ORCH_EXECUTION_MODE_LOOP = 'loop';

/**
 * Frozen V3 default profile. Callers should always run input through
 * `sanitizeLoopProfile` rather than mutating this object — the freeze is
 * a guardrail, not the contract.
 *
 * Field semantics:
 *
 *   - mode                  literal 'loop'; coerced on every sanitize
 *   - apiPresetName         Connection Manager profile (empty = global)
 *   - promptPresetName      chat completion preset (empty = global)
 *   - system_prompt         agent system instruction; missing falls back to
 *                            `DEFAULT_LOOP_SYSTEM_PROMPT` so fresh installs
 *                            ship with a usable RP director prompt. Existing
 *                            user-authored values (including explicit empty
 *                            string) are preserved verbatim.
 *   - tools.note.{open, close}  persistent note tool (per-chat, cross-run);
 *                            `close` lets the agent prune notes whose role
 *                            is exhausted (foreshadowing fired, setting
 *                            superseded) so the system-prompt note block
 *                            doesn't degenerate into noise
 *   - tools.chat.{read_range, search}  in-chat history tools
 *   - tools.lorebook.{world_book_list, list, search, get}  world-info lookup tools
 *   - tools.custom.{memory_*, search_*, ...}  Layer-2 extension tools
 *                            (registered by memory-graph / search-tools)
 *                            and any Layer-3 character-card customTools.
 *                            memory-graph and search-tools verbs default
 *                            ON via LOOP_PROFILE_DEFAULTS so first-run
 *                            users keep their out-of-box tool pipeline.
 *                            Extension tools use the current
 *                            `tools.custom.<toolName>` namespace.
 *   - tools.finalize        FORCED true; the loop has no other terminator
 *   - max_rounds            tool-call round budget; floored at 1
 *   - wall_clock_budget_ms  loop deadline; floored at 10000ms (10s)
 *   - capsule_inject        same shape as spec/agenda capsule injection
 */
/**
 * Default Layer-2 customs seed shared across loop / agenda / spec /
 * director. memory-graph + search-tools register these tools at startup;
 * a fresh profile ships with them all enabled so first-run users get the
 * same out-of-box pipeline they had before the namespace drop. Per-
 * profile `tools.custom.<name>` and per-agent override panels can flip
 * individual entries off.
 *
 * The plugin's own enable flag still gates execution at runtime — when
 * search-tools is disabled the Layer-2 exec raises SEARCH_DISABLED /
 * SEARCH_UNAVAILABLE as a structured error.
 */
export const DEFAULT_LAYER2_CUSTOMS = Object.freeze({
    memory_recall: true,
    memory_schema: true,
    memory_list_candidates: true,
    memory_edge_summary: true,
    memory_node_brief: true,
    memory_expand_seeds: true,
    memory_keyword_search: true,
    memory_vector_search: true,
    memory_find_by_name: true,
    memory_compaction_candidates: true,
    memory_node_create: true,
    memory_node_edit: true,
    memory_node_delete: true,
    memory_link_upsert: true,
    memory_link_delete: true,
    memory_compact_nodes: true,
    search_search: true,
    search_visit: true,
});

/**
 * Seed the current Layer-2 custom-tool namespace. Only
 * `tools.custom.<toolName>` participates in Atria profile sanitization;
 * predecessor top-level tool bags are ignored by the hard cutover.
 */
export function seedDefaultLayer2Customs(input) {
    const tools = input && typeof input === 'object' ? input : {};
    const callerCustom = tools.custom && typeof tools.custom === 'object'
        ? tools.custom
        : {};
    return {
        ...tools,
        custom: {
            ...DEFAULT_LAYER2_CUSTOMS,
            ...callerCustom,
        },
    };
}

const LOOP_PROFILE_DEFAULTS = Object.freeze({
    mode: ORCH_EXECUTION_MODE_LOOP,
    apiPresetName: '',
    promptPresetName: '',
    system_prompt: DEFAULT_LOOP_SYSTEM_PROMPT,
    tools: Object.freeze({
        note: Object.freeze({ open: true, close: true }),
        chat: Object.freeze({ read_range: true, search: true }),
        lorebook: Object.freeze({ world_book_list: true, list: true, search: true, get: true, force_activate: true }),
        custom: { ...DEFAULT_LAYER2_CUSTOMS },
        finalize: true,
    }),
    max_rounds: 40,
    wall_clock_budget_ms: 300000,
    capsule_inject: Object.freeze({
        position: 'atDepth',
        depth: 0,
        role: 'system',
        customInstruction: '',
    }),
});

const LOOP_MAX_ROUNDS_FLOOR = 1;
const LOOP_WALL_CLOCK_FLOOR_MS = 10000;

function floorInteger(value, lo, fallback) {
    // Treat null / undefined / NaN / non-numeric strings as "missing" and
    // fall back. Explicit numeric inputs (including 0 and negatives) are
    // floored at `lo` so the algorithm still has a meaningful minimum
    // (zero rounds = the loop never advances). No upper cap — users who
    // want 9999 get 9999.
    if (value === null || value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(lo, Math.floor(n));
}

function readBooleanFlag(input, defaultValue) {
    // Treats only an explicit `false` as a disable signal — every other
    // shape (undefined / true / truthy / falsy non-false / non-boolean)
    // collapses to the default. This matches the plan's "default-on"
    // ergonomics: callers pass `{ tools: { chat: { search: false } }}` to
    // disable, and missing fields stay enabled.
    if (input === false) return false;
    if (input === true) return true;
    return defaultValue;
}

function sanitizeLoopToolFlags(input) {
    // Loop mode defaults every flag ON — the agent has the full tool set
    // unless the user explicitly disables a flag. `sanitizeAgentToolFlags`
    // below is the shared sanitizer; for spec / agenda nodes it defaults
    // OFF (no tools) when no input was provided. Loop's all-on policy
    // stays the standalone outlier because loop has no "inherit"
    // semantics — its profile root *is* the tools spec.
    //
    // Memory and search extension tools live in the current Layer-2
    // `tools.custom.<name>` namespace. Seed current defaults before the
    // shared sanitizer applies explicit caller overrides.
    const seeded = seedDefaultLayer2Customs(input);
    return sanitizeAgentToolFlags(seeded, { defaultAllOn: true, forceFinalize: true });
}

/**
 * Canonical tool-flag sanitizer used by spec node / agenda agent /
 * profile defaultTools / loop profile. Caller picks the default disposition:
 *
 *   - `defaultAllOn: true`  → missing fields default to enabled. Used by
 *                              loop mode where the agent always has tools.
 *   - `defaultAllOn: false` → missing fields default to disabled. Used by
 *                              spec / agenda where tools are opt-in.
 *
 * `forceFinalize: true` forces `finalize: true` regardless of input. Loop
 * needs it (the agent has no other terminator); spec / agenda nodes don't,
 * since their wrapping driver provides its own finalize when the cascade
 * resolves to a non-empty tool set.
 *
 * Returns the canonical flag object. The cascade is performed elsewhere
 * (`resolveAgentToolFlags`) — this function never returns null; it always
 * builds a complete shape. Callers wanting "inherit" semantics pass
 * `null` / `undefined` to the cascade resolver directly.
 */
export function sanitizeAgentToolFlags(input, { defaultAllOn = false, forceFinalize = false } = {}) {
    const def = Boolean(defaultAllOn);
    const tools = input && typeof input === 'object' ? input : {};
    const noteIn = tools.note && typeof tools.note === 'object' ? tools.note : {};
    const chatIn = tools.chat && typeof tools.chat === 'object' ? tools.chat : {};
    const lorebookIn = tools.lorebook && typeof tools.lorebook === 'object' ? tools.lorebook : {};
    const collabIn = tools.collab && typeof tools.collab === 'object' ? tools.collab : {};
    const messageIn = tools.message && typeof tools.message === 'object' ? tools.message : {};
    const customIn = tools.custom && typeof tools.custom === 'object' ? tools.custom : {};
    const customOut = {};
    for (const [k, v] of Object.entries(customIn)) {
        customOut[String(k)] = v !== false;
    }
    // Override profiles replace the inherited tool bag. Layer-2 built-ins
    // therefore need explicit false defaults in override mode; otherwise the
    // registry's "undefined means enabled" rule would widen the override.
    if (!def) {
        for (const name of Object.keys(DEFAULT_LAYER2_CUSTOMS)) {
            if (customOut[name] === undefined) {
                customOut[name] = false;
            }
        }
    }
    return {
        note: {
            open: readBooleanFlag(noteIn.open, def),
            close: readBooleanFlag(noteIn.close, def),
        },
        chat: {
            read_range: readBooleanFlag(chatIn.read_range, def),
            search: readBooleanFlag(chatIn.search, def),
        },
        lorebook: {
            world_book_list: readBooleanFlag(lorebookIn.world_book_list, def),
            list: readBooleanFlag(lorebookIn.list, def),
            search: readBooleanFlag(lorebookIn.search, def),
            get: readBooleanFlag(lorebookIn.get, def),
            // force_activate is a write-mode tool but it is one of the
            // primary value-adds of loop/spec/agenda over a static WI
            // pass — defaults to on for new profiles. Users who don't
            // want it can flip it off in the editor or via iter-studio.
            force_activate: readBooleanFlag(lorebookIn.force_activate, def),
        },
        custom: customOut,
        // Director-only collaboration verbs. Sub-agents never see these
        // tools regardless of flag value (buildSubAgentToolSchemas hard-
        // excludes them — only the main agent dispatches). For other
        // modes (loop / spec / agenda) these flags are inert: those
        // runtimes don't construct the dispatcher schemas, so the field
        // round-trips through the profile but has no effect. Same inert
        // pattern applies to `message` below.
        collab: {
            dispatch_subagent: readBooleanFlag(collabIn.dispatch_subagent, def),
            dispatch_inline_subagent: readBooleanFlag(collabIn.dispatch_inline_subagent, def),
        },
        // Message-editing opt-in for BOTH main agent and sub-agents —
        // no role-based special-casing. `buildMainAgentToolSchemas` and
        // `buildSubAgentToolSchemas` both read `tools.message.<verb>`;
        // the shipping default main agent has an explicit `tools`
        // override that enables both flags (see
        // `buildDefaultMainAgentToolsOverride` in director-defaults.js),
        // sub-agents inherit the profile default (both off). Either
        // role can be flipped in its Tools override panel.
        //
        // Follows the same per-namespace default as other flag groups:
        // `def` (from `defaultAllOn`) so "Enable all" / "Disable all"
        // on the profile default panel act uniformly across every
        // visible toggle.
        //
        // New director profiles explicitly keep sub-agent draft editing off
        // at the profile default while the main agent receives its own
        // explicit write/patch override.
        //
        // Finalize is not represented — sub-agents cannot commit / end
        // the turn regardless of flag; main agent finalize is
        // unconditional (turn-terminator ownership).
        message: {
            write_message: readBooleanFlag(messageIn.write_message, def),
            apply_message_patches: readBooleanFlag(messageIn.apply_message_patches, def),
        },
        // `finalize` is the only tool the agent can use to stop a tool
        // loop. Loop mode (and spec/agenda nodes that opt into tools)
        // need it forced true so the wrapper driver has a known
        // terminator. Pure-default callers (no `forceFinalize`) still
        // get the default disposition.
        finalize: forceFinalize ? true : readBooleanFlag(tools.finalize, def),
    };
}

/**
 * Optional-input variant: `null` / `undefined` mean "inherit from upstream"
 * and pass through unchanged. Otherwise delegates to
 * `sanitizeAgentToolFlags` with the caller's defaults. Used by spec node
 * and agenda agent sanitizers where the persisted shape is `null | object`.
 */
export function sanitizeOptionalAgentToolFlags(input, opts = {}) {
    if (input === null || input === undefined) return null;
    return sanitizeAgentToolFlags(input, opts);
}

/**
 * Cascade resolver for an agent invocation. Returns the canonical flag
 * object to apply at runtime:
 *
 *   1. If the node / agent has its own `tools` field set (object), use it.
 *   2. Otherwise, fall back to the profile's `defaultTools` (object).
 *   3. Otherwise, return the built-in fallback (`builtinDefault`, which
 *      callers can pass as either an all-off shape — spec / agenda — or
 *      an all-on shape — single mode if it ever opts in).
 *
 * All three layers should already be sanitized; this helper just picks
 * the highest-priority non-null one.
 */
export function resolveAgentToolFlags(nodeTools, profileDefaultTools, builtinDefault = null) {
    if (nodeTools && typeof nodeTools === 'object') return nodeTools;
    if (profileDefaultTools && typeof profileDefaultTools === 'object') return profileDefaultTools;
    if (builtinDefault && typeof builtinDefault === 'object') return builtinDefault;
    return null;
}

/**
 * Returns true when any flag in the canonical shape is enabled. Used
 * by spec / agenda runtime to decide whether a node needs the
 * multi-round tool-loop driver instead of the single-forced-function
 * code path. `finalize` alone doesn't count as "enabled tools" — the
 * tool loop is pointless without at least one non-terminator tool.
 *
 * `tools.custom` is walked too so Layer-2 / Layer-3 tools (memory-graph,
 * search-tools, character-card customTools) opt the loop driver in even
 * when no builtin namespace has a true flag.
 */
export function hasAnyToolEnabled(flags) {
    if (!flags || typeof flags !== 'object') return false;
    const groups = ['note', 'chat', 'lorebook'];
    for (const group of groups) {
        const bag = flags[group];
        if (bag && typeof bag === 'object') {
            for (const key of Object.keys(bag)) {
                if (bag[key] === true) return true;
            }
        }
    }
    const custom = flags.custom;
    if (custom && typeof custom === 'object') {
        for (const key of Object.keys(custom)) {
            if (custom[key] === true) return true;
        }
    }
    return false;
}

function sanitizeLoopCapsuleInject(input) {
    const inject = input && typeof input === 'object' ? input : {};
    return {
        position: typeof inject.position === 'string' && inject.position
            ? inject.position
            : LOOP_PROFILE_DEFAULTS.capsule_inject.position,
        depth: Number.isFinite(Number(inject.depth))
            ? Math.floor(Number(inject.depth))
            : LOOP_PROFILE_DEFAULTS.capsule_inject.depth,
        role: typeof inject.role === 'string' && inject.role
            ? inject.role
            : LOOP_PROFILE_DEFAULTS.capsule_inject.role,
        customInstruction: typeof inject.customInstruction === 'string'
            ? inject.customInstruction
            : LOOP_PROFILE_DEFAULTS.capsule_inject.customInstruction,
    };
}

/**
 * Canonical V3 loop-profile normalizer. Coerces the input into the
 * runtime shape, clamps numeric budgets to the hard bounds, forces the
 * mode literal and `tools.finalize` regardless of caller intent, and
 * fills missing tool flags with the default-on state.
 *
 * Mirrors the role `sanitizeSpec` plays for V1 and `sanitizeAgendaWorkingProfile`
 * for V2. There is intentionally no top-level dispatcher in this module
 * (V1 and V2 sanitizers each live next to their data); callers that
 * need to choose between sanitizers do so by inspecting `input?.mode`
 * upstream (e.g. `runOrchestration` in main.js).
 *
 * @param {object | null | undefined} input
 * @returns {{
 *   mode: 'loop',
 *   apiPresetName: string,
 *   promptPresetName: string,
 *   system_prompt: string,
 *   tools: {
 *     note: { open: boolean, close: boolean },
 *     chat: { read_range: boolean, search: boolean },
 *     lorebook: { world_book_list: boolean, list: boolean, search: boolean, get: boolean },
 *     custom: { [toolName: string]: boolean },
 *     finalize: true,
 *   },
 *   max_rounds: number,
 *   wall_clock_budget_ms: number,
 *   capsule_inject: { position: string, depth: number, role: string, customInstruction: string },
 * }}
 */
export function sanitizeLoopProfile(input) {
    const source = input && typeof input === 'object' ? input : {};
    const out = {
        mode: ORCH_EXECUTION_MODE_LOOP,
        apiPresetName: source.apiPresetName == null ? '' : String(source.apiPresetName),
        promptPresetName: source.promptPresetName == null ? '' : String(source.promptPresetName),
        // Missing field (no `system_prompt` key at all) → ship the default RP
        // director prompt. Existing string values, including '', are kept
        // verbatim so users who deliberately cleared the textarea aren't
        // re-overwritten on every sanitize roundtrip.
        system_prompt: source.system_prompt == null
            ? LOOP_PROFILE_DEFAULTS.system_prompt
            : String(source.system_prompt),
        tools: sanitizeLoopToolFlags(source.tools),
        max_rounds: floorInteger(
            source.max_rounds,
            LOOP_MAX_ROUNDS_FLOOR,
            LOOP_PROFILE_DEFAULTS.max_rounds,
        ),
        wall_clock_budget_ms: (() => {
            // null/undefined → default; explicit numbers below the floor
            // get raised to LOOP_WALL_CLOCK_FLOOR_MS rather than silently
            // adopting the (much larger) default.
            if (source.wall_clock_budget_ms === null || source.wall_clock_budget_ms === undefined) {
                return LOOP_PROFILE_DEFAULTS.wall_clock_budget_ms;
            }
            const n = Number(source.wall_clock_budget_ms);
            if (!Number.isFinite(n)) return LOOP_PROFILE_DEFAULTS.wall_clock_budget_ms;
            return Math.max(LOOP_WALL_CLOCK_FLOOR_MS, Math.floor(n));
        })(),
        capsule_inject: sanitizeLoopCapsuleInject(source.capsule_inject),
        lorebookFilter: sanitizeLorebookFilter(source.lorebookFilter),
        ...(() => {
            const seeded = seedDefaultCustomToolsIfNeeded(source, sanitizeCustomTools(source.customTools));
            return {
                customTools: seeded.customTools,
                seededDefaultCustomTools: seeded.seededDefaultCustomTools,
            };
        })(),
    };
    // Loop is a single-agent mode, so the mode-level `skills` field is the
    // only place a visibility profile can live. Same inline normalizer the
    // director sanitizer uses; see director-defaults.js for rationale on
    // why we don't import from skill-resolution.js (lib.js test-env issue).
    if (source.skills && typeof source.skills === 'object') {
        out.skills = { ...source.skills };
        if (!Array.isArray(out.skills.visible)) out.skills.visible = ['*'];
        if (!Array.isArray(out.skills.deny)) out.skills.deny = [];
    } else {
        out.skills = { visible: ['*'], deny: [] };
    }
    return out;
}

let floorStatePromise = null;

/**
 * Lazy singleton holding the floor-state instance for orchestrator anchors.
 * The instance lives for the page session; its data namespace is kept in
 * sync with chat structure by core driving `settleXxx` from `floor-state.js`
 * on every structural transition — callers do not need to recreate it.
 */
export async function getFloorStateInstance(context) {
    if (!floorStatePromise) {
        if (typeof context?.createFloorState !== 'function') {
            throw new Error('[orchestrator] createFloorState API is unavailable in extension context.');
        }
        floorStatePromise = context.createFloorState({ namespace: STATE_NAMESPACE })
            .catch((err) => {
                floorStatePromise = null;  // do not cache rejection
                throw err;
            });
    }
    return floorStatePromise;
}

/**
 * Test escape hatch: drop the cached singleton so subsequent
 * `getFloorStateInstance` calls create a fresh instance. Production code
 * never needs this — the instance lives for the page session.
 */
export function resetFloorStateInstanceForTesting() {
    floorStatePromise = null;
}

/**
 * Read the current data namespace state. Returns `{}` (not null) so
 * callers can iterate keys without a guard.
 */
export async function loadAnchorMap(context) {
    const fs = await getFloorStateInstance(context);
    await fs.ready();
    const result = await fs.get();
    if (!result.ok) {
        console.warn(`[orchestrator] loadAnchorMap failed (reason=${result.reason}, hint=${result.hint})`);
        return {};
    }
    const data = result.state;
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

/**
 * Write a freshly-completed orchestration snapshot. The commit's
 * (floor, swipeId) tag is derived from the anchor's owning user message
 * so floor-state's structural-event handlers can correctly invalidate it
 * later.
 *
 * Returns a state envelope: `{ ok: false, reason, hint }` when the anchor
 * is incomplete (missing chatIndex / playableFloor) or the snapshot
 * cannot be normalized, otherwise the envelope returned by `fs.patch`
 * (`{ ok: true, updated: boolean }` on success, or
 * `{ ok: false, reason, hint }` on failure). Callers should branch on
 * `result.ok` and surface non-ok envelopes to the UI as soft errors.
 *
 * @param {object} context
 * @param {{ playableFloor: number, chatIndex: number, swipeId: number, hash: string }} anchor
 * @param {{ anchorHash: string, capsuleText: string, stageOutputs: object[] }} snapshot
 * @returns {Promise<{ ok: boolean, updated?: boolean, reason?: string, hint?: string }>}
 */
export async function commitAnchorSnapshot(context, anchor, snapshot) {
    const playableFloor = normalizeAnchorPlayableFloor(anchor?.playableFloor);
    const chatIndex = Number(anchor?.chatIndex);
    const swipeId = Number(anchor?.swipeId);
    if (!playableFloor || !Number.isInteger(chatIndex) || chatIndex < 0) {
        return { ok: false, reason: 'VALIDATION_ARGS', hint: 'invalid anchor coordinates' };
    }
    const normalizedSnapshot = normalizeOrchestrationSnapshot(snapshot);
    if (!normalizedSnapshot) {
        return { ok: false, reason: 'VALIDATION_ARGS', hint: 'snapshot normalization failed' };
    }
    const fs = await getFloorStateInstance(context);
    return fs.patch(
        [{ op: 'add', path: `/${playableFloor}`, value: normalizedSnapshot }],
        { floor: chatIndex, swipeId: Number.isInteger(swipeId) && swipeId >= 0 ? swipeId : 0 },
    );
}

/**
 * Convenience: pick the latest still-valid snapshot from the data map
 * given the current chat. "Valid" = stored playable floor still points
 * at a user message AND the stored anchorHash matches the live message
 * text. Used to populate the in-memory cache that drives capsule
 * injection and UI rendering.
 *
 * @param {object} context
 * @param {Object<number, object>} anchorMap
 * @returns {{ playableFloor: number, snapshot: object } | null}
 */
export function pickLatestValidSnapshot(context, anchorMap) {
    if (!anchorMap || typeof anchorMap !== 'object') return null;
    const messages = Array.isArray(context?.chat) ? context.chat : [];
    const sortedFloors = Object.keys(anchorMap)
        .map(Number)
        .filter(Number.isInteger)
        .sort((a, b) => b - a);
    for (const playableFloor of sortedFloors) {
        const snapshot = normalizeOrchestrationSnapshot(anchorMap[playableFloor]);
        if (!snapshot) continue;
        if (isStoredOrchestrationSnapshotValidForMessages(playableFloor, snapshot, messages)) {
            return { playableFloor, snapshot };
        }
    }
    return null;
}

export const constants = Object.freeze({
    STATE_NAMESPACE,
});

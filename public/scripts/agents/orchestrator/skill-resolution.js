import { boundEvidenceCapture } from './run-state/store.js';
import { nativeSessionRuntime } from '../../native/session-runtime.js';
import { resolveSkillInvocation, pinSkillEntries, loadAlwaysSkills, skillInstructions } from '../../../shared/skill-invocation.js';

/**
 * Skill-resolution helpers for orchestrator runtimes.
 *
 * Bridges Atria's skill inventory (`skillsApi.list`) with the orchestrator's
 * per-agent visibility model. Each orchestrator mode profile (director / loop /
 * spec / agenda) plus each per-agent config (sub-agent, spec node, agenda
 * worker, loop's single agent) carries an optional `skills: { visible, deny }`
 * field that filters which installed skills the agent sees.
 *
 * Three responsibilities:
 *
 *   - `ensureSkillsFieldShape(obj, opts)` — normalize the on-disk shape of the
 *     `skills` field at sanitizer time. Mode-level: defaults to
 *     `{ visible: ['*'], deny: [] }` so all installed skills are visible.
 *     Agent-level (`isAgent: true`): leaves the field undefined when absent
 *     so the resolver knows to "inherit mode default"; normalizes a partial
 *     shape if present.
 *
 *   - `resolveAgentVisibleSkills({ modeProfile, agentConfig, runtimeContext, run })`
 *     — load fresh inventory and pin accepted contents per run, merge the four
 *     scope layers (global → oai-preset → orch-preset → character,
 *     last-wins), then filter by the effective visible/deny lists. Agent-
 *     level visible starting with `"+"` inherits the mode default and
 *     appends; otherwise it replaces. Returns the SkillIndexEntry[] the
 *     agent can see.
 *
 *   - `buildAvailableSkillsBlock(visibleSkills)` — render the
 *     `<available_skills>` system-message block injected into agent task
 *     messages so the model knows which skills exist + their descriptions.
 *
 *   - `invalidateSkillInventory()` — retained compatibility hook for mode switch
 *     and after any skill mutation that arrives from outside this module.
 *
 * Each preparation loads fresh inventory. A caller-provided run object shares
 * accepted versions among workers; WeakMap entries expire with that run.
 */

const skillsApi = Atria.getContext().skills;

const runPins = new WeakMap();
function pinsForRun(run) {
    if (!run) return new Map();
    if (!runPins.has(run)) runPins.set(run, new Map());
    return runPins.get(run);
}

/**
 * Normalize the `skills` field on a mode profile or per-agent config in place.
 *
 * Mode-level (default): inserts `{ visible: ['*'], deny: [] }` when absent.
 * Agent-level (`opts.isAgent === true`): leaves `obj.skills` undefined when
 * absent so the resolver knows to fall back to the mode default; only
 * canonicalizes the shape if the caller already provided a partial object.
 *
 * The mode/agent distinction matters because the `+` inheritance semantics
 * are anchored on the mode profile — overwriting an undefined agent field
 * with the mode default would erase the "inherit" signal.
 *
 * @param {object} obj
 * @param {{ isAgent?: boolean }} [opts]
 */
export function ensureSkillsFieldShape(obj, { isAgent = false } = {}) {
    if (!obj || typeof obj !== 'object') return;
    if (isAgent) {
        if (obj.skills && typeof obj.skills === 'object') {
            if (!Array.isArray(obj.skills.visible)) obj.skills.visible = [];
            if (!Array.isArray(obj.skills.deny)) obj.skills.deny = [];
        }
        return;
    }
    if (!obj.skills || typeof obj.skills !== 'object') {
        obj.skills = { visible: ['*'], deny: [] };
        return;
    }
    if (!Array.isArray(obj.skills.visible)) obj.skills.visible = ['*'];
    if (!Array.isArray(obj.skills.deny)) obj.skills.deny = [];
}

/**
 * Resolve the list of skills visible to an agent.
 *
 * Pipeline:
 *   1. Load the fresh full inventory via `skillsApi.list({ scope: 'all' })`.
 *      Network/transport failure collapses to an empty inventory so the
 *      orchestrator never fails closed for a transient REST error — the agent
 *      sees no skills, not a crash.
 *   2. Merge the four scope layers (global → oai-preset → orch-preset →
 *      character) using a Map keyed by skill name. Character-scope wins
 *      by virtue of arriving last in the merge order. orch-preset overrides
 *      oai-preset because orchestration-run-specific bindings are more
 *      specialized than generic chat-completion-preset-wide bindings.
 *   3. Compute effective visible/deny by combining mode and agent lists.
 *      Agent visible starting with `'+'` means "inherit mode default and
 *      append the rest"; otherwise the agent list replaces the mode default
 *      entirely. Deny lists always union (agent deny adds to mode deny).
 *   4. Filter the merged inventory by visible (wildcard `*` matches all)
 *      and deny.
 *
 * @param {object} args
 * @param {object} args.modeProfile - orchestrator mode profile (director, loop, etc.)
 * @param {object|null} args.agentConfig - per-agent config or null for mode-only
 * @param {object} args.runtimeContext - { presetName, characterFile, orchPreset }
 * @returns {Promise<Array>} visible skills (SkillIndexEntry shape)
 */
export async function resolveAgentVisibleSkills({ modeProfile, agentConfig, runtimeContext, run }) {
    if (nativeSessionRuntime.active) {
        const snapshot = nativeSessionRuntime.snapshot;
        return resolveNativeAgentVisibleSkills({ modeProfile, agentConfig, run, nativeContext: {
            packageId: snapshot.session.packageId, packageVersionId: snapshot.session.packageVersionId,
            skillIds: snapshot.manifest.skills?.map(item => typeof item === 'string' ? item : item.skillId ?? item.id),
        } });
    }
    let inventory;
    try {
        inventory = await skillsApi.list({ scope: 'all' });
    } catch (e) {
        console.warn('[skill-resolution] failed to load skill inventory:', e?.message || e);
        inventory = [];
    }
    const inventoryRaw = Array.isArray(inventory) ? inventory : [];

    ensureSkillsFieldShape(modeProfile);
    const entries = await loadAlwaysSkills(await pinSkillEntries(resolveSkillInvocation(inventoryRaw, {
        context: runtimeContext, legacy: true, path: 'agents', modeProfile, agentConfig,
        settings: await skillsApi.invocationSettings?.(),
    }), opts => skillsApi.pin(opts), pinsForRun(run)), opts => skillsApi.readFile(opts));
    const runId = typeof run === 'string' ? run : run?.runId || run?.__atriRunId;
    if (runId) for (const entry of entries.filter(e => e.invocationMode === 'always')) boundEvidenceCapture(runId)?.append({ type: 'version.consumed', eventId: runId + '/skill/' + entry.version, runId,
        targetKind: 'skill', versionId: entry.version, skillName: entry.name, skillScopeKind: entry.scope.kind, characterFile: entry.scope.characterFile });
    return entries;
}


/**
 * Resolve skills for Native Build/Play identities without reusing Character
 * scope as authoring identity. The legacy orchestrator resolver above remains
 * available to legacy chat surfaces; Native callers use only
 * global -> project -> exact package precedence.
 *
 * @param {object} args
 * @param {object} args.modeProfile
 * @param {object|null} args.agentConfig
 * @param {{projectId?:string, packageId?:string, packageVersionId?:string, skillIds?:string[]}} args.nativeContext
 * @returns {Promise<Array>}
 */
export async function resolveNativeAgentVisibleSkills({ modeProfile, agentConfig, nativeContext = {}, run }) {
    let inventory;
    try {
        inventory = await skillsApi.list({ scope: 'all' });
    } catch (e) {
        console.warn('[skill-resolution] failed to load Native skill inventory:', e?.message || e);
        inventory = [];
    }
    const raw = Array.isArray(inventory) ? inventory : [];
    ensureSkillsFieldShape(modeProfile);
    return loadAlwaysSkills(await pinSkillEntries(resolveSkillInvocation(raw, {
        context: nativeContext, path: 'agents', modeProfile, agentConfig,
        settings: await skillsApi.invocationSettings?.(),
    }), opts => skillsApi.pin(opts), pinsForRun(run)), opts => skillsApi.readFile(opts));
}

/**
 * Build the `<available_skills>` system-message block appended to an
 * agent's task messages.
 *
 * Empty / null input collapses to an empty string so callers can do
 * `systemPrompt + (block ? '\n\n' + block : '')` without conditional guards.
 *
 * @param {Array} visibleSkills
 * @returns {string}
 */
export function buildAvailableSkillsBlock(visibleSkills) {
    if (!Array.isArray(visibleSkills) || visibleSkills.length === 0) return '';
    const lines = visibleSkills
        .filter(s => s && typeof s.name === 'string')
        .map(s => `- ${s.name}: ${String(s.description || '')}`)
        .join('\n');
    if (!lines) return '';
    return [
        '<available_skills>',
        lines,
        '</available_skills>',
        skillInstructions(visibleSkills),
        '',
        '(Use skill_read to consult specific content; skill_search to grep within a skill.)',
    ].join('\n');
}

/**
 * Compatibility hook for callers that used inventory caching. Fresh preparation
 * now observes changes directly; invalidation never changes an accepted run pin.
 */
export function invalidateSkillInventory() {
    // Each preparation reads fresh inventory; accepted per-run pins live in a WeakMap.
}

/**
 * Build a `runtimeContext` bag from a SillyTavern context + agent profile.
 *
 * The resolver uses three fields:
 *   - `presetName`  — the chat-completion preset name (e.g. 'rp4'); matched
 *     against `e.scope.name` for preset-scope skills
 *   - `characterFile` — the active character's avatar filename (e.g. 'alice.png')
 *   - `orchPreset`  — active orchestration preset `{mode, name}`; matched
 *     against `e.scope.mode` + `e.scope.name` for orch-preset-scope skills
 *
 * Each is optional; missing values just skip the corresponding scope layer.
 * Callers that want only the character context (no preset routing) can pass
 * a `null` agentProfile. `orchPreset` is only set when the caller supplies
 * a `{mode, name}` pair with non-empty strings on both fields — the four
 * mode-runtime dispatchers (spec / agenda / loop / director) supply this
 * so orch-preset-bound skills merge into the run.
 *
 * @param {object|null} sillyTavernContext - typically `getContext()`
 * @param {object|null} agentProfile - agent config with `promptPresetName`
 * @param {{mode:string, name:string}|null} [orchPreset] - active orchestration
 *   preset scope, if any.
 * @returns {{ presetName?: string, characterFile?: string, orchPreset?: {mode:string, name:string} }}
 */
export function buildSkillRuntimeContext(sillyTavernContext, agentProfile = null, orchPreset = null) {
    const ctx = {};
    // Character: read avatar filename from the live characters array if available.
    // `characterId` is the index; `characters[characterId].avatar` is the filename
    // we expose as skill scope id. Defensive fallback for partial contexts.
    try {
        const cid = sillyTavernContext?.characterId;
        if (cid !== undefined && cid !== null && Array.isArray(sillyTavernContext?.characters)) {
            const avatar = sillyTavernContext.characters[cid]?.avatar;
            if (typeof avatar === 'string' && avatar.length > 0) {
                ctx.characterFile = avatar;
            }
        }
    } catch (_) { /* tolerate sparse context shapes */ }

    // Preset: the agent's per-agent routing override is the source of truth
    // when set; otherwise the orchestrator's global LLM-node preset names
    // apply (carried in `sillyTavernContext` indirectly via settings).
    // Callers handle the fallback chain themselves; here we just lift what
    // the agent profile explicitly declares.
    //
    // The skill-scope `preset` shape is `{kind:'preset', name}` — the
    // connection profile is intentionally NOT part of the key, so a
    // preset-scope skill travels with the preset regardless of which
    // connection profile happens to be routing the request.
    if (agentProfile && typeof agentProfile === 'object') {
        const promptPresetName = String(agentProfile.promptPresetName || '').trim();
        if (promptPresetName) ctx.presetName = promptPresetName;
    }

    // Orch-preset: only lift when the caller supplies a well-formed
    // `{mode, name}` pair. Malformed / partial input silently omits the
    // field so callers can pass `null` / `{}` / stale editor drafts
    // without accidentally activating orch-preset scope filtering with
    // an empty name (which would collide with any orch-preset skill
    // that also has an empty name).
    if (orchPreset && typeof orchPreset === 'object'
        && typeof orchPreset.mode === 'string' && orchPreset.mode.length > 0
        && typeof orchPreset.name === 'string' && orchPreset.name.length > 0) {
        ctx.orchPreset = { mode: orchPreset.mode, name: orchPreset.name };
    }

    return ctx;
}

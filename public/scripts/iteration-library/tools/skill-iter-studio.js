// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups

/**
 * Shared Skill inventory and authoring tools for iteration hosts.
 * Reads use the existing Skills API; writes produce proposals committed
 * only when the user applies them. Scope and filesystem validation remain
 * enforced by the original Skill service.
 */

import { STATE_ERROR_REASONS } from '../../state-errors.js';

/**
 * Structured error thrown by skill iter-studio handlers and the
 * apply-time commit helper. Carries a `reason` from `STATE_ERROR_REASONS`
 * plus a short `hint` (capped at 120 chars) so callers can route the
 * failure to the right UI affordance (arg fixer vs target-missing vs
 * malformed commit) without parsing the message.
 */
export class SkillProposalError extends Error {
    constructor({ reason, hint }) {
        super(`[skill] ${reason}: ${hint}`);
        this.name = 'SkillProposalError';
        this.reason = reason;
        this.hint = String(hint || '').slice(0, 120);
    }
}

// iteration-library convention (mirrors lorebook-reads / lorebook-writes
// and the rest of iter-lib): never capture Atria.getContext() at
// module load — the context may not be ready when the module first
// evaluates, and resolving lazily lets tests stub the surface per-call.
// The two helpers below resolve fresh each time; downstream callers
// invoke them directly (cheap — getContext() returns a stable singleton).
function getSkillsApi() {
    return Atria.getContext().skills;
}
function getYaml() {
    return Atria.getContext().lib.yaml;
}

// ────────────────────────────────────────────────────────────────────────────
// Tool names (kept in a frozen set so isSkillIterStudioTool is a fast lookup
// and there's a single source of truth for tests + studio.js to import).
// ────────────────────────────────────────────────────────────────────────────
export const SKILL_ITER_STUDIO_TOOL_NAMES = Object.freeze([
    // Inventory (3)

    'skill_inspect',
    'skill_read_content',
    'skill_search_content',
    // Authoring (7)
    'skill_create',
    'skill_update_content',
    'skill_edit_content',
    'skill_update_frontmatter',
    'skill_rename',
    'skill_change_scope',
    'skill_delete',

    // Text extraction (1)
    'skill_extract_from_text',

]);

const SKILL_ITER_STUDIO_TOOL_NAME_SET = new Set(SKILL_ITER_STUDIO_TOOL_NAMES);

/**
 * Predicate matching any tool name dispatched by this module. studio.js
 * uses this to route calls into the inline-executed branch alongside
 * lorebook reads/writes + simulate. Names that don't match fall through
 * to the sandbox-diff edit-tool path.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isSkillIterStudioTool(name) {
    return SKILL_ITER_STUDIO_TOOL_NAME_SET.has(String(name || ''));
}

// ────────────────────────────────────────────────────────────────────────────
// Scope helpers. Tools accept either a structured scope object (preferred —
// matches the REST API shape) or the literal string 'global'. Tests
// frequently pass the string form for brevity, so normalize once at the top
// of each handler.
//
// When `args.scope` is omitted, `defaultScope` (supplied by the calling
// iter-studio via `mutationCtx.defaultScope`) is used. Callers can select
// a specific supported scope explicitly.
// ────────────────────────────────────────────────────────────────────────────

function normalizeScope(scope, defaultScope = null) {
    if (!scope) {
        if (defaultScope) return normalizeScope(defaultScope);
        return { kind: 'global' };
    }
    if (scope === 'global' || scope === 'all') return { kind: 'global' };
    if (scope.kind === 'global') return { kind: 'global' };
    if (scope.kind === 'preset' && scope.name) {
        return { kind: 'preset', name: String(scope.name) };
    }
    if (scope.kind === 'project' && scope.projectId) return { kind: 'project', projectId: String(scope.projectId) };
    if (scope.kind === 'package' && scope.packageId && scope.packageVersionId) {
        return { kind: 'package', packageId: String(scope.packageId), packageVersionId: String(scope.packageVersionId) };
    }
    if (scope.kind === 'character' && scope.characterFile) {
        return { kind: 'character', characterFile: String(scope.characterFile) };
    }
    throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: `invalid scope: ${JSON.stringify(scope)}` });
}

// ────────────────────────────────────────────────────────────────────────────
// Frontmatter merge for skill_update_frontmatter. Reads SKILL.md, parses the
// YAML header, merges the patch, serializes back. Null values in patch delete
// keys; everything else assigns. Body (after the frontmatter `---`) is
// preserved verbatim.
// ────────────────────────────────────────────────────────────────────────────

function splitFrontmatter(content) {
    const text = String(content || '').replace(/\r\n/g, '\n');
    if (!text.startsWith('---\n')) {
        throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_COMMIT, hint: 'SKILL.md missing opening YAML frontmatter (---)' });
    }
    const rest = text.slice(4);
    const closeIdx = rest.indexOf('\n---');
    if (closeIdx === -1) {
        throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_COMMIT, hint: 'SKILL.md frontmatter is not closed (---)' });
    }
    const yamlBlock = rest.slice(0, closeIdx);
    // Body starts after `\n---` (the closing marker), skipping the trailing
    // newline that always follows it in well-formed SKILL.md.
    const afterClose = rest.slice(closeIdx + 4);
    const body = afterClose.startsWith('\n') ? afterClose.slice(1) : afterClose;
    return { yamlBlock, body };
}

function mergeFrontmatterPatch(currentObj, patch) {
    const merged = { ...(currentObj && typeof currentObj === 'object' ? currentObj : {}) };
    if (!patch || typeof patch !== 'object') return merged;
    for (const [k, v] of Object.entries(patch)) {
        if (v === null) {
            delete merged[k];
        } else {
            merged[k] = v;
        }
    }
    return merged;
}

/**
 * Apply a patch to the frontmatter of a SKILL.md string. Exported for unit
 * testing — the live skill_update_frontmatter handler is a thin wrapper that
 * reads the file, calls this helper, and writes it back.
 *
 * @param {string} content - raw SKILL.md content
 * @param {object} patch - keys to assign or delete (null = delete)
 * @returns {string} merged SKILL.md content
 */
export function applyFrontmatterPatch(content, patch) {
    const yaml = getYaml();
    const { yamlBlock, body } = splitFrontmatter(content);
    const parsed = yaml.parse(yamlBlock) || {};
    const merged = mergeFrontmatterPatch(parsed, patch);
    const newYaml = yaml.stringify(merged).replace(/\n$/, '');
    return `---\n${newYaml}\n---\n${body}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Authoring proposal helpers. The 7 authoring tools + `skill_extract_from_text`
// (which composes `skill_create`) capture an op + before/after as a
// `pendingSkillEdit` and return a slim ack to the LLM. studio.js parks the
// blob on state.pendingSkillEdits and renders per-card approve/reject. At
// Apply time, studio.js calls `commitApprovedSkillProposal(op)` per approved
// entry — that function replays the original op against current on-disk
// state through skillsApi so parallel-session drift surfaces as a fresh
// validation error instead of clobbering with a stale snapshot. Mirrors how
// lorebook proposals re-derive at commit time.
// ────────────────────────────────────────────────────────────────────────────

function composeSkillMd(name, description, body) {
    const safeBody = String(body || '');
    return `---\nname: ${name}\ndescription: ${description}\n---\n${safeBody.startsWith('\n') ? safeBody : `\n${safeBody}`}`;
}

async function readFileSafe(scope, name, path) {
    const skillsApi = getSkillsApi();
    try {
        const raw = await skillsApi.readFile({ scope, name, path });
        if (typeof raw === 'string') return raw;
        if (raw && typeof raw.content === 'string') return raw.content;
        return null;
    } catch (err) {
        // Treat any read failure (typically a 404 for newly-created files)
        // as "not present" so callers can decide whether that's a soft
        // "before is empty" (frontmatter patch on a missing file is an
        // error; edit_content on a missing file is an error; create with
        // a name that already exists shouldn't end up here). Match
        // ENOENT and status:404 too — the skills repo wraps Node's
        // ENOENT in its message and the API attaches a structured
        // status, so the bare /404|not found/ regex misses the common
        // server-side shape and any caller would throw a spurious error.
        if (err && typeof err === 'object' && Number(err.status) === 404) return null;
        if (String(err?.message || err).match(/404|not found|ENOENT/i)) return null;
        throw err;
    }
}

function proposalReturn({ kind, skillName, scope, path, before, after, op, extras }) {
    return {
        result: buildProposalAck({ kind, skillName, scope, path, op }),
        pendingSkillEdit: {
            kind,
            skillName,
            scope,
            path,
            before,
            after,
            op,
            ...(extras && typeof extras === 'object' ? { extras } : {}),
        },
    };
}

function buildProposalAck({ kind, skillName, scope, path, op }) {
    return {
        ok: true,
        proposed: true,
        kind,
        skill: skillName,
        scope,
        ...(path ? { path } : {}),
        tool: op?.name,
        message: 'Proposed for user approval. The change is NOT live yet — the user reviews this diff card and approves or rejects it; nothing reaches disk until the user clicks Apply. The iter-studio will PAUSE the auto-continue loop the moment any write proposal (profile edit, lorebook, skill) is staged: the next round will not fire until the user has fully resolved every pending card via Apply. You will then receive a synthetic user message describing exactly which proposals committed, which were rejected, and which surfaced commit errors. Continue planning subsequent work in your reasoning, but do not stack additional unrelated write proposals in this same round expecting them to commit alongside this one — the user reviews each card independently and the loop only resumes after the batch is settled.',
    };
}

/**
 * Commit a single approved skill proposal at Apply time. studio.js walks
 * the approved entries in order and calls this per entry. The op shape is
 * the one the handler captured at proposal time. Each branch replays the
 * tool args against current on-disk state via skillsApi, so a parallel
 * session that edited the same file between proposal and apply surfaces
 * as a fresh validation error (writeFile expectedSha256 / editFile
 * substring-missing) instead of clobbering with a stale after-image.
 *
 * Throws on failure so the caller can halt the walk and leave the
 * remaining approved entries pending.
 */
export async function commitApprovedSkillProposal(op) {
    if (!op || typeof op !== 'object' || !op.name) {
        throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'commitApprovedSkillProposal: invalid op' });
    }
    const skillsApi = getSkillsApi();
    const args = op.args && typeof op.args === 'object' ? op.args : {};
    switch (op.name) {
        case 'skill_create': {
            const files = [{
                path: 'SKILL.md',
                encoding: 'utf8',
                content: composeSkillMd(String(args.name), String(args.description), String(args.body || '')),
            }];
            if (Array.isArray(args.files)) {
                for (const f of args.files) {
                    if (!f || typeof f !== 'object') continue;
                    if (!f.path || f.path === 'SKILL.md') continue;
                    files.push({
                        path: String(f.path),
                        encoding: f.encoding === 'base64' ? 'base64' : 'utf8',
                        content: String(f.content || ''),
                    });
                }
            }
            return skillsApi.install({ scope: args.scope, payload: { files } });
        }
        case 'skill_update_content':
            return skillsApi.writeFile({
                scope: args.scope,
                name: args.name,
                path: args.path,
                content: args.content,
                expectedSha256: args.expectedSha256,
            });
        case 'skill_edit_content':
            return skillsApi.editFile({
                scope: args.scope,
                name: args.name,
                path: args.path,
                oldString: args.oldString,
                newString: args.newString,
                replaceAll: Boolean(args.replaceAll),
            });
        case 'skill_update_frontmatter': {
            // Re-derive after-image against current on-disk SKILL.md so a
            // parallel-session edit lands cleanly. If the file vanished
            // between proposal and apply, surface that as the error.
            const current = await readFileSafe(args.scope, args.name, 'SKILL.md');
            if (current === null) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.CONFLICT, hint: `SKILL.md not found at apply time: ${args.name}` });
            const newContent = applyFrontmatterPatch(current, args.patch);
            return skillsApi.writeFile({
                scope: args.scope,
                name: args.name,
                path: 'SKILL.md',
                content: newContent,
            });
        }
        case 'skill_rename':
            return skillsApi.rename(args.scope, args.fromName, args.toName);
        case 'skill_change_scope':
            return skillsApi.moveScope(args.name, args.fromScope, args.toScope);
        case 'skill_delete':
            return skillsApi.delete(args.scope, args.name);
        default:
            throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: `commitApprovedSkillProposal: unknown op ${op.name}` });
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Tool defs. OpenAI-shape; spliced into the iter-studio catalog by studio.js
// alongside CONTROL_TOOL_DEFS. Names match SKILL_ITER_STUDIO_TOOL_NAMES.
// ────────────────────────────────────────────────────────────────────────────

const SCOPE_SCHEMA = {
    type: 'object',
    description: 'Skill scope. Global is shared; project binds to a project; package identifies read-only originals; preset and character are compatibility scopes. When omitted, the host default scope is used.',
    properties: {
        kind: { type: 'string', enum: ['global', 'project', 'package', 'preset', 'character'] },
        name: { type: 'string' },
        projectId: { type: 'string' },
        packageId: { type: 'string' },
        packageVersionId: { type: 'string' },
        characterFile: { type: 'string' },
    },
    required: ['kind'],
};

function fn(name, description, parameters) {
    return {
        type: 'function',
        function: { name, description, parameters },
    };
}

export const SKILL_ITER_STUDIO_TOOL_DEFS = Object.freeze([
    // ── Inventory inspection ────────────────────────────────────────────

    fn(
        'skill_inspect',
        'Inspect a single skill: returns frontmatter, file tree (path + size + binary flag), and total size in bytes. Does NOT return file bodies — use skill_read_content for that.',
        {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Skill name.' },
                scope: SCOPE_SCHEMA,
            },
            required: ['name'],
        },
    ),
    fn(
        'skill_read_content',
        'Read a file inside a skill. Defaults to SKILL.md when path is omitted. Supports offset/limit (1-based line numbers) for large files.',
        {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Skill name.' },
                scope: SCOPE_SCHEMA,
                path: { type: 'string', description: 'File path within the skill (defaults to SKILL.md).' },
                offset: { type: 'integer', description: '1-based starting line number.' },
                limit: { type: 'integer', description: 'Number of lines to read.' },
            },
            required: ['name'],
        },
    ),
    fn(
        'skill_search_content',
        'Search for a substring inside a skill\'s files. Case-insensitive; returns matching snippets with file path + line ref.',
        {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Skill name.' },
                scope: SCOPE_SCHEMA,
                query: { type: 'string', description: 'Substring to search.' },
            },
            required: ['name', 'query'],
        },
    ),

    // ── Authoring ────────────────────────────────────────────────────────
    fn(
        'skill_create',
        'PROPOSAL: stage creation of a brand-new skill from a description and an initial SKILL.md body. Optional `files` array stages additional non-SKILL.md files (each {path, encoding:\'utf8\'|\'base64\', content}). The skill is NOT written to disk by this call — the user reviews a proposal card and the create commits at Apply time. You will receive `"proposed": true` as the success contract.',
        {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'New skill name (must match [a-z0-9_-]+).' },
                scope: SCOPE_SCHEMA,
                description: { type: 'string', description: 'One-line description used in the skill catalog (becomes frontmatter description).' },
                body: { type: 'string', description: 'Markdown body for SKILL.md (after the frontmatter block). Will be wrapped with --- name/description --- frontmatter automatically.' },
                files: {
                    type: 'array',
                    description: 'Optional additional files. Each {path, encoding, content}.',
                    items: { type: 'object' },
                },
            },
            required: ['name', 'description', 'body'],
        },
    ),
    fn(
        'skill_update_content',
        'PROPOSAL: stage a full-file replacement of a file inside an existing skill. The change is NOT written to disk by this call — the user reviews a line-by-line diff card and the write commits at Apply time. Pair with expectedSha256 (optional) for optimistic concurrency at commit time. You will receive `"proposed": true` as the success contract.',
        {
            type: 'object',
            properties: {
                name: { type: 'string' },
                scope: SCOPE_SCHEMA,
                path: { type: 'string', description: 'File path within the skill (e.g. SKILL.md, examples/foo.md).' },
                content: { type: 'string', description: 'Full new file content.' },
                expectedSha256: { type: 'string', description: 'Optional sha256 of the pre-edit file content for optimistic concurrency.' },
            },
            required: ['name', 'path', 'content'],
        },
    ),
    fn(
        'skill_edit_content',
        'PROPOSAL: stage a find-and-replace inside a single file. Default replaces the FIRST occurrence; set replaceAll=true for all. The substring must appear at least once or the proposal fails. The change is NOT written to disk by this call — the user reviews a line-by-line diff card and the write commits at Apply time. You will receive `"proposed": true` as the success contract.',
        {
            type: 'object',
            properties: {
                name: { type: 'string' },
                scope: SCOPE_SCHEMA,
                path: { type: 'string' },
                oldString: { type: 'string', description: 'Substring to find (must appear at least once).' },
                newString: { type: 'string', description: 'Replacement.' },
                replaceAll: { type: 'boolean', description: 'Replace every occurrence (default false).' },
            },
            required: ['name', 'path', 'oldString', 'newString'],
        },
    ),
    fn(
        'skill_update_frontmatter',
        'PROPOSAL: stage a frontmatter patch on SKILL.md without touching the body. Patch keys with non-null values are assigned; null values delete the key. The change is NOT written to disk by this call — the user reviews a line-by-line diff card and the write commits at Apply time. You will receive `"proposed": true` as the success contract.',
        {
            type: 'object',
            properties: {
                name: { type: 'string' },
                scope: SCOPE_SCHEMA,
                patch: { type: 'object', description: 'Frontmatter field patch. e.g. {description: "new description", tags: ["a","b"]}. null value deletes the key.' },
            },
            required: ['name', 'patch'],
        },
    ),
    fn(
        'skill_rename',
        'PROPOSAL: stage a rename of a skill within its current scope. The new name must match [a-z0-9_-]+ and not collide with an existing skill in that scope. The rename is NOT applied to disk by this call — the user reviews a proposal card and it commits at Apply time. You will receive `"proposed": true` as the success contract.',
        {
            type: 'object',
            properties: {
                scope: SCOPE_SCHEMA,
                fromName: { type: 'string' },
                toName: { type: 'string' },
            },
            required: ['fromName', 'toName'],
        },
    ),
    fn(
        'skill_change_scope',
        'PROPOSAL: stage a scope move (e.g. global → character). The skill keeps its name. The move is NOT applied to disk by this call — the user reviews a proposal card and it commits at Apply time. You will receive `"proposed": true` as the success contract.',
        {
            type: 'object',
            properties: {
                name: { type: 'string' },
                fromScope: SCOPE_SCHEMA,
                toScope: SCOPE_SCHEMA,
            },
            required: ['name', 'fromScope', 'toScope'],
        },
    ),
    fn(
        'skill_delete',
        'PROPOSAL: stage permanent deletion of a skill (all files). Cannot be undone once the user approves AND clicks Apply. The deletion is NOT applied to disk by this call — the user reviews a proposal card and it commits at Apply time. You will receive `"proposed": true` as the success contract.',
        {
            type: 'object',
            properties: {
                name: { type: 'string' },
                scope: SCOPE_SCHEMA,
            },
            required: ['name'],
        },
    ),

    // ── Migration helpers ────────────────────────────────────────────────
    fn(
        'skill_extract_from_text',
        'PROPOSAL: create a new skill from a verbatim text block (selected by the authoring host). The skill\'s SKILL.md body is the supplied text exactly — DO NOT paraphrase, compress, or reword. The skill is NOT written to disk by this call — the user reviews a proposal card and the create commits at Apply time. You will receive `"proposed": true` as the success contract.',
        {
            type: 'object',
            properties: {
                sourceText: { type: 'string', description: 'Verbatim text content to extract into the skill body.' },
                suggestedName: { type: 'string', description: 'Skill name (must match [a-z0-9_-]+).' },
                scope: SCOPE_SCHEMA,
                description: { type: 'string', description: 'One-line description for the skill frontmatter.' },
            },
            required: ['sourceText', 'suggestedName', 'description'],
        },
    ),

]);

// ────────────────────────────────────────────────────────────────────────────
// Dispatcher. studio.js calls runSkillIterStudioTool for any inline-executed
// call matching isSkillIterStudioTool. The mutationCtx bag supplies the
// default scope and proposal metadata. Return shape:
//
//   { ok: true, result: ... }
//   { ok: true, result: ..., pendingEdit: { op:'set', path:'', oldValue, newValue } }
//   { ok: false, error: '...' }
//
// Errors are returned (not thrown) so studio.js can present them as
// `status: 'fail'` tool results that the next LLM round sees.
// ────────────────────────────────────────────────────────────────────────────

const HANDLERS = {

    async skill_inspect(args, mctx) {
        if (!args?.name) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'name is required' });
        const skillsApi = getSkillsApi();
        const scope = normalizeScope(args.scope, mctx?.defaultScope);
        const [entry, fileTree] = await Promise.all([
            skillsApi.get(args.name, scope),
            skillsApi.listFiles({ scope, name: args.name }),
        ]);
        if (!entry) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_TARGET, hint: `skill not found: ${args.name}` });
        const files = Array.isArray(fileTree?.files) ? fileTree.files : [];
        const sizeBytes = files.reduce((acc, f) => acc + (Number(f?.size) || 0), 0);
        return {
            name: entry.name,
            scope: entry.scope,
            frontmatter: {
                name: entry.name,
                description: entry.description,
                ...(entry.metadata || {}),
            },
            fileTree: files,
            sizeBytes,
        };
    },

    async skill_read_content(args, mctx) {
        if (!args?.name) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'name is required' });
        return getSkillsApi().readFile({
            scope: normalizeScope(args.scope, mctx?.defaultScope),
            name: String(args.name),
            path: args.path,
            offset: args.offset,
            limit: args.limit,
        });
    },

    async skill_search_content(args, mctx) {
        if (!args?.name) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'name is required' });
        if (!args?.query) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'query is required' });
        return getSkillsApi().search({
            scope: normalizeScope(args.scope, mctx?.defaultScope),
            name: String(args.name),
            query: String(args.query),
        });
    },

    async skill_create(args, mctx) {
        if (!args?.name) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'name is required' });
        if (!args?.description) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'description is required' });
        if (typeof args?.body !== 'string') throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'body is required' });
        const name = String(args.name);
        const description = String(args.description);
        const body = String(args.body);
        const scope = normalizeScope(args.scope, mctx?.defaultScope);
        const skillMd = composeSkillMd(name, description, body);
        const files = [{ path: 'SKILL.md', encoding: 'utf8', content: skillMd }];
        if (Array.isArray(args.files)) {
            for (const f of args.files) {
                if (!f || typeof f !== 'object') continue;
                if (!f.path || f.path === 'SKILL.md') continue;
                files.push({
                    path: String(f.path),
                    encoding: f.encoding === 'base64' ? 'base64' : 'utf8',
                    content: String(f.content || ''),
                });
            }
        }
        const op = { name: 'skill_create', args: { name, description, body, scope, files: args.files } };
        return proposalReturn({
            kind: 'create',
            skillName: name,
            scope,
            path: 'SKILL.md',
            // For create, the diff card shows SKILL.md going from "no file"
            // to its full body so the user sees the new file's shape
            // verbatim — same renderer the content-edit tools use. `before`
            // is null (not the empty string) so the bus-handler's snapshot
            // wrap stays consistent with readCurrent, which reads SKILL.md
            // off disk at approve time: file-absent → null snapshot, fresh
            // approve matches; concurrent-create → snapshot { content: ... }
            // mismatches and surfaces as a true conflict.
            before: null,
            after: skillMd,
            extras: files.length > 1 ? { extraFiles: files.slice(1).map(f => f.path) } : null,
            op,
        });
    },

    async skill_update_content(args, mctx) {
        if (!args?.name) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'name is required' });
        if (!args?.path) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'path is required' });
        if (typeof args?.content !== 'string') throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'content is required' });
        const scope = normalizeScope(args.scope, mctx?.defaultScope);
        const name = String(args.name);
        const path = String(args.path);
        const before = await readFileSafe(scope, name, path);
        return proposalReturn({
            kind: 'content',
            skillName: name,
            scope,
            path,
            before,
            after: String(args.content),
            op: {
                name: 'skill_update_content',
                args: {
                    name,
                    scope,
                    path,
                    content: String(args.content),
                    expectedSha256: args.expectedSha256,
                },
            },
        });
    },

    async skill_edit_content(args, mctx) {
        if (!args?.name) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'name is required' });
        if (!args?.path) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'path is required' });
        if (typeof args?.oldString !== 'string' || args.oldString.length === 0) {
            throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'oldString is required (non-empty)' });
        }
        if (typeof args?.newString !== 'string') throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'newString is required' });
        const scope = normalizeScope(args.scope, mctx?.defaultScope);
        const name = String(args.name);
        const path = String(args.path);
        const replaceAll = Boolean(args.replaceAll);
        const before = await readFileSafe(scope, name, path);
        if (before === null) {
            throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_TARGET, hint: `file not found: ${name}/${path}` });
        }
        if (!before.includes(args.oldString)) {
            throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_TARGET, hint: 'oldString not found in file (substring must appear at least once)' });
        }
        const after = replaceAll
            ? before.split(args.oldString).join(args.newString)
            : before.replace(args.oldString, args.newString);
        return proposalReturn({
            kind: 'content',
            skillName: name,
            scope,
            path,
            before,
            after,
            op: {
                name: 'skill_edit_content',
                args: {
                    name,
                    scope,
                    path,
                    oldString: String(args.oldString),
                    newString: String(args.newString),
                    replaceAll,
                },
            },
        });
    },

    async skill_update_frontmatter(args, mctx) {
        if (!args?.name) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'name is required' });
        if (!args?.patch || typeof args.patch !== 'object') {
            throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'patch is required' });
        }
        const scope = normalizeScope(args.scope, mctx?.defaultScope);
        const name = String(args.name);
        const before = await readFileSafe(scope, name, 'SKILL.md');
        if (before === null) {
            throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_TARGET, hint: `SKILL.md not found: ${name}` });
        }
        const after = applyFrontmatterPatch(before, args.patch);
        return proposalReturn({
            kind: 'frontmatter',
            skillName: name,
            scope,
            path: 'SKILL.md',
            before,
            after,
            op: {
                name: 'skill_update_frontmatter',
                args: { name, scope, patch: args.patch },
            },
        });
    },

    async skill_rename(args, mctx) {
        if (!args?.fromName) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'fromName is required' });
        if (!args?.toName) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'toName is required' });
        const scope = normalizeScope(args.scope, mctx?.defaultScope);
        const fromName = String(args.fromName);
        const toName = String(args.toName);
        return proposalReturn({
            kind: 'rename',
            skillName: fromName,
            scope,
            // Structural ops (rename/scope/delete) have no body diff — the
            // renderer surfaces a compact metadata card instead. We still
            // pass identity strings as `before`/`after` so the same data
            // shape works for tests that snapshot the proposal.
            before: { name: fromName },
            after: { name: toName },
            op: { name: 'skill_rename', args: { scope, fromName, toName } },
        });
    },

    async skill_change_scope(args) {
        if (!args?.name) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'name is required' });
        if (!args?.fromScope) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'fromScope is required' });
        if (!args?.toScope) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'toScope is required' });
        const fromScope = normalizeScope(args.fromScope);
        const toScope = normalizeScope(args.toScope);
        const name = String(args.name);
        return proposalReturn({
            kind: 'change_scope',
            skillName: name,
            scope: fromScope,
            before: { scope: fromScope },
            after: { scope: toScope },
            op: { name: 'skill_change_scope', args: { name, fromScope, toScope } },
        });
    },

    async skill_delete(args, mctx) {
        if (!args?.name) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'name is required' });
        const scope = normalizeScope(args.scope, mctx?.defaultScope);
        const name = String(args.name);
        return proposalReturn({
            kind: 'delete',
            skillName: name,
            scope,
            before: { exists: true },
            after: { exists: false },
            op: { name: 'skill_delete', args: { name, scope } },
        });
    },

    // ── Migration helpers ───────────────────────────────────────────────
    async skill_extract_from_text(args, mctx) {
        if (typeof args?.sourceText !== 'string' || args.sourceText.length === 0) {
            throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'sourceText is required (non-empty)' });
        }
        if (!args?.suggestedName) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'suggestedName is required' });
        if (!args?.description) throw new SkillProposalError({ reason: STATE_ERROR_REASONS.VALIDATION_ARGS, hint: 'description is required' });
        // Compose through skill_create so the same proposal shape (+ commit
        // path) handles both extraction-driven creates and direct creates.
        return HANDLERS.skill_create({
            name: String(args.suggestedName),
            description: String(args.description),
            body: String(args.sourceText),
            scope: args.scope,
        }, mctx);
    },

};

/**
 * Dispatch a single inline-executed skill tool call.
 *
 * @param {{name: string, args: object}} call
 * @param {{
 *   defaultScope?: object,
 * }} mutationCtx
 * @returns {Promise<
 *   | {ok: true, result: *}
 *   | {ok: true, result: *, pendingEdit: {op:string, path:string, oldValue:*, newValue:*}}
 *   | {ok: true, result: *, pendingSkillEdit: {kind:string, skillName:string, scope:object, path?:string, before:*, after:*, op:{name:string, args:object}}}
 *   | {ok: false, error: string}
 * >}
 */
export async function runSkillIterStudioTool(call, mutationCtx = {}) {
    const name = String(call?.name || '');
    const handler = HANDLERS[name];
    if (!handler) {
        return { ok: false, error: `not a skill iter-studio tool: ${name}` };
    }
    const args = (call?.args && typeof call.args === 'object') ? call.args : {};
    try {
        const out = await handler(args, mutationCtx);
        if (out && typeof out === 'object' && 'pendingEdit' in out) {
            return { ok: true, result: out.result, pendingEdit: out.pendingEdit };
        }
        if (out && typeof out === 'object' && 'pendingSkillEdit' in out) {
            return { ok: true, result: out.result, pendingSkillEdit: out.pendingSkillEdit };
        }
        return { ok: true, result: out };
    } catch (err) {
        if (err instanceof SkillProposalError) {
            return { ok: false, reason: err.reason, hint: err.hint, error: err.message };
        }
        return { ok: false, error: String(err?.message || err || 'unknown error') };
    }
}

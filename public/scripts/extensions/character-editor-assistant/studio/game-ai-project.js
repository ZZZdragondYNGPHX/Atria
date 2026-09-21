/**
 * R6 Game Studio AI project-awareness and edit preflight.
 *
 * The AI Builder keeps its existing cross-file edits-lib approval flow. This
 * module adds a runtime-aware project map plus a fail-closed validation gate
 * over the virtual post-edit source tree.
 */

import {
    GAME_PROJECT_KIND,
    buildGameProjectNavigator,
} from './game-project-navigator.js';
import {
    getGamePackageDeclaredFiles,
    validateGameManifest,
} from '../../game-runtime/manifest.js';
import { validateWorldState } from '../../game-runtime/world/schema.js';
import { validateDeclarativeLogicSource } from './structured-logic-editors.js';
import { compileGameSelectorDefinitions } from '../../game-runtime/ui/declarative.js';
import { compileGameObservationDefinitions } from '../../game-runtime/llm/declarative-observations.js';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fileEntries(files) {
    return (Array.isArray(files) ? files : [])
        .filter(file => file?.type === 'file' && typeof file.path === 'string')
        .map(file => ({
            path: file.path,
            type: 'file',
            size: Number(file.size) || 0,
        }));
}

function flattenNodes(model) {
    return (model?.groups || []).flatMap(group => (
        (group.nodes || []).map(node => ({
            group: group.id,
            groupLabel: group.label,
            kind: node.kind,
            role: node.role,
            label: node.label,
            path: node.path,
            ...(node.section ? { section: node.section } : {}),
            ...(Number.isInteger(node.count) ? { count: node.count } : {}),
            exists: node.exists !== false,
            editable: node.editable !== false,
        }))
    ));
}

export async function inspectGameStudioProject(options = {}) {
    if (typeof options.readFile !== 'function') {
        throw new Error('Game Studio AI inspection requires readFile(path)');
    }
    const model = await buildGameProjectNavigator({
        files: fileEntries(options.files),
        readFile: options.readFile,
    });

    return Object.freeze({
        kind: model.kind,
        status: model.status,
        summary: clone(model.summary),
        manifest: clone(model.manifest),
        diagnostics: Object.freeze(clone(model.diagnostics || [])),
        nodes: Object.freeze(flattenNodes(model).map(Object.freeze)),
    });
}

function pathLine(project, role, fallback = 'not declared') {
    return project.nodes.find(node => node.role === role)?.path || fallback;
}

export function buildGameStudioAiSystemAppendix(project) {
    if (!project || project.kind !== GAME_PROJECT_KIND.GAME) return '';

    const diagnostics = project.diagnostics?.length
        ? project.diagnostics.map(item => '- ' + item.message).join('\n')
        : '- none';

    return [
        '',
        '# Atria Game Studio project contract',
        '',
        'This source project contains game.json and is an Atria Game Runtime project, not a legacy variable-driven CardApp.',
        '',
        'Authoritative source map:',
        '- package metadata: game.json',
        '- World Schema: ' + pathLine(project, 'world_schema'),
        '- Initial State: ' + pathLine(project, 'initial_state'),
        '- declarative Game Logic: ' + pathLine(project, 'game_logic'),
        '- UI Selectors: ' + pathLine(project, 'selectors'),
        '- Observation projectors: ' + pathLine(project, 'observations'),
        '- UI entry: ' + pathLine(project, 'ui'),
        '- Immersive definition: ' + pathLine(project, 'immersive'),
        '',
        'Current project diagnostics:',
        diagnostics,
        '',
        'Engineering rules for this project:',
        '1. Treat World State + Event Journal as the authoritative game state. Do not create a second state engine with chat variables, localStorage, IndexedDB, ad-hoc JSON state files, or UI-owned state for authoritative facts.',
        '2. Typed Commands create Event drafts; Reducers project Events into World State; Rules derive Events; safe Formula AST handles deterministic expressions and RNG.',
        '3. LLM output never writes World State directly. LLM-visible mechanics go through exposed typed Commands / deterministic interpretation mappings.',
        '4. UI is a projection over Selectors and dispatches/simulates typed Commands. Do not make UI components own authoritative mechanics.',
        '5. Observation projectors are read-only R5 projections. Memory and narrative layers consume committed/runtime facts; they are not alternate persistence.',
        '6. When a change spans contracts, edit all affected source files in the same tool round so the user receives one reviewable cross-file diff.',
        '7. Read the relevant source files before editing. Use game_project_inspect whenever the current project map or diagnostics may have changed.',
        '8. Keep source/runtime files as the single source of truth. Do not invent parallel Studio-only configuration.',
        '9. Do not replace the Game Runtime architecture with legacy CardApp ctx.setVariable / setvar-macro mechanics.',
        '10. File batches are validated against the live Game Runtime contracts before approval/commit. If validation fails, repair the same source contracts rather than bypassing the gate.',
        '',
    ].join('\n');
}

async function readJson(readFile, path, label) {
    let value;
    try {
        value = JSON.parse(String(await readFile(path)));
    } catch (error) {
        throw new Error(label + " '" + path + "' is not valid JSON: " + (error?.message || String(error)));
    }
    return value;
}

function requireObject(value, label) {
    if (!isPlainObject(value)) throw new Error(label + ' must be a JSON object');
}

export async function validateGameStudioProjectSource(options = {}) {
    const files = fileEntries(options.files);
    const readFile = options.readFile;
    if (typeof readFile !== 'function') {
        throw new Error('Game Studio project validation requires readFile(path)');
    }

    const fileSet = new Set(files.map(file => file.path));
    if (!fileSet.has('game.json')) {
        return Object.freeze({
            ok: true,
            kind: GAME_PROJECT_KIND.CARDAPP,
            diagnostics: Object.freeze([]),
        });
    }

    const rawManifest = await readJson(readFile, 'game.json', 'Game manifest');
    const validated = validateGameManifest(rawManifest);
    if (!validated.ok) {
        throw new Error('Game manifest validation failed: ' + validated.errors.slice(0, 12).join('; '));
    }
    const manifest = validated.manifest;

    for (const path of getGamePackageDeclaredFiles(manifest)) {
        if (!fileSet.has(path)) {
            throw new Error("Game manifest references missing source file '" + path + "'");
        }
    }

    if (manifest.world) {
        const schema = await readJson(readFile, manifest.world.schema, 'World Schema');
        const initialState = await readJson(readFile, manifest.world.initial, 'Initial State');
        requireObject(schema, 'World Schema');
        requireObject(initialState, 'Initial State');
        const worldValidation = validateWorldState(initialState, schema);
        if (!worldValidation.ok) {
            throw new Error(
                'Initial State does not satisfy World Schema: '
                + worldValidation.errors.slice(0, 12).join('; '),
            );
        }
    }

    if (manifest.logic) {
        if (!manifest.logic.entry.endsWith('.json')) {
            throw new Error(
                "Game Logic entry '" + manifest.logic.entry
                + "' must remain declarative JSON until the restricted JavaScript runtime exists",
            );
        }
        const logic = await readJson(readFile, manifest.logic.entry, 'Game Logic');
        requireObject(logic, 'Game Logic');
        validateDeclarativeLogicSource(logic);
    }

    if (manifest.ui?.selectors) {
        const selectors = await readJson(readFile, manifest.ui.selectors, 'Selectors');
        compileGameSelectorDefinitions(selectors);
    }

    if (manifest.llm?.observations) {
        const observations = await readJson(readFile, manifest.llm.observations, 'Observations');
        compileGameObservationDefinitions(observations);
    }

    return Object.freeze({
        ok: true,
        kind: GAME_PROJECT_KIND.GAME,
        manifest: clone(manifest),
        diagnostics: Object.freeze([]),
    });
}

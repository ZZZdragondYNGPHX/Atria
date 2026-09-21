/**
 * Runtime-aware source-project model for Atria Game Studio.
 *
 * The navigator is deliberately a view over the existing source files. It
 * never materializes a second configuration: logical nodes such as Commands,
 * Reducers, Rules and Interpretation Mappings point back to the same
 * declarative logic source file that the Game Runtime consumes.
 */

import {
    GAME_MANIFEST_PATH,
    validateGameManifest,
} from '../../game-runtime/manifest.js';

export const GAME_PROJECT_KIND = Object.freeze({
    CARDAPP: 'cardapp',
    GAME: 'game',
});

export const GAME_PROJECT_STATUS = Object.freeze({
    PLAIN: 'plain',
    READY: 'ready',
    INVALID: 'invalid',
});

const GROUP_DEFINITIONS = Object.freeze([
    Object.freeze({ id: 'package', label: 'Package' }),
    Object.freeze({ id: 'world', label: 'World' }),
    Object.freeze({ id: 'logic', label: 'Game Logic' }),
    Object.freeze({ id: 'presentation', label: 'Presentation' }),
    Object.freeze({ id: 'llm', label: 'LLM / Observation' }),
    Object.freeze({ id: 'knowledge', label: 'Knowledge / Skills' }),
    Object.freeze({ id: 'assets', label: 'Assets' }),
    Object.freeze({ id: 'source', label: 'Other Source' }),
]);

const LOGIC_SECTIONS = Object.freeze([
    Object.freeze({ key: 'commands', role: 'commands', label: 'Commands' }),
    Object.freeze({ key: 'reducers', role: 'reducers', label: 'Reducers / Events' }),
    Object.freeze({ key: 'rules', role: 'rules', label: 'Rules' }),
    Object.freeze({ key: 'interpretations', role: 'interpretations', label: 'Interpretation Mappings' }),
]);

const TEXT_EXTENSIONS = new Set([
    'css', 'csv', 'ejs', 'html', 'htm', 'js', 'jsx', 'json', 'md', 'markdown',
    'mjs', 'svg', 'ts', 'tsx', 'txt', 'xml', 'yaml', 'yml',
]);

function normalizeProjectFiles(files) {
    return (Array.isArray(files) ? files : [])
        .filter(file => file && file.type === 'file' && typeof file.path === 'string' && file.path.trim())
        .map(file => ({
            path: file.path.trim(),
            size: Number.isFinite(Number(file.size)) ? Number(file.size) : 0,
            type: 'file',
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
}

function fileExtension(filePath) {
    const name = String(filePath || '').split('/').at(-1) || '';
    const index = name.lastIndexOf('.');
    return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

export function isGameProjectTextFile(filePath) {
    return TEXT_EXTENSIONS.has(fileExtension(filePath));
}

function createGroupStore() {
    return new Map(GROUP_DEFINITIONS.map(group => [
        group.id,
        { ...group, nodes: [] },
    ]));
}

function addNode(groups, groupId, node) {
    groups.get(groupId)?.nodes.push(Object.freeze(node));
}

function finalizeGroups(groups) {
    return Object.freeze(GROUP_DEFINITIONS
        .map(definition => groups.get(definition.id))
        .filter(group => group.nodes.length > 0)
        .map(group => Object.freeze({
            ...group,
            nodes: Object.freeze([...group.nodes]),
        })));
}

function addActualFileNode(groups, groupId, file, role, label, consumed, extra = {}) {
    consumed.add(file.path);
    addNode(groups, groupId, {
        kind: 'file',
        role,
        label,
        path: file.path,
        size: file.size,
        exists: true,
        editable: isGameProjectTextFile(file.path),
        ...extra,
    });
}

function addDeclaredFileNode({
    groups,
    groupId,
    fileMap,
    consumed,
    diagnostics,
    path,
    role,
    label,
}) {
    if (!path) return null;
    consumed.add(path);
    const file = fileMap.get(path);
    const node = {
        kind: 'file',
        role,
        label,
        path,
        size: file?.size || 0,
        exists: Boolean(file),
        editable: Boolean(file) && isGameProjectTextFile(path),
    };
    addNode(groups, groupId, node);
    if (!file) {
        diagnostics.push(Object.freeze({
            code: 'missing_file',
            path,
            message: `${label} references missing source file '${path}'`,
        }));
    }
    return node;
}

async function readJson(path, readFile, diagnostics, label) {
    try {
        const text = await readFile(path);
        return JSON.parse(String(text));
    } catch (error) {
        diagnostics.push(Object.freeze({
            code: 'invalid_json',
            path,
            message: `${label} is not valid JSON: ${error?.message || String(error)}`,
        }));
        return null;
    }
}

function addUnclaimedFiles(groups, files, consumed) {
    for (const file of files) {
        if (consumed.has(file.path)) continue;
        const lower = file.path.toLowerCase();
        if (lower.startsWith('knowledge/') || lower.startsWith('skills/')) {
            addActualFileNode(
                groups,
                'knowledge',
                file,
                lower.startsWith('skills/') ? 'skill' : 'knowledge',
                file.path,
                consumed,
            );
            continue;
        }
        if (lower.startsWith('assets/') || !isGameProjectTextFile(file.path)) {
            addActualFileNode(groups, 'assets', file, 'asset', file.path, consumed);
            continue;
        }
        addActualFileNode(groups, 'source', file, 'source', file.path, consumed);
    }
}

function plainCardAppModel(files) {
    const groups = createGroupStore();
    const consumed = new Set();
    for (const file of files) {
        addActualFileNode(groups, 'source', file, 'source', file.path, consumed);
    }
    return Object.freeze({
        kind: GAME_PROJECT_KIND.CARDAPP,
        status: GAME_PROJECT_STATUS.PLAIN,
        manifest: null,
        summary: Object.freeze({ name: '', version: '' }),
        diagnostics: Object.freeze([]),
        groups: finalizeGroups(groups),
    });
}

/**
 * Build the Studio's runtime-aware project navigator from live source files.
 *
 * @param {{files?:Array, readFile:(path:string)=>Promise<string>}} options
 * @returns {Promise<object>}
 */
export async function buildGameProjectNavigator(options = {}) {
    const files = normalizeProjectFiles(options.files);
    const readFile = options.readFile;
    if (typeof readFile !== 'function') {
        throw new Error('Game Project Navigator requires readFile(path)');
    }

    const fileMap = new Map(files.map(file => [file.path, file]));
    if (!fileMap.has(GAME_MANIFEST_PATH)) {
        return plainCardAppModel(files);
    }

    const groups = createGroupStore();
    const consumed = new Set();
    const diagnostics = [];
    const manifestFile = fileMap.get(GAME_MANIFEST_PATH);
    addActualFileNode(
        groups,
        'package',
        manifestFile,
        'package_metadata',
        'Package Metadata',
        consumed,
    );

    const rawManifest = await readJson(
        GAME_MANIFEST_PATH,
        readFile,
        diagnostics,
        'game.json',
    );
    if (!rawManifest) {
        addUnclaimedFiles(groups, files, consumed);
        return Object.freeze({
            kind: GAME_PROJECT_KIND.GAME,
            status: GAME_PROJECT_STATUS.INVALID,
            manifest: null,
            summary: Object.freeze({ name: '', version: '' }),
            diagnostics: Object.freeze(diagnostics),
            groups: finalizeGroups(groups),
        });
    }

    const validated = validateGameManifest(rawManifest);
    if (!validated.ok) {
        diagnostics.push(...validated.errors.map(message => Object.freeze({
            code: 'invalid_manifest',
            path: GAME_MANIFEST_PATH,
            message,
        })));
        addUnclaimedFiles(groups, files, consumed);
        return Object.freeze({
            kind: GAME_PROJECT_KIND.GAME,
            status: GAME_PROJECT_STATUS.INVALID,
            manifest: null,
            summary: Object.freeze({
                name: typeof rawManifest.name === 'string' ? rawManifest.name : '',
                version: typeof rawManifest.version === 'string' ? rawManifest.version : '',
            }),
            diagnostics: Object.freeze(diagnostics),
            groups: finalizeGroups(groups),
        });
    }

    const manifest = validated.manifest;
    addDeclaredFileNode({
        groups,
        groupId: 'world',
        fileMap,
        consumed,
        diagnostics,
        path: manifest.world?.schema,
        role: 'world_schema',
        label: 'World Schema',
    });
    addDeclaredFileNode({
        groups,
        groupId: 'world',
        fileMap,
        consumed,
        diagnostics,
        path: manifest.world?.initial,
        role: 'initial_state',
        label: 'Initial State',
    });

    const logicNode = addDeclaredFileNode({
        groups,
        groupId: 'logic',
        fileMap,
        consumed,
        diagnostics,
        path: manifest.logic?.entry,
        role: 'game_logic',
        label: 'Game Logic',
    });
    if (logicNode?.exists && logicNode.path.toLowerCase().endsWith('.json')) {
        const rawLogic = await readJson(logicNode.path, readFile, diagnostics, 'Game Logic');
        if (rawLogic && typeof rawLogic === 'object' && !Array.isArray(rawLogic)) {
            for (const section of LOGIC_SECTIONS) {
                if (!Array.isArray(rawLogic[section.key])) continue;
                addNode(groups, 'logic', {
                    kind: 'section',
                    role: section.role,
                    label: section.label,
                    path: logicNode.path,
                    section: section.key,
                    count: rawLogic[section.key].length,
                    size: logicNode.size,
                    exists: true,
                    editable: true,
                });
            }
        }
    }

    addDeclaredFileNode({
        groups,
        groupId: 'presentation',
        fileMap,
        consumed,
        diagnostics,
        path: manifest.ui?.entry,
        role: 'ui',
        label: 'UI',
    });
    addDeclaredFileNode({
        groups,
        groupId: 'presentation',
        fileMap,
        consumed,
        diagnostics,
        path: manifest.ui?.selectors,
        role: 'selectors',
        label: 'Selectors',
    });
    addDeclaredFileNode({
        groups,
        groupId: 'presentation',
        fileMap,
        consumed,
        diagnostics,
        path: manifest.ui?.immersive,
        role: 'immersive',
        label: 'Immersive Presentation',
    });
    addDeclaredFileNode({
        groups,
        groupId: 'llm',
        fileMap,
        consumed,
        diagnostics,
        path: manifest.llm?.observations,
        role: 'observations',
        label: 'Observations',
    });

    addUnclaimedFiles(groups, files, consumed);

    return Object.freeze({
        kind: GAME_PROJECT_KIND.GAME,
        status: diagnostics.length > 0
            ? GAME_PROJECT_STATUS.INVALID
            : GAME_PROJECT_STATUS.READY,
        manifest: Object.freeze(manifest),
        summary: Object.freeze({
            name: manifest.name,
            version: manifest.version,
        }),
        diagnostics: Object.freeze(diagnostics),
        groups: finalizeGroups(groups),
    });
}

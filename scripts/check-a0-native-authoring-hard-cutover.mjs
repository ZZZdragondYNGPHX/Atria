import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const ROOT = process.cwd();
const read = path => readFileSync(resolve(ROOT, path), 'utf8');
const posix = path => path.split(sep).join('/');

function walk(path) {
    const absolute = resolve(ROOT, path);
    if (!existsSync(absolute)) return [];
    if (statSync(absolute).isFile()) return [path];
    const output = [];
    for (const name of readdirSync(absolute)) {
        const child = resolve(absolute, name);
        const rel = posix(relative(ROOT, child));
        if (statSync(child).isDirectory()) output.push(...walk(rel));
        else if (/\.(?:js|mjs)$/.test(name)) output.push(rel);
    }
    return output;
}

function rejectPattern(path, regex, message) {
    const source = read(path);
    if (regex.test(source)) throw new Error(`${message} (${path})`);
}

function requirePattern(path, regex, message) {
    const source = read(path);
    if (!regex.test(source)) throw new Error(`${message} (${path})`);
}

const futureAuthoringImplementation = [
    ...walk('src/native/studio'),
    ...walk('src/native/authoring'),
    ...walk('public/scripts/native/studio'),
    ...walk('public/scripts/native/authoring'),
    'src/native/project-store.js',
    'src/native/studio-preview.js',
    'src/native/project-source.js',
].filter((path, index, list) => list.indexOf(path) === index);

for (const path of futureAuthoringImplementation) {
    rejectPattern(
        path,
        /\/api\/card-app(?:\/|['"`])|\bCardApp\b|\bGAME_MANIFEST_PATH\b|(?:^|[^A-Za-z0-9_])game\.json(?:[^A-Za-z0-9_]|$)/im,
        'A0 Native authoring implementation must not restore CardApp/game.json authority',
    );
    rejectPattern(
        path,
        /\b(?:charId|characterId|charDir|charaFilename|selected_world_info|swipeId|swipe_id)\b/,
        'A0 Native authoring implementation must not restore Character/Swipe identity',
    );
    rejectPattern(
        path,
        /\b(?:getChatState|setChatState|deleteChatState|createFloorState)\b|\batri_game_world\b/,
        'A0 Native authoring implementation must not use Chat State/FloorState game authority',
    );
}

requirePattern(
    'src/native/authoring-contracts.js',
    /ATRIA_EXPERIENCE_MODES[\s\S]*text[\s\S]*component[\s\S]*hybrid[\s\S]*full/,
    'A0 Experience contract must explicitly freeze Text/Component/Hybrid/Full',
);
requirePattern(
    'src/native/authoring-contracts.js',
    /ATRIA_RESOURCE_GRAPH_MODE = ['"]derived-readonly['"]/,
    'A0 Resource Graph must remain derived-only',
);
requirePattern(
    'src/native/authoring-contracts.js',
    /assertAuthoringOperation[\s\S]*assertAuthoringWorkspace[\s\S]*assertAuthoringChangeSet/,
    'A0 shared human/AI Authoring Operation pipeline contract is missing',
);
requirePattern(
    'src/native/authoring-contracts.js',
    /ATRIA_PROJECT_CONFLICT_CODE = ['"]project_revision_conflict['"]/,
    'A0 optimistic project-revision conflict contract is missing',
);
requirePattern(
    'src/native/authoring-contracts.js',
    /ATRIA_RUNTIME_DESCRIPTOR_FORMAT = ['"]atria-native-runtime-descriptor['"]/,
    'A0 Native Runtime Descriptor contract is missing',
);
requirePattern(
    'src/native/authoring-contracts.js',
    /ATRIA_PACKAGE_RUNTIME_VERSION = 1[\s\S]*execution !== ['"]declarative['"][\s\S]*rejectExecutablePackagePayload/,
    'A0 package-runtime-v1 must reject arbitrary JavaScript execution',
);
requirePattern(
    'src/native/authoring-contracts.js',
    /ATRIA_NATIVE_SKILL_SCOPES[\s\S]*global[\s\S]*project[\s\S]*package/,
    'A0 Native Skill scopes must be global/project/package',
);
rejectPattern(
    'src/native/authoring-contracts.js',
    /scope === ['"]character['"]|['"]character['"]\s*,\s*['"]project['"]/,
    'A0 Native Skill scope must not restore Character identity',
);
requirePattern(
    'src/native/index.js',
    /from ['"]\.\/authoring-contracts\.js['"]/,
    'A0 authoring contracts must be exported from the Native boundary',
);

console.log(`A0 Native Authoring hard-cutover guard passed (${futureAuthoringImplementation.length} implementation files scanned).`);

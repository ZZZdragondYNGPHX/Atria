import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const ROOT = process.cwd();
const read = file => readFileSync(resolve(ROOT, file), 'utf8');
const posix = value => value.split(sep).join('/');

function walk(directory) {
    const absolute = resolve(ROOT, directory);
    if (!existsSync(absolute)) return [];
    const output = [];
    for (const name of readdirSync(absolute)) {
        const child = resolve(absolute, name);
        const path = posix(relative(ROOT, child));
        if (statSync(child).isDirectory()) output.push(...walk(path));
        else if (/\.(?:js|mjs)$/.test(name)) output.push(path);
    }
    return output;
}

function rejectPattern(file, regex, message) {
    const source = read(file);
    if (regex.test(source)) throw new Error(`${message} (${file})`);
}

function requirePattern(file, regex, message) {
    const source = read(file);
    if (!regex.test(source)) throw new Error(`${message} (${file})`);
}

const authoringBackend = [
    ...walk('src/native/authoring'),
    'src/endpoints/native-studio.js',
    'src/native/project-store.js',
].filter((file, index, list) => list.indexOf(file) === index);

for (const file of authoringBackend) {
    rejectPattern(
        file,
        /\/api\/card-app(?:\/|['"`])|\bCardApp\b|\bGAME_MANIFEST_PATH\b|(?:^|[^A-Za-z0-9_])game\.json(?:[^A-Za-z0-9_]|$)/im,
        'A1 authoring backend must not restore retired Studio/package authority',
    );
    rejectPattern(
        file,
        /\b(?:charId|characterId|charDir|charaFilename|selected_world_info|swipeId|swipe_id)\b/,
        'A1 authoring backend must not restore Character/Swipe identity',
    );
    rejectPattern(
        file,
        /\b(?:getChatState|setChatState|deleteChatState|createFloorState)\b|\batri_game_world\b/,
        'A1 authoring backend must not use Chat State/FloorState game authority',
    );
    rejectPattern(
        file,
        /\b(?:ResourceGraph|ResourceRegistryService|LibraryAttach|LibraryFork)\b/,
        'A1 must not implement A2 Resource Graph/Library authority early',
    );
}

requirePattern(
    'src/native/authoring/studio-service.js',
    /export class StudioService/,
    'A1 StudioService boundary is missing',
);
requirePattern(
    'src/native/authoring/studio-service.js',
    /source\.write[\s\S]*source\.move[\s\S]*source\.delete[\s\S]*project\.save/,
    'A1 source/project Authoring Operation registry is incomplete',
);
requirePattern(
    'src/native/authoring/studio-service.js',
    /assertAuthoringWorkspace[\s\S]*assertAuthoringChangeSet/,
    'A1 must execute through frozen Workspace/ChangeSet contracts',
);
requirePattern(
    'src/native/authoring/studio-service.js',
    /ATRIA_PROJECT_CONFLICT_CODE[\s\S]*ConflictError/,
    'A1 optimistic revision conflict handling is missing',
);
requirePattern(
    'src/native/authoring/studio-service.js',
    /commitIfChanged[\s\S]*\.log\([\s\S]*\.diff\(/,
    'A1 ProjectStore-directory Git history integration is missing',
);
requirePattern(
    'src/native/authoring/studio-service.js',
    /buildProjectPackage[\s\S]*preflightProject[\s\S]*previewProject[\s\S]*simulateProject/,
    'A1 build/preflight/preview/simulation seams are incomplete',
);
requirePattern(
    'src/native/authoring/studio-service.js',
    /validators[\s\S]*diagnostics[\s\S]*_validateUnlocked/,
    'A1 validation/diagnostic hook is missing',
);
requirePattern(
    'src/endpoints/native-studio.js',
    /createNativeStudioRouter[\s\S]*workspaces\/execute[\s\S]*projects\/:projectId\/build/,
    'A1 Native Studio HTTP surface is incomplete',
);
requirePattern(
    'src/server-startup.js',
    /\/api\/native\/studio['"],\s*nativeStudioRouter/,
    'A1 Native Studio router is not mounted',
);
rejectPattern(
    'src/endpoints/native-product.js',
    /StudioService|workspaces\/execute|source\/move/,
    'A1 authoring backend must remain separate from the Product consumer API',
);

console.log(`A1 Native Authoring Backend guard passed (${authoringBackend.length} backend files scanned).`);

import fs from 'node:fs';
import path from 'node:path';

function walk(root) {
    if (!fs.existsSync(root)) return [];
    const out = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.isFile() && /\.(?:js|mjs|json|css)$/.test(entry.name)) out.push(full.replaceAll('\\\\', '/'));
    }
    return out;
}

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

function assertAbsent(target) {
    if (fs.existsSync(target)) throw new Error('A9 retired surface still exists: ' + target);
}

function assertNoMatch(file, regex, message) {
    const source = read(file);
    if (regex.test(source)) throw new Error(message + ': ' + file);
}

const retired = [
    'src/endpoints/card-app.js',
    'src/game-package/distribution.js',
    'public/scripts/extensions/card-app',
    'public/scripts/extensions/character-editor-assistant/studio',
    'public/scripts/extensions/game-runtime/manifest.js',
    'public/scripts/extensions/game-runtime/world/branch.js',
    'public/scripts/extensions/game-runtime/world/persistence.js',
    'public/scripts/extensions/game-runtime/world/runtime.js',
    'public/scripts/extensions/game-runtime/world/journal.js',
    'public/scripts/extensions/game-runtime/ui/immersive.js',
];
for (const target of retired) assertAbsent(target);

assertNoMatch(
    'src/server-startup.js',
    /\/api\/card-app|cardAppRouter/,
    'A9 server must not mount CardApp HTTP authority',
);
assertNoMatch(
    'src/endpoints/characters.js',
    /cardApps|extractCardAppFiles|packCardAppFiles|deleteCardAppFiles|card_app\.files/,
    'A9 Character import/export must not bridge CardApp package storage',
);
assertNoMatch(
    'src/constants.js',
    /\bcardApps\b|['"]card-apps['"]/,
    'A9 user-directory authority must not retain CardApp storage',
);
assertNoMatch(
    'src/sync/categories.js',
    /['"]card-apps['"]|\.cardApps\b/,
    'A9 sync registry must not retain CardApp storage',
);
assertNoMatch(
    'src/storage/management.js',
    /['"]card-apps['"]/,
    'A9 storage management must not retain CardApp storage',
);
assertNoMatch(
    'src/storage/inspector.js',
    /['"]card-apps['"]/,
    'A9 storage inspector must not retain CardApp storage',
);

const activeGameRuntime = walk('public/scripts/extensions/game-runtime');
for (const file of activeGameRuntime) {
    assertNoMatch(
        file,
        /\bGAME_MANIFEST_PATH\b|(?:^|[^A-Za-z0-9_])game\.json(?:[^A-Za-z0-9_]|$)|\/api\/card-app\//im,
        'A9 active Game Runtime must not use game.json/CardApp transport authority',
    );
    assertNoMatch(
        file,
        /\bcharId\b|\bcharacterId\b|\batri_game_world\b|\bbuildGameBranchPath\b|\bnormalizeGameBranchPath\b|\bgetGameBranchId\b/,
        'A9 active Game Runtime must not use Character/swipe/Chat-State game identity',
    );
}

for (const file of walk('public/scripts/native')) {
    assertNoMatch(
        file,
        /\batri_game_world\b/,
        'A9 active Native Session consumers must not retain retired game-world namespace',
    );
}

const cea = [
    ...walk('public/scripts/extensions/character-editor-assistant'),
].filter(file => !file.includes('/editor-iteration/'));
for (const file of cea) {
    assertNoMatch(
        file,
        /CardApp Studio|cardapp_studio_sessions|cardAppStudioSystemPrompt|cardapp_patch_file|cardapp_rename_file|extensions\/card-app|\/api\/card-app/,
        'A9 Character Editor Assistant must not expose retired CardApp Studio authority',
    );
}

const playHost = read('public/scripts/atria-shell/native-play-host.js');
if (!/atria-native-play-abi[\s\S]*mountAtriaPlayProduct/.test(playHost)) {
    throw new Error('A9 must retain the hidden SillyTavern generation ABI behind Atria Native Play');
}
if (!/data\.atriaNativePlayAbi|atria-native-play-abi/.test(playHost)) {
    throw new Error('A9 internal generation ABI must remain explicitly marked as internal');
}

const studio = read('public/scripts/native/studio-workspace.js');
if (!/mountNativeStudioAgent[\s\S]*nativeStudioClient\.executeWorkspace[\s\S]*nativeStudioClient\.preview/.test(studio)) {
    throw new Error('A9 must retain A7/A8 Native Studio replacement coverage');
}

console.log(`A9 Hard Cutover residual guard passed (${activeGameRuntime.length} active Game Runtime files scanned).`);

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const read = path => readFileSync(resolve(ROOT, path), 'utf8');

function requirePattern(path, regex, message) {
    const source = read(path);
    if (!regex.test(source)) throw new Error(message + ' (' + path + ')');
}

function rejectPattern(path, regex, message) {
    const source = read(path);
    if (regex.test(source)) throw new Error(message + ' (' + path + ')');
}

const nativeProductFiles = [
    'src/native/product-service.js',
    'src/endpoints/native-product.js',
    'public/scripts/native/product-client.js',
    'public/scripts/native/library-workspaces.js',
    'public/scripts/native/studio-workspace.js',
    'public/scripts/native/play-controls.js',
];

for (const path of nativeProductFiles) {
    rejectPattern(
        path,
        /\/api\/(?:characters|chats|worldinfo)(?:\/|['"`])/i,
        'N9 Native product code must not fall back to Character/JSONL/World Info authorities',
    );
    rejectPattern(
        path,
        /(?:#WorldInfo|\bcharacterId\b|selectCharacterById)/,
        'N9 Native product code must not bind legacy product authorities',
    );
}

if (existsSync(resolve(ROOT, 'src/native/product-ui-service.js'))) {
    throw new Error('Parallel N9 NativeProductUiService must not coexist with NativeProductService');
}

rejectPattern(
    'src/endpoints/native-session.js',
    /NativeProductUiService|\/product\//,
    'Native Session endpoint must not host a second Product UI API',
);

requirePattern(
    'src/endpoints/native-product.js',
    /createNativeProductRouter/,
    'N9 Product API router is missing',
);
requirePattern(
    'public/scripts/atria-shell/library-runtime-workspaces.js',
    /mountNativeWorksWorkspace[\s\S]*mountNativeWorldKnowledgeWorkspace/,
    'R7 Library is not routed to Native Works / World / Knowledge workspaces',
);
rejectPattern(
    'public/scripts/atria-shell/library-runtime-workspaces.js',
    /if \(section === ['"](?:characters|games|world-info)['"]\) return (?:await )?mount/,
    'Active Library routing still mounts a legacy authority',
);
requirePattern(
    'public/scripts/atria-shell/workspace-host.js',
    /mountNativeStudioWorkspace/,
    'R7 Studio is not routed to ProjectStore workspace',
);
requirePattern(
    'public/scripts/native/play-controls.js',
    /Retry Reply[\s\S]*Re-enter Turn[\s\S]*Restart From Here[\s\S]*Quick Save[\s\S]*Timeline[\s\S]*Context/,
    'Native Play product actions are incomplete',
);
requirePattern(
    'public/scripts/native/play-controls.js',
    /Save to my Library/,
    'Embedded Knowledge promotion seam is missing',
);
requirePattern(
    'public/css/atria-shell.css',
    /data-atria-native-session-active[\s\S]*\.swipe_left[\s\S]*\.swipe_right[\s\S]*\.swipes-counter[\s\S]*\.mes_edit[\s\S]*#option_regenerate/,
    'Native Play does not hide retired swipe/edit/regenerate product controls',
);
requirePattern(
    'src/native/product-service.js',
    /native_session_package_missing[\s\S]*dependency\.status === ['"]ready['"]/,
    'My Games missing-Package dependency seam is missing',
);
requirePattern(
    'src/native/product-service.js',
    /preflightSaveImport[\s\S]*importSave/,
    'N9 must delegate portable Save import to NativeSaveSystem',
);

console.log('N9 Native Product authority guard passed.');

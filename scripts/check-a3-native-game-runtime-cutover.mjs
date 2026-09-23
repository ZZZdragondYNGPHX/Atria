import fs from 'node:fs';

const implementationFiles = [
    'src/native/runtime-descriptor.js',
    'src/endpoints/native-session.js',
    'public/scripts/native/session-runtime.js',
    'public/scripts/extensions/game-runtime/index.js',
    'public/scripts/extensions/game-runtime/package-loader.js',
    'public/scripts/extensions/game-runtime/world/package.js',
    'public/scripts/extensions/game-runtime/world/session.js',
    'public/scripts/extensions/game-runtime/world/memory-source.js',
    'public/scripts/extensions/game-runtime/logic/package.js',
    'public/scripts/extensions/game-runtime/logic/runtime.js',
    'public/scripts/extensions/game-runtime/llm/declarative-observations.js',
    'public/scripts/extensions/game-runtime/llm/runtime.js',
    'public/scripts/extensions/game-runtime/llm/turn-context.js',
    'public/scripts/extensions/game-runtime/llm/turn-controller.js',
    'public/scripts/extensions/game-runtime/llm/memory-bridge.js',
];

for (const file of implementationFiles) {
    if (!fs.existsSync(file)) throw new Error('A3 required file missing: ' + file);
}

const source = Object.fromEntries(
    implementationFiles.map(file => [file, fs.readFileSync(file, 'utf8')]),
);
const gameRuntimeFiles = implementationFiles.filter(file => file.includes('/game-runtime/'));
const activeGameRuntime = gameRuntimeFiles.map(file => source[file]).join('\n');

for (const [label, pattern] of [
    ['game.json authority', /\bgame\.json\b|\bGAME_MANIFEST_PATH\b/i],
    ['Character package identity', /\bcharId\b|\bcharacterId\b/],
    ['CardApp runtime transport', /\/api\/card-app\//i],
    ['Chat State Game World authority', /\batri_game_world\b|\bgetChatState\b|\bupdateChatState\b|\bdeleteChatState\b/],
    ['swipe-derived Game World authority', /\bswipe_id\b|\bswipeId\b|\bbranchPath\b|\bbuildGameBranchPath\b|\bgetGameBranchId\b|\bnormalizeGameBranchPath\b/],
]) {
    if (pattern.test(activeGameRuntime)) {
        throw new Error('A3 active Game Runtime still depends on retired ' + label);
    }
}

const descriptor = source['src/native/runtime-descriptor.js'];
if (
    !descriptor.includes('compileNativeRuntimeDescriptor')
    || !descriptor.includes('packageVersionId')
    || !descriptor.includes('entryPointId')
    || !descriptor.includes('assertNativeRuntimeDescriptor')
) {
    throw new Error('A3 Runtime Descriptor compiler must derive from exact PackageVersion + EntryPoint identity');
}
if (/class\s+.*(?:Repo|Repository)|putMutable|putImmutable|writeFile/.test(descriptor)) {
    throw new Error('A3 Runtime Descriptor must not become a persisted package authority');
}

const loader = source['public/scripts/extensions/game-runtime/package-loader.js'];
if (
    !loader.includes('/api/native/session/')
    || !loader.includes('runtime/resolve')
    || !loader.includes('runtime/resource')
) {
    throw new Error('A3 game-runtime loader must use Native Session runtime APIs');
}

const world = source['public/scripts/extensions/game-runtime/world/session.js'];
if (
    !world.includes('atri_world_state')
    || !world.includes("'atri_game_runtime'")
    || !world.includes('nativeRuntime.commitStatePatch')
) {
    throw new Error('A3 World runtime must commit through Native SessionRevision state authority');
}

const turn = [
    source['public/scripts/extensions/game-runtime/llm/turn-context.js'],
    source['public/scripts/extensions/game-runtime/llm/runtime.js'],
    source['public/scripts/extensions/game-runtime/llm/turn-controller.js'],
].join('\n');
if (!/sessionId[\s\S]*branchId[\s\S]*revisionId/.test(turn)) {
    throw new Error('A3 Turn runtime must anchor to Native Session/Branch/Revision identity');
}

const index = source['public/scripts/extensions/game-runtime/index.js'];
if (!index.includes('nativeSessionRuntime') || index.includes('activateGamePackageUi')) {
    throw new Error('A3 Text Runtime must activate from Native Session without starting A4 UI runtime');
}

const textHost = fs.readFileSync('public/script.js', 'utf8');
if (
    !textHost.includes("getExtensionApi?.('game-runtime')")
    || !textHost.includes("gameState?.descriptor?.experience?.mode === 'text'")
    || !textHost.includes('gameApi.submitFreeText')
) {
    throw new Error('A3 Text Experience must route committed Native user turns through Game Runtime');
}

const endpoint = source['src/endpoints/native-session.js'];
if (
    !endpoint.includes("'/runtime/resolve'")
    || !endpoint.includes("'/runtime/resource'")
    || endpoint.includes('/api/card-app/')
) {
    throw new Error('A3 Native Session runtime endpoint is incomplete or bridges to CardApp');
}

console.log('A3 Native Game Runtime hard-cutover guard passed');

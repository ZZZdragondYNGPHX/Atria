import fs from 'node:fs';

const implementationFiles = [
    'src/native/runtime-descriptor.js',
    'src/native/studio-preview.js',
    'public/scripts/native/experience/index.js',
    'public/scripts/native/experience/package-loader.js',
    'public/scripts/native/experience/ui/component-model.js',
    'public/scripts/native/experience/ui/runtime.js',
    'public/scripts/native/experience/ui/declarative.js',
    'public/scripts/native/experience/ui/selectors.js',
    'public/scripts/native/experience/ui/surfaces.js',
    'public/scripts/native/experience/ui/host-surfaces.js',
    'public/scripts/native/experience/ui/native-components.js',
    'public/scripts/native/experience/ui/package.js',
    'public/scripts/native/experience/ui/live.js',
    'public/scripts/native/experience/ui/full-host.js',
    'public/scripts/atria-shell/native-play-host.js',
];

for (const file of implementationFiles) {
    if (!fs.existsSync(file)) throw new Error('A4 required file missing: ' + file);
}

const source = Object.fromEntries(
    implementationFiles.map(file => [file, fs.readFileSync(file, 'utf8')]),
);

const experienceFiles = [
    'public/scripts/native/experience/ui/component-model.js',
    'public/scripts/native/experience/ui/declarative.js',
    'public/scripts/native/experience/ui/surfaces.js',
    'public/scripts/native/experience/ui/package.js',
    'public/scripts/native/experience/ui/live.js',
].map(file => source[file]).join('\n');

for (const [label, pattern] of [
    ['legacy Game Package UI authority', /manifest\?*\.ui|manifest\.ui|GAME_MANIFEST_PATH|\bgame\.json\b/i],
    ['Character/CardApp package identity', /\bcharId\b|\bcharacterId\b|\/api\/card-app\//],
    ['HTML package execution surface', /loadGamePackageTextResource|\.html\b|sanitizeGameHtmlFragment/],
    ['Chat State UI authority', /\bgetChatState\b|\bupdateChatState\b|\bdeleteChatState\b/],
    ['swipe-derived UI authority', /\bswipe_id\b|\bswipeId\b|\bbranchPath\b/],
]) {
    if (pattern.test(experienceFiles)) {
        throw new Error('A4 active Experience Runtime still depends on retired ' + label);
    }
}

const descriptor = source['src/native/runtime-descriptor.js'];
if (
    !descriptor.includes('experienceRuntimeSource')
    || !descriptor.includes('experience.component')
    || !descriptor.includes('componentModelVersion')
    || !descriptor.includes('runtimeJsonPath')
) {
    throw new Error('A4 Runtime Descriptor must derive declarative Experience resources from exact PackageVersion + EntryPoint');
}

const model = source['public/scripts/native/experience/ui/component-model.js'];
for (const field of ['id', 'type', 'props', 'bindings', 'actions', 'visibility', 'responsive', 'children']) {
    if (!model.includes(`'${field}'`)) {
        throw new Error('A4 Component Model is missing required field: ' + field);
    }
}
if (!model.includes("'native-slot'") || !model.includes('conversation') || !model.includes('composer')) {
    throw new Error('A4 shared Component Model must support Hybrid/Full Native slots');
}

const packageUi = source['public/scripts/native/experience/ui/package.js'];
if (
    !packageUi.includes('loadGamePackageJsonResource')
    || !packageUi.includes('compileExperienceComponentModel')
    || packageUi.includes('loadGamePackageTextResource')
) {
    throw new Error('A4 package UI must load only structured JSON through the Native Session resource path');
}

const live = source['public/scripts/native/experience/ui/live.js'];
if (
    !live.includes('activateNativeExperienceRuntime')
    || !live.includes("mode === 'text'")
    || !live.includes('createComponentUiRuntime')
    || !live.includes('createFullGameHost')
) {
    throw new Error('A4 must route Text/Component/Hybrid/Full through one Experience dispatcher');
}

const surfaces = source['public/scripts/native/experience/ui/host-surfaces.js'];
for (const surface of [
    'app.root',
    'chat.header',
    'chat.footer',
    'composer.before',
    'composer.after',
    'sidebar.left',
    'sidebar.right',
    'drawer',
    'modal',
]) {
    if (!surfaces.includes(surface)) throw new Error('A4 semantic surface missing: ' + surface);
}
if (!surfaces.includes('acquireStageOwnership')) {
    throw new Error('A4 Hybrid must use Atria Play Stage ownership instead of creating a parallel host');
}

const full = source['public/scripts/native/experience/ui/full-host.js'];
if (
    !full.includes('acquireStageOwnership')
    || !full.includes("['exit'")
    || !full.includes("['stop'")
    || !full.includes("['save'")
    || !full.includes("['diagnostics'")
) {
    throw new Error('A4 Full Experience must preserve Host-owned recovery outside package visual ownership');
}

const index = source['public/scripts/native/experience/index.js'];
if (
    !index.includes('activateNativeExperienceRuntime')
    || !index.includes('nativeSessionRuntime')
    || !index.includes('nativeProductClient.createSave')
) {
    throw new Error('A4 Experience activation/recovery must remain attached to Native Session authority');
}

const preview = source['src/native/studio-preview.js'];
if (
    !preview.includes('compileNativeRuntimeDescriptor')
    || !preview.includes('persisted: false')
    || /new\s+SessionCore|createSession|createBranch/.test(preview)
) {
    throw new Error('A4 Native Preview must project the Runtime Descriptor without creating Session/Branch authority');
}

const uiAuthority = [
    source['public/scripts/native/experience/ui/component-model.js'],
    source['public/scripts/native/experience/ui/runtime.js'],
    source['public/scripts/native/experience/ui/declarative.js'],
    source['public/scripts/native/experience/ui/selectors.js'],
    source['public/scripts/native/experience/ui/package.js'],
    source['public/scripts/native/experience/ui/live.js'],
].join('\n');
if (/class\s+.*(?:Repo|Repository)|SessionCore|ProjectStore|PackageRepo|WorldRepo|localStorage|indexedDB/i.test(uiAuthority)) {
    throw new Error('A4 Experience UI must not create a second persistence/package/session/world authority');
}
if (/\beval\s*\(|new\s+Function\s*\(|Worker\s*\(|SharedWorker\s*\(/.test(uiAuthority)) {
    throw new Error('A4 package-runtime v1 must not execute arbitrary JavaScript/module/worker/eval payloads');
}

console.log('A4 Experience Runtime residual guard passed');

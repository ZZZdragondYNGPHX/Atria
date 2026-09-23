import { readFileSync, readdirSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const requirePattern = (path, pattern) => {
    if (!pattern.test(read(path))) throw new Error('P4 missing seam: ' + path);
};
function walk(path) {
    return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path + '/' + entry.name)
        : entry.name.endsWith('.js') ? [path + '/' + entry.name] : []);
}
const paths = ['public/scripts/native', 'public/scripts/extensions/game-runtime', 'public/scripts/extensions/orchestrator',
    'public/scripts/extensions/memory-graph', 'public/scripts/extensions/search-tools'].flatMap(walk);
paths.push('public/scripts/lib/iter-tool-calling.js');
const compatibility = 'public/scripts/native/generation-compat.js';

const forbidden = /\b(?:context|ctx|atriaContext)\s*(?:\?\.|\.)\s*generateTask(?:Stream)?\s*\(|buildPresetAwarePromptMessages\s*\(|connectionProfiles\s*\.\s*resolve\s*\(/;
for (const path of paths) {
    const source = read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (path !== compatibility && forbidden.test(source)) throw new Error('P4 legacy generation residual: ' + path);
    const presetCalls = source.match(/getPresetManager\s*(?:\?\.)?\s*\(/g) || [];
    if (presetCalls.length > (path === compatibility ? 1 : 0)) throw new Error('P4 unlisted legacy preset authority: ' + path);
}
requirePattern(compatibility, /!nativePromptUiActive\(\) && !options\.nativeSource/);
requirePattern(compatibility, /executeNativeGeneration\(/);
requirePattern('public/scripts/native/studio-agent.js', /executeNativeGeneration\([\s\S]*context\.task\.baseRevision/);
requirePattern('public/scripts/extensions/game-runtime/index.js', /executeGeneration:[^\n]*executeFirstPartyGeneration/);
requirePattern('public/script.js', /if \(nativeSessionRuntime\.active\)[\s\S]*runNativePlayGeneration/);
requirePattern('src/native/adapters/generation-host.js', /new GenerationService[\s\S]*service\.execute/);
requirePattern('src/native/adapters/generation-host.js', /new RouteResolver/);
requirePattern('src/native/adapters/generation-host.js', /new PromptCompiler/);
requirePattern('src/native/adapters/generation-host.js', /createNativeSessionContextAdapter/);
requirePattern('src/native/adapters/generation-host.js', /native_generation_revision_conflict[\s\S]*native_generation_task_stopped/);
requirePattern('src/endpoints/native-generation.js', /request\.user\?\.profile\?\.handle/);
requirePattern('scripts/check-a8-project-agent.mjs', /executeNativeGeneration[\s\S]*human Review gate/);
for (const sample of ['context.generateTask({})', 'ctx.generateTaskStream({})', 'buildPresetAwarePromptMessages()', 'connectionProfiles.resolve()']) {
    if (!forbidden.test(sample)) throw new Error('P4 negative guard self-test failed');
}
console.log(`P4 Native generation cutover guard passed (${paths.length} first-party files; explicit non-Native compatibility island).`);

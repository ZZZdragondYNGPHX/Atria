import { existsSync, readFileSync } from 'node:fs';

const required = [
    'src/native/model-prompt-runtime/resources.js',
    'src/native/model-prompt-runtime/persistence.js',
    'src/native/authoring/resource-registry.js',
    'src/native/authoring/library-service.js',
    'src/native/authoring/library-authoring.js',
    'src/native/authoring/resource-graph.js',
    'src/native/dependency-closure.js',
    'src/native/package-composition.js',
];

for (const file of required) {
    if (!existsSync(file)) throw new Error('P1 required file missing: ' + file);
}

const read = file => readFileSync(file, 'utf8');
const resources = read('src/native/model-prompt-runtime/resources.js');
const persistence = read('src/native/model-prompt-runtime/persistence.js');
const registry = read('src/native/authoring/resource-registry.js');
const library = read('src/native/authoring/library-service.js');
const authoring = read('src/native/authoring/library-authoring.js');
const graph = read('src/native/authoring/resource-graph.js');
const projectSource = read('src/native/project-source.js');
const closure = read('src/native/dependency-closure.js');
const packageComposition = read('src/native/package-composition.js');
const packageContracts = read('src/native/contracts.js');
const combined = [
    resources,
    persistence,
    registry,
    library,
    authoring,
    graph,
    projectSource,
    closure,
    packageComposition,
].join('\n');

for (const type of ['core.prompt-module', 'core.prompt-program', 'core.generation-profile']) {
    if (!registry.includes(type) || !resources.includes(type)) {
        throw new Error('P1 resource type is not wired through Registry/contracts: ' + type);
    }
}

if (!/class VersionedJsonResourceHandler/.test(persistence)) {
    throw new Error('P1 generic versioned JSON resource handler is missing');
}
if (/class\s+(?:PromptStore|GenerationStore|ModelPromptLibrary|ResourceGraphRepo)\b/.test(combined)) {
    throw new Error('P1 must not create a second Prompt/Generation/Library/Graph authority');
}
if (!/versionedJsonResources/.test(library) || !/getExact/.test(library)) {
    throw new Error('P1 Library must consume the generic resource handler through exact lookup');
}
if (!/resource\.attach[\s\S]*resource\.fork[\s\S]*resource\.update/.test(authoring)) {
    throw new Error('P1 resources must stay inside A1/A2 Attach/Fork/Update authoring operations');
}
if (!/mode:\s*['"]derived-readonly['"]/.test(graph)) {
    throw new Error('P1 Resource Graph must remain derived-readonly');
}
if (!/dependencies\.resources/.test(authoring) || !/source\.resources/.test(closure)) {
    throw new Error('P1 project/library exact resource dependencies are incomplete');
}
if (!/native_model_prompt_dependency_missing/.test(closure)) {
    throw new Error('P1 exact dependency closure must fail closed on missing revisions');
}
if (!/packagedModelPromptResources/.test(packageComposition) || !/scope:\s*['"]package['"]/.test(packageComposition)) {
    throw new Error('P1 build must vendor model/prompt resources into immutable Package scope');
}
if (!/resources:\s*modelPromptResources/.test(packageContracts)) {
    throw new Error('P1 Package contract must carry its vendored model/prompt resource closure');
}
if (!/secretRef/.test(persistence) && !/assertConnectionProfile/.test(persistence)) {
    throw new Error('P1 Connection persistence must remain behind the secretRef contract');
}
if (/\b(?:apiKey|accessToken|secretValue|password)\s*[:=]/i.test(persistence)) {
    throw new Error('P1 persistence must not serialize secret values');
}
if (/\b(?:document|window)\s*\.|\b(?:localStorage|sessionStorage|indexedDB)\b|PromptManager|getPresetManager|Atria\.getContext/.test(
    resources + '\n' + persistence,
)) {
    throw new Error('P1 Native Core must not depend on SillyTavern/browser runtime authority');
}
if (/\.save\(|\.putResource\(|\.deleteResource\(/.test(graph)) {
    throw new Error('P1 Resource Graph must not gain a write path');
}

console.log('P1 model/prompt resource & persistence foundation guard passed.');

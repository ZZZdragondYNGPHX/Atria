import fs from 'node:fs';

const required = [
    'src/native/authoring/resource-registry.js',
    'src/native/authoring/library-service.js',
    'src/native/authoring/resource-graph.js',
    'src/native/authoring/library-authoring.js',
];

for (const file of required) {
    if (!fs.existsSync(file)) throw new Error('A2 required file missing: ' + file);
}

const registry = fs.readFileSync('src/native/authoring/resource-registry.js', 'utf8');
const library = fs.readFileSync('src/native/authoring/library-service.js', 'utf8');
const graph = fs.readFileSync('src/native/authoring/resource-graph.js', 'utf8');
const authoring = fs.readFileSync('src/native/authoring/library-authoring.js', 'utf8');
const studio = fs.readFileSync('src/native/authoring/studio-service.js', 'utf8');
const projectSource = fs.readFileSync('src/native/project-source.js', 'utf8');
const combined = [registry, library, graph, authoring, studio, projectSource].join('\n');

if (!registry.includes('assertResourceDescriptor') || !registry.includes('assertResourceRegistryContract')) {
    throw new Error('A2 Resource Registry must remain descriptor-contract driven');
}
if (!graph.includes("mode: 'derived-readonly'")) {
    throw new Error('A2 Resource Graph must remain derived-readonly');
}
if (/class\s+(LibraryRepo|ResourceRepo|ResourceGraphRepo)\b/.test(combined)) {
    throw new Error('A2 must not create a second Library/Resource persistence repository');
}
if (/this\._(?:projects|worlds|knowledge|assets|packages)\.(?:create|save|writeFile|moveFile|deleteFile|delete|put|putBlob|deleteRef|commitRevision|saveBinding|commitVersion|setState|deleteState)\s*\(/.test(graph)) {
    throw new Error('A2 Resource Graph must not mutate canonical authorities');
}
if (/\/api\/card-app|\bCardApp\b|\bGAME_MANIFEST_PATH\b|\bcharId\b|\bswipe_id\b/.test(combined)) {
    throw new Error('A2 reintroduced a retired Native authoring/runtime authority');
}
if (!library.includes('getExact(') || !library.includes('immutable: true')) {
    throw new Error('A2 Library layer must expose exact immutable resource references');
}
if (!/resource\.attach[\s\S]*resource\.fork[\s\S]*resource\.update/.test(authoring)) {
    throw new Error('A2 Library authoring operations are incomplete');
}
if (!/dependencies\.assets[\s\S]*contentHash/.test(authoring) || !/contentHash/.test(projectSource)) {
    throw new Error('A2 Library Asset Attach must pin exact content identity');
}
if (!/LibraryAuthoringPlanner[\s\S]*RESOURCE_OPERATION_TYPES/.test(studio)) {
    throw new Error('A2 writes must remain inside StudioService Authoring Operations');
}
if (!/getResourceGraph[\s\S]*queryResources[\s\S]*getResourceReferences[\s\S]*inspectResourceDelete/.test(studio)) {
    throw new Error('A2 StudioService read-only Resource discovery surface is incomplete');
}

console.log('A2 Library/Resource architecture guard passed');

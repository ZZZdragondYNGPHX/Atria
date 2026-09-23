import fs from 'node:fs';

const required = [
    'src/native/authoring/resource-registry.js',
    'src/native/authoring/library-service.js',
    'src/native/authoring/resource-graph.js',
];

for (const file of required) {
    if (!fs.existsSync(file)) throw new Error('A2 required file missing: ' + file);
}

const registry = fs.readFileSync('src/native/authoring/resource-registry.js', 'utf8');
const library = fs.readFileSync('src/native/authoring/library-service.js', 'utf8');
const graph = fs.readFileSync('src/native/authoring/resource-graph.js', 'utf8');
const combined = [registry, library, graph].join('\n');

if (!registry.includes('assertResourceDescriptor') || !registry.includes('assertResourceRegistryContract')) {
    throw new Error('A2 Resource Registry must remain descriptor-contract driven');
}
if (!graph.includes("mode: 'derived-readonly'")) {
    throw new Error('A2 Resource Graph must remain derived-readonly');
}
if (/class\s+(LibraryRepo|ResourceRepo|ResourceGraphRepo)\b/.test(combined)) {
    throw new Error('A2 must not create a second Library/Resource persistence repository');
}
if (/\.put\(|\.save\(|\.delete\(|deleteResource\(|putMutable\(|putImmutable\(/.test(graph)) {
    throw new Error('A2 Resource Graph must not mutate canonical authorities');
}
if (/\/api\/card-app|CardApp|GAME_MANIFEST_PATH|charId|swipe_id/.test(combined)) {
    throw new Error('A2 reintroduced a retired Native authoring/runtime authority');
}
if (!library.includes('getExact(') || !library.includes('immutable: true')) {
    throw new Error('A2 Library layer must expose exact immutable resource references');
}

console.log('A2 Library/Resource architecture guard passed');

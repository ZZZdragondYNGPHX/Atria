import { readdirSync, readFileSync } from 'node:fs';

function walk(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = directory + '/' + entry.name;
        return entry.isDirectory() ? walk(path) : path.endsWith('.js') ? [path] : [];
    });
}

// Scan new Experience modules too, rather than a fixed list that silently goes
// stale as P1-P9 add files. Host SessionCore remains the persistence authority.
const files = [
    ...walk('public/scripts/native/experience'),
    'public/shared/native-experience-contract.js',
    'src/native/runtime-descriptor.js',
];
for (const path of files) {
    const source = readFileSync(path, 'utf8');
    for (const [label, pattern] of [
        ['retired authority', /\/api\/card-app\/|\bCardApp\b|\bGAME_MANIFEST_PATH\b|\bgame\.json\b|\bcharId\b|\bcharacterId\b|\bswipe_id\b|\bgetChatState\b|\bupdateChatState\b/],
        ['parallel persistence', /\blocalStorage\b|\bindexedDB\b|\b(?:putMutable|putImmutable|writeFile|writeFileSync)\s*\(|new\s+(?:SessionCore|\w*(?:Repo|Repository|Store))\s*\(/],
        ['package executable', /\beval\s*\(|new\s+Function\s*\(|new\s+(?:Worker|SharedWorker)\s*\(/],
    ]) {
        if (pattern.test(source)) throw new Error(`Experience contract fence: ${label} in ${path}`);
    }
}
console.log(`Experience contract foundation guard passed (${files.length} files scanned)`);

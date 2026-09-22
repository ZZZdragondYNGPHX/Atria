import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const ROOT = process.cwd();
const read = path => readFileSync(resolve(ROOT, path), 'utf8');
const posix = path => path.split(sep).join('/');

function walk(path) {
    const absolute = resolve(ROOT, path);
    if (!existsSync(absolute)) return [];
    if (statSync(absolute).isFile()) return [path];
    const out = [];
    for (const name of readdirSync(absolute)) {
        const child = resolve(absolute, name);
        const rel = posix(relative(ROOT, child));
        if (statSync(child).isDirectory()) out.push(...walk(rel));
        else if (/\.(?:js|mjs)$/.test(name)) out.push(rel);
    }
    return out;
}

function rejectPattern(path, regex, message) {
    const source = read(path);
    if (regex.test(source)) throw new Error(`${message} (${path})`);
}

function requirePattern(path, regex, message) {
    const source = read(path);
    if (!regex.test(source)) throw new Error(`${message} (${path})`);
}

const nativeAuthorityFiles = [
    ...walk('src/native'),
    ...walk('public/scripts/native'),
    'src/endpoints/native-session.js',
    'src/endpoints/native-product.js',
    'public/scripts/atria-shell/native-play-host.js',
    'public/scripts/atria-shell/library-runtime-workspaces.js',
    'public/scripts/atria-shell/workspace-host.js',
].filter((path, index, list) => list.indexOf(path) === index);

for (const path of nativeAuthorityFiles) {
    rejectPattern(
        path,
        /\/api\/(?:characters|chats|worldinfo)(?:\/|['"`])/i,
        'N10 Active Native authority must not call Character/JSONL/World Info persistence endpoints',
    );
    if (!['src/native/contracts.js', 'src/native/world-knowledge.js'].includes(path)) {
        rejectPattern(
            path,
            /\bWorldInfoRepo\b|worlds\/[<{$]|(?:^|[^A-Za-z0-9_])selected_world_info(?:[^A-Za-z0-9_]|$)|(?:^|[^A-Za-z0-9_])charaFilename(?:[^A-Za-z0-9_]|$)/m,
            'N10 Active Native authority must not depend on legacy World Info identity/storage',
        );
    }
    rejectPattern(
        path,
        /\b(?:createFloorState|getChatState|setChatState|deleteChatState|settleMessageSwiped|settleMessageDeleted|settleMessageSwipeDeleted)\b|\bMESSAGE_(?:SWIPED|DELETED|EDITED)\b/,
        'N10 Active Native authority must not depend on FloorState/chat structural-event authority',
    );
}

const identityCheckedFiles = nativeAuthorityFiles.filter(path => ![
    'src/native/contracts.js',
    'src/native/world-knowledge.js',
].includes(path));

for (const path of identityCheckedFiles) {
    rejectPattern(
        path,
        /\b(?:characterId|charDir|avatar_url|worldInfoUid|worldBookName|charaFilename|selected_world_info)\b/,
        'N10 Active Native authority must use opaque Native identities',
    );
}

const productFacingFiles = [
    'src/native/product-service.js',
    'src/endpoints/native-product.js',
    'src/endpoints/native-session.js',
    'public/scripts/native/product-client.js',
    'public/scripts/native/library-workspaces.js',
    'public/scripts/native/studio-workspace.js',
    'public/scripts/native/play-controls.js',
    'public/scripts/atria-shell/library-runtime-workspaces.js',
    'public/scripts/atria-shell/workspace-host.js',
];

for (const path of productFacingFiles) {
    rejectPattern(
        path,
        /\/characters\/export|\/chats\/export|\b(?:CharX|BYAF)\b|\.jsonl\b|file_type[^\n]{0,80}\b(?:png|json|charx|byaf)\b/i,
        'N10 Active Native product flow must not expose legacy Character/chat export formats',
    );
    rejectPattern(
        path,
        /\bCardApp\b|card-app/i,
        'N10 CardApp must not be an Active Native product identity',
    );
}

rejectPattern(
    'src/native/session-core.js',
    /\basync\s+(?:addVariant|selectVariant)\s*\(/,
    'N10 committed Variant mutation primitives must stay retired',
);
requirePattern(
    'src/native/session-core.js',
    /Retry the current committed assistant reply without creating a Native[\s\S]*fork from that post-user revision/,
    'N10 Retry Reply must remain revision/branch based',
);
requirePattern(
    'src/endpoints/native-session.js',
    /command\.variantId !== undefined \|\| command\.swipeId !== undefined[\s\S]*cannot select a committed Variant/,
    'N10 Native branch API must reject committed Variant/Swipe selection',
);
requirePattern(
    'public/scripts/native/session-runtime.js',
    /if \(type === ['"]swipe['"]\)[\s\S]*not a committed Timeline capability/,
    'N10 Native runtime must fail closed on committed Swipe generation',
);
requirePattern(
    'public/scripts/native/session-runtime.js',
    /async fork\(index, \{ swipeId = null \} = \{\}\)[\s\S]*if \(swipeId !== null\)[\s\S]*cannot select a committed Swipe\/Variant/,
    'N10 Native branch runtime must reject Swipe/Variant selection',
);

rejectPattern(
    'public/scripts/atria-shell/library-runtime-workspaces.js',
    /mountCharactersWorkspace|mountGamesWorkspace|mountWorldWorkspace|LEGACY_LIBRARY_ADAPTERS|selectCharacterById/,
    'N10 Product Library must not retain Characters/Games/WorldInfo authority adapters',
);
rejectPattern(
    'public/scripts/atria-shell/workspace-host.js',
    /openLibraryCharacter/,
    'N10 R7 route host must not retain Character Library authority aliases',
);
requirePattern(
    'public/scripts/atria-shell/library-runtime-workspaces.js',
    /id: ['"]works['"][\s\S]*id: ['"]worlds-knowledge['"][\s\S]*id: ['"]skills['"]/,
    'N10 Product Library must retain only Native Works / Worlds & Knowledge / Skills sections',
);

requirePattern(
    'public/script.js',
    /if \(id == ['"]option_select_chat['"]\) \{[\s\S]*nativeSessionRuntime\.active[\s\S]*Manage Chat Files/,
    'N10 Manage Chat Files must fail closed during an active Native Session',
);
requirePattern(
    'public/script.js',
    /select_selected_character[\s\S]{0,260}nativeSessionRuntime\.active[\s\S]{0,220}Character\/CardApp editor/,
    'N10 transient Native Character projection must not open the Character/CardApp editor',
);
requirePattern(
    'public/script.js',
    /#export_button[\s\S]{0,260}nativeSessionRuntime\.active[\s\S]{0,220}PNG\/JSON\/CharX\/BYAF export/,
    'N10 Character export must fail closed during an active Native Session',
);
requirePattern(
    'public/scripts/bookmarks.js',
    /function nativeCheckpointRetired[\s\S]*nativeSessionRuntime\.active[\s\S]*createNewBookmark[\s\S]*nativeCheckpointRetired/,
    'N10 Checkpoint Chat must fail closed during an active Native Session',
);
requirePattern(
    'public/css/atria-shell.css',
    /data-atria-native-session-active[\s\S]*#option_select_chat[\s\S]*#option_new_bookmark[\s\S]*#option_back_to_main[\s\S]*#character_import_button[\s\S]*#export_button/,
    'N10 retired Native chat-file/checkpoint controls must remain hidden',
);

requirePattern(
    'src/native/contracts.js',
    /FORBIDDEN_NATIVE_IDENTITY_FIELDS[\s\S]*characterId[\s\S]*charDir[\s\S]*avatar_url[\s\S]*swipe_id/,
    'N10 Native contracts must reject legacy Character/Swipe identity fields',
);
requirePattern(
    'src/native/world-knowledge.js',
    /WORLD_KNOWLEDGE_FORBIDDEN_IDENTITY_FIELDS[\s\S]*uid[\s\S]*worldBookName[\s\S]*charaFilename[\s\S]*selected_world_info/,
    'N10 World/Knowledge contracts must reject legacy book/file identity',
);
requirePattern(
    'public/scripts/world-info.js',
    /getSortedEntries[\s\S]{0,500}nativeSessionRuntime\.active[\s\S]{0,500}nativeSessionRuntime\.knowledgeEntries/,
    'N10 Native World Info adapter must source candidates from pinned Native Knowledge',
);
requirePattern(
    'public/scripts/world-info.js',
    /getWorldInfoEventRuntimeState[\s\S]{0,320}nativeSessionRuntime\.active[\s\S]{0,220}nativeSessionRuntime\.readState[\s\S]{0,260}getWorldInfoEventFloorState/,
    'N10 Native World Info state must read SessionRevision state before the non-Native FloorState branch',
);
requirePattern(
    'public/scripts/world-info.js',
    /if \(nativeSessionRuntime\.active\)[\s\S]{0,700}nativeSessionRuntime\.stageState[\s\S]{0,500}nativeSessionRuntime\.updateState[\s\S]{0,500}else \{[\s\S]{0,300}getWorldInfoEventFloorState/,
    'N10 Native World Info events must commit through SessionRevision state, not FloorState',
);

console.log(`N10 Native hard-cutover residual guard passed (${nativeAuthorityFiles.length} authority files scanned).`);

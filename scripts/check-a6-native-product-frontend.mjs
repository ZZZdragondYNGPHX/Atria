import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const read = path => readFileSync(resolve(ROOT, path), 'utf8');

function requirePattern(path, pattern, message) {
    if (!pattern.test(read(path))) throw new Error(message + ' (' + path + ')');
}

function rejectPattern(path, pattern, message) {
    if (pattern.test(read(path))) throw new Error(message + ' (' + path + ')');
}

requirePattern(
    'public/scripts/atria-shell/constants.js',
    /id:\s*['"]build['"][\s\S]*label:\s*['"]Build['"]/,
    'A6 primary authoring product domain must be Build',
);
rejectPattern(
    'public/scripts/atria-shell/constants.js',
    /id:\s*['"]studio['"]/,
    'A6 must not retain Studio as a primary product domain',
);
rejectPattern(
    'public/scripts/atria-shell/workspace-host.js',
    /domain\s*===\s*['"]studio['"]|navigate\(['"]studio['"]|openStudio\s*\(/,
    'A6 WorkspaceHost must route projects through Build',
);

requirePattern(
    'public/scripts/native/play-product.js',
    /nativeSessionRuntime[\s\S]*snapshot[\s\S]*timeline/,
    'A6 Conversation must render the Native Session projection',
);
requirePattern(
    'public/scripts/native/play-product.js',
    /native\.sendTextarea\.value[\s\S]*sendButton\.click\(\)/,
    'A6 Composer must bridge the existing Native generation boundary',
);
rejectPattern(
    'public/scripts/native/play-product.js',
    /\b(?:localStorage|sessionStorage|indexedDB|createFloorState|setChatState|SessionRepo|TimelineRepo)\b/,
    'A6 Play product UI must not create a second persistence/runtime authority',
);
requirePattern(
    'public/scripts/atria-shell/native-play-host.js',
    /atria-native-play-abi[\s\S]*mountAtriaPlayProduct/,
    'A6 must isolate the old conversation DOM as an internal generation ABI',
);
requirePattern(
    'public/scripts/extensions/game-runtime/ui/native-components.js',
    /data-atria-native-product-component="conversation"[\s\S]*data-atria-native-product-component="composer"/,
    'A6 Native Component Registry must compose Atria product Conversation/Composer',
);

requirePattern(
    'public/scripts/atria-shell/library-runtime-workspaces.js',
    /master-detail[\s\S]*id:\s*['"]capabilities['"][\s\S]*atriaRuntimeCapabilities/,
    'A6 Library/Runtime must use product patterns and expose Runtime Capabilities',
);
requirePattern(
    'public/scripts/atria-shell/library-runtime-workspaces.js',
    /atriaRuntimeConnections[\s\S]*atriaRuntimeConnectionAdvanced/,
    'A6 Runtime Connections must be native-first with Advanced compatibility editor',
);
rejectPattern(
    'public/scripts/atria-shell/library-runtime-workspaces.js',
    /body\.replaceChildren\(apiBlock\)/,
    'A6 must not use the old API block as the primary Runtime Connections product page',
);

requirePattern(
    'public/scripts/atria-shell/utility-workspaces.js',
    /atriaPluginSurface\s*=\s*['"]native['"][\s\S]*atriaLegacyPlugins/,
    'A6 Plugins must be Native-first and isolate Legacy extensions',
);
requirePattern(
    'public/scripts/atria-shell/utility-workspaces.js',
    /atriaSettingsPrimary[\s\S]*atriaSettingsCompatibility/,
    'A6 Settings must have an Atria-native primary surface',
);
requirePattern(
    'public/scripts/atria-shell/utility-workspaces.js',
    /atriaAccountPrimary[\s\S]*atriaAccountAdvanced/,
    'A6 Account must have an Atria-native primary surface',
);

requirePattern(
    'public/scripts/atria-shell/product-search.js',
    /host\.openLibraryWork[\s\S]*host\.openLibraryWorld[\s\S]*host\.openLibraryKnowledge[\s\S]*host\.openBuild/,
    'A6 Product Search must navigate to owning product routes',
);
rejectPattern(
    'public/scripts/atria-shell/product-search.js',
    /replaceChildren|innerHTML|appendChild|localStorage|indexedDB/,
    'A6 Product Search must not render foreign-domain content or persist a second index',
);

console.log('A6 Native Product Frontend residual guard passed.');

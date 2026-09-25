import { runtimeRequest, onRuntimeConfigurationChanged } from './runtime-client.js';
import { nativeProductClient } from './product-client.js';
import { nativeSessionRuntime } from './session-runtime.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { registerNativeRegexScope, SCRIPT_TYPES, notifyRuntimeRegexScriptsChanged } from '../extensions/regex/engine.js';

let preset = null, game = null, sequence = 0, initialized = false;
let errorMessage = '';
export function getNativeRegexScopeStatus() {
    return { preset, game, errorMessage, gameWritable: Boolean(game && !nativeSessionRuntime.history && !nativeSessionRuntime.host?.isGenerating()) };
}

export async function refreshNativeRegexScopes() {
    const token = ++sequence;
    const packageId = nativeSessionRuntime.snapshot?.session?.packageId;
    try {
        const [scopes, currentGame] = await Promise.all([
            runtimeRequest('/regex-scopes'),
            packageId ? nativeProductClient.getGameRegex(packageId) : null,
        ]);
        if (token !== sequence) return;
        preset = scopes.preset;
        game = currentGame ? { ...currentGame, packageId, displayName: nativeSessionRuntime.snapshot?.manifest?.name || packageId } : null;
        errorMessage = '';
    } catch (error) {
        if (token !== sequence) return;
        preset = null; game = null; errorMessage = error.message;
    }
    notifyRuntimeRegexScriptsChanged();
}

export async function initializeNativeRegexScopes() {
    if (!initialized) {
        initialized = true;
        registerNativeRegexScope(SCRIPT_TYPES.PRESET, {
            owner: () => preset?.presetId,
            get: () => preset?.regexScripts || [],
            async save(regexScripts, owner) {
                const expectedRevision = preset.revision;
                const document = await runtimeRequest('/presets/' + encodeURIComponent(owner));
                if (document.revision !== expectedRevision) throw new Error(tl('Preset changed. Reload before saving Regex.'));
                await runtimeRequest('/presets/' + encodeURIComponent(owner), { method: 'PUT', body: { preset: { ...document, regexScripts }, expectedRevision } });
            },
        });
        registerNativeRegexScope(SCRIPT_TYPES.GAME, {
            async save(regexScripts, owner) {
                if (!getNativeRegexScopeStatus().gameWritable || game.packageId !== owner) throw new Error(tl('Open a writable game Session before editing Game Regex.'));
                await nativeProductClient.saveGameRegex(owner, { regexScripts, packageVersionId: game.packageVersionId });
                if (nativeSessionRuntime.snapshot?.session?.packageId === owner) await nativeSessionRuntime.reload();
                await refreshNativeRegexScopes();
            },
        });
        onRuntimeConfigurationChanged(refreshNativeRegexScopes);
    }
    await refreshNativeRegexScopes();
}

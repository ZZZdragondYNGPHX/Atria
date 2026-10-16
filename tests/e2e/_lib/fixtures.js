// Shared helpers used by current product tests.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

import { resolve } from 'node:path';

function userRoot(dataRoot, handle = 'default-user') {
    return resolve(dataRoot, handle);
}

export function writeWorldBook({ dataRoot, handle = 'default-user', name = 'e2e-bryn-headland', entries = [] }) {
    const dir = resolve(userRoot(dataRoot, handle), 'worlds');
    mkdirSync(dir, { recursive: true });
    const indexed = {};
    entries.forEach((e, i) => {
        indexed[String(i)] = {
            ...structuredClone(e),
            uid: i,
            key: e.key || [],
            keysecondary: e.keysecondary || [],
            comment: e.comment || `entry ${i}`,
            content: e.content || '',
            constant: !!e.constant,
            selective: e.selective !== false,
            order: e.order ?? 100,
            position: e.position ?? 0,
            disable: !!e.disable,
            displayIndex: i,
            addMemo: true,
            group: '',
            groupOverride: false,
            groupWeight: 100,
            sticky: e.sticky ?? 0,
            cooldown: e.cooldown ?? 0,
            delay: e.delay ?? 0,
            stateConditions: Array.isArray(e.stateConditions) ? structuredClone(e.stateConditions) : [],
            stateConditionLogic: e.stateConditionLogic === 'any' ? 'any' : 'all',
            stateActivation: e.stateActivation === true,
            stateEvents: Array.isArray(e.stateEvents) ? structuredClone(e.stateEvents) : [],
            stateEventLogic: e.stateEventLogic === 'any' ? 'any' : 'all',
            requiredEntries: Array.isArray(e.requiredEntries) ? structuredClone(e.requiredEntries) : [],
            relatedEntries: Array.isArray(e.relatedEntries) ? structuredClone(e.relatedEntries) : [],
            mutualExclusionGroup: String(e.mutualExclusionGroup ?? ''),
            budgetTier: ['critical', 'scene', 'normal', 'optional'].includes(e.budgetTier) ? e.budgetTier : 'normal',
            compactContent: typeof e.compactContent === 'string' ? e.compactContent : '',
            probability: 100,
            depth: e.depth ?? 4,
            useProbability: true,
            role: null,
            vectorized: !!e.vectorized,
            excludeRecursion: !!e.excludeRecursion,
            preventRecursion: !!e.preventRecursion,
            delayUntilRecursion: !!e.delayUntilRecursion,
            scanDepth: null,
            caseSensitive: null,
            matchWholeWords: null,
            useGroupScoring: null,
            automationId: '',
        };
    });
    writeFileSync(resolve(dir, `${name}.json`), JSON.stringify({ entries: indexed }, null, 4));
    return name;
}

export function appendConnectionProfile({ dataRoot, handle = 'default-user', name = 'e2e-mock', baseURL, model = 'mock-gpt-4o', source = 'custom' }) {
    const settingsPath = resolve(userRoot(dataRoot, handle), 'settings.json');
    if (!existsSync(settingsPath)) {
        throw new Error(`settings.json not found at ${settingsPath} — start the server once before adding profiles`);
    }
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'));
    s.capabilitySettings = s.capabilitySettings || {};
    s.capabilitySettings.connectionManager = s.capabilitySettings.connectionManager || { profiles: [], selectedProfile: null };
    const profileId = `e2e-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const profile = {
        id: profileId,
        name,
        api: 'openai',
        mode: 'cc',
        preset: '',
        model,
        proxy: '',
        instruct: '',
        context: '',
        sysprompt: '',
        'sysprompt-state': false,
        'instruct-state': false,
        'tokenizer': '',
        'stop-strings': '',
        // CUSTOM source with explicit URL — no real key needed. For the
        // openai_responses source the profile-resolver reads overrides from
        // 'api-url' into responses_url (profile-resolver.js), so write that
        // key instead of 'custom-url'.
        'chat-completion-source': source,
        ...(source === 'openai_responses' ? { 'api-url': baseURL } : { 'custom-url': baseURL }),
    };
    s.capabilitySettings.connectionManager.profiles.push(profile);
    s.capabilitySettings.connectionManager.selectedProfile = profileId;
    writeFileSync(settingsPath, JSON.stringify(s, null, 4));
    return { profileId, name };
}

export function bootstrapCustomBackend({ dataRoot, handle = 'default-user', baseURL, model = 'mock-gpt-4o' }) {
    const settingsPath = resolve(userRoot(dataRoot, handle), 'settings.json');
    const s = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
    s.main_api = 'openai';
    s.firstRun = false;
    s.oai_settings = s.oai_settings || {};
    s.oai_settings.chat_completion_source = 'custom';
    s.oai_settings.custom_url = baseURL;
    s.oai_settings.custom_model = model;
    s.oai_settings.openai_model = model;
    s.oai_settings.stream_openai = true;
    // Wipe legacy fields the dev's settings.json may have left behind that
    // would otherwise reroute orchestrator/CPA/MG/CEA LLM calls via a real
    // provider URL. The mirrored values live under capabilitySettings
    // (snake_case) — the SPA reads from there at load.
    const ext = (s.capabilitySettings = s.capabilitySettings || {});
    for (const slot of ['orchestrator', 'completion_preset_assistant', 'memory_graph', 'character_editor_assistant']) {
        const m = (ext[slot] = ext[slot] || {});
        for (const key of [
            'llmNodeApiPresetName', 'llmNodePresetName',
            'requestApiPresetName', 'requestLlmPresetName',
            'schemaIterationApiPresetName', 'schemaIterationLlmPresetName',
            'iterationApiPresetName', 'iterationLlmPresetName',
            'recallApiPresetName', 'recallLlmPresetName',
            'extractApiPresetName', 'extractLlmPresetName',
        ]) {
            m[key] = '';
        }
    }
    // Clear the active connection profile so resolveProfile doesn't
    // override chat_completion_source/custom_url with a dev's "Claude"
    // / "Gemini" profile blob.
    ext.connectionManager = ext.connectionManager || { profiles: [], selectedProfile: null };
    ext.connectionManager.selectedProfile = null;
    writeFileSync(settingsPath, JSON.stringify(s, null, 4));
}

export function markOnboarded({ dataRoot, handle = 'default-user' }) {
    const settingsPath = resolve(userRoot(dataRoot, handle), 'settings.json');
    const s = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
    s.firstRun = false;
    writeFileSync(settingsPath, JSON.stringify(s, null, 4));
}

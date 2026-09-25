import { beforeAll, beforeEach, expect, jest, test } from '@jest/globals';

const settings = { regex: [], disabledPlugins: [] };
const execution = jest.fn();
jest.unstable_mockModule('../../public/script.js', () => ({ saveSettingsDebounced: jest.fn(), substituteParams: s => s, substituteParamsExtended: s => s }));
jest.unstable_mockModule('../../public/scripts/capability-host.js', () => ({ capabilitySettings: settings }));
jest.unstable_mockModule('../../public/scripts/i18n.js', () => ({ t: s => s }));
jest.unstable_mockModule('../../public/scripts/utils.js', () => ({ regexFromString: s => new RegExp(s, 'g') }));
jest.unstable_mockModule('../../public/scripts/extensions/regex/redos-reporter.js', () => ({
    isRegexScriptPaused: () => false, recordRegexExecution: execution, resetRegexScriptState: jest.fn(),
}));

let engine, runtime, presetOwner, presetRules, gameSave;
const rule = (findRegex, replaceString) => ({ id: 'shared-id', scriptName: 'Shared ID', findRegex, replaceString, placement: [1], trimStrings: [], substituteRegex: 0 });
const game = (id, scripts) => { runtime.snapshot = { session: { packageId: id }, manifest: { processors: { regex: scripts } } }; };

beforeAll(async () => {
    engine = await import('../../public/scripts/extensions/regex/engine.js');
    ({ nativeSessionRuntime: runtime } = await import('../../public/scripts/native/session-runtime.js'));
});
beforeEach(() => {
    settings.regex = [rule('A', 'B')];
    presetOwner = 'preset-a'; presetRules = [rule('B', 'C')];
    game('game-a', [rule('C', 'D')]);
    gameSave = jest.fn(async scripts => { runtime.snapshot.manifest.processors.regex = scripts; });
    engine.registerNativeRegexScope(engine.SCRIPT_TYPES.PRESET, {
        owner: () => presetOwner, get: () => presetRules, save: async scripts => { presetRules = scripts; },
    });
    engine.registerNativeRegexScope(engine.SCRIPT_TYPES.GAME, { save: gameSave });
    engine.invalidateRegexExecutionPlans(); execution.mockClear();
});

test('Global → Preset → Game executes identical IDs independently in scope order', () => {
    expect(engine.getRegexedString('A', 1)).toBe('D');
    const scripts = engine.getRegexScripts();
    expect(scripts.map(s => s.replaceString)).toEqual(['B', 'C', 'D']);
    expect(new Set(scripts.map(s => s.id)).size).toBe(3);
    expect(new Set(execution.mock.calls.map(([s]) => s.id)).size).toBe(3);
    expect(engine.getScriptsByType(engine.SCRIPT_TYPES.PRESET)[0].id).toBe('shared-id');
    expect(engine.getScriptsByType(engine.SCRIPT_TYPES.GAME)[0].id).toBe('shared-id');
});

test('switching and removing owners takes effect without stale static execution plans', () => {
    expect(engine.getRegexedString('A', 1)).toBe('D');
    const builds = engine.getRegexExecutionPlanStats().builds;
    presetOwner = 'preset-b'; presetRules = [rule('B', 'X')];
    game('game-b', [rule('X', 'Y')]);
    expect(engine.getRegexedString('A', 1)).toBe('Y');
    expect(engine.getRegexExecutionPlanStats().builds).toBe(builds);
    presetOwner = null; presetRules = []; runtime.snapshot = null;
    expect(engine.getRegexedString('A', 1)).toBe('B');
});

test('scope saves preserve Global and reject stale owner captures', async () => {
    const preset = engine.getScriptsByType(engine.SCRIPT_TYPES.PRESET);
    preset[0].replaceString = 'P';
    await engine.saveScriptsByType(preset, engine.SCRIPT_TYPES.PRESET, 'preset-a');
    expect(engine.getRegexedString('A', 1)).toBe('P');
    expect(settings.regex).toEqual([rule('A', 'B')]);
    const previousGame = engine.getScriptsByType(engine.SCRIPT_TYPES.GAME);
    presetOwner = 'preset-b';
    await expect(engine.saveScriptsByType(preset, engine.SCRIPT_TYPES.PRESET, 'preset-a')).rejects.toThrow('scope changed');
    await expect(engine.saveScriptsByType(preset, engine.SCRIPT_TYPES.PRESET)).rejects.toThrow('scope changed');
    game('game-b', [rule('P', 'Q')]);
    await expect(engine.saveScriptsByType(previousGame, engine.SCRIPT_TYPES.GAME)).rejects.toThrow('scope changed');
    expect(gameSave).not.toHaveBeenCalled();
    const current = engine.getScriptsByType(engine.SCRIPT_TYPES.GAME); current[0].replaceString = 'R';
    await engine.saveScriptsByType(current, engine.SCRIPT_TYPES.GAME, 'game-b');
    expect(gameSave).toHaveBeenCalledTimes(1);
    expect(settings.regex).toEqual([rule('A', 'B')]);
});

test('managed Plugin rules remain dynamic and separate from persisted scope editors', () => {
    const provider = engine.registerManagedRegexProvider('test-plugin');
    try {
        provider.upsertScript(rule('D', 'E'));
        expect(engine.getRegexedString('A', 1)).toBe('E');
        expect(engine.getRegexScripts().at(-1).__runtime_owner).toBe('test-plugin');
        for (const type of Object.values(engine.SCRIPT_TYPES)) expect(engine.getScriptsByType(type)).toHaveLength(1);
        provider.upsertScript(rule('D', 'F'));
        expect(engine.getRegexedString('A', 1)).toBe('F');
    } finally { provider.unregister(); }
});

/**
 * Regex execution-plan performance contract.
 *
 * The static plan must be reused while persisted state is unchanged, rebuilt
 * after a persisted save, and must never cache plain runtime-provider output.
 * Duplicate rules remain order-sensitive and are therefore diagnosed rather
 * than auto-deduplicated.
 */

import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../../public/script.js', () => ({
    characters: {},
    saveSettingsDebounced: jest.fn(),
    substituteParams: (s) => s,
    substituteParamsExtended: (s) => s,
    this_chid: null,
}));

const capabilitySettings = {
    disabledPlugins: [],
    regex: [],
};

jest.unstable_mockModule('../../public/scripts/capability-host.js', () => ({
    capabilitySettings: capabilitySettings,
}));

jest.unstable_mockModule('../../public/scripts/i18n.js', () => ({ t: (s) => s }));

const regexFromStringMock = jest.fn((input) => {
    if (typeof input !== 'string') return null;
    const match = input.match(/\/(.+)\/([gimsuy]*)/s);
    return match ? new RegExp(match[1], match[2]) : new RegExp(input);
});

jest.unstable_mockModule('../../public/scripts/utils.js', () => ({
    regexFromString: regexFromStringMock,
}));

jest.unstable_mockModule('../../public/scripts/extensions/regex/redos-reporter.js', () => ({
    isRegexScriptPaused: () => false,
    recordRegexExecution: () => {},
    resetRegexScriptState: () => {},
}));

let engine;
let nativeSessionRuntime;

function script(overrides = {}) {
    return {
        id: overrides.id || crypto.randomUUID(),
        scriptName: overrides.scriptName || 'rule',
        findRegex: '/A/g',
        replaceString: 'B',
        trimStrings: [],
        placement: [1],
        disabled: false,
        markdownOnly: false,
        promptOnly: false,
        pluginOnly: false,
        runOnEdit: false,
        minDepth: null,
        maxDepth: null,
        substituteRegex: 0,
        ...overrides,
    };
}

beforeAll(async () => {
    engine = await import('../../public/scripts/extensions/regex/engine.js');
    ({ nativeSessionRuntime } = await import('../../public/scripts/native/session-runtime.js'));
});

beforeEach(() => {
    capabilitySettings.regex = [];
    regexFromStringMock.mockClear();
    engine.RegexProvider.instance.clear();
    engine.invalidateRegexExecutionPlans();
    nativeSessionRuntime.snapshot = null;
});

describe('static regex execution plans', () => {
    test('builds once and reuses the static plan across repeated calls', () => {
        capabilitySettings.regex = [
            ...Array.from({ length: 250 }, (_, index) => script({
                id: `irrelevant-${index}`,
                scriptName: `irrelevant-${index}`,
                findRegex: '/NEVER/g',
                replaceString: 'x',
                placement: [2],
            })),
            script({ id: 'relevant', scriptName: 'relevant', findRegex: '/A/g', replaceString: 'B', placement: [1] }),
        ];
        engine.invalidateRegexExecutionPlans();
        const buildsBefore = engine.getRegexExecutionPlanStats().builds;

        expect(engine.getRegexedString('A', 1)).toBe('B');
        expect(engine.getRegexExecutionPlanStats().builds).toBe(buildsBefore + 1);

        expect(engine.getRegexedString('A', 1)).toBe('B');
        expect(engine.getRegexExecutionPlanStats().builds).toBe(buildsBefore + 1);
        // Only the relevant pattern reaches compilation on this placement.
        expect(regexFromStringMock).toHaveBeenCalledTimes(1);
    });

    test('grows compiled-regex capacity beyond the historical 1000-rule ceiling', () => {
        capabilitySettings.regex = Array.from({ length: 1200 }, (_, index) => script({
            id: `capacity-${index}`,
            scriptName: `capacity-${index}`,
            findRegex: `/P${index}/g`,
            placement: [2],
        }));
        engine.invalidateRegexExecutionPlans();

        // Building the active static plan is enough to reserve capacity even
        // though this particular placement has no executable candidates.
        expect(engine.getRegexedString('A', 1)).toBe('A');
        expect(engine.RegexProvider.instance.getStats().capacity).toBeGreaterThanOrEqual(1200);
    });

    test('persisted save invalidates the plan and the next execution rebuilds it', async () => {
        capabilitySettings.regex = [
            script({ id: 'first', findRegex: '/A/g', replaceString: 'B' }),
        ];
        engine.invalidateRegexExecutionPlans();
        expect(engine.getRegexedString('A', 1)).toBe('B');
        const buildsAfterFirstRun = engine.getRegexExecutionPlanStats().builds;

        await engine.saveScriptsByType([
            script({ id: 'second', findRegex: '/A/g', replaceString: 'C' }),
        ], engine.SCRIPT_TYPES.GLOBAL);

        expect(engine.getRegexedString('A', 1)).toBe('C');
        expect(engine.getRegexExecutionPlanStats().builds).toBe(buildsAfterFirstRun + 1);
    });

    test('active Native Package regex participates in the dynamic execution path', () => {
        nativeSessionRuntime.snapshot = {
            manifest: {
                processors: {
                    regex: [
                        script({
                            id: 'native-package-rule',
                            scriptName: 'native-package-rule',
                            findRegex: '/A/g',
                            replaceString: 'NATIVE',
                            placement: [1],
                        }),
                    ],
                },
            },
        };

        expect(engine.getRegexedString('A', 1)).toBe('NATIVE');
        expect(engine.getRegexScripts({ allowedOnly: true }).some(rule => rule.id === 'native-package-rule')).toBe(true);
    });

    test('plain runtime providers are evaluated on every call', () => {
        let replacement = 'one';
        const provider = jest.fn(() => [
            script({
                id: 'runtime-dynamic',
                scriptName: 'runtime-dynamic',
                findRegex: '/A/g',
                replaceString: replacement,
                placement: [1],
            }),
        ]);
        const registration = engine.registerRegexProvider('test-dynamic-provider', provider);
        try {
            expect(engine.getRegexedString('A', 1)).toBe('one');
            replacement = 'two';
            expect(engine.getRegexedString('A', 1)).toBe('two');
            expect(provider).toHaveBeenCalledTimes(2);
        } finally {
            registration?.unregister();
        }
    });

    test('static rules still execute before runtime-provider rules', () => {
        capabilitySettings.regex = [
            script({ id: 'static-a-b', findRegex: '/A/g', replaceString: 'B' }),
        ];
        engine.invalidateRegexExecutionPlans();
        const registration = engine.registerRegexProvider('test-order-provider', () => [
            script({ id: 'runtime-b-c', findRegex: '/B/g', replaceString: 'C' }),
        ]);
        try {
            expect(engine.getRegexedString('A', 1)).toBe('C');
        } finally {
            registration?.unregister();
        }
    });

    test('exact duplicate transforms are not auto-deduplicated', () => {
        capabilitySettings.regex = [
            script({ id: 'dup-1', findRegex: '/a/g', replaceString: 'aa' }),
            script({ id: 'dup-2', findRegex: '/a/g', replaceString: 'aa' }),
        ];
        engine.invalidateRegexExecutionPlans();

        // Sequential replacement is intentionally order-sensitive:
        // a -> aa -> aaaa.
        expect(engine.getRegexedString('a', 1)).toBe('aaaa');
    });
});

describe('regex duplicate/conflict diagnostics', () => {
    test('reports exact duplicates without changing execution semantics', () => {
        const rules = [
            script({ id: 'dup-a', scriptName: 'dup-a', findRegex: '/X/g', replaceString: 'Y' }),
            script({ id: 'dup-b', scriptName: 'dup-b', findRegex: '/X/g', replaceString: 'Y' }),
        ];
        const diagnostics = engine.getRegexScriptDiagnostics(rules);
        expect(diagnostics.duplicates).toHaveLength(1);
        expect(diagnostics.duplicates[0].scripts.map(x => x.id)).toEqual(['dup-a', 'dup-b']);
        expect(diagnostics.conflicts).toHaveLength(0);
    });

    test('reports overlapping same-pattern rules with different replacement behavior', () => {
        const rules = [
            script({ id: 'left', findRegex: '/X/g', replaceString: 'Y', placement: [1] }),
            script({ id: 'right', findRegex: '/X/g', replaceString: 'Z', placement: [1, 2] }),
        ];
        const diagnostics = engine.getRegexScriptDiagnostics(rules);
        expect(diagnostics.conflicts).toHaveLength(1);
        expect(diagnostics.conflicts[0].scripts.map(x => x.id)).toEqual(['left', 'right']);
    });

    test('does not flag same-pattern rules whose lanes cannot overlap', () => {
        const rules = [
            script({ id: 'chat', findRegex: '/X/g', replaceString: 'Y', placement: [1] }),
            script({ id: 'prompt', findRegex: '/X/g', replaceString: 'Z', placement: [1], promptOnly: true }),
        ];
        const diagnostics = engine.getRegexScriptDiagnostics(rules);
        expect(diagnostics.conflicts).toHaveLength(0);
    });

    test('does not flag same-pattern rules whose placements cannot overlap', () => {
        const rules = [
            script({ id: 'user', findRegex: '/X/g', replaceString: 'Y', placement: [1] }),
            script({ id: 'ai', findRegex: '/X/g', replaceString: 'Z', placement: [2] }),
        ];
        const diagnostics = engine.getRegexScriptDiagnostics(rules);
        expect(diagnostics.conflicts).toHaveLength(0);
    });
});

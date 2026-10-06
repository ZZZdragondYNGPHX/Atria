import { expect, jest, test } from '@jest/globals';

// A capture/adapter failure must survive as failed/incomplete evidence; the
// exporter must not drop a trial or fabricate a passed report.
jest.unstable_mockModule('./adapters.js', () => ({
    runRp: async () => { throw new Error('fixture capture failed'); },
    runProject: async () => { throw new Error('fixture serialization failed'); },
}));
const { runBaseline } = await import('./runner.js');

test('capture failures retain all 12 slots and restore process globals', async () => {
    const previousFetch = globalThis.fetch; const previousAtria = globalThis.Atria;
    const logs = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
        const { report } = await runBaseline();
        expect(report.trials).toHaveLength(12);
        expect(report.trials.every(trial => trial.executionStatus === 'failed' && trial.authorityStatus === 'unavailable' && trial.completeness.includes('adapter_execution'))).toBe(true);
        expect(report.summary).toMatchObject({ executedTrials: 0, deterministic: { passed: 0, unavailable: 44 } });
        expect(report.empiricalReady).toBe(false);
        expect(logs).toHaveBeenCalledTimes(12);
        expect(globalThis.fetch).toBe(previousFetch); expect(globalThis.Atria).toBe(previousAtria);
    } finally { logs.mockRestore(); }
});

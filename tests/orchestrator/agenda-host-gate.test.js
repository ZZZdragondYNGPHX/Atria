import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, jest, test } from '@jest/globals';
import { isAbortError, isAbortSignalLike, throwIfAborted, linkAbortSignals } from '../../public/scripts/lib/abort-utils.js';

// Execute the production event listener without booting unrelated DOM plugins.
// Only host services/model completion are replaced. The core continuation check
// is also loaded from source, so removing either half of the gate fails tests.
const main = readFileSync(new URL('../../public/scripts/extensions/orchestrator/main.js', import.meta.url), 'utf8');
const hook = main.slice(main.indexOf('async function onWorldInfoFinalized('), main.indexOf('async function onMessageDeleted('));
const core = readFileSync(new URL('../../public/script.js', import.meta.url), 'utf8');
const coreStart = core.indexOf('    await eventSource.emit(event_types.GENERATION_WORLD_INFO_FINALIZED, wiFinalizedPayload);');
const continuation = core.slice(coreStart, core.indexOf('    if (Array.isArray(wiFinalizedPayload.coreChat))', coreStart));

async function run({ enabled = true, stop = false, outcome = 'completed', error = null, reuse = false, text = 'guidance', stale = false } = {}) {
    const abort = new AbortController(), settings = { enabled }, statuses = [], prose = jest.fn(), notify = jest.fn();
    const payload = { signal: abort.signal, coreChat: [{ role: 'user', content: 'test' }] };
    const sandbox = {
        AbortController, structuredClone, console: { warn() {} }, MODULE_NAME: 'orchestrator',
        extension_settings: { orchestrator: settings }, ORCH_EXECUTION_MODE_AGENDA: 'agenda', ORCH_EXECUTION_MODE_DIRECTOR: 'director',
        isAbortError, isAbortSignalLike, throwIfAborted, linkAbortSignals,
        orchInFlight: false, activeOrchRunAbortController: null,
        getContext: () => ({}), getChatKey: () => 'chat', getSettings: () => settings,
        shouldRunOrchestrationForPayload: () => true, getEffectiveProfile: () => ({ mode: 'agenda' }),
        loadOrchestratorChatState: async () => {}, buildActivatedEntryKeysFromPayload: () => new Set(),
        currentExecutionConfig: () => 'config', digestExecutionConfig: async () => 'hash', buildLastUserAnchor: () => 'anchor',
        canReuseLatestOrchestrationSnapshot: () => reuse, getActiveSnapshot: () => ({ capsuleText: 'cached guidance' }),
        refreshActiveSnapshotFromCache() {}, clearCapsulePrompt() {}, updateUiStatus() {}, clearRunInfoToast() {}, ensureUi() {},
        showRunInfoToast() {}, emitOrchestratorResultEvent: async (_ctx, _payload, status) => statuses.push(status),
        runOrchestration: async (_ctx, request) => {
            if (stop) { request.__lukerResolveStopRequest(); throwIfAborted(request.signal); }
            if (error) throw error;
            return { status: outcome, stageOutputs: [] };
        },
        getOrchestrationOutcome: result => result.status, buildCapsule: () => text,
        storeCompletedOrchestrationSnapshot: async () => {}, injectCapsuleToPayload() {},
        i18n: text => text, i18nFormat: (key, arg) => key.replace('${0}', arg), notifyError: notify,
    };
    vm.createContext(sandbox);
    const listener = vm.runInContext(hook + '\nonWorldInfoFinalized', sandbox);
    Object.assign(sandbox, { wiFinalizedPayload: payload,
        abortController: stale ? new AbortController() : abort,
        eventSource: { emit: async () => listener(payload) }, event_types: { GENERATION_WORLD_INFO_FINALIZED: 'wi' },
        stopGeneration: () => abort.abort(), exitAbortedGenerationIfNeeded: () => abort.signal.aborted, prose,
    });
    await vm.runInContext(`(async () => { ${continuation}\nprose(); })()`, sandbox);
    return { payload, prose, notify, statuses, sandbox };
}

test.each(['Planner repair failed', 'Worker failed', 'Finalizer failed'])('%s blocks prose and unlocks orchestration', async message => {
    const result = await run({ error: new Error(message) });
    expect(result.prose).not.toHaveBeenCalled();
    expect(result.payload.generationBlocked.status).toBe('failed');
    expect(result.notify).toHaveBeenCalledTimes(1);
    expect(result.sandbox.orchInFlight).toBe(false);
});
test('manual cancellation blocks prose without a failure toast', async () => {
    const result = await run({ stop: true });
    expect(result.prose).not.toHaveBeenCalled(); expect(result.notify).not.toHaveBeenCalled();
    expect(result.statuses).toContain('cancelled');
});
test('cancelled runtime outcome remains cancellation', async () => {
    const result = await run({ outcome: 'cancelled' });
    expect(result.prose).not.toHaveBeenCalled(); expect(result.notify).not.toHaveBeenCalled();
});
test.each([{ enabled: false }, {}, { reuse: true }, { outcome: 'budget_exhausted' }])('disabled/success/reuse/budget-finalized prose remains available: %j', async options => {
    expect((await run(options)).prose).toHaveBeenCalledTimes(1);
});
test('empty final guidance cannot release the host gate', async () => {
    expect((await run({ text: '' })).prose).not.toHaveBeenCalled();
});
test('late failed generation does not cancel a newer request', async () => {
    const result = await run({ error: new Error('late failure'), stale: true });
    expect(result.prose).not.toHaveBeenCalled();
    expect(result.sandbox.abortController.signal.aborted).toBe(false);
});

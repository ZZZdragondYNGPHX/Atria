// @ts-nocheck

const SELF_PROFILING_STORAGE_KEY = 'atria.selfProfilingEnabled';
const SELF_PROFILING_SAMPLE_INTERVAL = 10;
const SELF_PROFILING_MAX_BUFFER_SIZE = 50000;
const SELF_PROFILING_STATE_KEY = '__atriaSelfProfilerState';

function startSelfProfilerAtEarliestPoint() {
    try {
        /** @type {any} */
        const globalAny = globalThis;

        if (localStorage.getItem(SELF_PROFILING_STORAGE_KEY) !== '1') {
            return;
        }

        const ProfilerCtor = globalAny.Profiler;
        if (typeof ProfilerCtor !== 'function') {
            return;
        }

        const profiler = new ProfilerCtor({
            sampleInterval: SELF_PROFILING_SAMPLE_INTERVAL,
            maxBufferSize: SELF_PROFILING_MAX_BUFFER_SIZE,
        });

        globalAny[SELF_PROFILING_STATE_KEY] = {
            profiler,
            sampleInterval: SELF_PROFILING_SAMPLE_INTERVAL,
            maxBufferSize: SELF_PROFILING_MAX_BUFFER_SIZE,
            bufferFull: false,
            startedAt: performance.now(),
            startedAtIso: new Date().toISOString(),
        };

        profiler.addEventListener('samplebufferfull', () => {
            const state = globalAny[SELF_PROFILING_STATE_KEY];
            if (state && typeof state === 'object') {
                state.bufferFull = true;
            }
        });
    } catch {
        // Ignore errors during earliest bootstrap path.
    }
}

startSelfProfilerAtEarliestPoint();

const PERF_ENABLED = (() => {
    try {
        const search = String(globalThis.location?.search || '');
        if (!search) {
            return false;
        }

        const params = new URLSearchParams(search);
        return params.get('atriaPerf') === '1' || params.get('atria_perf') === '1';
    } catch {
        return false;
    }
})();

/** @param {string} name */
function safePerfMark(name) {
    if (!PERF_ENABLED) {
        return;
    }

    try {
        performance?.mark?.(name);
    } catch {
        // Ignore unsupported mark calls.
    }
}

/** @param {string} name @param {string} startMark @param {string} endMark */
function safePerfMeasure(name, startMark, endMark) {
    if (!PERF_ENABLED) {
        return;
    }

    try {
        performance?.measure?.(name, startMark, endMark);
    } catch {
        // Ignore unsupported measure calls.
    }
}

async function initializeApplication() {
    safePerfMark('atria:init:start');

    try {
        safePerfMark('atria:init:import:lib:start');
        await import('./lib.js');
        safePerfMark('atria:init:import:lib:end');
        safePerfMeasure('atria:init:import:lib', 'atria:init:import:lib:start', 'atria:init:import:lib:end');

        safePerfMark('atria:init:import:app:start');
        await import('./script.js');
        safePerfMark('atria:init:import:app:end');
        safePerfMeasure('atria:init:import:app', 'atria:init:import:app:start', 'atria:init:import:app:end');
    } catch (error) {
        console.error('Failed to initialize Atria application:', error);
    } finally {
        safePerfMark('atria:init:end');
        safePerfMeasure('atria:init:total', 'atria:init:start', 'atria:init:end');
    }
}

initializeApplication();

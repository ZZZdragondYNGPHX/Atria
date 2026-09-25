import { cloneGameLlmValue } from './clone.js';

const clone = cloneGameLlmValue;

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return value;
}

export function buildOrchestratorTurnView(turnContext) {
    if (!turnContext || typeof turnContext !== 'object') {
        throw new Error('Orchestrator bridge requires Turn Context');
    }

    return deepFreeze({
        turnId: turnContext.turnId,
        anchor: clone(turnContext.anchor),
        userInput: turnContext.userInput,
        authoritative: {
            worldObservation: clone(turnContext.observation),
            committedEvents: clone(turnContext.committedEvents || []),
            commandResults: clone(turnContext.commandResults || []),
        },
        recentChat: clone(turnContext.recentChat || []),
        memories: (turnContext.memories || []).map(memory => ({
            ...clone(memory),
            authority: 'historical_context',
            authorityRank: 5,
        })),
        constraints: clone(turnContext.constraints || []),
        factPrecedence: clone(turnContext.authority?.precedence || []),
        provenance: clone(turnContext.provenance || {}),
        rules: {
            worldStateIsAuthoritative: true,
            committedEventsAreAuthoritative: true,
            memoryIsHistorical: true,
            guidanceIsAdvisory: true,
            mayWriteWorld: false,
            mayCommitEvents: false,
        },
    });
}

export function createGameOrchestratorBridge(options = {}) {
    const context = options.context
        || globalThis.Atria?.getContext?.()
        || null;
    const resolveApi = () => (
        options.orchestratorApi
        || context?.getCapabilityApi?.('orchestrator')
        || null
    );
    const getWorldState = options.getWorldState;
    const getJournal = options.getJournal;
    if (typeof getWorldState !== 'function' || typeof getJournal !== 'function') {
        throw new Error('Orchestrator bridge requires World/Journal readers');
    }

    function snapshotAuthority() {
        return {
            world: clone(getWorldState()),
            journal: clone(getJournal()),
        };
    }

    function assertAuthorityUnchanged(before) {
        if (JSON.stringify(getWorldState()) !== JSON.stringify(before.world)) {
            throw new Error('Orchestrator mutated World State');
        }
        if (JSON.stringify(getJournal()) !== JSON.stringify(before.journal)) {
            throw new Error('Orchestrator mutated Event Journal');
        }
    }

    return Object.freeze({
        getMode() {
            const api = resolveApi();
            return String(api?.getGameRuntimeMode?.(context) || '').trim().toLowerCase();
        },

        async runGuidance(turnContext, input = {}) {
            const mode = String(input.mode || '').trim().toLowerCase();
            if (!['spec', 'agenda', 'loop'].includes(mode)) {
                throw new Error(`Guidance mode '${mode}' is not advisory orchestration`);
            }
            const api = resolveApi();
            if (!api || typeof api.runGameGuidance !== 'function') {
                return Object.freeze({
                    status: 'unavailable',
                    mode,
                    guidance: null,
                });
            }

            const before = snapshotAuthority();
            const turnView = buildOrchestratorTurnView(turnContext);
            const result = await api.runGameGuidance({
                context,
                mode,
                turnContext: turnView,
                abortSignal: input.abortSignal,
            });
            assertAuthorityUnchanged(before);

            if (!result || result.status === 'disabled' || result.status === 'unavailable') {
                return Object.freeze({
                    status: result?.status || 'unavailable',
                    mode,
                    guidance: null,
                    trace: clone(result?.trace || null),
                });
            }

            const text = String(result.guidance ?? result.capsule ?? '').trim();
            if (!text) {
                return Object.freeze({
                    status: 'empty',
                    mode,
                    guidance: null,
                    trace: clone(result.trace || null),
                });
            }

            return Object.freeze({
                status: 'guided',
                mode,
                guidance: deepFreeze({
                    mode,
                    advisory: true,
                    authorityRank: 6,
                    turnId: turnContext.turnId,
                    anchor: clone(turnContext.anchor),
                    text,
                    stageOutputs: clone(result.stageOutputs || []),
                }),
                trace: clone(result.trace || null),
            });
        },

        async runDirector(turnContext, input = {}) {
            const api = resolveApi();
            if (!api || typeof api.runGameDirector !== 'function') {
                throw new Error('Director takeover is unavailable');
            }

            const before = snapshotAuthority();
            const turnView = buildOrchestratorTurnView(turnContext);
            const result = await api.runGameDirector({
                context,
                turnContext: turnView,
                narrativeContract: clone(input.contract || null),
                abortSignal: input.abortSignal,
            });
            assertAuthorityUnchanged(before);

            const finalProse = String(result?.finalProse || '').trim();
            if (!finalProse) {
                throw Object.assign(new Error('Director returned empty final prose'), {
                    code: 'validation_failed',
                });
            }

            return Object.freeze({
                status: 'final',
                producer: 'director',
                finalProse,
                guidance: result.guidance
                    ? deepFreeze({
                        ...clone(result.guidance),
                        mode: 'director',
                        advisory: true,
                        authorityRank: 6,
                    })
                    : null,
                trace: clone(result.trace || null),
                routing: clone(result.routing || null),
            });
        },
    });
}

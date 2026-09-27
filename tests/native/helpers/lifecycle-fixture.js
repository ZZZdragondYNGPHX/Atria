// Fresh mutable declarations for shared contract and Host lifecycle tests.
export function lifecycleFixture() {
    const empty = () => ({ type: 'object', properties: {}, required: [], additionalProperties: false });
    const text = () => ({ type: 'object', properties: { text: { type: 'string', maxLength: 256 } }, required: ['text'], additionalProperties: false });
    const appAction = () => ({ kind: 'app.command', domainId: 'notes', recordId: 'main', commandId: 'save', args: { text: 'ready' } });
    const taskAction = () => ({ kind: 'task', taskId: 'summarize', variantId: 'default', input: {} });
    return {
        taskRuntime: {
            schemaVersion: 1,
            slots: [{ id: 'structured', requiredCapabilities: [] }],
            tasks: [{
                id: 'summarize', bindingSlotId: 'structured', executionClass: 'background',
                inputSchema: empty(), context: ['input'], resultPolicy: { resultClass: 'presentation', sink: 'artifact' },
                variants: [{ id: 'default', prompt: { resourceId: 'pprog_' + 'a'.repeat(32), revision: 'r1' },
                    generation: { resourceId: 'genprof_' + 'b'.repeat(32), revision: 'r1' }, outputSchema: text(), requiredCapabilities: [] }],
            }],
        },
        lifecycleRuntime: {
            schemaVersion: 1,
            scopes: [{ id: 'session', kind: 'session' }],
            domains: [{
                id: 'notes', scopeId: 'session', schemaVersion: 1, recordSchema: text(), initial: { text: '' },
                commands: [{ id: 'save', argsSchema: text(), event: 'notes.saved', assign: { text: { formula: 'args.text' } } },
                    { id: 'finish', argsSchema: empty(), event: 'notes.finished', assign: { text: 'done' }, terminal: true }],
                retention: { maxItems: 32, maxLogicalBytes: 16384, terminalTtl: { clockId: 'world', ticks: 10 }, keepPinned: true, keepReferenced: true },
            }],
            clocks: [{ id: 'world', unit: 'turn', initialTick: 0 }],
            advances: [{ id: 'advance', clockId: 'world', maxTicks: 8 }],
            interactions: [],
            automations: [{ id: 'on-ready', scopeId: 'session', trigger: { kind: 'experience.ready' }, action: appAction(), maxCatchUp: 1 }],
            workflows: [{
                id: 'onboarding', scopeId: 'session', initial: 'start',
                nodes: [{ id: 'start', kind: 'user_gate' }, { id: 'write', kind: 'action', action: appAction() },
                    { id: 'summary', kind: 'model_task', action: taskAction() },
                    { id: 'pause', kind: 'wait_until', wait: { clockId: 'world', tick: 5 } }, { id: 'done', kind: 'terminal' }],
                transitions: [{ id: 'begin', from: 'start', to: 'write' }, { id: 'summarize', from: 'write', to: 'summary' },
                    { id: 'wait', from: 'summary', to: 'pause' }, { id: 'finish', from: 'pause', to: 'done' }],
            }],
            retention: { maxTaskResults: 32, maxReceipts: 256 },
        },
    };
}

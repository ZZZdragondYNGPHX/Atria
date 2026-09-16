export function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

export function fakePorts(decisions = [{ type: 'complete', output: 'done' }]) {
    const calls = { model: [], tool: [], memory: [] };
    let fresh = true;
    const ports = {
        model: { async request(request) {
            calls.model.push(request);
            if (!decisions.length) throw new Error('Fake model exhausted');
            const next = decisions.shift();
            return typeof next === 'function' ? next(request) : next;
        } },
        tool: { async execute(request) {
            calls.tool.push(request);
            return { ok: true, value: 'tool-result' };
        } },
        memory: { async recall(request) {
            calls.memory.push(request);
            return { content: 'private-recall-text', references: [{ id: 'fact-1', revision: 1 }], assertCurrent() {
                if (!fresh) throw new Error('Stale memory');
            } };
        } },
    };
    return { ports, calls, invalidate() { fresh = false; } };
}

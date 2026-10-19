import { AsyncLocalStorage } from 'node:async_hooks';

// Original Model/Prompt write authority. Plan publication shares this lock
// with dependency deletion; no separate orchestration resource-lock service.
const writes = new Map();
const active = new AsyncLocalStorage();

export async function withRuntimeWrite(handle, operation) {
    const current = active.getStore();
    if (current?.open && current.handle === handle) return operation();
    const next = (writes.get(handle) || Promise.resolve()).catch(() => {}).then(async () => {
        const scope = { handle, open: true };
        try { return await active.run(scope, operation); } finally { scope.open = false; }
    });
    writes.set(handle, next);
    try { return await next; } finally { if (writes.get(handle) === next) writes.delete(handle); }
}

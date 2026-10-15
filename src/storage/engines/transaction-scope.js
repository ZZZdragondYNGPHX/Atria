import { AsyncLocalStorage } from 'node:async_hooks';

/** Compose repositories inside one commit. Detached work cannot reuse a
 * transaction after its original callback has returned. */
export class TransactionScope {
    constructor() { this.context = new AsyncLocalStorage(); }
    get(handle) { const value = this.context.getStore(); return value?.open && value.handle === handle ? value.tx : null; }
    run(handle, tx, operation) {
        const value = { handle, tx, open: true };
        return this.context.run(value, async () => { try { return await operation(); } finally { value.open = false; } });
    }
}

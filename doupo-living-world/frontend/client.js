// Only the native, component-scoped Bridge is available here. These helpers
// never retry/rebase writes and never turn an Action receipt into world state.
export const put = (c, key, value) => c.set('component.' + key, value);

export function ok(receipt) {
    if (!receipt?.ok) {
        const error = new Error(receipt?.error?.code || 'bridge_request_failed');
        error.code = receipt?.error?.code || 'bridge_request_failed';
        throw error;
    }
    return receipt.data;
}

export async function page(c, id, input = {}, cursor = null) {
    return c.bridge.page(id, input, cursor ? { cursor } : {});
}

export async function read(c, id, input = {}) {
    return ok(id === 'saves' ? await page(c, id, input) : await c.bridge.snapshot(id, input));
}

// Keep the caller's exact revision and key for result observation or an
// explicitly authorised same-request retry. The returned value is a Receipt.
export async function action(c, binding, input, revision, key) {
    if (!revision || !key) throw new Error('bridge_write_identity_required');
    return c.bridge.invoke(binding, input, { revision, idempotencyKey: key });
}

export async function focus(c, id) {
    try {
        await c.scheduler.frame();
        await c.node(id, 'focus');
    } catch {
        // A view/epoch replacement can dispose this NodeRef before the frame.
    }
}

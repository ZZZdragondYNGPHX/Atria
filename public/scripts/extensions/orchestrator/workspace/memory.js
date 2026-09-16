/** Mount existing Memory services with a Workspace-owned view lifetime. */
export function createMemoryWorkspace({ getContext }) {
    return function renderMemory(parent, { el, button, detail, getView }) {
        const controller = new AbortController();
        const container = el('section', undefined, parent);
        const status = el('p', '', container); status.setAttribute('role', 'status');
        const load = button(container, 'Knowledge · Sources · Build & Maintenance', async () => {
            load.disabled = true;
            try {
                const context = getContext();
                const service = context.getExtensionApi?.('memory-graph')?.getWorkspacePorts?.(context);
                if (!service) throw new Error('Memory OS is not available in this host.');
                await service.mountKnowledge(container, controller.signal, (record, inspector) => {
                    detail(inspector, 'Used this run by', getView().memoryUsers(record.id));
                });
            } catch (error) { if (!controller.signal.aborted) status.textContent = error.message; } finally { load.disabled = false; }
        });
        return () => controller.abort();
    };
}

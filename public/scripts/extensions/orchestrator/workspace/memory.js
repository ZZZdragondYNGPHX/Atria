/** Mount existing Memory services with a Workspace-owned view lifetime. */
export function createMemoryWorkspace({ getContext }) {
    return function renderMemory(parent, { el, button, detail, getView }) {
        const controller = new AbortController();
        const container = el('section', undefined, parent);
        const status = el('p', '', container); status.setAttribute('role', 'status');
        const context = getContext();
        const service = context.getExtensionApi?.('memory-graph')?.getWorkspacePorts?.(context);
        let disposeSettings = () => {};

        if (!service) {
            status.textContent = 'Memory OS is not available in this host.';
            return () => controller.abort();
        }

        if (typeof service.mountSettings === 'function') {
            disposeSettings = service.mountSettings(container) || (() => {});
        }

        const knowledge = el('section', undefined, container);
        const load = button(knowledge, 'Knowledge · Sources · Build & Maintenance', async () => {
            load.disabled = true;
            try {
                await service.mountKnowledge(knowledge, controller.signal, (record, inspector) => {
                    detail(inspector, 'Used this run by', getView().memoryUsers(record.id));
                });
            } catch (error) {
                if (!controller.signal.aborted) status.textContent = error.message;
            } finally {
                load.disabled = false;
            }
        });

        return () => {
            controller.abort();
            disposeSettings?.();
        };
    };
}

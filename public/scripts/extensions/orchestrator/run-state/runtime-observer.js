import { getCurrentRun, recordRuntimeEvent } from './store.js';

/** Bind one Runtime to one presentation run; a chat change can never rebind its late events. */
export function createRuntimeObserver({ panelRunId = null, getPanelRunId, onEvent } = {}) {
    let bound = panelRunId;
    const buffered = [];
    return event => {
        if (!bound) {
            bound = getPanelRunId?.() || null;
            const current = getCurrentRun();
            if (!bound && current && (event.runId === current.runId || event.runId.startsWith(current.runId + '/'))) bound = current.runId;
        }
        if (bound) {
            for (const pending of buffered.splice(0)) recordRuntimeEvent({ runId: bound, event: pending });
            recordRuntimeEvent({ runId: bound, event });
        } else if (getPanelRunId) buffered.push(event);
        return onEvent?.(event);
    };
}

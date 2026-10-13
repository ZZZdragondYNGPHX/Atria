import { runtimeRequest } from './runtime-client.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function mountProtocolControls({ document: doc, container, runtime, signal, request = runtimeRequest }) {
    const root = doc.createElement('section'); root.className = 'atri-runtime-group';
    const title = doc.createElement('h3'); title.textContent = tl('External services');
    const content = doc.createElement('select'), service = doc.createElement('select'), saved = doc.createElement('select');
    const load = doc.createElement('button'), run = doc.createElement('button'), reconnect = doc.createElement('button'), cancel = doc.createElement('button');
    const status = doc.createElement('output'), result = doc.createElement('pre'); result.style.whiteSpace = 'pre-wrap'; result.style.overflowWrap = 'anywhere';
    const label = (text, input) => { const node = doc.createElement('label'); node.textContent = tl(text); node.append(input); return node; };
    for (const [button, text] of [[load, 'Load services'], [run, 'Run service'], [reconnect, 'Reconnect'], [cancel, 'Cancel']]) { button.type = 'button'; button.textContent = tl(text); button.style.minHeight = '44px'; }
    content.setAttribute('aria-label', tl('Public content')); service.setAttribute('aria-label', tl('Service'));
    saved.setAttribute('aria-label', tl('Saved remote tasks'));
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    root.append(title, label('Public content', content), label('Service', service), label('Saved remote tasks', saved), load, run, reconnect, cancel, status, result); container.append(root);
    let data = null, operation = null, controller = null;
    const post = (path, body, taskSignal) => request(path, { method: 'POST', body, signal: taskSignal });
    const current = () => {
        const snapshot = runtime()?.snapshot;
        if (signal?.aborted || !root.isConnected || !snapshot || runtime().history) throw new Error('native_protocol_source_unavailable');
        if (data && (data.sessionId !== snapshot.session.sessionId || data.revisionId !== snapshot.revision.revisionId)) throw new Error('native_protocol_source_stale');
        return { sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId };
    };
    const buttons = () => {
        load.disabled = Boolean(controller); run.disabled = Boolean(controller) || !data?.items.length || !data?.services.length;
        reconnect.disabled = Boolean(controller) || operation?.protocol !== 'a2a' && !data?.tasks?.length; cancel.disabled = !operation;
    };
    const body = () => operation.protocol === 'a2a' ? { operationId: operation.id, sessionId: operation.sessionId } : { operationId: operation.id };
    const error = () => { status.textContent = tl('External service unavailable. Reload the public content and check the connection.'); };
    async function wait(started, selected, taskSignal) {
        operation = { id: started.operationId, protocol: selected.protocol, sessionId: data.sessionId }; buttons();
        while (true) {
            taskSignal.throwIfAborted(); current();
            const value = await post('/' + selected.protocol + '/status', body(), taskSignal); current();
            if (value.status === 'completed' && value.current && value.artifact) { result.textContent = JSON.stringify(value.artifact.result, null, 2); status.textContent = tl('External result'); return; }
            if (['failed', 'stale', 'cancelled', 'interrupted'].includes(value.status)) throw new Error('native_protocol_failed');
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }
    async function execute(action) {
        if (controller) return; const capture = new AbortController(); controller = capture; buttons();
        try {
            if (action === 'load') data = null;
            current(); status.textContent = tl('Loading…');
            if (action === 'load') {
                data = null; data = await post('/protocols/describe', current(), capture.signal); current();
                for (const [select, values] of [[content, data.items], [service, data.services], [saved, data.tasks ?? []]]) {
                    select.replaceChildren(); values.forEach((value, index) => { const option = doc.createElement('option'); option.value = String(index); option.textContent = value.label; select.append(option); });
                }
                status.textContent = data.services.length ? '' : tl('No configured external services');
            } else {
                if (action === 'reconnect' && saved.value && data.tasks?.[Number(saved.value)]) { const task = data.tasks[Number(saved.value)]; operation = { id: task.operationId, protocol: 'a2a', sessionId: task.sessionId }; }
                const selected = action === 'run' ? data.services[Number(service.value)] : operation;
                const started = action === 'run' ? await post('/' + selected.protocol + '/start', { ...current(), viewId: data.items[Number(content.value)].viewId, itemId: data.items[Number(content.value)].itemId,
                    ...(selected.toolName ? { toolName: selected.toolName } : {}), ...(selected.resourceUri ? { resourceUri: selected.resourceUri } : {}),
                    ...(selected.skillId ? { skillId: selected.skillId } : {}), routeRef: data.routeRef }, capture.signal)
                    : await post('/a2a/reconnect', body(), capture.signal);
                capture.signal.throwIfAborted(); current();
                if (!started.operationId) throw new Error('native_protocol_not_configured');
                await wait(started, selected, capture.signal);
            }
        } catch { if (!capture.signal.aborted && root.isConnected) error(); } finally { if (controller === capture) controller = null; buttons(); }
    }
    load.onclick = () => { operation = null; result.textContent = ''; void execute('load'); };
    run.onclick = () => { result.textContent = ''; void execute('run'); };
    reconnect.onclick = () => { void execute('reconnect'); };
    cancel.onclick = async () => {
        const pending = operation; if (!pending) return;
        controller?.abort(); const cancellation = new AbortController(); controller = cancellation; buttons(); cancel.disabled = true;
        status.textContent = tl('Cancellation requested');
        try {
            const stopped = await post('/' + pending.protocol + '/cancel', body(), cancellation.signal);
            if (stopped.operationId) await wait(stopped, pending, cancellation.signal);
        } catch { if (!cancellation.signal.aborted) error(); } finally { if (controller === cancellation) controller = null; buttons(); }
    };
    const abort = () => { controller?.abort(); }; signal?.addEventListener('abort', abort, { once: true }); buttons();
    return { dispose() { abort(); signal?.removeEventListener('abort', abort); root.remove(); } };
}

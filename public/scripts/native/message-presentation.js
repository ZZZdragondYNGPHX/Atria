import { assertMessageProjection, assertConversationThread } from '../../shared/native-message-contract.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { mountUiDocument } from './experience/ui/v2-runtime.js';
import { validateMessageBlocks } from './experience/ui/message-templates.js';
import { json } from './experience/ui/v2-values.js';

const localAction = action => action.steps.every(step => step.op.startsWith('ui.'));
const actionKey = (anchor, blockId, actionId) => [anchor.variantId, blockId, actionId].join(':');

// Orchestrates existing v2 components and the Host's canonical prose formatter.
// No new message renderer, history store, live World binding or model receipt.
export function mountMessageProjection(definition, { content, projection, anchor, root, ...options }) {
    const doc = root.ownerDocument;
    const validated = assertMessageProjection(projection, content);
    validateMessageBlocks(definition, validated);
    const flow = doc.createElement('div'); flow.className = 'atri-message-flow';
    const blocks = new Map(); const statusNodes = new Map(); let disposed = false;
    const nodeBudget = { nodes: 0, limit: 2048 };
    function receipt(status, error) {
        options.onRenderReceipt?.(Object.freeze({ kind: 'render', status, ...anchor,
            ...(error ? { error: String(error.message || error) } : {}) }));
    }
    function consumed(blockId, actionId) {
        const key = actionKey(anchor, blockId, actionId);
        return options.worldSession?.getActionReceipts?.().some(item => item.idempotencyKey === key) === true;
    }
    try {
        for (const item of validated.flow) {
            if (item.kind === 'prose') {
                const prose = doc.createElement('div'); prose.className = 'atri-message-prose';
                if (options.renderProse) options.renderProse(item.text, prose); else prose.textContent = item.text;
                flow.append(prose); continue;
            }
            const template = definition.messageBlocks[item.type];
            const container = doc.createElement('section'); container.className = 'atri-message-block atri-ui-document';
            container.dataset.blockId = item.id;
            if (template.attachmentKind) container.dataset.attachmentKind = template.attachmentKind;
            const status = doc.createElement('p'); status.className = 'atri-message-action-status'; status.setAttribute('role', 'status');
            statusNodes.set(item.id, status);
            const runtime = mountUiDocument(template.document, {
                ...options, nodeBudget, document: doc, instanceId: anchor.variantId + '-' + item.id,
                environmentRoot: container, selectors: undefined,
                presentationContext: { block: json(item.data), message: json({ role: anchor.role, messageId: anchor.messageId }) },
                // State/receipts use the existing Host adapters. Only mount-local
                // drafts plus declared preferences are visible to this template.
                stateStorage: options.createMessageStateStorage?.(template.document, item.type),
                actionKey: id => actionKey(anchor, item.id, id),
                actionDisabled: (id, action, resuming) => !localAction(action) && ((!resuming && consumed(item.id, id))
                    || options.isBusy?.() || (!options.isActiveTail?.(anchor) && (template.actionPolicy !== 'fork-from-anchor' || options.allowFork === false))),
                async beforeAction(id, action, extra, controls) {
                    if (localAction(action)) return;
                    if (options.isBusy?.()) throw new Error(tl('Finish the current operation first.'));
                    if (!controls.resuming && consumed(item.id, id)) return { handled: true, result: { status: 'completed', replayed: true } };
                    if (options.isActiveTail?.(anchor)) return;
                    if (template.actionPolicy !== 'fork-from-anchor' || options.allowFork === false) throw new Error(tl('Historical message actions are read-only.'));
                    const before = options.getSnapshot?.();
                    const revisionId = before?.revision?.revisionId;
                    if (!await controls.confirm(tl('Fork from this message and perform the action?'))) return { handled: true, result: { status: 'cancelled' } };
                    if (disposed || options.getSnapshot?.()?.revision?.revisionId !== revisionId) throw new Error(tl('The conversation changed. Try again.'));
                    if (!options.onForkAction) throw new Error(tl('Historical message actions are read-only.'));
                    const result = await options.onForkAction(anchor, item.id, id, controls.state.ui, extra);
                    return { handled: true, result };
                },
                surfaceHost: { mount() {
                    const node = doc.createElement('div'); container.append(node);
                    return { container: node, unmount() { node.remove(); } };
                } },
            });
            blocks.set(item.id, runtime); container.append(status); flow.append(container);
        }
        root.append(flow); receipt('rendered');
    } catch (error) {
        for (const runtime of blocks.values()) runtime.dispose(); flow.remove(); receipt('failed', error); throw error;
    }
    function refresh() {
        if (disposed) return;
        for (const item of validated.flow.filter(item => item.kind === 'block')) {
            blocks.get(item.id).refresh();
            const template = definition.messageBlocks[item.type];
            const completed = Object.keys(template.document.actions).some(id => consumed(item.id, id));
            const status = statusNodes.get(item.id);
            const text = completed ? tl('Action completed') : !options.isActiveTail?.(anchor) ? tl('Historical message') : '';
            if (status.textContent !== text) status.textContent = text;
            status.hidden = !text;
        }
    }
    refresh();
    return Object.freeze({ root: flow, refresh,
        execute(blockId, id, state = {}, extra = {}) {
            if (disposed) throw new Error('Message projection disposed');
            const runtime = blocks.get(blockId);
            if (!runtime) throw new Error('Message block unavailable');
            for (const [key, value] of Object.entries(state)) runtime.state.set('ui.' + key, value);
            return runtime.execute(id, extra);
        },
        dispose() { if (disposed) return; disposed = true; for (const runtime of blocks.values()) runtime.dispose(); flow.remove(); },
    });
}

// Operates the already-owned Native Conversation DOM, including host pagination.
// Render receipts remain bounded mount diagnostics and never touch SessionState.
export function mountConversationPresentation(definition, options) {
    const doc = options.document; const chat = options.conversationRoot || doc.getElementById('chat');
    if (!chat) return null;
    const records = new Map(); const receipts = new Map(); let disposed = false; let queued = false;
    let mode = definition.conversation?.mode || 'feed'; let profile = definition.conversation?.profile || 'default';
    const toolbar = doc.createElement('div'); toolbar.className = 'atri-conversation-presentation atri-ui-document';
    toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', tl('Conversation presentation'));
    function select(label, values, current, change) {
        const wrapper = doc.createElement('label'); wrapper.textContent = tl(label);
        const input = doc.createElement('select'); input.setAttribute('aria-label', tl(label));
        for (const [value, title] of values) { const option = doc.createElement('option'); option.value = value; option.textContent = tl(title); input.append(option); }
        input.value = current; input.addEventListener('change', () => change(input.value)); wrapper.append(input); toolbar.append(wrapper); return input;
    }
    const modeSelect = select('Conversation view', [['feed', 'Feed'], ['latest', 'Latest reply'], ['reader', 'Reader']], mode, value => { mode = value; refresh(); });
    select('Narrative style', [['default', 'Default'], ['novel', 'Novel'], ['dialogue', 'Dialogue']], profile, value => { profile = value; refresh(); });
    chat.prepend(toolbar);
    const previousMode = chat.getAttribute('data-atri-conversation'); const previousProfile = chat.getAttribute('data-atri-narrative');
    function release(record) {
        record.projection?.dispose(); record.reply?.dispose?.();
        if (record.text && record.original && record.text.childNodes.length === 0) record.text.append(...record.original);
        record.element.hidden = record.hidden;
    }
    function remember(receipt) {
        receipts.delete(receipt.variantId); receipts.set(receipt.variantId, receipt);
        if (receipts.size > 256) receipts.delete(receipts.keys().next().value);
        options.onRenderReceipt?.(receipt);
    }
    function refresh() {
        if (disposed) return;
        const snapshot = options.getSnapshot?.();
        if (!snapshot) return;
        chat.dataset.atriConversation = mode; chat.dataset.atriNarrative = profile;
        const variants = new Map(snapshot.variants.map(item => [item.variantId, item]));
        const elements = [...chat.querySelectorAll('.mes[mesid]')]; const seen = new Set();
        for (const element of elements) {
            const index = Number(element.getAttribute('mesid')); const entry = snapshot.timeline[index];
            // Streaming drafts stay visible and never receive committed blocks.
            if (!entry) continue;
            seen.add(element);
            const variant = variants.get(entry.activeVariantId); const text = element.querySelector('.mes_text');
            let record = records.get(element);
            if (record && (record.variantId !== variant?.variantId || record.text !== text
                || (record.projection && record.projection.root.parentNode !== text))) {
                release(record); records.delete(element); record = null;
            }
            if (!record) {
                record = { element, text, variantId: variant?.variantId, hidden: element.hidden }; records.set(element, record);
                const anchor = { sessionId: snapshot.session.sessionId, branchId: snapshot.revision.branchId,
                    viewRevisionId: snapshot.revision.revisionId, messageId: entry.messageId, variantId: entry.activeVariantId, role: entry.role };
                if (variant?.projection && text) {
                    record.original = [...text.childNodes]; text.replaceChildren();
                    try {
                        record.projection = mountMessageProjection(definition, { ...options, root: text, anchor,
                            content: variant.content, projection: variant.projection,
                            renderProse: (value, node) => options.renderProse ? options.renderProse(value, node, index) : (node.textContent = value),
                            onRenderReceipt: remember });
                    } catch (error) {
                        text.replaceChildren(...record.original); record.original = null;
                        const alert = doc.createElement('p'); alert.className = 'atri-ui-feedback'; alert.setAttribute('role', 'alert');
                        alert.textContent = tl('Message presentation failed. Canonical text is preserved.'); text.append(alert);
                        options.onDiagnostic?.({ kind: 'render', status: 'failed', message: error.message });
                    }
                }
                if (entry.role === 'assistant') record.reply = options.mountReplyVariants?.(element, anchor);
            }
            record.projection?.refresh();
            element.hidden = record.hidden || (mode === 'latest' && index < snapshot.timeline.length - 2);
        }
        for (const [element, record] of records) if (!seen.has(element)) { release(record); records.delete(element); }
    }
    const Observer = options.window?.MutationObserver || globalThis.MutationObserver;
    const observer = Observer ? new Observer(() => {
        if (queued || disposed) return; queued = true;
        queueMicrotask(() => { queued = false; if (!disposed) refresh(); });
    }) : null;
    refresh(); observer?.observe(chat, { childList: true, subtree: true });
    return Object.freeze({ refresh, getRenderReceipts: () => [...receipts.values()],
        execute(anchor, blockId, actionId, state, extra) {
            refresh();
            const record = [...records.values()].find(item => item.variantId === anchor.variantId);
            if (!record?.projection) throw new Error('Message projection is not mounted');
            return record.projection.execute(blockId, actionId, state, extra);
        },
        showAll() { mode = 'feed'; modeSelect.value = mode; refresh(); },
        dispose() {
            if (disposed) return; disposed = true; observer?.disconnect();
            for (const record of records.values()) release(record); records.clear(); receipts.clear(); toolbar.remove();
            for (const [name, value] of [['data-atri-conversation', previousMode], ['data-atri-narrative', previousProfile]]) {
                if (value === null) chat.removeAttribute(name); else chat.setAttribute(name, value);
            }
        },
    });
}

/** Read-only scoped thread view. The Host supplies an already-authorized snapshot.
 * P4/P6 own mutation/context/perspective; a thread never pretends to be Timeline.
 */
export function mountConversationThread(definition, snapshot, { root, ...options }) {
    const thread = assertConversationThread(snapshot); const doc = root.ownerDocument;
    const container = doc.createElement('section'); container.className = 'atri-conversation-thread';
    container.dataset.atriThread = thread.threadId;
    container.setAttribute('aria-label', tl('Scoped conversation'));
    const participants = new Map(thread.participants.map(item => [item.id, item.label]));
    const views = []; let shown = 0; let disposed = false;
    const more = doc.createElement('button'); more.type = 'button'; more.className = 'atri-library-button'; more.textContent = tl('Show more messages');
    function renderMore() {
        const end = Math.min(shown + 50, thread.messages.length);
        for (const message of thread.messages.slice(shown, end)) {
            const article = doc.createElement('article'); article.className = 'atri-thread-message';
            const header = doc.createElement('h4'); header.textContent = participants.get(message.participantId); article.append(header);
            const body = doc.createElement('div'); article.append(body);
            const view = mountMessageProjection(definition, { ...options, root: body, content: message.content,
                projection: message.projection ?? { schemaVersion: 1, flow: [{ kind: 'prose', text: message.content }] },
                anchor: { threadId: thread.threadId, messageId: message.id, variantId: thread.threadId + '-' + message.id, role: 'participant' },
                worldSession: undefined, composer: undefined, onForkAction: undefined, allowFork: false, isActiveTail: () => false });
            views.push(view); container.insertBefore(article, more);
        }
        shown = end; more.hidden = shown >= thread.messages.length;
    }
    container.append(more);
    if (!thread.messages.length) { const empty = doc.createElement('p'); empty.textContent = tl('No messages in this thread.'); container.prepend(empty); }
    try { renderMore(); root.append(container); } catch (error) { views.forEach(view => view.dispose()); container.remove(); throw error; }
    const showMore = () => {
        try { renderMore(); } catch (error) {
            more.disabled = true; const alert = doc.createElement('p'); alert.setAttribute('role', 'alert');
            alert.textContent = tl('Message presentation failed. Canonical text is preserved.'); container.append(alert);
            options.onDiagnostic?.({ kind: 'render', status: 'failed', message: error.message });
        }
    };
    more.addEventListener('click', showMore);
    return Object.freeze({ refresh() { if (!disposed) views.forEach(view => view.refresh()); },
        dispose() { if (disposed) return; disposed = true; more.removeEventListener('click', showMore); views.forEach(view => view.dispose()); container.remove(); } });
}

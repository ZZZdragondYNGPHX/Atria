// Exact Source selectors for Binding and Run lists. IDs come from the original
// Session, Studio and RpRunControl authorities; nothing is inferred from names.
import { formatShellText as fmt, translateShellText as tl } from '../../atria-shell/localization.js';
import { nativeProductClient } from '../product-client.js';
import { nativeStudioClient } from '../studio-client.js';
import { bindRpChatSource } from './client.js';
import { describeError, shortId } from './ledger.js';
import { el, field, select } from './dom.js';

export function sourceLabel(selector) {
    if (!selector) return tl('No source');
    if (selector.domain === 'native_session') return fmt('Session ${0}', [shortId(selector.sessionId)]);
    if (selector.domain === 'project') return selector.taskId ? fmt('Project ${0}, task ${1}', [shortId(selector.projectId), shortId(selector.taskId)]) : fmt('Project ${0}', [shortId(selector.projectId)]);
    if (selector.domain === 'rp_chat') return fmt('Chat ${0}', [shortId(selector.controlId)]);
    return tl('Unknown source');
}

/** The open legacy chat's exact locator; null when no chat is open. */
function currentChatLocator() {
    const context = globalThis.Atria?.getContext?.() ?? globalThis.SillyTavern?.getContext?.();
    const name = String(context?.chatId || context?.getCurrentChatId?.() || '');
    if (!name) return null;
    if (context.groupId) return { charDir: null, name, isGroup: true, groupId: String(context.groupId) };
    const avatar = String(context.characters?.[context.characterId]?.avatar || '');
    return avatar ? { charDir: avatar.replace(/\.png$/i, ''), name, isGroup: false, groupId: null } : null;
}

export function createSourcePicker(doc, { client, signal, onChange = () => {}, initial = null }) {
    const element = el(doc, 'div', 'atria-orch-source');
    const domain = select(doc, [['', tl('Choose a source type')], ['native_session', tl('Native Session')], ['project', tl('Studio Project task')], ['rp_chat', tl('Chat')]], { value: initial?.domain ?? '' });
    field(doc, tl('Source type'), domain, { parent: element, key: 'source.domain' });
    const detail = el(doc, 'div', 'atria-orch-source__detail', null, element);
    const status = el(doc, 'p', 'atria-field__hint', null, element);
    status.setAttribute('role', 'status');
    let value = null;
    const emit = (next, meta = {}) => { value = next; onChange(next, meta); };

    async function renderSessions() {
        status.textContent = tl('Reading Sessions…');
        let sessions = [];
        try { sessions = await nativeProductClient.listSessions(); status.textContent = ''; } catch (error) { status.textContent = describeError(error); return; }
        if (!sessions.length) { status.textContent = tl('No Native Sessions yet. Start one from Library.'); return; }
        const choose = select(doc, [['', tl('Choose a Session')], ...sessions.map(item => [item.sessionId, fmt('${0} · ${1}', [item.displayTitle || item.title || shortId(item.sessionId), shortId(item.sessionId)])])],
            { value: initial?.sessionId ?? '' });
        field(doc, tl('Session'), choose, { parent: detail, key: 'source.session' });
        const entry = select(doc, [['', tl('Any entry point')]], { value: '' });
        field(doc, tl('Entry point'), entry, { parent: detail, key: 'source.entry', hint: tl('A Binding for one entry point overrides the Session default.') });
        const update = () => {
            const session = sessions.find(item => item.sessionId === choose.value);
            entry.replaceChildren();
            el(doc, 'option', '', tl('Any entry point'), entry).value = '';
            if (session?.entryPointId) el(doc, 'option', '', fmt('Entry ${0}', [shortId(session.entryPointId)]), entry).value = session.entryPointId;
            emit(session ? { domain: 'native_session', sessionId: session.sessionId, entryPointId: entry.value || null } : null);
        };
        choose.addEventListener('change', update);
        entry.addEventListener('change', () => { if (choose.value) emit({ domain: 'native_session', sessionId: choose.value, entryPointId: entry.value || null }); });
        if (initial?.sessionId) update();
    }

    async function renderProjects() {
        status.textContent = tl('Reading Projects…');
        let projects = [];
        try { const result = await nativeStudioClient.listProjects({ summary: true }); projects = Array.isArray(result) ? result : result.projects ?? result.items ?? []; status.textContent = ''; } catch (error) { status.textContent = describeError(error); return; }
        if (!projects.length) { status.textContent = tl('No Studio Projects yet.'); return; }
        const choose = select(doc, [['', tl('Choose a Project')], ...projects.map(item => [item.projectId, item.displayName || item.name || shortId(item.projectId)])], { value: initial?.projectId ?? '' });
        field(doc, tl('Project'), choose, { parent: detail, key: 'source.project' });
        const task = select(doc, [['', tl('Every task in this Project')]], { value: '' });
        field(doc, tl('Task'), task, { parent: detail, key: 'source.task' });
        choose.addEventListener('change', async () => {
            task.replaceChildren();
            el(doc, 'option', '', tl('Every task in this Project'), task).value = '';
            if (!choose.value) return emit(null);
            emit({ domain: 'project', projectId: choose.value, taskId: null });
            try {
                const result = await nativeStudioClient.listAgentTasks(choose.value);
                for (const item of Array.isArray(result) ? result : result.tasks ?? result.items ?? []) el(doc, 'option', '', item.title || item.taskId, task).value = item.taskId;
            } catch (error) { status.textContent = describeError(error); }
        });
        task.addEventListener('change', () => { if (choose.value) emit({ domain: 'project', projectId: choose.value, taskId: task.value || null }); });
    }

    async function renderChat() {
        status.textContent = tl('Reading recent chats…');
        let chats = [];
        try {
            const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {};
            const response = await fetch('/api/chats/recent', { method: 'POST', credentials: 'same-origin', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ max: 50 }) });
            if (!response.ok) throw Object.assign(new Error('chat_list_failed'), { code: 'native_orchestration_failed', status: response.status });
            chats = (await response.json()).map(item => item.group
                ? { charDir: null, name: String(item.file_name).replace(/\.jsonl$/i, ''), isGroup: true, groupId: String(item.group) }
                : { charDir: String(item.avatar || '').replace(/\.png$/i, ''), name: String(item.file_name).replace(/\.jsonl$/i, ''), isGroup: false, groupId: null })
                .filter(item => item.name && (item.isGroup || item.charDir));
            status.textContent = '';
        } catch (error) { status.textContent = describeError(error); }
        const open = currentChatLocator(), key = item => JSON.stringify(item);
        if (open && !chats.some(item => key(item) === key(open))) chats.unshift(open);
        if (!chats.length) { status.textContent = tl('No chats found. Start a chat first.'); return; }
        const choose = select(doc, [['', tl('Choose a chat')], ...chats.map(item => [key(item), fmt('${0} · ${1}${2}', [item.isGroup ? tl('Group') : item.charDir, item.name, open && key(item) === key(open) ? tl(' (open now)') : ''])])], { value: '' });
        field(doc, tl('Chat'), choose, { parent: detail, key: 'source.chat', hint: tl('The chat authority resolves the exact source; nothing is guessed from names.') });
        choose.addEventListener('change', async () => {
            if (!choose.value) return emit(null);
            const locator = JSON.parse(choose.value);
            status.textContent = fmt('Resolving “${0}” through the chat authority…', [locator.name]);
            try {
                const bound = await bindRpChatSource(client, locator);
                status.textContent = fmt('Chat “${0}” resolved.', [locator.name]);
                emit({ domain: 'rp_chat', controlId: bound.controlId }, { locator });
            } catch (error) { status.textContent = describeError(error); emit(null); }
        });
    }

    domain.addEventListener('change', () => {
        detail.replaceChildren(); status.textContent = ''; emit(null);
        if (signal?.aborted) return;
        if (domain.value === 'native_session') void renderSessions();
        if (domain.value === 'project') void renderProjects();
        if (domain.value === 'rp_chat') void renderChat();
    });
    if (initial?.domain === 'native_session') void renderSessions();
    else if (initial?.domain === 'project') { value = initial; void renderProjects(); } else if (initial?.domain === 'rp_chat') { queueMicrotask(() => emit(initial)); void renderChat(); }
    return { element, get value() { return value; } };
}

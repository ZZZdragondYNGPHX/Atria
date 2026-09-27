import { translateShellText as t } from '../atria-shell/localization.js';
import { nativeExperienceRequest } from './experience-health-ui.js';
import { mountNativeSharedExperience } from './shared-client.js';

// Host controls connection and fixed-seat membership. The remote mount receives
// only its authenticated Shared projection, never the local Session runtime.
export function mountSharedSessionPanel({ document, root, runtime, request = nativeExperienceRequest, mount = mountNativeSharedExperience }) {
    root.classList.add('atri-experience-panel');
    let disposed = false; let mounted = null; let busy = false; let snapshot = null;
    const availability = new WeakMap();
    const syncButtons = () => root.querySelectorAll('button').forEach(node => { node.disabled = busy || !(availability.get(node)?.() ?? true); });
    const abort = new AbortController(); const sessionId = runtime?.snapshot?.session.sessionId;
    const form = document.createElement('div'); const status = document.createElement('p'); status.setAttribute('role', 'status');
    const controls = document.createElement('div'); const turnControls = document.createElement('div'); const canvas = document.createElement('div');
    function field(label, initial = '') {
        const wrapper = document.createElement('label'); const caption = document.createElement('span'); caption.textContent = t(label);
        const input = document.createElement('input'); input.className = 'text_pole'; input.value = initial; wrapper.append(caption, input); form.append(wrapper); return input;
    }
    const owner = field('Host account'); const session = field('Shared session ID', sessionId ?? '');
    const member = field('Participant account'); const seat = field('Declared seat ID');
    const role = document.createElement('select'); const roleLabel = document.createElement('label'); roleLabel.textContent = t('Participant role');
    for (const value of ['participant', 'observer', 'revoked']) { const option = document.createElement('option'); option.value = value; option.textContent = t(value); role.append(option); } roleLabel.append(role); form.append(roleLabel);
    const current = () => !disposed && (!sessionId || runtime?.snapshot?.session.sessionId === sessionId);
    function button(label, fn, available = () => true) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = t(label);
        availability.set(button, available); button.disabled = busy || !available();
        button.addEventListener('click', async () => {
            if (busy || !current() || !available()) return;
            busy = true; root.querySelectorAll('button').forEach(node => { node.disabled = true; }); status.setAttribute('role', 'status'); status.textContent = t('Working…');
            try { await fn(); } catch (error) { if (current()) { status.textContent = t(error.message); status.setAttribute('role', 'alert'); } } finally { busy = false; if (current()) syncButtons(); }
        }); button.className = 'atria-native-play-actions__button'; return button;
    }
    const credentials = () => ({ owner: owner.value.trim(), sessionId: session.value.trim() });
    function renderTurnControls() {
        turnControls.replaceChildren();
        if (!mounted || !snapshot) return;
        const contract = mounted.packageState.descriptor.experienceContract;
        const ownSeat = contract.sharedRuntime.seats.find(item => item.id === snapshot.seatId);
        const peers = document.createElement('p'); peers.textContent = snapshot.participants.map(item => `${item.seatId} · ${t(item.role)} · ${t(item.online ? 'Online' : 'Offline')}`).join('\n');
        const rules = document.createElement('select'); rules.setAttribute('aria-label', t('Shared rule'));
        for (const id of ownSeat.ruleIds) { const option = document.createElement('option'); option.value = id; option.textContent = id; rules.append(option); }
        const argumentsRoot = document.createElement('div'); const argumentsInputs = new Map();
        function renderArguments() {
            argumentsRoot.replaceChildren(); argumentsInputs.clear();
            const rule = contract.sharedRuntime.rules.find(item => item.id === rules.value);
            if (!rule) return;
            const command = contract.lifecycleRuntime.domains.find(item => item.id === rule.domainId).commands.find(item => item.id === rule.commandId);
            for (const [key, schema] of Object.entries(command.argsSchema.properties)) {
                if (key === rule.roll?.argument) continue;
                const label = document.createElement('label'); label.textContent = key;
                const input = document.createElement('input'); input.className = 'text_pole';
                input.type = schema.type === 'boolean' ? 'checkbox' : ['integer', 'number'].includes(schema.type) ? 'number' : 'text';
                label.append(input); argumentsRoot.append(label); argumentsInputs.set(key, { input, schema });
            }
        }
        rules.addEventListener('change', renderArguments); renderArguments();
        const invoke = async action => { await mounted.client.command(action); if (current()) renderTurnControls(); };
        turnControls.append(peers, rules, argumentsRoot);
        if (snapshot.role !== 'observer') turnControls.append(button('Submit shared input', () => {
            const args = Object.fromEntries([...argumentsInputs].map(([key, { input, schema }]) => [key, schema.type === 'boolean' ? input.checked
                : ['integer', 'number'].includes(schema.type) ? Number(input.value) : ['object', 'array'].includes(schema.type) ? JSON.parse(input.value) : input.value]));
            return invoke({ kind: 'turn.submit', turnId: snapshot.turn?.id, ruleId: rules.value, args });
        }, () => snapshot?.turn?.status === 'collecting' && !snapshot.turn.stale && ownSeat.ruleIds.length > 0 && snapshot.turn.roster.includes(snapshot.seatId) && !snapshot.turn.submitted.includes(snapshot.seatId)));
        if (snapshot.role === 'host') turnControls.append(
            button('Open shared turn', () => invoke({ kind: 'turn.open', scopeId: ownSeat.scopeId, scopeEpoch: snapshot.scopes[ownSeat.scopeId].epoch }), () => snapshot?.turn?.status !== 'collecting' && snapshot?.scopes[ownSeat.scopeId]?.status === 'active'),
            button('Commit shared turn', () => invoke({ kind: 'turn.commit', turnId: snapshot.turn?.id }), () => snapshot?.turn?.status === 'collecting' && !snapshot.turn.stale && snapshot.turn.submitted.length === snapshot.turn.roster.length),
            button('Cancel shared turn', () => invoke({ kind: 'turn.cancel', turnId: snapshot.turn?.id }), () => snapshot?.turn?.status === 'collecting'),
        );
    }
    async function connect() {
        mounted?.dispose(); mounted = null; snapshot = null; canvas.replaceChildren();
        const selected = credentials();
        const result = await mount({ ...selected, document, window: document.defaultView,
            headers: () => globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {},
            environmentRoot: canvas,
            surfaceHost: { mount(surface) {
                const container = document.createElement('section'); container.dataset.sharedSurface = surface; canvas.append(container);
                return { container, unmount: () => container.remove() };
            } },
            onProjection(value) {
                if (!current() || selected.owner !== credentials().owner || selected.sessionId !== credentials().sessionId) return;
                snapshot = value;
                if (!value) { canvas.replaceChildren(); turnControls.replaceChildren(); }
                status.textContent = value ? `${t(value.role)} · ${value.seatId} · ${t(value.turn?.status ?? 'Ready')}` : t('Disconnected');
            } });
        if (!current() || selected.owner !== credentials().owner || selected.sessionId !== credentials().sessionId) { result.dispose(); return; }
        mounted = result;
        await mounted.client.heartbeat();
        if (!current() || mounted !== result) { result.dispose(); return; }
        await mounted.refresh();
        renderTurnControls();
    }
    controls.append(button('Enable sharing', async () => {
        const base = runtime?.snapshot;
        if (!base || runtime.history || runtime.generation) throw new Error('Sharing requires the active session');
        await request('shared/enable', { sessionId: base.session.sessionId, expectedRevisionId: base.revision.revisionId }, abort.signal);
        if (current()) { await runtime.open(base.session.sessionId); status.textContent = t('Sharing enabled. Connect with the Host account and session ID.'); }
    }), button('Connect', connect), button('Refresh participants', async () => {
        if (!mounted) throw new Error('Connect first'); const selected = mounted; await selected.client.heartbeat();
        if (!current() || mounted !== selected) return; await selected.refresh(); if (current()) renderTurnControls();
    }), button('Apply membership', async () => {
        if (!snapshot || snapshot.role !== 'host' || mounted.client.getSnapshot()?.sessionId !== session.value.trim()) throw new Error('Connect as Host first');
        await request('shared/membership', { ...credentials(), action: { expectedAccessRevisionId: snapshot.accessRevisionId,
            handle: member.value.trim(), ...(role.value === 'revoked' ? {} : { seatId: seat.value.trim() }), role: role.value } }, abort.signal);
        if (current()) { await mounted.refresh(); renderTurnControls(); }
    }), button('Disconnect', () => { mounted?.dispose(); mounted = null; snapshot = null; canvas.replaceChildren(); turnControls.replaceChildren(); status.textContent = t('Disconnected'); }));
    for (const input of [owner, session]) input.addEventListener('input', () => { mounted?.dispose(); mounted = null; snapshot = null; canvas.replaceChildren(); turnControls.replaceChildren(); });
    const note = document.createElement('p'); note.textContent = t('Fixed declared seats. All participants submit once; the Host commits or cancels. Refresh to reconnect.');
    root.replaceChildren(note, form, controls, status, turnControls, canvas);
    return { dispose() { disposed = true; abort.abort(); mounted?.dispose(); root.replaceChildren(); root.classList.remove('atri-experience-panel'); } };
}

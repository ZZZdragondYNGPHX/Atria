// Run inspection over the Host RunProjection only. The browser keeps view
// choices; status, costs, approvals and controls are the Host's words. Leaving
// this page or losing the connection never cancels a Run.
import { createAtriaStatePanel } from '../../atria-shell/primitives.js';
import { formatAtriaRelativeTime } from '../../atria-shell/components.js';
import { formatShellText as fmt, translateShellText as tl } from '../../atria-shell/localization.js';
import { classifyOrchestrationError, newCommandId, prepareProjectCommit, preflightRpRun, readNativeOperation, startRpRun } from './client.js';
import { nodeModelRoutePins } from '../../../shared/native-orchestration-contracts.js';
import { GraphView, KIND_LABELS } from './graph-view.js';
import { autoLayout } from './plan-draft.js';
import { chipFor, describeDiagnostic, describeError, describeState, eventLabel, eventTone, formatDuration, formatTime, formatTokens, idText, seal, shortId, stateChip } from './ledger.js';
import { banner, button, confirmInline, dismissInline, el } from './dom.js';
import { nativeStudioClient } from '../studio-client.js';
import { createSourcePicker, sourceLabel } from './source-picker.js';

const WINDOW = 50;
const COLLECTIONS = ['nodes', 'edges', 'attempts', 'effects', 'approvals', 'events'];
const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled', 'stale']);
const SOURCE_KEY = 'atria.orchestration.runs.source';
const DIMENSIONS = { requests: 'Requests', tokens: 'Tokens', jobs: 'Local jobs', items: 'Local items', inputBytes: 'Local input bytes' };
const WORK_KINDS = { generation: 'Generation calls', embedding: 'Embedding calls', rerank: 'Rerank calls', other: 'Other provider calls' };
const COUNTERS = { steps: 'Steps', attempts: 'Attempts', patches: 'Graph changes', delegates: 'Delegations' };
const REVIEW_EFFECTS = { explicit_paid_model_generation: 'Paid model generation', explicit_paid_planner_generation: 'Paid planner generation',
    bounded_graph_patch_proposal: 'Bounded graph change proposal', explicit_paid_graph_draft_generation: 'Paid draft generation', same_source_result_reference: 'Result reused from the same source',
    explicit_paid_quality_review_generation: 'Paid quality review', explicit_paid_quality_selection: 'Paid quality selection', explicit_paid_candidate_generation: 'Paid candidate generation',
    bounded_local_rerun: 'Bounded local rerun', original_rp_assistant_output: 'Writes one assistant message to this chat' };
const count = value => Number.isSafeInteger(value) ? new Intl.NumberFormat().format(value) : tl('Unknown');

const readRemembered = () => { try { return JSON.parse(globalThis.sessionStorage?.getItem(SOURCE_KEY) ?? 'null'); } catch { return null; } };
const remember = value => { try { globalThis.sessionStorage?.setItem(SOURCE_KEY, JSON.stringify(value)); } catch { /* per-viewer convenience only */ } };

/* ─────────────────────────────── Run list ─────────────────────────────── */

export function mountRunList({ document: doc, root, client, onOpenRun, initialSource = null }) {
    const controller = new AbortController();
    const page = el(doc, 'div', 'atria-orch-page', null, root);
    const header = el(doc, 'header', 'atria-orch-page__header', null, page);
    const titles = el(doc, 'div', 'atria-orch-page__titles', null, header);
    el(doc, 'h2', 'atria-orch-page__title', tl('Runs'), titles);
    el(doc, 'p', 'atria-orch-page__subtitle', tl('Runs are started by their Session, Project task or chat. Choose a source to follow what the Native Host recorded.'), titles);
    const source = initialSource ?? readRemembered();
    let cursor = null, current = null, token = 0, locator = null, start = null, list = null, status = null, more = null;
    const picker = createSourcePicker(doc, { client, signal: controller.signal, initial: source, onChange: (value, meta) => { remember(value); current = value; locator = meta?.locator ?? null; renderStart(); void load(value, true); } });
    page.append(picker.element);
    start = el(doc, 'section', 'atria-orch-start', null, page);
    status = el(doc, 'div', 'atria-orch-status', null, page);
    list = el(doc, 'ul', 'atria-orch-rows atria-orch-run-list', null, page);
    list.setAttribute('aria-label', tl('Runs for this source'));
    more = button(doc, tl('Load more Runs'), () => load(current, false));
    more.hidden = true;
    page.append(more);

    async function load(selector, reset) {
        current = selector;
        const mine = ++token;
        if (reset) { cursor = null; list.replaceChildren(); }
        more.hidden = true;
        if (!selector) { status.replaceChildren(createAtriaStatePanel(doc, 'empty', { title: tl('Choose a source'), message: tl('Runs are listed per exact Session, Project task or chat.') })); return; }
        status.replaceChildren(createAtriaStatePanel(doc, 'loading', { title: tl('Reading Runs'), message: fmt('Runs for ${0}…', [sourceLabel(selector)]) }));
        try {
            const outcome = await client.listRuns(selector, cursor, 25, controller.signal);
            if (mine !== token) return;
            cursor = outcome.cursor;
            status.replaceChildren();
            for (const run of outcome.items) {
                const item = el(doc, 'li', 'atria-orch-row', null, list);
                const open = el(doc, 'button', 'atria-orch-row__main', null, item);
                open.type = 'button';
                open.append(chipFor(doc, 'run', run.status));
                el(doc, 'strong', 'atria-orch-row__title', fmt('Run ${0}', [shortId(run.runId)]), open);
                const marks = el(doc, 'span', 'atria-orch-row__marks', null, open);
                if (run.cancelRequested && !TERMINAL.has(run.status)) marks.append(stateChip(doc, { label: tl('Cancel requested'), tone: 'history', shape: 'history' }));
                marks.append(seal(doc, { label: fmt('Plan rev ${0}', [shortId(run.planRef.planRevisionId, 4)]), kind: 'exact', title: run.planRef.planRevisionId }));
                el(doc, 'span', 'atria-orch-row__meta', fmt('Started ${0} · updated ${1}', [formatAtriaRelativeTime(run.createdAt), formatAtriaRelativeTime(run.updatedAt)]), open);
                open.addEventListener('click', () => onOpenRun(run.runId, run.source));
            }
            if (!list.children.length) status.replaceChildren(createAtriaStatePanel(doc, 'empty', { title: tl('No Runs for this source'), message: tl('A Run appears here after its Session, Project task or chat starts one with a chosen Plan.') }));
            more.hidden = !cursor;
        } catch (error) {
            if (controller.signal.aborted || mine !== token) return;
            status.replaceChildren(createAtriaStatePanel(doc, 'error', { title: tl('Runs could not be read'), message: describeError(error), action: { label: tl('Try reading again'), onClick: () => load(selector, true) } }));
        }
    }
    function renderStart(review = null, fingerprint = null, message = '') {
        start.replaceChildren();
        if (current?.domain === 'project' && current.taskId) return renderProjectStart();
        if (current?.domain !== 'rp_chat' || !locator) return;
        el(doc, 'h3', 'atria-orch-group__title', tl('Start a Run from this chat'), start);
        el(doc, 'p', 'atria-orch-group__hint', tl('Review first: the review reads the chat, the chosen Plan and its route, and sends nothing. Starting sends paid model requests within the reviewed budget.'), start);
        if (message) el(doc, 'p', 'atria-orch-start__message', message, start).setAttribute('role', 'status');
        if (!review) { start.append(button(doc, tl('Review a Run for the last message…'), () => void prepare())); return; }
        const facts = el(doc, 'dl', 'atria-orch-facts', null, start);
        const fact = (term, value) => { el(doc, 'dt', '', term, facts); const dd = el(doc, 'dd', '', null, facts); if (typeof value === 'string') dd.textContent = value; else dd.append(value); };
        fact(tl('Plan revision'), idText(doc, review.planRef.planRevisionId));
        fact(tl('Chat message'), fmt('Message ${0} (last user message)', [review.input.floor + 1]));
        fact(tl('Request budget'), fmt('${0} requests · ${1} tokens', [review.budget.maxRequests, formatTokens(review.budget.maxTokens)]));
        if (review.childBudget) fact(tl('Child budget'), fmt('${0} requests · ${1} tokens', [review.childBudget.maxRequests, formatTokens(review.childBudget.maxTokens)]));
        fact(tl('Effects'), review.effects.map(code => REVIEW_EFFECTS[code] ? tl(REVIEW_EFFECTS[code]) : code).join(' · '));
        fact(tl('Output'), review.outputContract?.kind ?? tl('Unknown'));
        fact(tl('Review fingerprint'), idText(doc, fingerprint));
        const row = el(doc, 'div', 'atria-button-row', null, start);
        const go = button(doc, tl('Start paid Run'), () => void begin(review, fingerprint, go), { variant: 'primary' });
        row.append(go, button(doc, tl('Discard review'), () => renderStart()));
    }

    function renderProjectStart() {
        const source = { ...current };
        el(doc, 'h3', 'atria-orch-group__title', tl('Prepare trusted commit'), start);
        el(doc, 'p', 'atria-orch-group__hint', tl('Reads the current task review and chosen Plan. Preparing reserves local work; writing requires a separate trusted approval and dispatch.'), start);
        const result = el(doc, 'div', 'atria-orch-status', null, start);
        let pending = null;
        const prepare = button(doc, tl('Prepare trusted commit'), async () => {
            prepare.disabled = true;
            try {
                if (!pending) {
                    const task = await nativeStudioClient.getAgentTask(source.projectId, source.taskId);
                    if (task.status !== 'review' || !task.reviewHash) throw new Error(tl('The task needs a current review before preparing a commit.'));
                    const binding = await client.getBinding(source, controller.signal);
                    if (!binding) throw new Error(tl('Choose a published commit Plan for this task under Plans › Revisions.'));
                    pending = { commandId: newCommandId(), planRef: binding.planRef, expectedSequence: task.sequence, expectedReviewHash: task.reviewHash,
                        computeBudget: { maxRequests: 1, maxTokens: 1, localWork: { maxJobs: 4, maxItems: 16, maxInputBytes: 16777216 } } };
                }
                const prepared = await prepareProjectCommit(source, pending);
                if (!controller.signal.aborted) onOpenRun(prepared.runId, source);
            } catch (error) {
                result.textContent = error.unknownOutcome ? tl('Outcome unknown. Check again with the same command; do not prepare a new commit.') : error.code ? describeError(error) : error.message;
                if (!error.unknownOutcome) pending = null;
                prepare.textContent = error.unknownOutcome ? tl('Check preparation outcome') : tl('Prepare trusted commit');
            } finally { prepare.disabled = false; }
        });
        start.append(prepare);
    }

    async function prepare() {
        if (locator.isGroup) return renderStart(null, null, tl('Group chats cannot be reviewed from here yet. Start them from the chat.'));
        renderStart(null, null, tl('Reading the chat and the chosen Plan…'));
        try {
            const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {};
            const chatResponse = await fetch('/api/chats/get', { method: 'POST', credentials: 'same-origin', headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatar_url: locator.charDir + '.png', file_name: locator.name }) });
            const rows = chatResponse.ok ? await chatResponse.json() : null;
            const body = Array.isArray(rows) ? rows.slice(1) : [];
            const floor = body.length - 1;
            if (floor < 0 || !body[floor]?.is_user) return renderStart(null, null, tl('The last message in this chat is not a user message. Nothing to start.'));
            const binding = await client.getBinding(current, controller.signal);
            if (!binding) return renderStart(null, null, tl('No Plan is chosen for this chat. Choose a published revision under Plans › Revisions.'));
            const revision = await client.getRevision(binding.planRef, controller.signal);
            const entry = revision.definition.nodes.find(node => revision.definition.entryNodeIds.includes(node.nodeId));
            const pin = nodeModelRoutePins(entry, revision.dependencyPins).find(item => item.pinId === entry?.policy?.agentPinId);
            if (!pin) return renderStart(null, null, tl('The chosen Plan has no pinned player route on its entry agent.'));
            const requestId = 'rp-' + crypto.randomUUID().replaceAll('-', '');
            const { review, fingerprint } = await preflightRpRun({ controlId: current.controlId, floor, requestId, routeRef: pin.resourceRef });
            renderStart(review, fingerprint);
        } catch (error) { renderStart(null, null, describeError(error)); }
    }

    async function begin(review, fingerprint, node) {
        node.disabled = true; node.setAttribute('aria-busy', 'true');
        try {
            const { operationId } = await startRpRun(client, review, fingerprint);
            renderStart(null, null, tl('The Host accepted the request. Waiting for its Run to appear…'));
            for (let i = 0; i < 40 && !controller.signal.aborted; i++) {
                const operation = await readNativeOperation(operationId).catch(() => null);
                if (operation?.runId) return onOpenRun(operation.runId, current);
                if (operation?.status === 'failed' || operation?.status === 'cancelled') {
                    renderStart(null, null, fmt('The Host operation ended as ${0} before a Run was visible (${1}). Nothing more is sent from here.', [operation.status, operation.errorCode ?? tl('no code')]));
                    return void load(current, true);
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            renderStart(null, null, tl('The request was accepted, but its Run is not visible yet. Refresh the list below.'));
            void load(current, true);
        } catch (error) {
            renderStart(error.code === 'native_orchestration_rp_review_stale' ? null : review, fingerprint, describeError(error));
        }
    }

    if (!source) void load(null, true);
    return { dispose() { controller.abort(); page.remove(); } };
}

/* ─────────────────────────────── Run detail ─────────────────────────────── */

export function mountRunDetail({ document: doc, root, client, shell, environment, runId, openPlan = () => {} }) {
    const controller = new AbortController();
    const state = { snapshot: null, envelope: null, cursor: null, view: null, selection: null, generation: 0, paused: false, error: null, busy: null, pending: null, lastUpdate: 0 };
    const page = el(doc, 'div', 'atria-orch-run', null, root);
    const header = el(doc, 'header', 'atria-orch-run__header', null, page);
    const banners = el(doc, 'div', 'atria-orch-banners', null, page);
    const surface = el(doc, 'div', 'atria-orch-run__surface', null, page);
    const live = el(doc, 'div', 'atria-visually-hidden', null, page);
    live.setAttribute('aria-live', 'polite');
    const inspector = el(doc, 'div', 'atria-orch-inspector');
    inspector.dataset.atriaWorkspaceContext = 'true';
    let lastAnnounced = '';
    const announce = text => { if (text === lastAnnounced) return; lastAnnounced = text; live.textContent = text; };
    const graph = new GraphView(doc, { editable: false, ariaLabel: tl('Run graph from the Host projection. Arrow keys move between nodes, Enter shows details.'),
        onSelect: selection => { state.selection = selection; renderInspector(); },
        onActivate: selection => { state.selection = selection; renderInspector(); shell?.setDockOpen?.(true); } });

    surface.replaceChildren(createAtriaStatePanel(doc, 'loading', { title: tl('Reading Run'), message: tl('Asking the Native Host for a snapshot…') }));

    /* ── observation ── */
    async function completeCollections(snapshot, versions) {
        // Pages bind to one state version; a different version means resync.
        for (const collection of COLLECTIONS) {
            if (!snapshot.hasMore?.[collection]) continue;
            const holder = ['nodes', 'edges'].includes(collection) ? snapshot.graph : snapshot;
            const items = [];
            let cursor = null;
            for (let page_ = 0; page_ < 50; page_++) {
                const result = await client.runDetails({ runId, collection, cursor, limit: 100 }, controller.signal);
                if (JSON.stringify(result.versions) !== JSON.stringify(versions)) throw Object.assign(new Error('native_orchestration_projection_resync_required'), { code: 'native_orchestration_projection_resync_required' });
                items.push(...result.items);
                cursor = result.cursor;
                if (!cursor) break;
            }
            holder[collection] = items;
            snapshot.hasMore[collection] = Boolean(cursor);
        }
        return snapshot;
    }

    async function observeLoop() {
        const generation = ++state.generation;
        state.cursor = null;
        while (!controller.signal.aborted && generation === state.generation) {
            if (state.paused) return;
            try {
                const envelope = await client.observeRun(runId, state.cursor, WINDOW, controller.signal);
                if (generation !== state.generation) return;
                if (state.envelope && envelope.kind === 'deltaBatch' && (envelope.projectionId !== state.envelope.projectionId || envelope.epoch !== state.envelope.epoch)) throw Object.assign(new Error('resync'), { code: 'native_orchestration_projection_resync_required' });
                state.cursor = envelope.cursor;
                let next = null;
                if (envelope.kind === 'snapshot') next = envelope.payload;
                else if (envelope.payload.changes.length) next = envelope.payload.changes.at(-1).snapshot;
                if (next) {
                    const complete = await completeCollections(structuredClone(next), next.versions);
                    if (generation !== state.generation) return;
                    accept(complete, envelope);
                }
                state.error = null;
                state.envelope = envelope;
                if (TERMINAL.has(state.snapshot?.status) && !state.snapshot?.diagnostics?.some(item => item.severity === 'blocking')) {
                    // Settled Runs stop polling; Refresh re-reads on demand.
                    renderHeader();
                    return;
                }
            } catch (error) {
                if (controller.signal.aborted || generation !== state.generation) return;
                const type = classifyOrchestrationError(error);
                if (type === 'resync' || type === 'host_changed') {
                    state.cursor = null; state.envelope = null;
                    announce(tl('The Run view expired. Reading a fresh snapshot.'));
                    continue;
                }
                state.error = error;
                renderError(error);
                return;
            }
        }
    }

    function accept(snapshot, envelope) {
        const previous = state.snapshot;
        state.snapshot = snapshot;
        state.lastUpdate = Date.now();
        state.view ??= environment?.get?.().mode === 'compact' ? 'timeline' : 'timeline';
        if (previous?.status !== snapshot.status) announce(fmt('Run status: ${0}.', [describeState('run', snapshot.status).label]));
        if (snapshot.approvals.some(item => item.status === 'pending') && !previous?.approvals?.some(item => item.status === 'pending')) announce(tl('An approval is waiting for your review.'));
        void envelope;
        render();
    }

    function renderError(error) {
        banners.replaceChildren(banner(doc, { title: tl('Run view stopped'), message: describeError(error), tone: classifyOrchestrationError(error) === 'missing' ? 'warning' : 'danger',
            actions: [{ label: tl('Read a fresh snapshot'), onClick: () => { banners.replaceChildren(); void observeLoop(); } }] }));
        if (!state.snapshot) surface.replaceChildren(createAtriaStatePanel(doc, 'error', { title: tl('Run could not be read'), message: describeError(error) }));
    }

    /* ── Host controls ── */
    const guard = () => ({ runId, expectedEpoch: state.snapshot.versions.epoch, expectedStateVersion: state.snapshot.versions.stateVersion, expectedGraphRevision: state.snapshot.versions.graphRevision });

    async function command(kind, invoke, success) {
        if (state.busy) return;
        state.busy = kind;
        renderHeader();
        try {
            const result = await invoke();
            state.pending = null;
            banners.replaceChildren(banner(doc, success(result.outcome)));
            void restart();
        } catch (error) {
            if (controller.signal.aborted) return;
            const type = classifyOrchestrationError(error);
            if (type === 'unknown') state.pending = { kind, commandId: error.commandId, invoke };
            banners.replaceChildren(banner(doc, { title: type === 'unknown' ? tl('Outcome unknown') : tl('The Host did not accept this'), message: describeError(error),
                tone: type === 'unknown' ? 'warning' : 'danger', actions: [{ label: tl('Read a fresh snapshot'), onClick: () => restart() }] }));
        } finally { state.busy = null; renderHeader(); }
    }

    async function cancel() {
        const message = state.snapshot.effects.some(item => ['dispatching', 'unknown', 'confirmed'].includes(item.status))
            ? tl('The Host stops new work. Effects already sent are not undone, their outcomes are still checked, and recorded fees are not refunded.')
            : tl('The Host stops new work. Recorded fees are not refunded.');
        if (!await confirmInline(doc, banners, { title: tl('Request cancel?'), message, confirmLabel: tl('Request cancel'), cancelLabel: tl('Keep running'), destructive: true })) return;
        const body = { ...guard(), reasonCode: 'user_requested' };
        const commandId = state.pending?.kind === 'cancel' ? state.pending.commandId : newCommandId();
        void command('cancel', () => client.cancelRun(body, { commandId, signal: controller.signal }), outcome => ({ title: tl('Cancel requested'),
            message: outcome.status === 'reconciling' ? tl('The Host recorded the request. Effects already sent are being checked; nothing is shown as undone.') : fmt('The Host recorded the request. Run status: ${0}.', [describeState('run', outcome.status).label]), tone: 'info' }));
    }

    function recover() {
        const body = guard();
        const commandId = state.pending?.kind === 'recover' ? state.pending.commandId : newCommandId();
        void command('recover', () => client.recoverRun(body, { commandId, signal: controller.signal }), () => ({ title: tl('Control recovered on this Host'),
            message: tl('Earlier approvals were invalidated. Nothing was resumed or resent; continuing still needs the original source.'), tone: 'info' }));
    }

    function reconcile() {
        const recorded = state.snapshot.reconciliationRequest;
        const body = guard();
        const commandId = recorded?.commandId ?? (state.pending?.kind === 'reconcile' ? state.pending.commandId : newCommandId());
        void command('reconcile', () => client.reconcileRun(body, { commandId, signal: controller.signal }), outcome => ({ title: tl('Receipt checked'),
            message: fmt('The original receipt was checked. Run status: ${0}. Nothing was resent.', [describeState('run', outcome.status).label]), tone: 'info' }));
    }

    async function resumeCommit() {
        const source = state.snapshot.source, effect = state.snapshot.effects.find(item => item.status === 'ready');
        if (source.domain !== 'project' || !source.taskId || !effect) return;
        if (!await confirmInline(doc, banners, { title: tl('Resume this Project commit?'), message: tl('The Host re-checks the source and budget, and a fresh trusted approval is required before anything is written.'),
            confirmLabel: tl('Resume commit'), cancelLabel: tl('Not now') })) return;
        void command('resume', async () => {
            const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {};
            const response = await fetch(`/api/native/studio/projects/${encodeURIComponent(source.projectId)}/agent/tasks/${encodeURIComponent(source.taskId)}/commit/resume`, {
                method: 'POST', credentials: 'same-origin', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, effectId: effect.effectId }) });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw Object.assign(new Error(payload.error ?? 'native_orchestration_failed'), { code: payload.error ?? 'native_orchestration_failed', status: response.status });
            return { outcome: payload };
        }, () => ({ title: tl('Commit re-admitted'), message: tl('The same effect was re-admitted. Approve it again in trusted review before anything is written.'), tone: 'info' }));
    }

    async function projectCommit(action, effect) {
        const source = state.snapshot.source;
        if (action === 'dispatch' && !await confirmInline(doc, banners, { title: tl('Write the approved commit?'), message: tl('The Host re-checks the approval, source and budget before writing to the Project.'),
            confirmLabel: tl('Write commit'), cancelLabel: tl('Not now') })) return;
        void command(action, async () => {
            const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {};
            const response = await fetch(`/api/native/studio/projects/${encodeURIComponent(source.projectId)}/agent/tasks/${encodeURIComponent(source.taskId)}/commit/${action}`, {
                method: 'POST', credentials: 'same-origin', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, effectId: effect.effectId }) });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw Object.assign(new Error(payload.error ?? 'native_orchestration_failed'), { code: payload.error ?? 'native_orchestration_failed', status: response.status, unknownOutcome: action === 'dispatch' && response.status >= 500 });
            return { outcome: payload };
        }, outcome => ({ title: outcome.status === 'completed' ? tl('Commit recorded') : tl('Commit status read'),
            message: fmt('Host commit status: ${0}.', [outcome.status ?? tl('Unknown')]), tone: outcome.status === 'completed' ? 'success' : 'info' }));
    }

    async function launchReview(approval) {
        try {
            const { outcome } = await client.launchApproval({ runId, approvalId: approval.approvalId }, { signal: controller.signal });
            // Open blank first so a blocked pop-up is detectable, then cut the opener link.
            const opened = doc.defaultView.open('about:blank', '_blank');
            if (opened) { opened.opener = null; opened.location.href = outcome.url; }
            banners.replaceChildren(banner(doc, { title: opened ? tl('Trusted review opened') : tl('Open trusted review'), message: opened
                ? tl('Decide in the separate review window. This page only shows the Host’s result.')
                : tl('Your browser blocked the window. Allow pop-ups for this site, then open review again.'), tone: 'info' }));
        } catch (error) {
            const message = error.status === 503 && !error.code?.startsWith('native_') ? tl('Approvals can only be decided on the device running the Native Host.') : describeError(error);
            banners.replaceChildren(banner(doc, { title: tl('Trusted review not opened'), message, tone: 'warning' }));
        }
    }

    async function restart() { state.envelope = null; await observeLoop(); }

    /* ── rendering ── */
    function render() { renderHeader(); renderSurface(); renderInspector(); }

    function renderHeader() {
        const snapshot = state.snapshot;
        if (!snapshot) return;
        header.replaceChildren();
        const top = el(doc, 'div', 'atria-orch-run__top', null, header);
        const titles = el(doc, 'div', 'atria-orch-page__titles', null, top);
        el(doc, 'h2', 'atria-orch-page__title', fmt('Run ${0}', [shortId(runId)]), titles);
        el(doc, 'p', 'atria-orch-page__subtitle', fmt('${0} · started ${1}', [sourceLabel(snapshot.source), formatAtriaRelativeTime(snapshot.createdAt)]), titles);
        const marks = el(doc, 'div', 'atria-orch-run__marks', null, top);
        marks.append(chipFor(doc, 'run', snapshot.status));
        if (snapshot.cancelRequested && !TERMINAL.has(snapshot.status)) marks.append(stateChip(doc, { label: tl('Cancel requested'), tone: 'history', shape: 'history' }));
        marks.append(chipFor(doc, 'costs', snapshot.costs.status));
        const pendingApprovals = snapshot.approvals.filter(item => item.status === 'pending');
        if (pendingApprovals.length) marks.append(stateChip(doc, { label: fmt('${0} awaiting your review', [pendingApprovals.length]), tone: 'warning', shape: 'pending' }));
        const facts = el(doc, 'div', 'atria-orch-run__facts', null, header);
        const planLink = button(doc, fmt('Plan revision ${0}', [shortId(snapshot.planRef.planRevisionId, 4)]), () => openPlan(snapshot.planRef.planId), { variant: 'plain' });
        facts.append(planLink, seal(doc, { label: fmt('epoch ${0} · state ${1} · graph r${2}', [snapshot.versions.epoch, snapshot.versions.stateVersion, snapshot.versions.graphRevision]), kind: 'exact' }));
        const updated = el(doc, 'span', 'atria-orch-run__updated', state.paused ? tl('Updates paused while hidden') : TERMINAL.has(snapshot.status) ? fmt('Final state read ${0}', [formatAtriaRelativeTime(state.lastUpdate)]) : tl('Following live'), facts);
        updated.dataset.live = String(!state.paused && !TERMINAL.has(snapshot.status));

        const controls = el(doc, 'div', 'atria-button-row atria-orch-run__controls', null, header);
        const view = el(doc, 'div', 'atria-segmented', null, controls);
        view.setAttribute('role', 'group');
        view.setAttribute('aria-label', tl('Run view'));
        for (const [id, label] of [['timeline', tl('Timeline')], ['graph', tl('Graph')]]) {
            const item = el(doc, 'button', 'atria-segmented__item', label, view);
            item.type = 'button';
            item.setAttribute('aria-pressed', String(state.view === id));
            item.addEventListener('click', () => { state.view = id; renderSurface(); renderHeader(); });
        }
        const c = snapshot.controls;
        if (c.cancel && !snapshot.cancelRequested) controls.append(withBusy(button(doc, tl('Request cancel…'), cancel, { icon: 'stop' }), 'cancel'));
        if (c.recover) controls.append(withBusy(button(doc, tl('Recover control on this Host'), recover, { variant: TERMINAL.has(snapshot.status) ? 'secondary' : 'primary' }), 'recover'));
        if (c.recover && TERMINAL.has(snapshot.status)) el(doc, 'p', 'atria-orch-toolbar__reason', tl('The Host restarted after this Run settled. Recovering only rebinds its control records; nothing runs again.'), header);
        if (c.reconcile) controls.append(withBusy(button(doc, snapshot.reconciliationRequest ? tl('Check the recorded receipt request') : tl('Check original receipt'), reconcile, { variant: c.recover ? 'secondary' : 'primary' }), 'reconcile'));
        if (c.resume) controls.append(withBusy(button(doc, tl('Resume Project commit…'), resumeCommit), 'resume'));
        const commitSource = snapshot.source.domain === 'project' && snapshot.source.taskId;
        const approvedEffect = commitSource && snapshot.effects.find(effect => effect.status === 'ready' && effect.requiresApproval
            && snapshot.approvals.some(approval => approval.effectId === effect.effectId && approval.status === 'approved'));
        const pendingEffect = commitSource && snapshot.effects.find(effect => ['dispatching', 'unknown', 'confirmed'].includes(effect.status));
        if (approvedEffect) controls.append(withBusy(button(doc, tl('Write approved commit…'), () => projectCommit('dispatch', approvedEffect), { variant: 'primary' }), 'dispatch'));
        if (pendingEffect && !TERMINAL.has(snapshot.status)) controls.append(withBusy(button(doc, tl('Check commit receipt'), () => projectCommit('observe', pendingEffect)), 'observe'));
        controls.append(button(doc, tl('Refresh'), () => restart(), { variant: 'plain', icon: 'retry' }), button(doc, tl('Details'), () => { state.selection = null; renderInspector(); shell?.setDockOpen?.(true); }, { variant: 'plain', icon: 'inspector' }));
        if (!c.cancel && !c.recover && !c.reconcile && !c.resume && !controls.querySelector('[data-variant="primary"]')) el(doc, 'p', 'atria-orch-toolbar__reason', TERMINAL.has(snapshot.status) ? tl('This Run is settled. Its record stays available here.') : tl('The Host offers no control for this Run right now.'), header);
    }

    function withBusy(node, kind) {
        node.disabled = Boolean(state.busy);
        if (state.busy === kind) node.setAttribute('aria-busy', 'true');
        return node;
    }

    function nodeStatus(nodeId) {
        const attempts = state.snapshot.attempts.filter(item => item.nodeId === nodeId && !item.superseded);
        return attempts.sort((a, b) => b.attemptNumber - a.attemptNumber)[0] ?? null;
    }

    function renderSurface() {
        const snapshot = state.snapshot;
        if (!snapshot) return;
        surface.replaceChildren();
        if (state.view === 'graph') {
            const nodes = snapshot.graph.nodes, edges = snapshot.graph.edges;
            const definition = { nodes: nodes.map(node => ({ nodeId: node.nodeId })), edges: edges.map(edge => ({ from: { nodeId: edge.from.nodeId ?? edge.from }, to: { nodeId: edge.to.nodeId ?? edge.to }, loopBack: edge.loopBack })),
                entryNodeIds: nodes.filter(node => !edges.some(edge => (edge.to.nodeId ?? edge.to) === node.nodeId && !edge.loopBack)).map(node => node.nodeId) };
            const positions = autoLayout(definition, {});
            graph.render({
                positions,
                nodes: nodes.map(node => {
                    const attempt = nodeStatus(node.nodeId), described = attempt ? describeState('attempt', attempt.status) : { label: tl('Not started'), tone: 'neutral', shape: 'pending' };
                    return { id: node.nodeId, kind: node.kind, label: node.label ?? tl('Added during Run'), sub: described.label, tone: described.tone, shape: described.shape,
                        ariaLabel: fmt('${0}, ${1}, ${2}', [node.label ?? tl('Added during Run'), tl(KIND_LABELS[node.kind] ?? node.kind), described.label]) };
                }),
                edges: edges.map(edge => ({ id: edge.edgeId, from: edge.from.nodeId ?? edge.from, to: edge.to.nodeId ?? edge.to, loopBack: edge.loopBack, ariaLabel: tl('Edge') })),
            });
            surface.append(graph.element);
            if (state.selection?.type === 'node') graph.select(state.selection);
            if (graph.autoFit) requestAnimationFrame(() => graph.fit());
            if (snapshot.hasMore.nodes || snapshot.hasMore.edges) surface.append(banner(doc, { title: tl('Graph shown in part'), message: tl('The Host has more graph items than could be read for this version.'), tone: 'warning' }));
            return;
        }
        const timeline = el(doc, 'ol', 'atria-orch-timeline', null, surface);
        timeline.setAttribute('aria-label', tl('Run timeline'));
        let previousVersion = '';
        for (const event of snapshot.events) {
            const version = fmt('epoch ${0} · graph r${1}', [event.epoch, event.graphRevision]);
            const item = el(doc, 'li', 'atria-orch-timeline__item', null, timeline);
            item.dataset.tone = eventTone(event.type);
            el(doc, 'span', 'atria-orch-timeline__dot', null, item).setAttribute('aria-hidden', 'true');
            const text = el(doc, 'div', 'atria-orch-timeline__text', null, item);
            el(doc, 'strong', '', eventLabel(event.type), text);
            const time = el(doc, 'time', 'atria-orch-timeline__time', version === previousVersion ? formatAtriaRelativeTime(event.createdAt) : fmt('${0} · ${1}', [formatAtriaRelativeTime(event.createdAt), version]), text);
            previousVersion = version;
            time.dateTime = new Date(event.createdAt).toISOString();
            time.title = formatTime(event.createdAt);
        }
        if (!snapshot.events.length) el(doc, 'li', 'atria-orch-empty-line', tl('No visible events recorded yet.'), timeline);
        if (snapshot.hasMore.events) surface.append(banner(doc, { title: tl('Timeline shown in part'), message: tl('More events exist than could be read for this version.'), tone: 'warning' }));
        if (!TERMINAL.has(snapshot.status)) el(doc, 'p', 'atria-orch-timeline__tail', tl('Waiting for the Host to record more…'), surface);
    }

    function renderInspector() {
        if (!state.snapshot) return;
        fillInspector();
        if (!inspector.isConnected) shell?.setContextContent?.(inspector, { title: tl('Run details'), open: shell.isDockOpen?.() ?? false, state: 'half' });
    }

    function fillInspector() {
        const snapshot = state.snapshot;
        inspector.replaceChildren();
        const group = (title, hint = '') => {
            const section = el(doc, 'section', 'atria-orch-group', null, inspector);
            el(doc, 'h4', 'atria-orch-group__title', title, section);
            if (hint) el(doc, 'p', 'atria-orch-group__hint', hint, section);
            return section;
        };
        if (state.selection?.type === 'node') {
            const node = snapshot.graph.nodes.find(item => item.nodeId === state.selection.id);
            const head = group(node?.label ?? tl('Added during Run'));
            head.append(idText(doc, state.selection.id));
            el(doc, 'p', 'atria-orch-group__hint', tl(KIND_LABELS[node?.kind] ?? 'Node'), head);
            const attempts = snapshot.attempts.filter(item => item.nodeId === state.selection.id).sort((a, b) => a.attemptNumber - b.attemptNumber);
            const section = group(fmt('Attempts (${0})', [attempts.length]));
            if (!attempts.length) el(doc, 'p', 'atria-orch-group__hint', tl('No attempt recorded for this node.'), section);
            for (const attempt of attempts) {
                const card = el(doc, 'div', 'atria-orch-pin', null, section);
                const top = el(doc, 'div', 'atria-orch-pin__top', null, card);
                el(doc, 'strong', '', fmt('Attempt ${0}', [attempt.attemptNumber]), top);
                top.append(chipFor(doc, 'attempt', attempt.status));
                if (attempt.superseded) top.append(seal(doc, { label: tl('Superseded'), kind: 'history' }));
                if (attempt.reviewDecision) top.append(seal(doc, { label: fmt('Review: ${0}', [attempt.reviewDecision]), kind: 'solid' }));
                el(doc, 'p', 'atria-orch-group__hint', fmt('Started ${0} · ended ${1}', [attempt.startedAt ? formatTime(attempt.startedAt) : tl('not started'), attempt.endedAt ? formatTime(attempt.endedAt) : tl('not ended')]), card);
                for (const effect of snapshot.effects.filter(item => item.nodeAttemptId === attempt.attemptId)) effectRow(card, effect);
            }
            return;
        }
        const pending = snapshot.approvals.filter(item => item.status === 'pending');
        const approvals = group(tl('Approvals'), tl('Decisions happen only in the trusted review window on the device running the Host.'));
        if (!snapshot.approvals.length) el(doc, 'p', 'atria-orch-group__hint', tl('No approvals requested.'), approvals);
        for (const approval of snapshot.approvals) {
            const card = el(doc, 'div', 'atria-orch-pin', null, approvals);
            const top = el(doc, 'div', 'atria-orch-pin__top', null, card);
            top.append(chipFor(doc, 'approval', approval.status), seal(doc, { label: fmt('Risk ${0}', [approval.risk]), kind: approval.risk === 'R0' ? 'solid' : 'blocked' }));
            el(doc, 'p', 'atria-orch-group__hint', fmt('Effect ${0} · expires ${1}', [shortId(approval.effectId), formatTime(approval.expiresAt)]), card);
            if (approval.status === 'pending') {
                if (approval.reviewAvailable) card.append(button(doc, tl('Open trusted review…'), () => launchReview(approval), { variant: pending[0] === approval ? 'primary' : 'secondary' }));
                else el(doc, 'p', 'atria-orch-group__hint', tl('Trusted review is not available for this approval on this Host now. Nothing can approve it from here.'), card);
            }
        }
        const costs = group(tl('Fees'), tl('From the original budget records. Unknown usage is never shown as zero.'));
        costs.append(chipFor(doc, 'costs', snapshot.costs.status));
        const table = el(doc, 'dl', 'atria-orch-facts', null, costs);
        const fact = (term, value) => { el(doc, 'dt', '', term, table); el(doc, 'dd', '', value, table); };
        if (snapshot.costs.status === 'unavailable') fact(tl('Amounts'), tl('Unavailable'));
        else {
            fact(tl('Known tokens'), formatTokens(snapshot.costs.knownTotalTokens));
            fact(tl('Provider calls'), String(snapshot.costs.modelAttempts));
            fact(tl('Calls with unknown usage'), String(snapshot.costs.unknownAttempts));
            fact(tl('Reserved upper bound for unknown calls'), formatTokens(snapshot.costs.reservedUpperTokens));
            for (const [kind, work] of Object.entries(snapshot.costs.providerWork)) if (work.attempts) fact(tl(WORK_KINDS[kind] ?? 'Other provider calls'), fmt('${0} · ${1} known tokens · ${2} unknown', [work.attempts, formatTokens(work.knownTotalTokens), work.unknownAttempts]));
            fact(tl('Local jobs'), fmt('${0} (${1} unsettled) · ${2}', [snapshot.costs.localJobs, snapshot.costs.localUnknownJobs, formatDuration(snapshot.costs.localWallMs)]));
        }
        const capacity = group(tl('Budget capacity'));
        if (snapshot.capacity.status !== 'available') el(doc, 'p', 'atria-orch-group__hint', snapshot.capacity.status === 'unavailable' ? tl('The original budget could not be read.') : tl('No budget reservation recorded yet.'), capacity);
        else {
            const capTable = el(doc, 'dl', 'atria-orch-facts', null, capacity);
            for (const dimension of Object.keys(snapshot.capacity.ceiling ?? {})) {
                el(doc, 'dt', '', tl(DIMENSIONS[dimension] ?? dimension), capTable);
                el(doc, 'dd', '', fmt('${0} used · ${1} left of ${2}', [count(snapshot.capacity.used?.[dimension]), count(snapshot.capacity.remaining?.[dimension]), count(snapshot.capacity.ceiling[dimension])]), capTable);
            }
        }
        const execution = group(tl('Limits and progress'));
        const execTable = el(doc, 'dl', 'atria-orch-facts', null, execution);
        for (const [counter, limit] of [['steps', 'maxSteps'], ['attempts', 'maxAttempts'], ['patches', 'maxPatches'], ['delegates', 'maxDelegates']]) {
            if (snapshot.execution.progress[counter] === undefined) continue;
            el(doc, 'dt', '', tl(COUNTERS[counter]), execTable);
            el(doc, 'dd', '', fmt('${0} of ${1}', [snapshot.execution.treeProgress[counter] ?? snapshot.execution.progress[counter], snapshot.execution.limits[limit]]), execTable);
        }
        if (snapshot.execution.treeProgress.deadlineAt) { el(doc, 'dt', '', tl('Deadline'), execTable); el(doc, 'dd', '', formatTime(snapshot.execution.treeProgress.deadlineAt), execTable); }
        const diagnostics = group(tl('Diagnostics'));
        if (!snapshot.diagnostics.length) el(doc, 'p', 'atria-orch-group__hint', tl('The Host reports nothing that blocks this Run.'), diagnostics);
        for (const item of snapshot.diagnostics) {
            const described = describeDiagnostic(item.code);
            const row = el(doc, 'div', 'atria-orch-issue', null, diagnostics);
            row.append(chipFor(doc, 'severity', item.severity));
            const text = el(doc, 'div', 'atria-orch-issue__text', null, row);
            el(doc, 'strong', '', described.title, text);
            el(doc, 'span', '', described.detail, text);
        }
        const effects = group(fmt('Effects (${0})', [snapshot.effects.length]), tl('Confirmed means the original receipt confirms the effect. It does not mean the Run or its output is complete.'));
        for (const effect of snapshot.effects) effectRow(effects, effect);
    }

    function effectRow(parent, effect) {
        const row = el(doc, 'div', 'atria-orch-effect', null, parent);
        row.append(chipFor(doc, 'effect', effect.status), seal(doc, { label: fmt('Risk ${0}', [effect.risk]), kind: effect.risk === 'R0' ? 'solid' : 'blocked' }));
        if (effect.requiresApproval) row.append(seal(doc, { label: tl('Needs approval'), kind: 'draft' }));
        row.append(idText(doc, effect.effectId));
    }

    const visibility = () => {
        if (doc.visibilityState === 'hidden') { state.paused = true; state.generation++; renderHeader(); return; }
        if (state.paused) { state.paused = false; void restart(); }
    };
    doc.addEventListener('visibilitychange', visibility);
    void observeLoop();
    return {
        refreshContext: () => renderInspector(),
        dismissTransient: () => dismissInline(doc, banners),
        dispose() {
            controller.abort();
            graph.dispose();
            state.generation++;
            doc.removeEventListener('visibilitychange', visibility);
            page.remove();
            inspector.remove();
        },
    };
}

// Plan Library and Plan editor. Canvas, Node/Edge list and Inspector edit one
// PlanDraft. Saving, validation, hashing and publication belong to the Host;
// a publish never starts a Run and a Binding never grants permissions.
import { createAtriaStatePanel } from '../../atria-shell/primitives.js';
import { createAtriaIcon } from '../../atria-shell/icons.js';
import { formatAtriaRelativeTime } from '../../atria-shell/components.js';
import { formatShellText as fmt, translateShellText as tl } from '../../atria-shell/localization.js';
import { runtimeRequest } from '../runtime-client.js';
import { classifyOrchestrationError } from './client.js';
import { PlanDraft, NODE_KINDS, LIMIT_FIELDS, EXECUTABLE_KINDS, starterDocument, autoLayout, precheck, nodeRemovalImpact,
    compatiblePorts, edgeTypeMismatch, diffDefinitions } from './plan-draft.js';
import { GraphView, KIND_LABELS } from './graph-view.js';
import { chipFor, describeError, describeIssue, describeState, idText, seal, shortId, stateChip } from './ledger.js';
import { banner, button, checkbox, confirmInline, dismissInline, el, field, input, preserveFocus, select, textarea } from './dom.js';
import { createSourcePicker, sourceLabel } from './source-picker.js';

const CAPABILITIES = ['generation.send', 'chat.output', 'memory.retrieve', 'graph.patch', 'agent.delegate', 'project.read', 'project.propose', 'project.commit', 'mcp.read', 'a2a.read', 'skill.read'];
const PATCH_OPERATIONS = ['addNode', 'addEdge', 'setPendingPriority', 'cancelPending', 'markBlocked', 'requestFinalize', 'requestReplan'];
const PIN_PORTS = ['model', 'context', 'tool', 'narrative', 'project', 'evaluation', 'plan'];
const LIMIT_LABELS = { maxNodes: 'Nodes', maxEdges: 'Edges', maxSteps: 'Steps', maxAttempts: 'Attempts', maxPatches: 'Graph changes', maxReplans: 'Replans',
    maxReviews: 'Reviews', maxDelegates: 'Delegations', maxHandoffs: 'Handoffs', maxDepth: 'Delegation depth', maxConcurrency: 'Concurrency',
    maxEdgeVisits: 'Visits per edge', maxLoopIterations: 'Loop iterations', deadlineMs: 'Deadline (ms)' };
const POSITIVE_LIMITS = new Set(['maxNodes', 'maxSteps', 'maxAttempts', 'maxConcurrency', 'deadlineMs']);
const planTitle = root => root?.viewState?.title?.trim() || tl('Untitled Plan');

/* ─────────────────────────────── Library ─────────────────────────────── */

export function mountPlanLibrary({ document: doc, root, client, onOpen }) {
    const controller = new AbortController();
    let cursor = null, items = [], busy = false;
    const page = el(doc, 'div', 'atria-orch-page', null, root);
    const header = el(doc, 'header', 'atria-orch-page__header', null, page);
    const titles = el(doc, 'div', 'atria-orch-page__titles', null, header);
    el(doc, 'h2', 'atria-orch-page__title', tl('Plans'), titles);
    el(doc, 'p', 'atria-orch-page__subtitle', tl('Author agent graphs as drafts, validate them on the Host, then publish immutable revisions.'), titles);
    const create = el(doc, 'form', 'atria-orch-create', null, header);
    const name = input(doc, { placeholder: tl('New Plan name') });
    name.setAttribute('aria-label', tl('New Plan name'));
    name.maxLength = 200;
    const createButton = button(doc, tl('Create draft'), null, { variant: 'primary', type: 'submit', icon: 'plus' });
    create.append(name, createButton);
    const status = el(doc, 'div', 'atria-orch-status', null, page);
    status.setAttribute('role', 'status');
    const list = el(doc, 'div', 'atria-orch-plan-list', null, page);
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', tl('Plans'));
    const more = button(doc, tl('Load more Plans'), () => load(false));
    more.hidden = true;
    page.append(more);

    create.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || event.isComposing) return;
        busy = true; createButton.disabled = true; createButton.setAttribute('aria-busy', 'true');
        status.replaceChildren();
        const title = name.value.trim() || tl('Untitled Plan');
        try {
            const { outcome } = await client.createPlan(starterDocument(title), { signal: controller.signal });
            onOpen(outcome.planId, planTitle(outcome));
        } catch (error) {
            if (controller.signal.aborted) return;
            status.replaceChildren(banner(doc, { title: tl('Plan not created'), message: describeError(error), tone: classifyOrchestrationError(error) === 'unknown' ? 'warning' : 'danger',
                actions: classifyOrchestrationError(error) === 'unknown' ? [{ label: tl('Reload Plans'), onClick: () => load(true) }] : [] }));
        } finally { busy = false; createButton.disabled = false; createButton.removeAttribute('aria-busy'); }
    });

    function row(plan) {
        const item = el(doc, 'div', 'atria-orch-plan-row', null, list);
        item.setAttribute('role', 'listitem');
        const open = el(doc, 'button', 'atria-orch-plan-row__open', null, item);
        open.type = 'button';
        el(doc, 'span', 'atria-orch-plan-row__mark', null, open).append(createAtriaIcon(doc, 'agents', { size: 18 }));
        const text = el(doc, 'span', 'atria-orch-plan-row__text', null, open);
        el(doc, 'strong', 'atria-orch-plan-row__title', planTitle(plan), text);
        el(doc, 'span', 'atria-orch-plan-row__meta', fmt('${0} nodes · ${1} edges · updated ${2}', [plan.definition.nodes.length, plan.definition.edges.length, formatAtriaRelativeTime(plan.updatedAt)]), text);
        const seals = el(doc, 'span', 'atria-orch-plan-row__seals', null, open);
        seals.append(seal(doc, { label: fmt('Draft v${0}', [plan.draftVersion]), kind: 'draft' }));
        seals.append(plan.currentPlanRevisionId
            ? seal(doc, { label: fmt('Published ${0}', [shortId(plan.currentPlanRevisionId, 4)]), kind: 'solid', title: plan.currentPlanRevisionId })
            : seal(doc, { label: tl('Not published'), kind: 'unknown' }));
        open.addEventListener('click', () => onOpen(plan.planId, planTitle(plan)));
    }

    async function load(reset) {
        if (reset) { cursor = null; items = []; list.replaceChildren(); }
        status.replaceChildren(createAtriaStatePanel(doc, 'loading', { title: tl('Reading Plans'), message: tl('Asking the Native Host for your Plans…') }));
        more.disabled = true;
        try {
            const outcome = await client.listPlans(cursor, 50, controller.signal);
            items.push(...outcome.items);
            cursor = outcome.cursor;
            status.replaceChildren();
            for (const plan of outcome.items.sort((a, b) => b.updatedAt - a.updatedAt)) row(plan);
            if (!items.length) status.replaceChildren(createAtriaStatePanel(doc, 'empty', { title: tl('No Plans yet'), message: tl('Name a Plan above to create a draft with one agent and one output.') }));
            more.hidden = !cursor;
        } catch (error) {
            if (controller.signal.aborted) return;
            status.replaceChildren(createAtriaStatePanel(doc, 'error', { title: tl('Plans could not be read'), message: describeError(error), action: { label: tl('Try reading again'), onClick: () => load(true) } }));
        } finally { more.disabled = false; }
    }
    void load(true);
    return { dispose() { controller.abort(); page.remove(); } };
}

/* ─────────────────────────────── Editor ─────────────────────────────── */

export function mountPlanEditor({ document: doc, root, client, shell, planId, environment, onTitle = () => {}, openRuns = () => {} }) {
    const controller = new AbortController();
    const state = {
        base: null, draft: null, report: null, digest: null, reportFor: null, revisions: [], revisionsCursor: null,
        selection: { type: 'plan' }, inspectorTab: 'selection', view: null, busy: null, pending: null, conflict: null, routes: null,
    };
    const page = el(doc, 'div', 'atria-orch-editor', null, root);
    page.dataset.atriaDraftDirty = 'false';
    const toolbar = el(doc, 'div', 'atria-orch-toolbar', null, page);
    const banners = el(doc, 'div', 'atria-orch-banners', null, page);
    const work = el(doc, 'div', 'atria-orch-editor__work', null, page);
    const surface = el(doc, 'div', 'atria-orch-editor__surface', null, work);
    const problems = el(doc, 'section', 'atria-orch-problems', null, work);
    const live = el(doc, 'div', 'atria-visually-hidden', null, page);
    live.setAttribute('aria-live', 'polite');
    const inspector = el(doc, 'div', 'atria-orch-inspector');
    inspector.dataset.atriaWorkspaceContext = 'true';
    const announce = text => { live.textContent = ''; live.textContent = text; };
    const compact = () => environment?.get?.().mode === 'compact';

    const graph = new GraphView(doc, {
        editable: true, ariaLabel: tl('Plan graph. Arrow keys move between nodes, Alt+Arrow moves a node, Enter edits, Delete removes.'),
        onSelect: selection => selectItem(selection ?? { type: 'plan' }, { from: 'graph' }),
        onActivate: selection => { selectItem(selection, { from: 'graph' }); openInspector(); },
        onMove: (nodeId, position) => edit(() => state.draft.moveNode(nodeId, position)),
        onConnect: (fromId, toId) => connect(fromId, toId),
        onDelete: selection => selection.type === 'node' ? removeNode(selection.id) : edit(() => state.draft.removeEdge(selection.id)),
    });

    /* ── data ── */
    function currentDocument() { return state.draft.document(); }
    function edit(action, message = '') {
        try { action(); } catch (error) {
            announce(fmt('Edit not applied: ${0}', [error.message]));
            return false;
        }
        if (message) announce(message);
        return true;
    }

    function openInspector(tab = 'selection') {
        state.inspectorTab = tab;
        renderInspector();
        shell?.setDockOpen?.(true);
    }

    function selectItem(selection, { from = '' } = {}) {
        state.selection = selection;
        if (from !== 'graph') graph.select(selection?.type === 'plan' ? null : selection);
        state.inspectorTab = 'selection';
        renderSurfaceSelection();
        renderInspector();
    }

    async function load({ keepDraft = false } = {}) {
        page.dataset.atriaSavePending = 'false';
        surface.replaceChildren(createAtriaStatePanel(doc, 'loading', { title: tl('Opening Plan'), message: tl('Reading the saved draft from the Native Host…') }));
        try {
            const [rootDoc, revisions] = await Promise.all([client.getPlan(planId, controller.signal), client.listRevisions(planId, null, 50, controller.signal)]);
            state.base = rootDoc;
            state.revisions = revisions.items.sort((a, b) => b.publishedAt - a.publishedAt);
            state.revisionsCursor = revisions.cursor;
            const hostDoc = { definition: rootDoc.definition, dependencyPins: rootDoc.dependencyPins, viewState: rootDoc.viewState };
            if (!state.draft) {
                state.draft = new PlanDraft(hostDoc);
                state.draft.subscribe(reason => onDraftChange(reason));
                if (!Object.keys(state.draft.view.positions).length) { state.draft.layoutAll(); state.draft.markSaved(hostDoc); }
            } else if (!keepDraft) state.draft.replace(hostDoc);
            onTitle(planTitle(rootDoc));
            state.view ??= compact() ? 'list' : 'graph';
            renderAll();
        } catch (error) {
            if (controller.signal.aborted) return;
            surface.replaceChildren(createAtriaStatePanel(doc, 'error', { title: tl('Plan could not be opened'), message: describeError(error), action: { label: tl('Try reading again'), onClick: () => load({ keepDraft }) } }));
        }
    }

    function onDraftChange() {
        page.dataset.atriaDraftDirty = String(state.draft.isDirty());
        renderToolbar();
        renderSurface();
        renderProblems();
        renderInspector();
    }

    /* ── Host commands ── */
    async function runCommand(kind, invoke) {
        if (state.busy) return null;
        state.busy = kind;
        page.dataset.atriaSavePending = 'true';
        renderToolbar();
        try {
            const result = await invoke();
            state.pending = null;
            return result;
        } catch (error) {
            if (controller.signal.aborted) return null;
            handleCommandError(kind, error);
            return null;
        } finally {
            state.busy = null;
            page.dataset.atriaSavePending = 'false';
            if (!controller.signal.aborted) renderToolbar();
        }
    }

    function handleCommandError(kind, error) {
        const type = classifyOrchestrationError(error);
        if (type === 'unknown') {
            // Retain exactly this command for an explicit same-identity check.
            state.pending = { kind, commandId: error.commandId, body: state.pending?.body };
            showBanner({ title: tl('Outcome unknown'), message: describeError(error), tone: 'warning', actions: [
                { label: tl('Check the same request again'), onClick: () => replayPending() },
                { label: tl('Reload Plan state'), onClick: () => reconcileWithHost() },
            ] });
        } else if (type === 'conflict' || type === 'host_changed') {
            state.conflict = { kind, code: error.code };
            showBanner({ title: type === 'host_changed' ? tl('Host restarted') : tl('Changed elsewhere'), message: describeError(error), tone: 'warning', actions: [
                { label: tl('Compare with Host'), onClick: () => reconcileWithHost() },
            ] });
        } else {
            showBanner({ title: fmt('${0} failed', [tl(kind === 'save' ? 'Save' : kind === 'publish' ? 'Publish' : kind === 'validate' ? 'Validation' : 'Request')]), message: describeError(error), tone: 'danger' });
        }
        announce(describeError(error));
    }

    function showBanner(options) { banners.replaceChildren(banner(doc, { ...options, actions: [...(options.actions ?? []), { label: tl('Dismiss'), variant: 'plain', onClick: () => banners.replaceChildren() }] })); }

    async function save() {
        const current = currentDocument();
        const body = { planId, expectedDraftVersion: state.base.draftVersion, expectedDefinitionHash: state.base.definitionHash, ...current };
        state.pending = { kind: 'save', body };
        const result = await runCommand('save', () => client.savePlan(body, { signal: controller.signal }));
        if (!result) return false;
        acceptSaved(result.outcome, current);
        return true;
    }

    function acceptSaved(rootDoc, sent) {
        state.base = rootDoc;
        banners.replaceChildren();
        // Only the content the Host acknowledged becomes the clean baseline.
        state.draft.markSaved({ definition: rootDoc.definition, dependencyPins: rootDoc.dependencyPins, viewState: rootDoc.viewState ?? sent.viewState });
        announce(fmt('Draft v${0} saved on the Host.', [rootDoc.draftVersion]));
        onDraftChange('saved');
    }

    async function replayPending() {
        const pending = state.pending;
        if (!pending?.commandId || !pending.body) return reconcileWithHost();
        const invoke = { save: client.savePlan, publish: client.publishPlan }[pending.kind];
        if (!invoke) return reconcileWithHost();
        const result = await runCommand(pending.kind, () => invoke(pending.body, { commandId: pending.commandId, signal: controller.signal }));
        if (!result) return;
        banners.replaceChildren();
        if (pending.kind === 'save') acceptSaved(result.outcome, pending.body);
        else { announce(tl('Publication confirmed by the Host.')); await load({ keepDraft: true }); state.draft.markSaved(); renderAll(); }
    }

    /** Re-read the Host draft and show what differs; never auto-merge or resend. */
    async function reconcileWithHost() {
        let latest;
        try { latest = await client.getPlan(planId, controller.signal); } catch (error) {
            return showBanner({ title: tl('Plan could not be read'), message: describeError(error), tone: 'danger' });
        }
        const mine = currentDocument();
        const hostDoc = { definition: latest.definition, dependencyPins: latest.dependencyPins, viewState: latest.viewState };
        const diff = diffDefinitions(hostDoc, mine);
        const same = !diff.nodes.added.length && !diff.nodes.removed.length && !diff.nodes.changed.length && !diff.edges.added.length && !diff.edges.removed.length
            && !diff.edges.changed.length && !diff.pins.added.length && !diff.pins.removed.length && !diff.pins.changed.length && !diff.fields.length;
        if (same) {
            state.base = latest; state.pending = null; state.conflict = null;
            state.draft.markSaved({ ...hostDoc, viewState: mine.viewState });
            showBanner({ title: tl('Draft matches the Host'), message: fmt('Draft v${0} on the Host already contains your edits.', [latest.draftVersion]), tone: 'success' });
            onDraftChange('reconciled');
            return;
        }
        const summary = fmt('Host draft v${0}. Differences from your draft: ${1} nodes, ${2} edges, ${3} pins, ${4} settings.', [latest.draftVersion,
            diff.nodes.added.length + diff.nodes.removed.length + diff.nodes.changed.length, diff.edges.added.length + diff.edges.removed.length + diff.edges.changed.length,
            diff.pins.added.length + diff.pins.removed.length + diff.pins.changed.length, diff.fields.length]);
        showBanner({ title: tl('Your draft differs from the Host'), message: summary, tone: 'warning', actions: [
            { label: tl('Use the Host draft'), onClick: () => { state.base = latest; state.pending = null; state.conflict = null; state.draft.replace(hostDoc); banners.replaceChildren(); renderAll(); } },
            { label: tl('Keep mine and save over it…'), onClick: async () => {
                if (!await confirmInline(doc, banners, { title: tl('Save over the Host draft?'), message: fmt('Your draft replaces Host draft v${0}. Its different edits are replaced in the draft. Published revisions are not affected.', [latest.draftVersion]),
                    confirmLabel: tl('Save my draft over it'), cancelLabel: tl('Keep comparing'), destructive: true })) return;
                state.base = latest; state.pending = null; state.conflict = null; void save();
            } },
        ] });
    }

    async function validate() {
        if (state.draft.isDirty()) return;
        const body = { planId, expectedDraftVersion: state.base.draftVersion, expectedDefinitionHash: state.base.definitionHash };
        const result = await runCommand('validate', () => client.validatePlan(body, controller.signal));
        if (!result) return;
        state.report = result.report;
        state.digest = result.validationDigest;
        state.reportFor = { draftVersion: state.base.draftVersion, definitionHash: state.base.definitionHash };
        announce(fmt('Validation: ${0}, ${1} issues.', [describeState('validation', result.report.status).label, result.report.issues.length]));
        renderAll();
    }

    const reportCurrent = () => state.report && !state.draft.isDirty() && state.reportFor?.draftVersion === state.base.draftVersion && state.reportFor?.definitionHash === state.base.definitionHash;

    function confirmPublish() {
        const published = state.revisions.find(item => item.planRevisionId === state.base.currentPlanRevisionId) ?? null;
        const diff = diffDefinitions(published, currentDocument());
        const sheet = el(doc, 'div', 'atria-orch-confirm');
        el(doc, 'h3', 'atria-orch-confirm__title', tl('Publish an immutable revision'), sheet);
        el(doc, 'p', '', tl('Publishing freezes this validated draft. It does not start a Run, choose it for any source, or grant any permission.'), sheet);
        const facts = el(doc, 'dl', 'atria-orch-facts', null, sheet);
        const fact = (term, value) => { el(doc, 'dt', '', term, facts); const dd = el(doc, 'dd', '', null, facts); if (typeof value === 'string') dd.textContent = value; else dd.append(value); };
        fact(tl('Draft'), fmt('v${0}', [state.base.draftVersion]));
        fact(tl('Definition'), idText(doc, state.base.definitionHash));
        fact(tl('Compared with'), published ? idText(doc, published.planRevisionId) : tl('No earlier revision'));
        fact(tl('Nodes'), fmt('+${0} −${1} changed ${2}', [diff.nodes.added.length, diff.nodes.removed.length, diff.nodes.changed.length]));
        fact(tl('Edges'), fmt('+${0} −${1} changed ${2}', [diff.edges.added.length, diff.edges.removed.length, diff.edges.changed.length]));
        fact(tl('Pins'), fmt('+${0} −${1} changed ${2}', [diff.pins.added.length, diff.pins.removed.length, diff.pins.changed.length]));
        const actions = el(doc, 'div', 'atria-button-row', null, sheet);
        actions.append(button(doc, tl('Publish revision'), () => publish(), { variant: 'primary' }), button(doc, tl('Keep editing'), () => banners.replaceChildren()));
        banners.replaceChildren(sheet);
        sheet.querySelector('button')?.focus();
    }

    async function publish() {
        banners.replaceChildren();
        const body = { planId, expectedDraftVersion: state.base.draftVersion, expectedDefinitionHash: state.base.definitionHash, validationDigest: state.digest };
        state.pending = { kind: 'publish', body };
        const result = await runCommand('publish', () => client.publishPlan(body, { signal: controller.signal }));
        if (!result) return;
        const ref = result.outcome.planRef;
        state.report = null;
        await load({ keepDraft: true });
        state.draft.markSaved();
        showBanner({ title: tl('Revision published'), message: fmt('Revision ${0} is immutable. Choose it for a source under Revisions to use it.', [shortId(ref.planRevisionId)]), tone: 'success',
            actions: [{ label: tl('Open revisions'), onClick: () => openInspector('revisions') }] });
        renderAll();
    }

    /* ── editing helpers ── */
    async function removeNode(nodeId) {
        const node = state.draft.node(nodeId);
        if (!node) return;
        const impact = nodeRemovalImpact(state.draft.definition, nodeId);
        const effects = [impact.edges.length ? fmt('${0} connected edges', [impact.edges.length]) : '', impact.entry ? tl('its entry marker') : '', impact.output ? tl('the output owner') : ''].filter(Boolean);
        const message = effects.length ? fmt('Remove “${0}” and ${1} from this draft? Published revisions and Runs are not changed.', [node.label, effects.join(', ')])
            : fmt('Remove “${0}” from this draft? Published revisions and Runs are not changed.', [node.label]);
        if (!await confirmInline(doc, banners, { title: fmt('Remove ${0}?', [node.label || tl(KIND_LABELS[node.kind])]), message, confirmLabel: tl('Remove from draft'), cancelLabel: tl('Keep node'), destructive: true })) return;
        if (edit(() => state.draft.removeNode(nodeId), fmt('Removed ${0}. Undo is available.', [node.label]))) selectItem({ type: 'plan' });
    }

    function connect(fromId, toId, ports = null) {
        const pairs = ports ? [ports] : compatiblePorts(state.draft.definition, fromId, toId);
        const from = state.draft.node(fromId), to = state.draft.node(toId);
        if (!pairs.length) {
            announce(fmt('No matching port types between ${0} and ${1}. Add or change a port in the Inspector.', [from?.label, to?.label]));
            selectItem({ type: 'node', id: fromId });
            openInspector();
            return;
        }
        let edgeId;
        if (edit(() => { edgeId = state.draft.addEdge({ from: { nodeId: fromId, port: pairs[0].from }, to: { nodeId: toId, port: pairs[0].to } }); },
            fmt('Connected ${0} to ${1}.', [from.label, to.label]))) selectItem({ type: 'edge', id: edgeId });
    }

    function addNode(kind) {
        const positions = state.draft.view.positions, values = Object.values(positions);
        const position = values.length ? { x: Math.max(...values.map(p => p.x)) + 40, y: Math.max(...values.map(p => p.y)) + 90 } : { x: 60, y: 60 };
        let nodeId;
        if (edit(() => { nodeId = state.draft.addNode(kind, { label: tl(KIND_LABELS[kind]), position }); }, fmt('Added ${0} node.', [tl(KIND_LABELS[kind])]))) {
            selectItem({ type: 'node', id: nodeId });
            openInspector();
        }
    }

    /* ── rendering ── */
    function renderAll() { renderToolbar(); renderSurface(); renderProblems(); renderInspector(); }

    function renderToolbar() {
        if (!state.draft) return;
        toolbar.replaceChildren();
        const dirty = state.draft.isDirty();
        const seals = el(doc, 'div', 'atria-orch-toolbar__seals', null, toolbar);
        seals.append(seal(doc, { label: dirty ? fmt('Draft v${0} · unsaved edits', [state.base.draftVersion]) : fmt('Draft v${0} · saved', [state.base.draftVersion]), kind: 'draft' }));
        seals.append(state.base.currentPlanRevisionId ? seal(doc, { label: fmt('Published ${0}', [shortId(state.base.currentPlanRevisionId, 4)]), kind: 'solid', title: state.base.currentPlanRevisionId })
            : seal(doc, { label: tl('Not published'), kind: 'unknown' }));
        if (state.report) seals.append(reportCurrent() ? chipFor(doc, 'validation', state.report.status) : stateChip(doc, { label: tl('Validation out of date'), tone: 'history', shape: 'history' }));

        const view = el(doc, 'div', 'atria-segmented atria-orch-toolbar__view', null, toolbar);
        view.setAttribute('role', 'group');
        view.setAttribute('aria-label', tl('Editor view'));
        for (const [id, label] of [['graph', tl('Graph')], ['list', tl('List')]]) {
            const item = el(doc, 'button', 'atria-segmented__item', label, view);
            item.type = 'button';
            item.setAttribute('aria-pressed', String(state.view === id));
            item.addEventListener('click', () => { state.view = id; renderSurface(); renderToolbar(); });
        }
        const edits = el(doc, 'div', 'atria-button-row atria-orch-toolbar__edits', null, toolbar);
        const undo = button(doc, tl('Undo'), () => state.draft.undo(), { icon: 'retry', variant: 'plain' });
        undo.disabled = !state.draft.canUndo() || Boolean(state.busy);
        const redo = button(doc, tl('Redo'), () => state.draft.redo(), { variant: 'plain' });
        redo.disabled = !state.draft.canRedo() || Boolean(state.busy);
        const kind = select(doc, NODE_KINDS.map(item => [item, tl(KIND_LABELS[item])]), { value: 'agent' });
        kind.setAttribute('aria-label', tl('Node kind to add'));
        kind.classList.add('atria-orch-toolbar__kind');
        const add = button(doc, tl('Add node'), () => addNode(kind.value), { icon: 'plus' });
        add.disabled = Boolean(state.busy);
        edits.append(undo, redo, kind, add);

        const actions = el(doc, 'div', 'atria-button-row atria-orch-toolbar__actions', null, toolbar);
        const busyLabel = { save: tl('Saving…'), validate: tl('Validating…'), publish: tl('Publishing…') };
        const saveButton = button(doc, state.busy === 'save' ? busyLabel.save : tl('Save draft'), () => save(), { variant: dirty ? 'primary' : 'secondary' });
        saveButton.disabled = !dirty || Boolean(state.busy);
        const validateButton = button(doc, state.busy === 'validate' ? busyLabel.validate : tl('Validate on Host'), () => validate());
        validateButton.disabled = dirty || Boolean(state.busy);
        const canPublish = !dirty && reportCurrent() && state.report.status === 'valid' && Boolean(state.digest);
        const publishButton = button(doc, state.busy === 'publish' ? busyLabel.publish : tl('Publish…'), () => confirmPublish(), { variant: !dirty && canPublish ? 'primary' : 'secondary' });
        publishButton.disabled = !canPublish || Boolean(state.busy);
        for (const [node, busy] of [[saveButton, 'save'], [validateButton, 'validate'], [publishButton, 'publish']]) if (state.busy === busy) node.setAttribute('aria-busy', 'true');
        const inspectorButton = button(doc, tl('Open Inspector'), () => openInspector(state.inspectorTab), { icon: 'inspector', variant: 'plain' });
        actions.append(saveButton, validateButton, publishButton, inspectorButton);
        const reason = el(doc, 'p', 'atria-orch-toolbar__reason', dirty ? tl('Save the draft before validating; the Host validates the saved draft only.')
            : !state.report ? tl('Validate on the Host before publishing.') : !reportCurrent() ? tl('The draft changed after validation. Validate again.')
                : state.report.status !== 'valid' ? tl('Publishing needs a valid Host report. Resolve the problems below.') : '', toolbar);
        reason.hidden = !reason.textContent;
    }

    function graphModel() {
        const definition = state.draft.definition, issues = issueTargets();
        const positions = autoLayout(definition, state.draft.view.positions);
        return {
            positions,
            nodes: definition.nodes.map(node => ({ id: node.nodeId, kind: node.kind, label: node.label, entry: definition.entryNodeIds.includes(node.nodeId),
                sub: definition.outputContract.ownerNodeId === node.nodeId ? tl('Output owner') : tl(KIND_LABELS[node.kind]), issue: issues.nodes.has(node.nodeId),
                ariaLabel: fmt('${0}, ${1}${2}', [node.label || tl(KIND_LABELS[node.kind]), tl(KIND_LABELS[node.kind]), issues.nodes.has(node.nodeId) ? tl(', has problems') : '']) })),
            edges: definition.edges.map(edge => ({ id: edge.edgeId, from: edge.from.nodeId, to: edge.to.nodeId, loopBack: edge.loopBack, condition: edge.condition,
                maxVisits: edge.maxVisits, mismatch: edgeTypeMismatch(definition, edge) || issues.edges.has(edge.edgeId), ariaLabel: edgeLabel(edge) })),
        };
    }

    function edgeLabel(edge) {
        const from = state.draft.node(edge.from.nodeId), to = state.draft.node(edge.to.nodeId);
        return fmt('${0}.${1} to ${2}.${3}', [from?.label ?? '?', edge.from.port, to?.label ?? '?', edge.to.port]);
    }

    function issueTargets() {
        const nodes = new Set(), edges = new Set(), pins = new Set();
        const issues = [...(reportCurrent() ? state.report.issues : [])];
        const local = precheck(currentDocument());
        if (local) issues.push(local);
        for (const issue of issues) {
            if (issue.nodeId) nodes.add(issue.nodeId);
            if (issue.edgeId) edges.add(issue.edgeId);
            const path = issue.fieldPath ?? '';
            const nodeMatch = /onode_[a-f0-9]{32}/.exec(path);
            if (nodeMatch) nodes.add(nodeMatch[0]);
            if (path.startsWith('dependencyPins.')) pins.add(path.slice('dependencyPins.'.length));
        }
        return { nodes, edges, pins };
    }

    function renderSurface() {
        if (!state.draft) return;
        surface.replaceChildren();
        surface.dataset.view = state.view;
        if (state.view === 'graph') {
            surface.append(graph.element);
            graph.render(graphModel());
            graph.select(state.selection.type === 'node' || state.selection.type === 'edge' ? state.selection : null);
            if (!surface.dataset.fitted) { requestAnimationFrame(() => graph.fit()); surface.dataset.fitted = 'true'; }
        } else surface.append(renderList());
    }

    function renderSurfaceSelection() {
        if (state.view === 'list') for (const row of surface.querySelectorAll('[data-select-id]')) {
            const on = row.dataset.selectId === state.selection.id;
            row.toggleAttribute('data-selected', on);
            row.querySelector('.atria-orch-row__main')?.setAttribute('aria-current', on ? 'true' : 'false');
        }
    }

    function renderList() {
        const definition = state.draft.definition, issues = issueTargets();
        const wrap = el(doc, 'div', 'atria-orch-lists');
        const nodes = el(doc, 'section', 'atria-orch-list-section', null, wrap);
        el(doc, 'h3', 'atria-orch-list-section__title', fmt('Nodes (${0})', [definition.nodes.length]), nodes);
        const nodeList = el(doc, 'ul', 'atria-orch-rows', null, nodes);
        nodeList.setAttribute('aria-label', tl('Nodes'));
        definition.nodes.forEach((node, index) => {
            const item = el(doc, 'li', 'atria-orch-row', null, nodeList);
            item.dataset.selectId = node.nodeId;
            item.toggleAttribute('data-selected', state.selection.id === node.nodeId);
            const main = el(doc, 'button', 'atria-orch-row__main', null, item);
            main.type = 'button';
            main.setAttribute('aria-current', state.selection.id === node.nodeId ? 'true' : 'false');
            el(doc, 'span', 'atria-orch-row__kind', tl(KIND_LABELS[node.kind]), main);
            el(doc, 'strong', 'atria-orch-row__title', node.label || tl(KIND_LABELS[node.kind]), main);
            const marks = el(doc, 'span', 'atria-orch-row__marks', null, main);
            if (definition.entryNodeIds.includes(node.nodeId)) marks.append(seal(doc, { label: tl('Entry'), kind: 'solid' }));
            if (definition.outputContract.ownerNodeId === node.nodeId) marks.append(seal(doc, { label: tl('Output owner'), kind: 'solid' }));
            if (issues.nodes.has(node.nodeId)) marks.append(stateChip(doc, { label: tl('Problems'), tone: 'danger', shape: 'failed' }));
            main.addEventListener('click', () => { selectItem({ type: 'node', id: node.nodeId }); openInspector(); });
            const tools = el(doc, 'span', 'atria-orch-row__tools', null, item);
            const up = button(doc, tl('Move up'), () => edit(() => state.draft.moveNodeInList(node.nodeId, -1)), { variant: 'plain', icon: 'expand', iconOnly: true });
            up.disabled = index === 0;
            const down = button(doc, tl('Move down'), () => edit(() => state.draft.moveNodeInList(node.nodeId, 1)), { variant: 'plain', icon: 'expand', iconOnly: true });
            down.disabled = index === definition.nodes.length - 1;
            up.classList.add('atria-orch-up'); down.classList.add('atria-orch-down');
            tools.append(up, down);
        });
        if (!definition.nodes.length) el(doc, 'p', 'atria-orch-empty-line', tl('No nodes yet. Choose a kind and Add node.'), nodes);
        const edges = el(doc, 'section', 'atria-orch-list-section', null, wrap);
        el(doc, 'h3', 'atria-orch-list-section__title', fmt('Edges (${0})', [definition.edges.length]), edges);
        const edgeList = el(doc, 'ul', 'atria-orch-rows', null, edges);
        edgeList.setAttribute('aria-label', tl('Edges'));
        for (const edge of definition.edges) {
            const item = el(doc, 'li', 'atria-orch-row', null, edgeList);
            item.dataset.selectId = edge.edgeId;
            item.toggleAttribute('data-selected', state.selection.id === edge.edgeId);
            const main = el(doc, 'button', 'atria-orch-row__main', null, item);
            main.type = 'button';
            el(doc, 'span', 'atria-orch-row__kind', edge.loopBack ? fmt('↺ back to (≤${0})', [edge.maxVisits]) : edge.condition === 'always' ? tl('then') : tl(edge.condition === 'success' ? 'on success' : 'on failure'), main);
            el(doc, 'strong', 'atria-orch-row__title', edgeLabel(edge), main);
            const marks = el(doc, 'span', 'atria-orch-row__marks', null, main);
            if (edgeTypeMismatch(definition, edge)) marks.append(stateChip(doc, { label: tl('Port types differ'), tone: 'danger', shape: 'failed' }));
            main.addEventListener('click', () => { selectItem({ type: 'edge', id: edge.edgeId }); openInspector(); });
        }
        if (!definition.edges.length) el(doc, 'p', 'atria-orch-empty-line', tl('No edges yet. Open a node and use Connect to.'), edges);
        return wrap;
    }

    function renderProblems() {
        if (!state.draft) return;
        problems.replaceChildren();
        const header = el(doc, 'div', 'atria-orch-problems__header', null, problems);
        el(doc, 'h3', 'atria-orch-problems__title', tl('Problems'), header);
        const local = precheck(currentDocument());
        const hostIssues = reportCurrent() ? state.report.issues : [];
        if (state.report && !reportCurrent()) header.append(stateChip(doc, { label: tl('Last Host report is out of date'), tone: 'history', shape: 'history' }));
        else if (state.report) header.append(chipFor(doc, 'validation', state.report.status));
        else header.append(stateChip(doc, { label: tl('Not validated on Host'), tone: 'unknown', shape: 'unknown' }));
        const list = el(doc, 'ul', 'atria-orch-issues', null, problems);
        const add = (issue, origin) => {
            const item = el(doc, 'li', 'atria-orch-issue', null, list);
            item.append(chipFor(doc, 'severity', issue.severity ?? 'blocking'));
            const text = el(doc, 'div', 'atria-orch-issue__text', null, item);
            el(doc, 'span', '', origin === 'local' ? fmt('Local pre-check: ${0}', [issue.message]) : describeIssue(issue), text);
            if (issue.fieldPath) el(doc, 'code', 'atria-orch-issue__path', issue.fieldPath, text);
            const target = issue.nodeId ? { type: 'node', id: issue.nodeId } : issue.edgeId ? { type: 'edge', id: issue.edgeId }
                : /onode_[a-f0-9]{32}/.exec(issue.fieldPath ?? '') ? { type: 'node', id: /onode_[a-f0-9]{32}/.exec(issue.fieldPath)[0] }
                    : (issue.fieldPath ?? '').startsWith('dependencyPins.') ? { type: 'pins' } : null;
            if (target) item.append(button(doc, tl('Show'), () => { if (target.type === 'pins') openInspector('pins'); else { selectItem(target); openInspector(); } }, { variant: 'plain' }));
        };
        if (local) add({ ...local, severity: 'blocking' }, 'local');
        const seen = new Set();
        for (const issue of hostIssues) {
            const key = [issue.code, issue.severity, issue.fieldPath, issue.nodeId, issue.edgeId].join('|');
            if (!seen.has(key)) { seen.add(key); add(issue, 'host'); }
        }
        if (!local && !hostIssues.length) el(doc, 'li', 'atria-orch-empty-line', state.report && reportCurrent() ? tl('The Host reported no problems for this saved draft.') : tl('No local structural problems. Only the Host can confirm the Plan is valid.'), list);
    }

    /* ── Inspector ── */
    function renderInspector() {
        if (!state.draft) return;
        preserveFocus(doc, inspector, () => {
            inspector.replaceChildren();
            const tabs = el(doc, 'div', 'atria-segmented atria-orch-inspector__tabs', null, inspector);
            tabs.setAttribute('role', 'group');
            tabs.setAttribute('aria-label', tl('Inspector sections'));
            const selected = state.selection.type === 'node' || state.selection.type === 'edge';
            if (state.inspectorTab === 'selection' && !selected) state.inspectorTab = 'plan';
            const tabList = [['plan', tl('Plan')], ...selected ? [['selection', state.selection.type === 'node' ? tl('Node') : tl('Edge')]] : [], ['pins', tl('Pins')], ['revisions', tl('Revisions')]];
            for (const [id, label] of tabList) {
                const tab = el(doc, 'button', 'atria-segmented__item', label, tabs);
                tab.type = 'button';
                tab.setAttribute('aria-pressed', String(state.inspectorTab === id));
                tab.addEventListener('click', () => { state.inspectorTab = id; renderInspector(); });
            }
            const body = el(doc, 'div', 'atria-orch-inspector__body', null, inspector);
            if (state.inspectorTab === 'pins') renderPins(body);
            else if (state.inspectorTab === 'revisions') renderRevisions(body);
            else if (state.inspectorTab === 'selection' && state.selection.type === 'node' && state.draft.node(state.selection.id)) renderNode(body, state.draft.node(state.selection.id));
            else if (state.inspectorTab === 'selection' && state.selection.type === 'edge' && state.draft.edge(state.selection.id)) renderEdge(body, state.draft.edge(state.selection.id));
            else renderPlanSettings(body);
        });
        if (!inspector.isConnected) shell?.setContextContent?.(inspector, { title: tl('Plan Inspector'), open: shell.isDockOpen?.() ?? false, state: 'half' });
    }

    const group = (parent, title, hint = '') => {
        const section = el(doc, 'section', 'atria-orch-group', null, parent);
        el(doc, 'h4', 'atria-orch-group__title', title, section);
        if (hint) el(doc, 'p', 'atria-orch-group__hint', hint, section);
        return section;
    };

    function renderPlanSettings(body) {
        const definition = state.draft.definition;
        const header = group(body, tl('Plan'));
        field(doc, tl('Name'), input(doc, { value: state.draft.view.title, onCommit: value => edit(() => state.draft.setPlan({ title: value })) }), { parent: header, key: 'plan.title', hint: tl('Display name only; saved with the draft layout.') });
        el(doc, 'div', 'atria-orch-inline', null, header).append(el(doc, 'span', 'atria-field__label', tl('Plan ID')), idText(doc, planId));

        const output = group(body, tl('Output'), tl('Exactly one Output node owns the final result.'));
        const contract = definition.outputContract;
        field(doc, tl('Output kind'), select(doc, [['rp_narration', tl('Chat narration')], ['project_review', tl('Project review')], ['result', tl('Typed result')]],
            { value: contract.kind, onCommit: value => edit(() => state.draft.setPlan({ outputContract: { kind: value, ...(contract.resultPolicy ? { resultPolicy: null } : {}) } })) }), { parent: output, key: 'out.kind' });
        field(doc, tl('Output owner'), select(doc, [['', tl('None selected')], ...definition.nodes.filter(node => node.kind === 'output').map(node => [node.nodeId, node.label])],
            { value: contract.ownerNodeId ?? '', onCommit: value => edit(() => state.draft.setPlan({ outputContract: { ownerNodeId: value || null } })) }), { parent: output, key: 'out.owner' });
        field(doc, tl('Output slot'), input(doc, { value: contract.slot, mono: true, onCommit: value => edit(() => state.draft.setPlan({ outputContract: { slot: value } })) }), { parent: output, key: 'out.slot' });
        checkbox(doc, tl('Allow partial output'), { checked: contract.allowPartial, parent: output, hint: tl('Required for deadline Joins. A partial result is labelled partial, never complete.'),
            onCommit: value => edit(() => state.draft.setPlan({ outputContract: { allowPartial: value } })) });
        checkbox(doc, tl('Bound the result payload'), { checked: Boolean(contract.resultPolicy), parent: output, onCommit: value => edit(() => state.draft.setPlan({ outputContract:
            { resultPolicy: value ? { outputType: contract.kind === 'project_review' ? 'json' : 'text', maxBytes: 16384 } : null } })) });
        if (contract.resultPolicy) {
            field(doc, tl('Result type'), select(doc, (contract.kind === 'rp_narration' ? ['text'] : contract.kind === 'project_review' ? ['json'] : ['text', 'json']).map(item => [item, item]),
                { value: contract.resultPolicy.outputType, onCommit: value => edit(() => state.draft.setPlan({ outputContract: { resultPolicy: { ...contract.resultPolicy, outputType: value } } })) }), { parent: output, key: 'out.type' });
            field(doc, tl('Maximum result bytes'), input(doc, { type: 'number', min: 1, value: contract.resultPolicy.maxBytes, onCommit: value => edit(() => state.draft.setPlan({ outputContract: { resultPolicy: { ...contract.resultPolicy, maxBytes: value } } })) }), { parent: output, key: 'out.bytes' });
        }

        const capabilities = group(body, tl('Capability ceiling'), tl('The most any node may declare. Declaring is not granting; the Host and original authorities decide at validation and run time.'));
        for (const capability of [...new Set([...CAPABILITIES, ...definition.capabilityCeiling])]) {
            checkbox(doc, capability, { checked: definition.capabilityCeiling.includes(capability), parent: capabilities, onCommit: on => edit(() => state.draft.setPlan({
                capabilityCeiling: on ? [...definition.capabilityCeiling, capability] : definition.capabilityCeiling.filter(item => item !== capability) })) });
        }

        const limits = group(body, tl('Limits'), tl('Hard bounds checked by the Host. They are not a budget grant.'));
        const grid = el(doc, 'div', 'atria-orch-grid', null, limits);
        for (const field_ of LIMIT_FIELDS) {
            field(doc, tl(LIMIT_LABELS[field_]), input(doc, { type: 'number', min: POSITIVE_LIMITS.has(field_) ? 1 : 0, value: definition.limits[field_],
                onCommit: (value, node) => { if (!edit(() => state.draft.setPlan({ limits: { [field_]: value } }))) node.value = definition.limits[field_]; } }), { parent: grid, key: 'limit.' + field_ });
        }

        const patches = group(body, tl('Graph changes during a Run'), tl('Operations a Planner may request. The Host still checks every change against limits.'));
        for (const op of PATCH_OPERATIONS) checkbox(doc, op, { checked: definition.graphChangePolicy.allowedOperations.includes(op), parent: patches, onCommit: on => edit(() => state.draft.setPlan({ graphChangePolicy: {
            allowedOperations: on ? [...definition.graphChangePolicy.allowedOperations, op] : definition.graphChangePolicy.allowedOperations.filter(item => item !== op) } })) });
        const kinds = el(doc, 'details', 'atria-orch-details', null, patches);
        el(doc, 'summary', '', fmt('Node kinds a change may add (${0})', [definition.graphChangePolicy.allowedNodeKinds.length]), kinds);
        for (const kind of NODE_KINDS) checkbox(doc, tl(KIND_LABELS[kind]), { checked: definition.graphChangePolicy.allowedNodeKinds.includes(kind), parent: kinds, onCommit: on => edit(() => state.draft.setPlan({ graphChangePolicy: {
            allowedNodeKinds: on ? [...definition.graphChangePolicy.allowedNodeKinds, kind] : definition.graphChangePolicy.allowedNodeKinds.filter(item => item !== kind) } })) });
        const layout = group(body, tl('Layout'));
        layout.append(button(doc, tl('Arrange automatically'), () => edit(() => state.draft.layoutAll(), tl('Nodes arranged. Undo restores the previous layout.'))));
    }

    function pinOptions(ports) {
        return state.draft.pins.filter(pin => ports.includes(pin.port)).map(pin => [pin.pinId, fmt('${0} · ${1}', [pin.pinId, pin.port])]);
    }

    function renderNode(body, node) {
        const definition = state.draft.definition;
        const head = group(body, tl(KIND_LABELS[node.kind]));
        el(doc, 'div', 'atria-orch-inline', null, head).append(el(doc, 'span', 'atria-field__label', tl('Node ID')), idText(doc, node.nodeId));
        field(doc, tl('Label'), input(doc, { value: node.label, onCommit: value => edit(() => state.draft.updateNode(node.nodeId, { label: value.slice(0, 256) })) }), { parent: head, key: 'node.label' });
        if (node.kind !== 'output') checkbox(doc, tl('Entry node'), { checked: definition.entryNodeIds.includes(node.nodeId), parent: head, hint: tl('Runs start at entry nodes.'),
            onCommit: on => edit(() => state.draft.setEntry(node.nodeId, on)) });

        const policy = group(body, tl('Behaviour'));
        const setPolicy = patch => edit(() => state.draft.updateNode(node.nodeId, { policy: patch }));
        if (['agent', 'planner', 'judge', 'review'].includes(node.kind)) {
            const options = pinOptions(['model']).filter(([pinId]) => node.dependencyPinIds.includes(pinId));
            field(doc, tl('Model pin'), select(doc, [['', tl('Not chosen')], ...options], { value: node.policy.agentPinId ?? '', onCommit: value => setPolicy({ agentPinId: value || null }) }),
                { parent: policy, key: 'node.agentPin', hint: options.length ? tl('An exact Runtime route pinned to this node.') : tl('Attach a model pin to this node under Dependencies first.') });
        }
        if (node.kind === 'review') field(doc, tl('Review rounds'), input(doc, { type: 'number', min: 1, value: node.policy.maxRounds, onCommit: value => setPolicy({ maxRounds: value }) }), { parent: policy, key: 'node.rounds' });
        if (node.kind === 'effect') {
            const options = pinOptions(['tool', 'project']).filter(([pinId]) => node.dependencyPinIds.includes(pinId));
            field(doc, tl('Action pin'), select(doc, [['', tl('Not chosen')], ...options], { value: node.policy.actionPinId ?? '', onCommit: value => setPolicy({ actionPinId: value || null }) }),
                { parent: policy, key: 'node.actionPin', hint: tl('An exact tool or Project action. Risk and approval are decided by the Host at run time.') });
        }
        if (node.kind === 'router') field(doc, tl('Selection'), select(doc, [['first_success', tl('First successful route')], ['all_matching', tl('All matching routes')]], { value: node.policy.selection, onCommit: value => setPolicy({ selection: value }) }), { parent: policy, key: 'node.selection' });
        if (node.kind === 'fanout') {
            field(doc, tl('Concurrency'), input(doc, { type: 'number', min: 1, value: node.policy.maxConcurrency, onCommit: value => setPolicy({ maxConcurrency: value }) }), { parent: policy, key: 'node.conc' });
            field(doc, tl('On branch failure'), select(doc, [['continue', tl('Continue other branches')], ['fail_fast', tl('Stop the group')]], { value: node.policy.failurePolicy, onCommit: value => setPolicy({ failurePolicy: value }) }), { parent: policy, key: 'node.failure' });
        }
        if (node.kind === 'join') {
            field(doc, tl('Join strategy'), select(doc, [['all-success', tl('All succeed')], ['all-settled', tl('All settle')], ['any-success', tl('Any succeeds')], ['count-quorum', tl('Quorum')], ['deadline', tl('Deadline (partial allowed)')]],
                { value: node.policy.strategy, onCommit: value => setPolicy({ strategy: value }) }), { parent: policy, key: 'node.strategy' });
            field(doc, tl('Quorum'), input(doc, { type: 'number', min: 1, value: node.policy.quorum, onCommit: value => setPolicy({ quorum: value }) }), { parent: policy, key: 'node.quorum' });
            field(doc, tl('Deadline (ms)'), input(doc, { type: 'number', min: 1, value: node.policy.deadlineMs, onCommit: value => setPolicy({ deadlineMs: value }) }), { parent: policy, key: 'node.deadline' });
        }
        if (['wait', 'approval'].includes(node.kind)) field(doc, tl('Timeout (ms)'), input(doc, { type: 'number', min: 1, value: node.policy.timeoutMs, onCommit: value => setPolicy({ timeoutMs: value }) }), { parent: policy, key: 'node.timeout' });
        if (!policy.querySelector('.atria-field')) el(doc, 'p', 'atria-orch-group__hint', tl('This node kind has no extra settings.'), policy);

        const deps = group(body, tl('Dependencies'), tl('Exact pins this node may use. Manage pins in the Pins section.'));
        if (!state.draft.pins.length) el(doc, 'p', 'atria-orch-group__hint', tl('No pins in this Plan yet.'), deps);
        for (const pin of state.draft.pins) checkbox(doc, fmt('${0} · ${1}', [pin.pinId, pin.port]), { checked: node.dependencyPinIds.includes(pin.pinId), parent: deps,
            onCommit: on => edit(() => state.draft.updateNode(node.nodeId, { dependencyPinIds: on ? [...node.dependencyPinIds, pin.pinId] : node.dependencyPinIds.filter(id => id !== pin.pinId),
                ...(!on && (node.policy.agentPinId === pin.pinId || node.policy.actionPinId === pin.pinId) ? { policy: { ...(node.policy.agentPinId === pin.pinId ? { agentPinId: null } : { actionPinId: null }) } } : {}) })) });

        if (!['fanout', 'join'].includes(node.kind)) {
            const caps = group(body, tl('Declared capabilities'), tl('Only capabilities inside the Plan ceiling. Declared does not mean granted.'));
            if (!definition.capabilityCeiling.length) el(doc, 'p', 'atria-orch-group__hint', tl('The Plan ceiling is empty. Add capabilities in Plan settings.'), caps);
            for (const capability of definition.capabilityCeiling) checkbox(doc, capability, { checked: node.capabilities.includes(capability), parent: caps,
                onCommit: on => edit(() => state.draft.updateNode(node.nodeId, { capabilities: on ? [...node.capabilities, capability] : node.capabilities.filter(item => item !== capability) })) });
            if (node.capabilities.includes('agent.delegate') && EXECUTABLE_KINDS.includes(node.kind)) {
                const allowed = group(body, tl('Delegation allowed to'), tl('Only Plan pins attached to this node. An empty list forbids delegation.'));
                const planPins = state.draft.pins.filter(pin => pin.port === 'plan' && node.dependencyPinIds.includes(pin.pinId));
                if (!planPins.length) el(doc, 'p', 'atria-orch-group__hint', tl('Attach a Plan pin to this node first.'), allowed);
                for (const pin of planPins) checkbox(doc, pin.pinId, { checked: node.policy.allowedPlanPinIds?.includes(pin.pinId), parent: allowed,
                    onCommit: on => setPolicy({ allowedPlanPinIds: on ? [...(node.policy.allowedPlanPinIds ?? []), pin.pinId] : (node.policy.allowedPlanPinIds ?? []).filter(id => id !== pin.pinId) }) });
            }
        }

        for (const direction of ['inputs', 'outputs']) {
            if (direction === 'outputs' && node.kind === 'output') continue;
            const ports = group(body, direction === 'inputs' ? tl('Input ports') : tl('Output ports'), tl('Edges connect ports of the same type.'));
            node[direction].forEach((port, index) => {
                const row = el(doc, 'div', 'atria-orch-port', null, ports);
                const name = input(doc, { value: port.name, mono: true, onCommit: (value, inputNode) => { if (!edit(() => state.draft.setPort(node.nodeId, direction, index, { ...port, name: value }))) inputNode.value = port.name; } });
                name.setAttribute('aria-label', fmt('${0} port ${1} name', [direction === 'inputs' ? tl('Input') : tl('Output'), index + 1]));
                name.dataset.field = `port.${direction}.${index}.name`;
                const type = input(doc, { value: port.type, mono: true, onCommit: (value, inputNode) => { if (!edit(() => state.draft.setPort(node.nodeId, direction, index, { ...port, type: value }))) inputNode.value = port.type; } });
                type.setAttribute('aria-label', fmt('${0} port ${1} type', [direction === 'inputs' ? tl('Input') : tl('Output'), index + 1]));
                type.dataset.field = `port.${direction}.${index}.type`;
                type.setAttribute('list', 'atria-orch-port-types');
                row.append(name, type);
                checkbox(doc, tl('Required'), { checked: port.required, parent: row, onCommit: on => edit(() => state.draft.setPort(node.nodeId, direction, index, { ...port, required: on })) });
                row.append(button(doc, fmt('Remove port ${0}', [port.name]), () => edit(() => state.draft.setPort(node.nodeId, direction, index, null)), { variant: 'plain', icon: 'trash', iconOnly: true }));
            });
            ports.append(button(doc, direction === 'inputs' ? tl('Add input port') : tl('Add output port'), () => {
                const names = new Set(node[direction].map(item => item.name));
                let name = direction === 'inputs' ? 'in' : 'out', suffix = 2;
                while (names.has(name)) name = (direction === 'inputs' ? 'in' : 'out') + suffix++;
                edit(() => state.draft.setPort(node.nodeId, direction, node[direction].length, { name, type: 'text', required: false }));
            }, { icon: 'plus' }));
        }
        let types = doc.getElementById('atria-orch-port-types');
        if (!types) { types = el(doc, 'datalist', '', null, inspector); types.id = 'atria-orch-port-types'; for (const value of ['text', 'json']) el(doc, 'option', '', null, types).value = value; }

        const connections = group(body, tl('Connections'));
        const incoming = definition.edges.filter(edge => edge.to.nodeId === node.nodeId), outgoing = definition.edges.filter(edge => edge.from.nodeId === node.nodeId);
        for (const [label, edges] of [[tl('Incoming'), incoming], [tl('Outgoing'), outgoing]]) {
            el(doc, 'p', 'atria-field__label', fmt('${0} (${1})', [label, edges.length]), connections);
            for (const edge of edges) connections.append(button(doc, edgeLabel(edge), () => selectItem({ type: 'edge', id: edge.edgeId }), { variant: 'plain' }));
        }
        if (node.kind !== 'output') {
            const form = el(doc, 'div', 'atria-orch-connect', null, connections);
            const targets = definition.nodes.filter(item => item.nodeId !== node.nodeId);
            const target = select(doc, [['', tl('Choose a node')], ...targets.map(item => [item.nodeId, fmt('${0} (${1})', [item.label, tl(KIND_LABELS[item.kind])])])], { value: '' });
            const portSelect = select(doc, [['', tl('Choose ports')]], { value: '' });
            portSelect.disabled = true;
            target.addEventListener('change', () => {
                const pairs = compatiblePorts(definition, node.nodeId, target.value);
                portSelect.replaceChildren();
                const blank = el(doc, 'option', '', pairs.length ? tl('Choose ports') : tl('No ports of the same type'), portSelect); blank.value = '';
                for (const pair of pairs) { const option = el(doc, 'option', '', fmt('${0} → ${1}', [pair.from, pair.to]), portSelect); option.value = JSON.stringify(pair); }
                portSelect.disabled = !pairs.length;
                if (pairs.length === 1) portSelect.value = JSON.stringify(pairs[0]);
            });
            field(doc, tl('Connect to'), target, { parent: form, key: 'connect.target' });
            field(doc, tl('Ports'), portSelect, { parent: form, key: 'connect.ports' });
            form.append(button(doc, tl('Add edge'), () => { if (target.value && portSelect.value) connect(node.nodeId, target.value, JSON.parse(portSelect.value)); }, { icon: 'plus' }));
        }
        const actions = el(doc, 'div', 'atria-button-row atria-orch-inspector__actions', null, body);
        actions.append(button(doc, tl('Duplicate'), () => { let id; if (edit(() => { id = state.draft.duplicateNode(node.nodeId); })) selectItem({ type: 'node', id }); }, { icon: 'duplicate' }),
            button(doc, tl('Remove node…'), () => removeNode(node.nodeId), { variant: 'destructive', icon: 'trash' }));
    }

    function renderEdge(body, edge) {
        const definition = state.draft.definition;
        const head = group(body, tl('Edge'));
        el(doc, 'div', 'atria-orch-inline', null, head).append(el(doc, 'span', 'atria-field__label', tl('Edge ID')), idText(doc, edge.edgeId));
        if (edgeTypeMismatch(definition, edge)) head.append(banner(doc, { title: tl('Port types differ'), message: tl('This edge connects ports of different types or a missing port. The Host will reject it.'), tone: 'danger' }));
        const endpoint = (end, direction) => {
            const nodes = definition.nodes;
            const nodeSelect = select(doc, nodes.map(node => [node.nodeId, node.label || tl(KIND_LABELS[node.kind])]), { value: edge[end].nodeId,
                onCommit: value => { const next = definition.nodes.find(node => node.nodeId === value); edit(() => state.draft.updateEdge(edge.edgeId, { [end]: { nodeId: value, port: next?.[direction][0]?.name ?? edge[end].port } })); } });
            const current = definition.nodes.find(node => node.nodeId === edge[end].nodeId);
            const portSelect = select(doc, (current?.[direction] ?? []).map(port => [port.name, fmt('${0} (${1})', [port.name, port.type])]), { value: edge[end].port,
                onCommit: value => edit(() => state.draft.updateEdge(edge.edgeId, { [end]: { nodeId: edge[end].nodeId, port: value } })) });
            field(doc, end === 'from' ? tl('From node') : tl('To node'), nodeSelect, { parent: head, key: 'edge.' + end + '.node' });
            field(doc, end === 'from' ? tl('From port') : tl('To port'), portSelect, { parent: head, key: 'edge.' + end + '.port' });
        };
        endpoint('from', 'outputs');
        endpoint('to', 'inputs');
        field(doc, tl('Condition'), select(doc, [['always', tl('Always')], ['success', tl('On success')], ['failure', tl('On failure')]], { value: edge.condition,
            onCommit: value => edit(() => state.draft.updateEdge(edge.edgeId, { condition: value })) }), { parent: head, key: 'edge.condition' });
        field(doc, tl('Maximum visits'), input(doc, { type: 'number', min: 1, value: edge.maxVisits, onCommit: value => edit(() => state.draft.updateEdge(edge.edgeId, { maxVisits: value })) }),
            { parent: head, key: 'edge.visits', hint: fmt('Plan limit: ${0} visits per edge.', [definition.limits.maxEdgeVisits]) });
        checkbox(doc, tl('Loop back'), { checked: edge.loopBack, parent: head, hint: tl('A bounded return to an earlier node. Needs a loop iteration limit; without loop-backs the graph must be acyclic.'),
            onCommit: on => edit(() => state.draft.updateEdge(edge.edgeId, { loopBack: on })) });
        el(doc, 'div', 'atria-button-row atria-orch-inspector__actions', null, body).append(button(doc, tl('Remove edge'), () => { if (edit(() => state.draft.removeEdge(edge.edgeId), tl('Edge removed. Undo is available.'))) selectItem({ type: 'plan' }); }, { variant: 'destructive', icon: 'trash' }));
    }

    async function loadRoutes() {
        if (state.routes) return state.routes;
        try { state.routes = (await runtimeRequest('/configuration', { signal: controller.signal })).routes ?? []; } catch { state.routes = []; }
        return state.routes;
    }

    function renderPins(body) {
        const issues = issueTargets();
        const list = group(body, tl('Pinned dependencies'), tl('Each pin is an exact original reference plus a fingerprint computed by the Host. A pin is not a permission.'));
        if (!state.draft.pins.length) el(doc, 'p', 'atria-orch-group__hint', tl('No pins yet.'), list);
        for (const pin of state.draft.pins) {
            const card = el(doc, 'div', 'atria-orch-pin', null, list);
            const top = el(doc, 'div', 'atria-orch-pin__top', null, card);
            el(doc, 'strong', 'atria-orch-mono', pin.pinId, top);
            top.append(seal(doc, { label: pin.port, kind: 'exact' }));
            if (issues.pins.has(pin.pinId)) top.append(stateChip(doc, { label: tl('Problem reported'), tone: 'danger', shape: 'failed' }));
            el(doc, 'code', 'atria-orch-pin__ref', JSON.stringify(pin.resourceRef), card);
            el(doc, 'div', 'atria-orch-inline', null, card).append(el(doc, 'span', 'atria-field__label', tl('Fingerprint')), idText(doc, pin.integrity));
            const users = state.draft.definition.nodes.filter(node => node.dependencyPinIds.includes(pin.pinId));
            el(doc, 'p', 'atria-orch-group__hint', users.length ? fmt('Used by ${0}', [users.map(node => node.label).join(', ')]) : tl('Not attached to any node.'), card);
            const row = el(doc, 'div', 'atria-button-row', null, card);
            row.append(button(doc, tl('Pin current fingerprint'), () => repin(pin)), button(doc, fmt('Remove pin ${0}', [pin.pinId]), async () => {
                if (!users.length || await confirmInline(doc, banners, { title: fmt('Remove pin ${0}?', [pin.pinId]), message: fmt('It is detached from ${0} nodes in this draft. Published revisions are not changed.', [users.length]),
                    confirmLabel: tl('Remove pin'), cancelLabel: tl('Keep pin'), destructive: true })) edit(() => state.draft.removePin(pin.pinId));
            }, { variant: 'plain', icon: 'trash' }));
        }
        const add = group(body, tl('Add a pin'));
        const pinId = input(doc, { mono: true, placeholder: 'model.narrator' });
        field(doc, tl('Pin ID'), pinId, { parent: add, key: 'pin.id', hint: tl('Letters, digits, dot, colon, dash or underscore; starts with a letter.') });
        const port = select(doc, PIN_PORTS.map(item => [item, item]), { value: 'model' });
        field(doc, tl('Port'), port, { parent: add, key: 'pin.port' });
        const helper = el(doc, 'div', 'atria-orch-pin-helper', null, add);
        const ref = textarea(doc, { mono: true, rows: 3 });
        field(doc, tl('Exact original reference (JSON)'), ref, { parent: add, key: 'pin.ref', hint: tl('Copied from the original resource. Never put a Secret or credential here.') });
        const result = el(doc, 'div', 'atria-orch-status', null, add);
        result.setAttribute('role', 'status');
        const renderHelper = async () => {
            helper.replaceChildren();
            if (port.value === 'model') {
                const routes = await loadRoutes();
                const choose = select(doc, [['', routes.length ? tl('Choose a Runtime route') : tl('No Runtime routes found')], ...routes.map(route => [route.runtimeRouteId, fmt('${0} · ${1}', [route.displayName || route.runtimeRouteId, route.role ?? ''])])], { value: '' });
                choose.addEventListener('change', () => { if (choose.value) ref.value = JSON.stringify({ scope: 'player', runtimeRouteId: choose.value }); });
                field(doc, tl('Runtime route'), choose, { parent: helper, key: 'pin.route' });
            } else if (port.value === 'plan') {
                let plans = [];
                try { plans = (await client.listPlans(null, 100, controller.signal)).items.filter(item => item.planId !== planId && item.currentPlanRevisionId); } catch { plans = []; }
                const choose = select(doc, [['', plans.length ? tl('Choose a published Plan') : tl('No other published Plans')], ...plans.map(item => [item.planId, planTitle(item)])], { value: '' });
                choose.addEventListener('change', async () => {
                    const chosen = plans.find(item => item.planId === choose.value);
                    if (!chosen) return;
                    try {
                        const revisions = await client.listRevisions(chosen.planId, null, 100, controller.signal);
                        const current = revisions.items.find(item => item.planRevisionId === chosen.currentPlanRevisionId);
                        if (current) ref.value = JSON.stringify({ planId: current.planId, planRevisionId: current.planRevisionId, definitionHash: current.definitionHash });
                    } catch (error) { result.textContent = describeError(error); }
                });
                field(doc, tl('Published Plan'), choose, { parent: helper, key: 'pin.plan' });
            }
        };
        port.addEventListener('change', () => void renderHelper());
        void renderHelper();
        add.append(button(doc, tl('Pin exact fingerprint'), async () => {
            let resourceRef;
            try { resourceRef = JSON.parse(ref.value); } catch { result.textContent = tl('The reference is not valid JSON.'); ref.setAttribute('aria-invalid', 'true'); return; }
            ref.removeAttribute('aria-invalid');
            result.textContent = tl('Asking the original authority for the exact fingerprint…');
            try {
                const pinned = await client.inspectDependency({ pinId: pinId.value.trim(), port: port.value, resourceRef }, controller.signal);
                if (edit(() => state.draft.upsertPin(pinned), fmt('Pinned ${0}.', [pinned.pinId]))) result.textContent = fmt('Pinned ${0} at ${1}.', [pinned.pinId, shortId(pinned.integrity)]);
            } catch (error) { result.textContent = classifyOrchestrationError(error) === 'missing' ? tl('No original resource matches this reference.') : describeError(error); }
        }, { variant: 'secondary', icon: 'lock' }));
    }

    async function repin(pin) {
        try {
            const pinned = await client.inspectDependency({ pinId: pin.pinId, port: pin.port, resourceRef: pin.resourceRef }, controller.signal);
            if (pinned.integrity === pin.integrity) announce(fmt('${0} is already pinned to the current fingerprint.', [pin.pinId]));
            else edit(() => state.draft.upsertPin(pinned), fmt('${0} now pins the current fingerprint. Save and validate again.', [pin.pinId]));
        } catch (error) { announce(describeError(error)); showBanner({ title: fmt('Could not pin ${0}', [pin.pinId]), message: describeError(error), tone: 'danger' }); }
    }

    function renderRevisions(body) {
        const list = group(body, tl('Published revisions'), tl('Immutable. Runs pin the exact revision they started with.'));
        if (!state.revisions.length) el(doc, 'p', 'atria-orch-group__hint', tl('Nothing published yet.'), list);
        for (const revision of state.revisions) {
            const card = el(doc, 'div', 'atria-orch-pin', null, list);
            const top = el(doc, 'div', 'atria-orch-pin__top', null, card);
            top.append(idText(doc, revision.planRevisionId));
            if (revision.planRevisionId === state.base.currentPlanRevisionId) top.append(seal(doc, { label: tl('Current'), kind: 'solid' }));
            else top.append(seal(doc, { label: tl('Earlier'), kind: 'history' }));
            el(doc, 'p', 'atria-orch-group__hint', fmt('Published ${0} · ${1} nodes', [formatAtriaRelativeTime(revision.publishedAt), revision.definition.nodes.length]), card);
            const diff = diffDefinitions(revision, currentDocument());
            const changes = diff.nodes.added.length + diff.nodes.removed.length + diff.nodes.changed.length + diff.edges.added.length + diff.edges.removed.length + diff.edges.changed.length + diff.pins.added.length + diff.pins.removed.length + diff.pins.changed.length + diff.fields.length;
            el(doc, 'p', 'atria-orch-group__hint', changes ? fmt('Draft differs: ${0} node, ${1} edge, ${2} pin and ${3} setting changes.', [
                diff.nodes.added.length + diff.nodes.removed.length + diff.nodes.changed.length, diff.edges.added.length + diff.edges.removed.length + diff.edges.changed.length,
                diff.pins.added.length + diff.pins.removed.length + diff.pins.changed.length, diff.fields.length]) : tl('Draft matches this revision.'), card);
        }
        if (state.revisionsCursor) list.append(button(doc, tl('Load more revisions'), async () => {
            try { const next = await client.listRevisions(planId, state.revisionsCursor, 50, controller.signal); state.revisions.push(...next.items); state.revisionsCursor = next.cursor; renderInspector(); } catch (error) { announce(describeError(error)); }
        }));
        renderBinding(body);
    }

    function renderBinding(body) {
        const section = group(body, tl('Use for a source'), tl('Choose which published revision a Session, Project task or chat uses. Saving a choice does not start a Run or grant any permission.'));
        if (!state.revisions.length) { el(doc, 'p', 'atria-orch-group__hint', tl('Publish a revision first.'), section); return; }
        const revision = select(doc, state.revisions.map(item => [item.planRevisionId, fmt('${0}${1}', [shortId(item.planRevisionId), item.planRevisionId === state.base.currentPlanRevisionId ? tl(' (current)') : ''])]), { value: state.base.currentPlanRevisionId ?? state.revisions[0].planRevisionId });
        field(doc, tl('Revision'), revision, { parent: section, key: 'binding.revision' });
        const current = el(doc, 'div', 'atria-orch-binding', null, section);
        current.setAttribute('role', 'status');
        let binding = null, selector = null, pendingBinding = null;
        const picker = createSourcePicker(doc, { client, signal: controller.signal, onChange: async value => {
            selector = value; binding = null; current.replaceChildren();
            if (!value) return;
            current.textContent = tl('Reading the current choice for this source…');
            try {
                binding = await client.getBinding(value, controller.signal);
                current.replaceChildren(binding ? fmt('Currently: Plan ${0}, revision ${1} (choice v${2}).', [shortId(binding.planRef.planId), shortId(binding.planRef.planRevisionId), binding.version]) : tl('No Plan chosen for this source yet.'));
            } catch (error) { current.textContent = describeError(error); }
        } });
        section.append(picker.element);
        const saveChoice = button(doc, tl('Save choice for this source'), async () => {
            if (!selector) { current.textContent = tl('Choose a source first.'); return; }
            const chosen = state.revisions.find(item => item.planRevisionId === revision.value);
            const bodyValue = { sourceSelector: selector, planRef: { planId: chosen.planId, planRevisionId: chosen.planRevisionId, definitionHash: chosen.definitionHash }, expectedVersion: binding?.version ?? null };
            const sameRequest = pendingBinding && JSON.stringify(pendingBinding.body) === JSON.stringify(bodyValue);
            saveChoice.disabled = true; saveChoice.setAttribute('aria-busy', 'true');
            try {
                const { outcome } = await client.saveBinding(bodyValue, { signal: controller.signal, ...(sameRequest ? { commandId: pendingBinding.commandId } : {}) });
                pendingBinding = null; binding = outcome;
                current.replaceChildren(fmt('Choice saved for ${0}: revision ${1} (choice v${2}). No Run was started.', [sourceLabel(selector), shortId(outcome.planRef.planRevisionId), outcome.version]));
            } catch (error) {
                const type = classifyOrchestrationError(error);
                if (type === 'unknown') pendingBinding = { body: bodyValue, commandId: error.commandId };
                current.replaceChildren(type === 'unknown' ? fmt('${0} Press Save again to check the same request.', [describeError(error)]) : describeError(error));
                if (type === 'conflict') try { binding = await client.getBinding(selector, controller.signal); } catch { /* keep the shown error */ }
            } finally { saveChoice.disabled = false; saveChoice.removeAttribute('aria-busy'); }
        }, { variant: 'secondary' });
        section.append(saveChoice, button(doc, tl('Open Runs for a source'), () => openRuns(selector), { variant: 'plain' }));
    }

    /* ── keyboard ── */
    const keydown = event => {
        if (event.isComposing || event.keyCode === 229 || !(event.ctrlKey || event.metaKey)) return;
        const editable = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
        if (editable) return;
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) { event.preventDefault(); if (state.draft?.undo()) announce(tl('Undone.')); } else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); if (state.draft?.redo()) announce(tl('Redone.')); }
    };
    page.addEventListener('keydown', keydown);
    inspector.addEventListener('keydown', keydown);
    const draftQuery = event => { if (event.detail.root.contains(page) || page.contains(event.detail.root)) event.detail.dirty ||= Boolean(state.draft?.isDirty()); };
    doc.addEventListener('atria-draft-query', draftQuery);

    void load();
    return {
        selectNodeFromProblem: id => selectItem({ type: 'node', id }),
        refreshContext: () => renderInspector(),
        dismissTransient() {
            return dismissInline(doc, banners);
        },
        isDirty: () => Boolean(state.draft?.isDirty()),
        dispose() {
            controller.abort();
            graph.dispose();
            doc.removeEventListener('atria-draft-query', draftQuery);
            page.remove();
            inspector.remove();
        },
    };
}

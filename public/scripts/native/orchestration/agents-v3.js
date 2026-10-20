// Agents › Plans and Agents › Runs inside the existing Shell. Route child IDs:
// plans · plans:<planId> · runs · runs:<runId>. URLs only locate; the Host
// re-checks ownership and source access on every read.
import { formatShellText as fmt, translateShellText as tl } from '../../atria-shell/localization.js';
import { createOrchestrationClient } from './client.js';
import { mountPlanEditor, mountPlanLibrary } from './plan-workspace.js';
import { mountRunDetail, mountRunList } from './run-workspace.js';
import { el } from './dom.js';
import { shortId } from './ledger.js';
import { buildAgentsFrame } from '../../atria-shell/agent-sections.js';

export const V3_SECTIONS = Object.freeze(['plans', 'runs']);

export function parseV3Route(route) {
    const childId = String(route?.child?.id || '') || 'plans';
    const [section, id = ''] = childId.split(/:(.*)/s);
    if (!V3_SECTIONS.includes(section)) return null;
    if (section === 'plans') return { section, planId: /^oplan_[a-f0-9]{32}$/.test(id) ? id : null };
    return { section, runId: /^orun_[a-f0-9]{32}$/.test(id) ? id : null };
}

let sharedClient = null;
const client = () => sharedClient ??= createOrchestrationClient();

export function mountAgentsV3({ document: doc, slot, route, shell, navigation, host }) {
    const frame = buildAgentsFrame(doc, { active: parseV3Route(route)?.section, onSelect: id => host.openAgentSection(id) });
    const { root, body } = frame;
    root.classList.add('atria-orch'); body.classList.add('atria-orch__body');
    slot.replaceChildren(root);
    let current = null, currentKey = '';

    const navigateChild = (id, label, kind = 'detail') => navigation.navigateChild({ id, label, kind }, { history: 'push', reason: 'agents-v3-' + id.split(':')[0] });
    const openPlan = (planId, label = '') => navigateChild('plans:' + planId, label || fmt('Plan ${0}', [shortId(planId)]));
    const openRun = runId => navigateChild('runs:' + runId, fmt('Run ${0}', [shortId(runId)]));

    function show(nextRoute) {
        const parsed = parseV3Route(nextRoute);
        if (!parsed) return;
        frame.select(parsed.section);
        // A deep link carries only the child ID; label the section once known.
        const child = nextRoute.child;
        if (child && child.label === child.id && (child.id === 'plans' || child.id === 'runs')) navigation.navigateChild({ id: child.id, label: child.id === 'plans' ? 'Plans' : 'Runs', kind: 'workspace' }, { history: 'replace', reason: 'agents-v3-label' });
        if (child && child.label === child.id && parsed.runId) navigation.navigateChild({ id: child.id, label: fmt('Run ${0}', [shortId(parsed.runId)]), kind: 'detail' }, { history: 'replace', reason: 'agents-v3-label' });
        const key = parsed.section + ':' + (parsed.planId ?? parsed.runId ?? '');
        if (key === currentKey) return;
        current?.dispose?.();
        shell.slots.dock.querySelector('.atria-orch-inspector')?.remove();
        body.replaceChildren();
        currentKey = key;
        // Run · Plan share one tab; the lists switch here, details keep their own back path.
        if (!parsed.planId && !parsed.runId) {
            const views = el(doc, 'div', 'atria-segmented atria-orch-views', null, body);
            views.setAttribute('role', 'group'); views.setAttribute('aria-label', tl('Run · Plan'));
            for (const [id, label] of [['runs', 'Runs'], ['plans', 'Plans']]) {
                const item = el(doc, 'button', 'atria-segmented__item', tl(label), views);
                item.type = 'button'; item.setAttribute('aria-pressed', String(parsed.section === id));
                item.addEventListener('click', () => host.openAgentSection(id));
            }
        }
        const summary = el(doc, 'section', 'atria-workspace-context-summary');
        summary.dataset.atriaWorkspaceContext = 'true';
        el(doc, 'strong', '', parsed.section === 'plans' ? tl('Plans') : tl('Runs'), summary);
        el(doc, 'p', '', parsed.section === 'plans' ? tl('Drafts stay on this device until saved. The Native Host validates, publishes and records revisions.')
            : tl('Runs are read from the Native Host projection. Leaving this page does not cancel a Run.'), summary);
        shell.setContextContent(summary, { title: parsed.section === 'plans' ? tl('Plans') : tl('Runs'), open: false });
        const common = { document: doc, root: body, client: client(), shell, environment: shell.environment };
        if (parsed.section === 'plans' && parsed.planId) current = mountPlanEditor({ ...common, planId: parsed.planId,
            onTitle: label => {
                // A deep link carries only the ID; show the Plan name once the Host returned it.
                const child = navigation.getRoute().child;
                if (child?.id === 'plans:' + parsed.planId && child.label !== label) navigation.navigateChild({ id: child.id, label, kind: 'detail' }, { history: 'replace', reason: 'agents-v3-title' });
            },
            onOpenPlan: openPlan, openRuns: () => host.openAgentSection('runs'), openPromptProgram: ref => host.openLibraryResource(ref) });
        else if (parsed.section === 'plans') current = mountPlanLibrary({ ...common, onOpen: openPlan });
        else if (parsed.runId) current = mountRunDetail({ ...common, runId: parsed.runId, openPlan: planId => openPlan(planId) });
        else current = mountRunList({ ...common, onOpenRun: runId => openRun(runId) });
    }

    show(route);
    return {
        root,
        ownsContext: true,
        updateRoute: nextRoute => show(nextRoute),
        refreshContext: () => current?.refreshContext?.(),
        dismissTransient: () => current?.dismissTransient?.() === true,
        dispose() {
            current?.dispose?.();
            current = null;
            root.remove();
        },
    };
}

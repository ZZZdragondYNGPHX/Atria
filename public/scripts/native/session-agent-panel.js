import { mountAgentGoals } from './agent-goals-panel.js';
import { mountAgentEvolution } from './agent-evolution-panel.js';
import { sessionEvidenceReceipts } from './evidence-receipts.js';
import { el, field, feedback } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function mountSessionAgentPanel({ root, runtime }) {
    const doc = root.ownerDocument, snapshot = runtime?.snapshot;
    if (!snapshot) { feedback(doc, root, 'Open a Session first.'); return { dispose() {} }; }
    const scope = { domain: 'rp_session', sessionId: snapshot.session.sessionId };
    const sameSource = () => runtime.snapshot?.session.sessionId === scope.sessionId && runtime.snapshot?.revision.branchId === snapshot.revision.branchId;
    const sources = snapshot.timeline.map((message, index) => ({ label: `${index + 1} · ${String(message.content ?? '').slice(0, 72)}`, selector: { kind: 'message', messageId: message.messageId }, path: ['content'], value: message.content ?? '' }));
    const disposeGoals = mountAgentGoals({ slot: root, scope, sources, writable: () => sameSource() && !runtime.history && !runtime.failed });
    el(doc, 'h3', '', tl('Feedback on saved output'), root);
    const receipts = sessionEvidenceReceipts(runtime);
    let disposeEvolution = null;
    const panel = el(doc, 'div', '', undefined, root);
    if (receipts.length) {
        const label = el(doc, 'label', '', tl('Saved output'), root), select = el(doc, 'select', '', undefined, label);
        select.setAttribute('aria-label', tl('Saved output'));
        for (const receipt of receipts) { const option = el(doc, 'option', '', receipt.revisionId, select); option.value = receipt.evidenceId; }
        const receipt = el(doc, 'p', 'atri-library-meta', '', root);
        const show = () => { receipt.textContent = tl('Evidence receipt ID') + ': ' + select.value; disposeEvolution?.(); disposeEvolution = mountAgentEvolution({ slot: panel, scope, sourceKind: 'evidence', sourceId: select.value, writable: () => sameSource() && !runtime.history && !runtime.failed }); };
        select.addEventListener('change', show); show();
    } else feedback(doc, panel, 'No saved output receipt in this open workspace. Generate a new saved output to leave feedback.');
    // Exact receipts can be reopened after reload; the original service checks ownership and currentness.
    const advanced = el(doc, 'details', '', undefined, root); el(doc, 'summary', '', tl('Open an evidence receipt'), advanced);
    const id = field(doc, advanced, 'Evidence receipt ID', '');
    const open = el(doc, 'button', '', tl('Open saved evidence'), advanced); open.type = 'button';
    open.addEventListener('click', () => {
        if (!sameSource() || !/^[a-f0-9]{64}$/.test(id.value)) { feedback(doc, advanced, 'Enter an exact evidence receipt ID.', true); return; }
        disposeEvolution?.(); disposeEvolution = mountAgentEvolution({ slot: panel, scope, sourceKind: 'evidence', sourceId: id.value, writable: () => sameSource() && !runtime.history && !runtime.failed });
    });
    return { dispose() { disposeEvolution?.(); disposeGoals(); } };
}

import { el, field, action, feedback } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

// Author a bounded goal against an actual source; creation never starts a model.
export function mountGoalAuthoring({ root, scope, sources, request, onCreated = () => {}, writable = () => true }) {
    const doc = root.ownerDocument;
    const form = el(doc, 'details', 'atria-goal-authoring', undefined, root);
    el(doc, 'summary', '', tl('New persistent goal'), form);
    el(doc, 'p', '', tl('Choose a saved source and the exact outcome to check. Creating a goal does not run a model.'), form);
    const fields = el(doc, 'fieldset', '', undefined, form);
    const intent = field(doc, fields, 'Goal', '');
    const label = el(doc, 'label', '', tl('Saved source'), fields), source = el(doc, 'select', '', undefined, label);
    source.setAttribute('aria-label', tl('Saved source'));
    for (const [index, choice] of sources.entries()) { const option = el(doc, 'option', '', choice.label, source); option.value = String(index); }
    const expectedLabel = el(doc, 'label', '', tl('Expected value'), fields);
    const expected = el(doc, 'textarea', '', undefined, expectedLabel); expected.rows = 4;
    const requests = field(doc, fields, 'Request limit', '1', 'number'); requests.min = '1'; requests.max = '32'; requests.step = '1';
    const tokens = field(doc, fields, 'Token limit', '16000', 'number'); tokens.min = '1'; tokens.step = '1';
    const notice = el(doc, 'div', '', undefined, form);
    const review = el(doc, 'div', '', undefined, form);
    let disposed = false, busy = false, preview = null, published = false, sequence = 0;
    function invalidate(event) { ++sequence; preview = null; review.replaceChildren(); confirm.disabled = true; form.dataset.atriaDraftDirty = String(Boolean(event || intent.value)); }
    function selectSource() { const choice = sources[Number(source.value)]; expected.value = choice ? (typeof choice.value === 'string' ? choice.value : JSON.stringify(choice.value)) : ''; invalidate(); }
    function definition() {
        const choice = sources[Number(source.value)];
        if (!choice || !intent.value.trim() || !expected.value.trim()) throw new Error(tl('Choose a source, goal and expected value.'));
        for (const input of [requests, tokens]) if (!input.checkValidity() || !Number.isSafeInteger(Number(input.value))) { input.reportValidity(); input.focus(); throw new Error(tl('Enter a whole positive budget limit.')); }
        const equals = typeof choice.value === 'string' ? expected.value : JSON.parse(expected.value);
        return { scope, subject: { kind: 'user', actorId: null }, intent: intent.value.trim(),
            criteria: [{ criterionId: 'outcome', description: choice.label, selector: choice.selector, path: choice.path, equals }],
            invariants: [], budget: { maxRequests: Number(requests.value), maxTokens: Number(tokens.value) } };
    }
    async function run(fn) {
        if (busy || disposed || published || !writable()) return;
        busy = true; fields.disabled = true; form.dataset.atriaSavePending = 'true'; prepare.disabled = confirm.disabled = true; form.setAttribute('aria-busy', 'true'); notice.replaceChildren();
        try { await fn(); } catch (error) { if (!disposed) feedback(doc, notice, error.message, true); } finally { busy = false; if (!disposed) { form.dataset.atriaSavePending = 'false'; fields.disabled = published; prepare.disabled = published || !sources.length; confirm.disabled = published || !preview; form.setAttribute('aria-busy', 'false'); } }
    }
    const prepare = action(doc, form, 'Review goal', () => run(async () => {
        preview = null; review.replaceChildren(); const version = sequence, input = definition();
        const result = await request('create-preflight', input);
        if (disposed || version !== sequence) return;
        preview = { input, anchor: result.anchorFingerprint, version };
        el(doc, 'p', '', `${tl('Ready to create')} · ${input.intent} · ${input.budget.maxRequests} ${tl('requests')} · ${input.budget.maxTokens} ${tl('tokens')}`, review);
    }), { disabled: !sources.length });
    const confirm = action(doc, form, 'Create reviewed goal', () => run(async () => {
        if (!preview || preview.version !== sequence) return;
        const result = await request('create-checked', { definition: preview.input, expectedAnchorFingerprint: preview.anchor });
        published = true;
        if (disposed) return;
        form.dataset.atriaDraftDirty = 'false'; form.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
        review.replaceChildren(); el(doc, 'p', 'atria-goal-receipt', tl('Goal created.') + ' ' + (result.goalId ?? ''), review);
        try { await onCreated(result); } catch { if (!disposed) feedback(doc, notice, 'Saved, but the goal list could not refresh. Refresh goals to read the saved result.'); }
    }), { disabled: true, primary: true });
    fields.addEventListener('input', invalidate); source.addEventListener('change', selectSource); selectSource();
    return () => { disposed = true; ++sequence; form.remove(); };
}

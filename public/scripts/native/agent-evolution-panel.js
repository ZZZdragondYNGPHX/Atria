import { contentSha256 } from '../../shared/content-sha256.js';

export async function evolutionRequest(group, action, value) {
    const response = await fetch('/api/native/generation/' + group + '/' + action, { method: 'POST',
        headers: { ...globalThis.Atria?.getContext?.()?.getRequestHeaders?.(), 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Evolution is unavailable (' + response.status + ')');
    return body;
}

// Shared pane lives inside the existing Run / Project Task surfaces.
export function mountAgentEvolution({ slot, scope, sourceKind, sourceId, request = evolutionRequest }) {
    const document = slot.ownerDocument;
    let disposed = false, busy = false, identity = null, state = null, experience = null, catalog = null;
    const root = document.createElement('details'); root.className = 'atria-agent-evolution';
    const heading = document.createElement('summary'); heading.textContent = 'Feedback and local evolution'; root.append(heading);
    const body = document.createElement('div'); root.append(body); slot.append(root);
    const error = document.createElement('p'); error.setAttribute('role', 'status'); body.append(error);
    const content = document.createElement('div'); body.append(content);
    function el(tag, text, parent = content) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; parent.append(n); return n; }
    function input(label, type = 'text', parent = content, value = '') {
        const wrap = el('label', label + ' ', parent), n = el(type === 'textarea' ? 'textarea' : 'input', undefined, wrap);
        if (type !== 'textarea') n.type = type; n.value = value; return n;
    }
    function select(label, options, parent = content) {
        const wrap = el('label', label + ' ', parent), n = el('select', undefined, wrap); n.setAttribute('aria-label', label);
        for (const [value, text] of options) { const o = el('option', text, n); o.value = value; } return n;
    }
    function button(label, action, parent = content, disabled = false) {
        const n = el('button', label, parent); n.type = 'button'; n.disabled = busy || state?.readOnly || disabled;
        n.addEventListener('click', () => void act(action)); return n;
    }
    async function act(action) {
        if (busy || disposed) return; busy = true; error.textContent = '';
        for (const b of content.querySelectorAll('button')) b.disabled = true;
        try { await action(); if (!disposed) await refresh(); } catch (e) { if (!disposed) error.textContent = e.message; } finally { busy = false; if (!disposed) render(); }
    }
    const invoke = (action, value = {}) => request('evolution', action, { ...identity, ...value });
    async function refresh() {
        catalog = state?.catalog || catalog;
        if (!identity) {
            const selected = await request('experience', 'target', { kind: sourceKind, id: sourceId, scope });
            identity = { scope, subject: selected.subject };
        }
        [state, experience] = await Promise.all([invoke('inspect'), request('experience', 'inspect', identity)]);
        if (catalog) state.catalog = catalog;
    }
    const feedbackValue = (signal, note) => ({ kind: 'explicit', signal, dimension: 'behavior', note });
    const json = (label, value, parent = content) => { const details = el('details', undefined, parent); el('summary', label, details); el('pre', JSON.stringify(value, null, 2), details); };
    function download(value) {
        const link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
        link.href = url; link.download = 'atria-evolution.json'; link.click(); URL.revokeObjectURL(url);
    }
    function render() {
        if (!state || disposed) return; content.replaceChildren();
        const doc = state.scope, policy = doc?.policy, owner = state.owner;
        el('p', 'Policy: ' + (policy?.mode || 'review') + (policy?.reason ? ' · ' + policy.reason : '') + (state.readOnly ? ' · read only' : ''));
        el('p', 'Automatic publication needs nine independent paired reviews, agreement with the evaluator, no regressions and known costs. Each job evaluates one field.');
        button('Refresh', async () => {}, content, false).disabled = busy;
        button('Export evidence and reports', async () => download({ experience: await request('experience', 'export', identity), evolution: await invoke('export') }));
        const feedback = el('section'); el('h4', 'Feedback on this saved output', feedback);
        const signal = select('Feedback', [['correction', 'Correction'], ['prefer', 'Prefer'], ['avoid', 'Avoid']], feedback);
        const note = input('Public note', 'textarea', feedback);
        button('Save feedback', async () => {
            const selected = await request('experience', 'target', { kind: sourceKind, id: sourceId, scope });
            await request('experience', 'submit', { target: selected.target, feedback: feedbackValue(signal.value, note.value), expectedSequence: experience?.sequence ?? null });
        }, feedback);
        for (const f of experience?.feedback || []) {
            const row = el('details', undefined, feedback); el('summary', f.signal + ' · ' + f.status + ' · ' + f.applicability, row);
            el('p', f.note, row); json('Exact source', f.source, row);
            const corrected = input('Correct note', 'textarea', row, f.note);
            if (f.kind === 'explicit') button('Correct', () => request('experience', 'correct', { ...identity, id: f.id, expectedSequence: experience.sequence, feedback: feedbackValue(f.signal, corrected.value) }), row, f.status !== 'active');
            for (const action of ['withdraw', 'delete']) button(action === 'withdraw' ? 'Withdraw feedback' : 'Delete feedback', () => request('experience', action, { ...identity, id: f.id, expectedSequence: experience.sequence }), row);
        }
        for (const d of experience?.diagnoses || []) {
            const row = el('details', undefined, feedback); el('summary', 'Hypothesis · ' + d.origin + ' · ' + d.status, row);
            json('Rationale and applicability', d, row);
            for (const action of ['withdrawDiagnosis', 'deleteDiagnosis']) button(action === 'withdrawDiagnosis' ? 'Withdraw hypothesis' : 'Delete hypothesis', () => request('experience', action, { ...identity, id: d.id, expectedSequence: experience.sequence }), row);
        }
        const days = input('Retention days (1–365)', 'number', feedback, String(experience?.retentionDays || 30)); days.min = '1'; days.max = '365';
        button('Set retention', () => request('experience', 'retention', { ...identity, days: Number(days.value), expectedSequence: experience?.sequence ?? null }), feedback, !experience);
        button('Purge expired sources', () => request('experience', 'purge', { ...identity, expectedSequence: experience?.sequence ?? null }), feedback, !experience);
        button('Delete scope feedback and derived reports', () => request('experience', 'deleteScope', { ...identity, expectedSequence: experience?.sequence ?? null }), feedback, !experience);
        const budget = el('details'); el('summary', 'Shared account budget', budget);
        el('p', owner ? `${owner.totals.requests} requests · ${owner.totals.tokens} tokens · ${owner.unsettled} unsettled` : 'Set a finite shared budget before evaluation.', budget);
        const requests = input('Total request limit', 'number', budget, String(owner?.limits?.maxRequests || ''));
        const tokens = input('Total token limit', 'number', budget, String(owner?.limits?.maxTokens || ''));
        const interval = input('Seconds between sends', 'number', budget, String((owner?.limits?.minIntervalMs || 3000) / 1000));
        button('Save budget', () => request('evolution', 'budget', { expectedSequence: owner?.sequence || 0, limits: { maxRequests: Number(requests.value), maxTokens: Number(tokens.value), minIntervalMs: Number(interval.value) * 1000 } }), budget);
        if (scope.domain === 'project') el('p', 'Use feedback from an earlier saved Task. A repair target must be a separate Task prepared without running.');
        const configure = el('details'); el('summary', 'Choose a local target and policy', configure);
        button('Load available targets', async () => {
            const catalog = await invoke('catalog');
            // Hold explicit choices while the main view refreshes.
            state.catalog = catalog;
        }, configure);
        if (state.catalog) {
            const catalog = state.catalog;
            const target = select('Target', catalog.choices.map((c, i) => [String(i), c.label]), configure);
            const route = select('Evaluation model route', catalog.routes.map(r => [r.routeId, r.role + ' · ' + r.routeId]), configure);
            const mode = select('Policy', [['review', 'Review'], ['auto', 'Local automatic']], configure);
            const source = input('Price source', 'text', configure), currency = input('Currency', 'text', configure, 'USD');
            const inPrice = input('Input price / million tokens', 'number', configure), outPrice = input('Output price / million tokens', 'number', configure);
            el('p', 'Leave prices blank to keep automatic publication ineligible. Only an already visible always-invoked local Skill or a supported bounded Director can be evaluated automatically.', configure);
            button('Declare this field and enable policy', async () => {
                const choice = catalog.choices[Number(target.value)]; if (!choice) throw new Error('Choose a target');
                await invoke('declare', { target: choice.target, expectedBaseHash: choice.baseHash });
                const price = source.value && inPrice.value !== '' && outPrice.value !== '' ? { source: source.value, currency: currency.value, inputPerMillion: Number(inPrice.value), outputPerMillion: Number(outPrice.value), confirmedAt: Date.now() } : null;
                await invoke('configure', { target: choice.target, mode: mode.value, routeId: route.value, price, expectedSequence: doc?.sequence || 0 });
            }, configure);
        }
        if (policy) {
            json('Exact declared policy', policy);
            button('Evaluate a candidate', () => invoke('start', { expectedSequence: doc.sequence }), content, !['review', 'auto'].includes(policy.mode));
            for (const mode of ['paused', 'disabled']) button(mode === 'paused' ? 'Pause' : 'Disable', () => invoke('mode', { mode, expectedSequence: doc.sequence }));
        }
        for (const job of doc?.jobs || []) {
            const section = el('details'); el('summary', 'Job · ' + job.status + (job.reason ? ' · ' + job.reason : ''), section); json('Exact sources', job.dependencies, section);
            for (const c of job.candidates) {
                el('p', c.rationale, section); json('Candidate diff', c.diff, section); json('Decision and costs', c.decision, section);
                if (!c.report) continue;
                for (const pair of c.report.pairs || []) {
                    const row = el('details', undefined, section); el('summary', pair.case.caseId + ' · trial ' + pair.repetition + (pair.human ? ' · reviewed' : ''), row);
                    const flipped = parseInt(pair.pairHash.slice(0, 2), 16) % 2 === 1;
                    const a = flipped ? 'candidate' : 'baseline', b = flipped ? 'baseline' : 'candidate';
                    el('p', 'Compare these two outputs against the scenario. Grade B relative to A; negative means worse.', row);
                    json('Scenario', pair.scenario, row);
                    el('h5', 'A', row); el('pre', pair[a].output, row); el('h5', 'B', row); el('pre', pair[b].output, row);
                    const preference = select('Preference', [['uncertain', 'Uncertain'], ['left', 'A'], ['right', 'B'], ['tie', 'Tie']], row);
                    const grades = Object.fromEntries(pair.case.behaviorDimensions.map(d => { const n = input(d + ' (B − A, −4…4)', 'number', row); n.min = '-4'; n.max = '4'; return [d, n]; }));
                    button('Save paired review', () => {
                        if (Object.values(grades).some(n => n.value === '')) throw new Error('Grade every dimension explicitly');
                        return invoke('label', { jobId: job.id, candidateId: c.candidateId, pairHash: pair.pairHash, expectedSequence: doc.sequence,
                            preference: preference.value === 'left' ? a : preference.value === 'right' ? b : preference.value,
                            deltas: Object.fromEntries(Object.entries(grades).map(([k, n]) => [k, Number(n.value) * (flipped ? -1 : 1)])) });
                    }, row, job.status !== 'awaiting_review');
                }
                json('Full comparison report', c.report, section);
                const review = input('I reviewed this exact diff and report', 'checkbox', section);
                button('Publish reviewed version', () => {
                    if (!review.checked) throw new Error('Review the exact diff and report first');
                    return invoke('publish', { jobId: job.id, candidateId: c.candidateId, expectedReportHash: canonicalHash(c.report), review: true });
                }, section, job.status !== 'awaiting_review');
            }
        }
        if (doc?.garbage?.length) el('p', 'Some candidate history is still used by the original authority. Resolve the current binding or task before clearing it.');
        if (doc?.retired?.length) json('Revoked publication receipts (content removed)', doc.retired);
        for (const p of doc?.publications || []) { json('Publication · ' + p.status + (state.bindingStates?.find(b => b.publicationId === p.id)?.current ? ' · current binding' : ' · historical binding') + (p.activation ? ' · version observed' : ' · awaiting next run'), p); if (p.status !== 'rolled_back') button('Pause and restore previous version', () => invoke('rollback', { publicationId: p.id })); }
    }
    root.addEventListener('toggle', () => { if (root.open && !state) void act(async () => {}); });
    return () => { disposed = true; root.remove(); };
}
function canonicalHash(value) {
    const canonical = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    return contentSha256(canonical(value));
}

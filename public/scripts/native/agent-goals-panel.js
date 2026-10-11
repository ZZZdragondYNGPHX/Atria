import { runtimeRequest } from './runtime-client.js';

const statusText = { active: 'Ready', waiting: 'Waiting for evidence', blocked: 'Blocked', stale: 'Source changed', paused: 'Paused', cancelled: 'Cancelled', completed: 'Completed' };
const nextStep = { active: 'Check the saved outcome or continue the linked Task.', waiting: 'Continue the current work, then check the saved outcome.',
    blocked: 'Resolve the blocked source or invariant, then check again.', stale: 'Review the changed source. A new scope needs a new goal.',
    paused: 'Resume when you are ready.', cancelled: 'This goal will not continue.', completed: 'Current saved evidence meets every criterion.' };
export const goalRequest = (action, value) => runtimeRequest('/goals/' + action, { method: 'POST', body: value });

// One mount per original Run/Task surface. Only the server owns evidence and controls.
export function mountAgentGoals({ slot, scope, task = null, request = goalRequest }) {
    const document = slot.ownerDocument;
    const root = document.createElement('details'); root.className = 'atria-agent-goals';
    const heading = document.createElement('summary'); heading.textContent = 'Persistent goals'; root.append(heading);
    const body = document.createElement('div'); root.append(body); slot.append(root);
    const notice = document.createElement('p'); notice.setAttribute('role', 'status'); body.append(notice);
    const content = document.createElement('div'); body.append(content);
    let disposed = false, busy = false, readOnly = false, goals = null, selectedId = null, selected = null;
    function el(tag, text, parent = content) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; parent.append(node); return node; }
    function button(label, action, parent = content, disabled = false) {
        const node = el('button', label, parent); node.type = 'button'; node.className = 'menu_button'; node.disabled = busy || disabled;
        node.addEventListener('click', () => void act(action, node)); return node;
    }
    async function refresh() {
        const context = await request('context', { scope });
        if (disposed) return;
        goals = context.goals;
        readOnly = context.readOnly;
        selected = selectedId ? await request('inspect', { goalId: selectedId }) : null;
    }
    async function act(action, trigger) {
        if (disposed || busy) return;
        const label = trigger?.textContent;
        const goalId = trigger?.closest('section')?.dataset.goalId;
        busy = true; notice.textContent = 'Working…'; root.setAttribute('aria-busy', 'true');
        for (const node of content.querySelectorAll('button')) node.disabled = true;
        try { await action(); await refresh(); if (!disposed) notice.textContent = ''; } catch {
            if (!disposed) notice.textContent = 'Could not update this goal. Refresh to check the current state, then try again.';
        } finally {
            busy = false;
            if (!disposed) {
                root.setAttribute('aria-busy', 'false'); render();
                const target = goalId ? [...content.querySelectorAll('section')].find(node => node.dataset.goalId === goalId) : content;
                const nextLabel = label === 'Pause goal' ? 'Resume goal' : label === 'Resume goal' ? 'Pause goal' : label;
                [...(target?.querySelectorAll('button') || [])].find(node => node.textContent === nextLabel)?.focus();
            }
        }
    }
    function render() {
        content.replaceChildren();
        button('Refresh goals', async () => {});
        if (goals === null) return;
        if (!goals.length) el('p', 'No persistent goals in this scope.');
        if (readOnly) el('p', 'Read-only mode: goals can be inspected; controls are unavailable.');
        el('p', scope.domain === 'project' ? 'Task continuation keeps the original budget and stops at human Review.'
            : 'RP goals update from saved evidence when you check. They continue with your next user or author event.');
        for (const goal of goals) {
            const section = el('section'); section.dataset.goalId = goal.goalId;
            el('h4', goal.intent, section); el('p', statusText[goal.status] || goal.status, section); el('p', nextStep[goal.status], section);
            const list = el('ul', undefined, section);
            for (const criterion of goal.criteria) {
                const progress = goal.progress.find(row => row.criterionId === criterion.criterionId);
                el('li', criterion.description + ' · ' + (progress?.status === 'satisfied' ? 'Evidence met' : progress?.status === 'unknown' ? 'Evidence unavailable' : 'Not yet met'), list);
            }
            if (goal.blockers.some(row => row.code === 'goal_invariants_unmet')) el('p', 'A required invariant no longer holds.', section);
            if (goal.budget) el('p', `Declared limit: ${goal.budget.maxRequests} requests · ${goal.budget.maxTokens} tokens`, section);
            const controls = el('div', undefined, section); controls.className = 'atria-goal-actions';
            const terminal = ['completed', 'cancelled'].includes(goal.status);
            button('Check saved evidence', () => scope.domain === 'project' ? request('evaluate', { goalId: goal.goalId, expectedSequence: goal.sequence })
                : request('wake', { goalId: goal.goalId, eventId: 'user:' + crypto.randomUUID() }), controls, readOnly || ['paused', 'cancelled'].includes(goal.status));
            button(goal.status === 'paused' ? 'Resume goal' : 'Pause goal', () => request('control', { goalId: goal.goalId, expectedSequence: goal.sequence,
                action: goal.status === 'paused' ? 'resume' : 'pause' }), controls, readOnly || terminal);
            button('Cancel goal', () => request('control', { goalId: goal.goalId, expectedSequence: goal.sequence, action: 'cancel' }), controls, readOnly || terminal);
            button('Inspect evidence and usage', async () => { selectedId = goal.goalId; }, controls);
            if (scope.domain === 'project' && task && goal.intent === task.intent && !goal.taskId) button('Link this Task', () => request('bind', {
                goalId: goal.goalId, expectedSequence: goal.sequence, taskId: task.taskId }), controls, readOnly || terminal || goal.status === 'paused');
            if (goal.taskId) button('Continue linked Task', () => request('wake', { goalId: goal.goalId, eventId: 'user:' + crypto.randomUUID() }), controls,
                readOnly || !['active', 'waiting'].includes(goal.status));
            if (selectedId === goal.goalId && selected) {
                const details = el('details', undefined, section); details.open = true; el('summary', 'Evidence and usage', details);
                for (const set of selected.goal.evidence) el('p', `${set.references.length} saved source references. Check the saved evidence to verify currentness.`, details);
                const attempts = selected.compute?.attempts || [], local = selected.compute?.localWork || [];
                if (selected.compute) {
                    const spent = attempts.reduce((sum, row) => sum + (row.status === 'settled' ? row.usage.totalTokens : row.estimatedTokens), 0);
                    el('p', `${attempts.length} charged requests · ${spent} settled or reserved tokens · ${local.length} local jobs`, details);
                    el('p', `${attempts.filter(row => row.status !== 'settled').length} request costs remain uncertain.`, details);
                    if (selected.wakes.some(row => ['unknown', 'running'].includes(row.status))) el('p', 'A prior execution is unresolved. Automatic resend is blocked.', details);
                } else el('p', 'This goal has no automatic execution binding.', details);
            }
        }
    }
    root.addEventListener('toggle', () => { if (root.open && goals === null) void act(async () => {}); });
    render();
    return () => { disposed = true; root.remove(); };
}

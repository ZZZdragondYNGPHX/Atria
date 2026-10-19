import { runtimeRequest } from './runtime-client.js';
import { promptStageEntries } from '../../shared/prompt-module-order.js';
import { comparablePromptResource, mergePromptUpgrade, promptUpgradeOrigin } from '../../shared/prompt-upgrade.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';

const key = ref => JSON.stringify(ref, Object.keys(ref).sort());
export function mountPromptUpgrade({ document: doc, parent, entry, resource = entry.resource, readDraft, applyDraft, state }) {
    const origin = promptUpgradeOrigin(resource); if (!origin) return;
    const el = (tag, text, parent) => { const node = doc.createElement(tag); if (text !== undefined) node.textContent = tl(text); parent?.append(node); return node; };
    const root = el('details', undefined, parent); root.className = 'atri-prompt-preview'; root.open = state.open ?? false;
    el('summary', 'Compare an upstream revision', root);
    el('p', 'Compare the old upstream, your private draft and a new upstream revision. Resolve differences here, then preview and save a new revision. Consumers keep their pinned versions until you adopt it.', root);
    const fields = el('div', undefined, root); fields.className = 'atri-prompt-sample-fields';
    const select = label => { const wrap = el('label', label, fields); const node = el('select', undefined, wrap); node.setAttribute('aria-label', tl(label)); return node; };
    const base = select('Old upstream revision'), next = select('New upstream revision');
    const status = el('p', undefined, root); status.setAttribute('role', 'status');
    const result = el('div', undefined, root); result.className = 'atri-prompt-preview-result'; let catalog = null; let loading = false; let comparison = null;
    const button = (text, callback, parent = root) => { const node = el('button', text, parent); node.type = 'button'; node.className = 'atri-library-button'; node.addEventListener('click', callback); return node; };
    const resolve = async ref => catalog.find(item => key(item.ref) === key(ref))?.resource ?? (await runtimeRequest('/resources/exact', { method: 'POST', body: ref })).snapshot;
    function targets(resource, seen = new Set()) {
        const output = [];
        if (resource.parentRef && !seen.has(key(resource.parentRef))) {
            seen.add(key(resource.parentRef)); const parent = catalog.find(item => key(item.ref) === key(resource.parentRef));
            if (parent) output.push(...targets(parent.resource, seen));
        }
        for (const stage of resource.stages) for (const item of promptStageEntries(stage)) output.push({ stageId: stage.stageId, entryId: item.entryId, item });
        for (const op of resource.derive ?? []) if (op.op === 'add' && op.entry) output.push({ stageId: op.stageId, entryId: op.entry.entryId, item: op.entry });
        return output;
    }
    function renderComparison() {
        result.replaceChildren(); if (!comparison) return;
        const { old, local, upstream, nextRef, identity } = comparison;
        const choices = comparison.choices;
        let merged, conflicts;
        if (origin.derived) {
            merged = { ...local, parentRef: nextRef, derive: JSON.parse(JSON.stringify(local.derive ?? [])) };
            const available = targets(upstream);
            conflicts = [];
            (local.derive ?? []).forEach((op, index) => {
                const relative = op.position?.before ?? op.position?.after, requested = op.entryId ?? relative;
                if (op.op === 'add' && !relative && upstream.stages.some(stage => stage.stageId === op.stageId)) return;
                if (available.some(target => target.stageId === op.stageId && (requested ? target.entryId === requested : target.item.moduleRef?.resourceId === op.moduleId))) return;
                const path = '/derive/' + index, choice = choices[path];
                if (choice === 'drop') merged.derive[index] = null;
                else if (choice) {
                    const target = JSON.parse(choice), replacement = merged.derive[index]; replacement.stageId = target.stageId;
                    if (relative) replacement.position = { [op.position.before ? 'before' : 'after']: target.entryId };
                    else { delete replacement.moduleId; replacement.entryId = target.entryId; }
                } else conflicts.push({ path, local: op, options: available });
            });
            merged.derive = merged.derive.filter(Boolean);
        } else {
            const merge = mergePromptUpgrade(comparablePromptResource(old, local), comparablePromptResource(local, local), comparablePromptResource(upstream, local), choices);
            merged = merge.resource; conflicts = merge.conflicts;
        }
        el('p', undefined, result).textContent = fmt('${0} unresolved differences', [conflicts.length]);
        for (const conflict of conflicts) {
            const group = el('fieldset', undefined, result); el('legend', undefined, group).textContent = conflict.path;
            const details = el('pre', undefined, group); details.textContent = JSON.stringify({ base: conflict.base, local: conflict.local, upstream: conflict.upstream }, null, 2);
            const choose = el('select', undefined, group); choose.setAttribute('aria-label', fmt('Resolve ${0}', [conflict.path]));
            const options = origin.derived ? [['', tl('Choose a replacement target')], ['drop', tl('Remove this private operation')], ...conflict.options.map(target => [JSON.stringify({ stageId: target.stageId, entryId: target.entryId }), target.stageId + ' · ' + target.entryId])]
                : [['', tl('Choose a resolution')], ['local', tl('Keep private edit')], ['upstream', tl('Use upstream change')]];
            for (const [value, text] of options) { const option = el('option', undefined, choose); option.value = value; option.textContent = text; }
            choose.addEventListener('change', () => { choices[conflict.path] = choose.value; renderComparison(); result.querySelector('select, button')?.focus(); });
        }
        for (const [label, value] of [['Old upstream', old], ['Private draft', local], ['New upstream', upstream], ['Merged draft', merged]]) {
            const details = el('details', undefined, result); el('summary', label, details); el('pre', undefined, details).textContent = JSON.stringify(value, null, 2);
        }
        const apply = button('Use merged draft', () => {
            if (JSON.stringify(readDraft()) !== identity) { status.textContent = tl('The draft changed. Compare again before applying the merge.'); return; }
            merged.provenance = [...(local.provenance ?? []), { source: 'atria.upstream', ref: JSON.stringify({ source: nextRef, baseRef: nextRef }) }];
            state.open = false; applyDraft(merged, { resources: catalog });
        }, result); apply.classList.add('atri-library-button--primary'); apply.disabled = conflicts.length > 0;
    }
    const compare = button('Compare revisions', async () => {
        if (!next.value) return;
        compare.disabled = true;
        try {
            const local = readDraft(), identity = JSON.stringify(local); const nextRef = JSON.parse(next.value);
            const [old, upstream] = await Promise.all([resolve(JSON.parse(base.value)), resolve(nextRef)]);
            comparison = { old, local, upstream, nextRef, identity, choices: {} }; status.textContent = ''; renderComparison();
        } catch (error) { status.textContent = error.message; } finally { compare.disabled = false; }
    }); compare.disabled = true;
    async function load() {
        if (loading || catalog) return; loading = true;
        try {
            catalog = await runtimeRequest('/resources'); if (!root.isConnected) return;
            const resources = catalog.filter(item => item.ref.resourceType === entry.ref.resourceType && (item.ref.scope === 'library' || item.ref.projectId === entry.ref.projectId));
            for (const control of [base, next]) {
                control.replaceChildren();
                if (control === next) { const option = el('option', 'Choose a new upstream revision', control); option.value = ''; }
                for (const item of resources) { const option = el('option', undefined, control); option.textContent = item.resource.displayName + ' · ' + item.ref.revision; option.value = JSON.stringify(item.ref); }
            }
            const selected = resources.find(item => key(item.ref) === key(origin.baseRef)); if (selected) base.value = JSON.stringify(selected.ref);
            else { const option = el('option', undefined, base); option.value = JSON.stringify(origin.baseRef); option.textContent = tl('Recorded upstream base'); base.append(option); base.value = option.value; }
            if (resources.some(item => key(item.ref) === key(state.next ?? {}))) next.value = JSON.stringify(state.next);
            compare.disabled = !next.value;
            status.textContent = resources.length ? '' : tl('Import the new upstream revision into Library first.');
        } catch (error) { catalog = null; status.textContent = error.message; } finally { loading = false; }
    }
    next.addEventListener('change', () => { state.next = next.value ? JSON.parse(next.value) : null; compare.disabled = !next.value; comparison = null; result.replaceChildren(); });
    base.addEventListener('change', () => { comparison = null; result.replaceChildren(); });
    root.addEventListener('toggle', () => { state.open = root.open; if (root.open) void load(); }); if (root.open) void load();
}

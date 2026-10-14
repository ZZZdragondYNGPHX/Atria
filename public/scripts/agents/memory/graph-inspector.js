import { translateShellText as t, formatShellText } from '../../atria-shell/localization.js';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { ENTITY_TYPES } from './temporal-graph.js';
import { computeInspector, openMemoryDiagnostics } from './inspector-compute.js';
import { projectProviders } from './provider-provenance.js';

/** Bounded graph projection; edges always refer to persisted semantic relations. */
export function selectGraph(view, { query = '', type = '', predicate = '', history = false, center = '', hops = 1 } = {}) {
    const needle = query.normalize('NFKC').toLowerCase().trim();
    let entities = view.entities.filter(entity => (history || entity.status === 'active') && (!type || entity.type === type)
        && (!needle || [entity.canonicalName, ...(entity.aliases || [])].some(name => name.normalize('NFKC').toLowerCase().includes(needle))));
    const eligible = new Set(entities.map(entity => entity.id));
    let relations = view.relations.filter(edge => (history || edge.status === 'active') && (!predicate || edge.predicate === predicate)
        && eligible.has(edge.sourceEntityId) && eligible.has(edge.targetEntityId));
    if (center) {
        const neighbors = new Map();
        for (const edge of relations) {
            for (const [a, b] of [[edge.sourceEntityId, edge.targetEntityId], [edge.targetEntityId, edge.sourceEntityId]]) {
                if (!neighbors.has(a)) neighbors.set(a, new Set());
                neighbors.get(a).add(b);
            }
        }
        const reached = new Set([center]); let frontier = [center];
        for (let depth = 0; depth < Math.max(1, Math.min(3, Number(hops) || 1)); depth++) {
            const next = [];
            for (const id of frontier) for (const other of neighbors.get(id) || []) if (!reached.has(other)) { reached.add(other); next.push(other); }
            frontier = next;
        }
        entities = entities.filter(entity => reached.has(entity.id));
    }
    const total = entities.length;
    // Put the local anchor first so it cannot be truncated out of its own graph.
    if (center) entities.sort((a, b) => Number(b.id === center) - Number(a.id === center));
    entities = entities.slice(0, 250);
    const ids = new Set(entities.map(entity => entity.id));
    relations = relations.filter(edge => ids.has(edge.sourceEntityId) && ids.has(edge.targetEntityId));
    return { entities, relations: relations.slice(0, 600), total, totalRelations: relations.length };
}

const node = (tag, text, parent) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    parent?.append(element);
    return element;
};
const button = (parent, text, run) => {
    const element = node('button', text, parent); element.type = 'button'; element.className = 'menu_button';
    element.addEventListener('click', run); return element;
};
const select = (parent, label, entries) => {
    const wrapper = node('label', label, parent); const input = node('select', undefined, wrapper);
    input.setAttribute('aria-label', label);
    entries.forEach(([value, text]) => { const option = node('option', text, input); option.value = value; });
    return input;
};

export async function openMemoryOsInspector(context, { load, correct, loadCytoscape, openLegacy, openHistory, container, signal, onInspect }) {
    const root = node('section'); root.className = 'memory-os-inspector';
    if (!document.querySelector('link[data-memory-os-inspector]')) {
        const css = node('link', undefined, document.head); css.rel = 'stylesheet'; css.href = new URL('./graph-inspector.css', import.meta.url).href; css.dataset.memoryOsInspector = '';
    }
    node('h3', t('Memory OS · World graph'), root);
    const toolbar = node('div', undefined, root); toolbar.className = 'mos-toolbar';
    const status = node('p', '', root); status.setAttribute('role', 'status');
    const filters = node('div', undefined, root); filters.className = 'mos-toolbar';
    const searchLabel = node('label', t('Search names and aliases'), filters); const search = node('input', undefined, searchLabel); search.type = 'search';
    const type = select(filters, t('Entity type'), [['', t('All')], ...ENTITY_TYPES.map(value => [value, value])]);
    const predicate = select(filters, t('Relation type'), [['', t('All')]]);
    const history = select(filters, t('Status'), [['', t('Current')], ['history', t('Include history and inactive records')]]);
    const center = select(filters, t('Graph scope'), [['', t('Full graph')]]);
    const hops = select(filters, t('Local depth'), [['1', '1 hop'], ['2', '2 hops'], ['3', '3 hops']]);
    const content = node('div', undefined, root); content.className = 'mos-content';
    const canvas = node('div', undefined, content); canvas.className = 'mos-canvas'; canvas.setAttribute('aria-label', t('Entity graph. The list below supports keyboard navigation.'));
    const inspector = node('aside', undefined, content); inspector.className = 'mos-detail';
    const listing = node('div', undefined, root); listing.className = 'mos-list';
    const review = node('details', undefined, root); node('summary', t('Review, facts and external state'), review);
    const reviewBody = node('div', undefined, review);
    const editor = node('details', undefined, root); node('summary', t('Manual corrections in Memory OS only'), editor);
    const form = node('form', undefined, editor); form.className = 'mos-form';
    const action = select(form, t('Action'), [
        ['entity', t('New entity')], ['rename', t('Rename entity')], ['alias', t('Add alias')], ['remove_alias', t('Delete alias')],
        ['merge_entity', t('Merge source into target')], ['split_entity', t('Undo target merge')], ['relation', t('New relation')], ['edit_relation', t('Replace relation')],
        ['reject_relation', t('Reject or invalidate relation')], ['reject_fact', t('Delete incorrect fact or inference')], ['resolve_pending', t('Resolve entity ambiguity')],
        ['reject_pending', t('Reject entity resolution')], ['resolve_conflict', t('Accept relation and resolve conflicts')],
    ]);
    const fields = node('div', undefined, form); fields.className = 'mos-form';
    const save = node('button', t('Save correction'), form); save.type = 'submit'; save.className = 'menu_button';
    let snapshot, view, facts, cy, disposed = false, busy = false, generation = 0;
    let selected = null; let computation = null;
    const fail = error => { status.textContent = formatShellText('Not completed: ${0}. Refresh if the source changed.', [error.message]); };
    const guarded = run => async () => { try { snapshot.assertCurrent(); await run(); } catch (error) { fail(error); } };
    const display = (record, kind) => {
        try { snapshot.assertCurrent(); } catch (error) { fail(error); return; }
        record = { ...snapshot.state[{ entity: 'entities', relation: 'relations', fact: 'facts', pending: 'entityPending' }[kind]]?.[record.id], ...record };
        selected = { record, kind }; inspector.replaceChildren();
        node('h4', record.canonicalName || record.text || record.predicate || record.name, inspector);
        if (kind === 'entity') button(inspector, t('Explore this entity’s local graph'), () => { center.value = record.id; render(); });
        const data = structuredClone(record);
        node('pre', JSON.stringify(data, null, 2), inspector);
        onInspect?.(record, inspector);
        const refs = [...(record.supports || []), ...(record.names || []), ...(record.merges || []), ...(record.resolutions || []), record.resolution || {}, record];
        const ids = [...new Set(refs.flatMap(ref => ref.episodeIds || []))];
        for (const id of ids) {
            const episode = snapshot.state.episodes[id];
            if (!episode) continue;
            const section = node('details', undefined, inspector); node('summary', formatShellText('Source ${0} · Message ${1} · ${2}', [id, episode.sourceFloor, episode.status]), section);
            node('pre', episode.content, section);
            button(section, t('Locate the loaded source message'), guarded(() => {
                const message = document.querySelector(`#chat .mes[mesid="${Number(episode.sourceFloor)}"]`);
                if (message) { message.scrollIntoView({ block: 'center' }); status.textContent = t('Source located in the story. Close the graph to view it.'); } else status.textContent = t('The original message is not loaded. Its source text is shown here.');
            }));
        }
        for (const id of new Set(refs.map(ref => ref.manualId).filter(Boolean))) node('pre', formatShellText('User correction source\n${0}', [JSON.stringify(snapshot.state.corrections?.[id], null, 2)]), inspector);
        if (kind === 'entity') {
            node('h4', t('Related relations'), inspector);
            view.relations.filter(edge => edge.sourceEntityId === record.id || edge.targetEntityId === record.id).slice(0, 100)
                .forEach(edge => button(inspector, `${edge.predicate} · ${edge.status}`, () => display(edge, 'relation')));
        }
        renderFields();
    };
    const input = (name, title, value = '', options = null) => {
        const element = options ? select(fields, title, options) : node(name === 'reason' || name === 'text' ? 'textarea' : 'input', undefined, node('label', title, fields));
        element.name = name; element.value = value; element.required = !['validFrom', 'validUntil'].includes(name); return element;
    };
    const renderFields = () => {
        fields.replaceChildren(); if (!view) return;
        const a = action.value; const record = selected?.record || {};
        const prioritized = [record.id, record.sourceEntityId, record.targetEntityId];
        const entities = [...view.entities.filter(entity => prioritized.includes(entity.id)), ...view.entities.filter(entity => !prioritized.includes(entity.id)).slice(0, 500)].map(entity => [entity.id, `${entity.canonicalName} · ${entity.type} · ${entity.id.slice(0, 8)}`]);
        const relations = [...view.relations.filter(edge => edge.id === record.id), ...view.relations.filter(edge => edge.id !== record.id).slice(0, 500)].map(edge => [edge.id, `${edge.predicate} · ${edge.status} · ${edge.id.slice(0, 8)}`]);
        const pending = view.pending.filter(item => item.status === 'pending').slice(0, 500).map(item => [item.id, item.name]);
        if (['rename', 'alias', 'remove_alias', 'merge_entity', 'split_entity', 'resolve_pending', 'relation', 'edit_relation'].includes(a)) input('targetId', t('Target entity'), record.targetEntityId || record.id || '', entities);
        if (['merge_entity', 'relation', 'edit_relation'].includes(a)) input('sourceId', t('Source entity'), record.sourceEntityId || '', entities);
        if (['entity', 'rename', 'alias', 'remove_alias'].includes(a)) input('name', t('Name or alias'), a === 'rename' ? record.canonicalName || '' : '');
        if (a === 'entity') input('type', t('Entity type'), 'Character', ENTITY_TYPES.map(value => [value, value]));
        if (['relation', 'edit_relation'].includes(a)) {
            input('predicate', t('Relation predicate in snake_case'), record.predicate || '');
            input('text', t('Relation fact stated by the user'), '');
            input('validFrom', t('Start time, optional number or story time'), record.validFrom ?? '');
            input('validUntil', t('End time, optional'), '');
        }
        if (['edit_relation', 'resolve_conflict'].includes(a)) input('relationId', t('Relation to keep in a conflict'), record.id || '', relations);
        if (a === 'resolve_conflict') {
            const losers = input('loserIds', t('Conflicting relations to reject, multiple selection'), '', relations); losers.multiple = true;
            [...losers.options].forEach(option => { option.selected = (record.conflictIds || []).includes(option.value); });
        }
        if (a === 'reject_relation') input('targetId', t('Relation'), record.id || '', relations);
        if (a === 'reject_fact') input('targetId', t('Fact or inference'), record.id || '', facts.map(fact => [fact.id, fact.text.slice(0, 100)]));
        if (a === 'resolve_pending') input('pendingId', t('Unresolved entity'), record.id || '', pending);
        if (a === 'reject_pending') input('targetId', t('Unresolved entity'), record.id || '', pending);
        input('reason', t('Correction reason, stored separately from story messages and external state'));
    };
    const render = () => {
        if (!view || disposed) return;
        const previousCenter = center.value;
        const needle = search.value.normalize('NFKC').toLowerCase().trim();
        const choices = view.entities.filter(entity => !needle || [entity.canonicalName, ...entity.aliases].some(name => name.normalize('NFKC').toLowerCase().includes(needle))).slice(0, 500);
        const anchor = view.entities.find(entity => entity.id === previousCenter);
        if (anchor && !choices.includes(anchor)) choices.unshift(anchor);
        center.replaceChildren();
        for (const [value, label] of [['', t('Full graph')], ...choices.map(entity => [entity.id, entity.canonicalName])]) { const option = node('option', label, center); option.value = value; }
        center.value = previousCenter;
        const graph = selectGraph(view, { query: search.value, type: type.value, predicate: predicate.value, history: Boolean(history.value), center: center.value, hops: hops.value });
        status.textContent = formatShellText('Showing ${0}/${1} entities and ${2}/${3} relations. Limits are 250 and 600. Search or narrow the local scope.', [graph.entities.length, graph.total, graph.relations.length, graph.totalRelations]);
        cy?.elements().remove();
        cy?.add([...graph.entities.map(entity => ({ data: { id: `n:${entity.id}`, label: entity.canonicalName, record: entity, kind: 'entity', status: entity.status } })),
            ...graph.relations.map(edge => ({ data: { id: `e:${edge.id}`, source: `n:${edge.sourceEntityId}`, target: `n:${edge.targetEntityId}`, label: edge.predicate, record: edge, kind: 'relation', status: edge.status } }))]);
        cy?.layout({ name: 'circle', animate: false, fit: true, padding: 30 }).run();
        listing.replaceChildren();
        node('span', t('Keyboard navigation list:'), listing);
        [...graph.entities.map(record => [record, 'entity']), ...graph.relations.map(record => [record, 'relation'])].slice(0, 100)
            .forEach(([record, kind]) => button(listing, `${record.canonicalName || record.predicate} · ${record.status}`, () => display(record, kind)));
    };
    const refresh = async () => {
        const version = ++generation; computation?.abort(); const active = new AbortController(); computation = active;
        const next = await load();
        if (disposed || version !== generation) return;
        const computed = await computeInspector(next, { signal: active.signal });
        if (disposed || version !== generation) return;
        snapshot = next; snapshot.assertCurrent(); selected = null;
        view = computed.graph; facts = computed.facts;
        const refill = (element, entries) => { const previous = element.value; element.replaceChildren(); entries.forEach(([value, label]) => { const option = node('option', label, element); option.value = value; }); element.value = entries.some(([value]) => value === previous) ? previous : ''; };
        refill(predicate, [['', t('All')], ...[...new Set(view.relations.map(edge => edge.predicate))].sort().map(value => [value, value])]);
        refill(center, [['', t('Full graph')], ...view.entities.slice(0, 500).map(entity => [entity.id, entity.canonicalName])]);
        inspector.replaceChildren(); node('p', t('Choose an entity or relation to inspect its details, sources and audit history.'), inspector);
        reviewBody.replaceChildren();
        const pending = view.pending.filter(item => item.status === 'pending'); const disputed = view.relations.filter(edge => edge.status === 'disputed');
        node('p', formatShellText('${0} unresolved entities and ${1} disputed relations. Up to 100 of each are shown below.', [pending.length, disputed.length]), reviewBody);
        pending.slice(0, 100).forEach(record => button(reviewBody, formatShellText('Unresolved: ${0}', [record.name]), () => { display(record, 'pending'); action.value = 'resolve_pending'; editor.open = true; renderFields(); }));
        disputed.slice(0, 100).forEach(record => button(reviewBody, formatShellText('Disputed: ${0}', [record.predicate]), () => { display(record, 'relation'); action.value = 'resolve_conflict'; editor.open = true; renderFields(); }));
        const factSection = node('details', undefined, reviewBody); node('summary', formatShellText('Facts and inferences (${0})', [facts.length]), factSection);
        facts.slice(0, 100).forEach(record => button(factSection, `${record.text.slice(0, 100)} · ${record.status}`, () => display(record, 'fact')));
        const providers = projectProviders(snapshot.state, snapshot.chat);
        node('h4', t('External state and field mapping · Read only'), reviewBody);
        node('p', t('Plain text cards do not require external state. This view shows MVU and LoreState provider state, field paths and mappings. Corrections do not write to them.'), reviewBody);
        node('pre', JSON.stringify(providers, null, 2).slice(0, 32000), reviewBody);
        const audit = node('details', undefined, reviewBody); node('summary', t('Latest 100 user corrections'), audit);
        node('pre', JSON.stringify(Object.values(snapshot.state.corrections || {}).slice(-100), null, 2).slice(0, 32000), audit);
        renderFields(); render();
    };
    button(toolbar, t('Refresh'), () => { refresh().catch(fail); });
    button(toolbar, t('Memory diagnostics'), guarded(() => openMemoryDiagnostics(context, snapshot)));
    button(toolbar, t('Fit graph'), () => cy?.fit(undefined, 30));
    if (openLegacy) button(toolbar, t('Legacy node graph'), () => { Promise.resolve().then(openLegacy).catch(fail); });
    if (openHistory) button(toolbar, t('History extraction and rollback'), () => { Promise.resolve().then(openHistory).then(refresh).catch(fail); });
    for (const element of [search, type, predicate, history, center, hops]) element.addEventListener('change', render);
    action.addEventListener('change', renderFields);
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy || disposed) return;
        busy = true; save.disabled = true; status.textContent = t('Saving correction…');
        try {
            snapshot.assertCurrent();
            const command = { action: action.value, ...Object.fromEntries(new FormData(form)) };
            const loserSelect = form.elements.namedItem('loserIds');
            if (loserSelect) command.loserIds = [...loserSelect.selectedOptions].map(option => option.value);
            for (const key of ['validFrom', 'validUntil']) {
                if (!command[key]) delete command[key];
                else if (Number.isFinite(Number(command[key]))) command[key] = Number(command[key]);
            }
            await correct(command, snapshot); await refresh(); status.textContent = t('Correction saved. User sources and history are preserved.');
        } catch (error) { fail(error); } finally { busy = false; save.disabled = false; }
    });
    if (container) container.append(root);
    const popup = container ? new Promise(resolve => {
        if (signal?.aborted) resolve();
        else signal?.addEventListener('abort', resolve, { once: true });
    }) : context.callGenericPopup(root, context.POPUP_TYPE.TEXT, '', { wide: true, wider: true, large: true, allowVerticalScrolling: true });
    // Dispose as soon as the popup closes, including during lazy script loading.
    const closing = Promise.resolve(popup).finally(() => { disposed = true; generation++; computation?.abort(); cy?.destroy(); });
    try {
        const cytoscape = await loadCytoscape();
        if (!disposed) {
            cy = cytoscape({ container: canvas, elements: [], style: [
                { selector: 'node', style: { label: 'data(label)', 'background-color': '#779ddd', color: '#ddd', 'font-size': 11 } },
                { selector: 'edge', style: { label: 'data(label)', width: 1.5, 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', color: '#bbb', 'font-size': 9 } },
                { selector: '[status != "active"]', style: { opacity: 0.45 } },
            ], wheelSensitivity: 0.2, pixelRatio: 1 });
            cy.on('tap', 'node, edge', event => display(event.target.data('record'), event.target.data('kind')));
            await refresh();
        }
    } catch (error) { if (!disposed) { fail(error); if (!snapshot) await refresh().catch(fail); } }
    await closing;
}

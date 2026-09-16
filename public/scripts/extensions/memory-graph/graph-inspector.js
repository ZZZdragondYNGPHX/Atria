// SPDX-License-Identifier: AGPL-3.0-or-later
import { ENTITY_TYPES, projectTemporalGraph } from './temporal-graph.js';
import { projectFacts } from './atomic-facts.js';
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

export async function openMemoryOsInspector(context, { load, correct, loadCytoscape, openLegacy, openHistory }) {
    const root = node('section'); root.className = 'memory-os-inspector';
    if (!document.querySelector('link[data-memory-os-inspector]')) {
        const css = node('link', undefined, document.head); css.rel = 'stylesheet'; css.href = new URL('./graph-inspector.css', import.meta.url).href; css.dataset.memoryOsInspector = '';
    }
    node('h3', 'Memory OS · 世界图谱', root);
    const toolbar = node('div', undefined, root); toolbar.className = 'mos-toolbar';
    const status = node('p', '', root); status.setAttribute('role', 'status');
    const filters = node('div', undefined, root); filters.className = 'mos-toolbar';
    const searchLabel = node('label', '搜索名称 / 别名', filters); const search = node('input', undefined, searchLabel); search.type = 'search';
    const type = select(filters, '实体类型', [['', '全部'], ...ENTITY_TYPES.map(value => [value, value])]);
    const predicate = select(filters, '关系类型', [['', '全部']]);
    const history = select(filters, '状态', [['', '当前'], ['history', '含历史 / 失效']]);
    const center = select(filters, '图谱范围', [['', '全局图谱']]);
    const hops = select(filters, '局部深度', [['1', '1 hop'], ['2', '2 hops'], ['3', '3 hops']]);
    const content = node('div', undefined, root); content.className = 'mos-content';
    const canvas = node('div', undefined, content); canvas.className = 'mos-canvas'; canvas.setAttribute('aria-label', '实体关系图（下方列表可键盘操作）');
    const inspector = node('aside', undefined, content); inspector.className = 'mos-detail';
    const listing = node('div', undefined, root); listing.className = 'mos-list';
    const review = node('details', undefined, root); node('summary', '待审核 / 事实 / 外部状态', review);
    const reviewBody = node('div', undefined, review);
    const editor = node('details', undefined, root); node('summary', '手工修正（仅 Memory OS）', editor);
    const form = node('form', undefined, editor); form.className = 'mos-form';
    const action = select(form, '操作', [
        ['entity', '新建实体'], ['rename', '修改实体名称'], ['alias', '添加别名'], ['remove_alias', '删除别名'],
        ['merge_entity', '合并 source → target'], ['split_entity', '撤销 target 的合并'], ['relation', '新建关系'], ['edit_relation', '替换关系'],
        ['reject_relation', '拒绝 / 使关系失效'], ['reject_fact', '删除错误事实 / 推断'], ['resolve_pending', '接受实体消歧'],
        ['reject_pending', '拒绝实体消歧'], ['resolve_conflict', '接受关系并裁决冲突'],
    ]);
    const fields = node('div', undefined, form); fields.className = 'mos-form';
    const save = node('button', '保存修正', form); save.type = 'submit'; save.className = 'menu_button';
    let snapshot, view, facts, cy, disposed = false, busy = false, generation = 0;
    let selected = null;
    const fail = error => { status.textContent = `未完成：${error.message}。来源变化时请刷新。`; };
    const guarded = run => async () => { try { snapshot.assertCurrent(); await run(); } catch (error) { fail(error); } };
    const display = (record, kind) => {
        selected = { record, kind }; inspector.replaceChildren();
        node('h4', record.canonicalName || record.text || record.predicate || record.name, inspector);
        if (kind === 'entity') button(inspector, '以此实体查看局部图谱', () => { center.value = record.id; render(); });
        const data = structuredClone(record);
        node('pre', JSON.stringify(data, null, 2), inspector);
        const refs = [...(record.supports || []), ...(record.names || []), ...(record.merges || []), ...(record.resolutions || []), record.resolution || {}, record];
        const ids = [...new Set(refs.flatMap(ref => ref.episodeIds || []))];
        for (const id of ids) {
            const episode = snapshot.state.episodes[id];
            if (!episode) continue;
            const section = node('details', undefined, inspector); node('summary', `来源 ${id} · Message ${episode.sourceFloor} · ${episode.status}`, section);
            node('pre', episode.content, section);
            button(section, '定位已加载的来源消息', guarded(() => {
                const message = document.querySelector(`#chat .mes[mesid="${Number(episode.sourceFloor)}"]`);
                if (message) { message.scrollIntoView({ block: 'center' }); status.textContent = '已定位聊天中的来源；关闭图谱即可查看。'; } else status.textContent = '原始楼层尚未加载；此处已显示来源正文。';
            }));
        }
        for (const id of new Set(refs.map(ref => ref.manualId).filter(Boolean))) node('pre', `用户修正来源\n${JSON.stringify(snapshot.state.corrections?.[id], null, 2)}`, inspector);
        if (kind === 'entity') {
            node('h4', '关联关系', inspector);
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
        const entities = view.entities.map(entity => [entity.id, `${entity.canonicalName} · ${entity.type} · ${entity.id.slice(0, 8)}`]);
        const relations = view.relations.map(edge => [edge.id, `${edge.predicate} · ${edge.status} · ${edge.id.slice(0, 8)}`]);
        const pending = view.pending.filter(item => item.status === 'pending').map(item => [item.id, item.name]);
        if (['rename', 'alias', 'remove_alias', 'merge_entity', 'split_entity', 'resolve_pending', 'relation', 'edit_relation'].includes(a)) input('targetId', '目标实体 target', record.targetEntityId || record.id || '', entities);
        if (['merge_entity', 'relation', 'edit_relation'].includes(a)) input('sourceId', '来源实体 source', record.sourceEntityId || '', entities);
        if (['entity', 'rename', 'alias', 'remove_alias'].includes(a)) input('name', '名称 / 别名', a === 'rename' ? record.canonicalName || '' : '');
        if (a === 'entity') input('type', '实体类型', 'Character', ENTITY_TYPES.map(value => [value, value]));
        if (['relation', 'edit_relation'].includes(a)) {
            input('predicate', '语义谓词（snake_case）', record.predicate || '');
            input('text', '关系事实（用户陈述）', '');
            input('validFrom', '开始时间（可选，数字或故事时间）', record.validFrom ?? '');
            input('validUntil', '结束时间（可选）', '');
        }
        if (['edit_relation', 'resolve_conflict'].includes(a)) input('relationId', '关系 / 冲突胜者', record.id || '', relations);
        if (a === 'resolve_conflict') {
            const losers = input('loserIds', '冲突败者（可多选）', '', relations); losers.multiple = true;
            [...losers.options].forEach(option => { option.selected = (record.conflictIds || []).includes(option.value); });
        }
        if (a === 'reject_relation') input('targetId', '关系', record.id || '', relations);
        if (a === 'reject_fact') input('targetId', '事实 / 推断', record.id || '', facts.map(fact => [fact.id, fact.text.slice(0, 100)]));
        if (a === 'resolve_pending') input('pendingId', '待消歧实体', record.id || '', pending);
        if (a === 'reject_pending') input('targetId', '待消歧实体', record.id || '', pending);
        input('reason', '修正原因（独立用户来源，不改写聊天或外部状态）');
    };
    const render = () => {
        if (!view || disposed) return;
        const graph = selectGraph(view, { query: search.value, type: type.value, predicate: predicate.value, history: Boolean(history.value), center: center.value, hops: hops.value });
        status.textContent = `显示 ${graph.entities.length}/${graph.total} 实体，${graph.relations.length}/${graph.totalRelations} 关系。上限 250 / 600；请搜索或缩小局部范围。`;
        cy?.elements().remove();
        cy?.add([...graph.entities.map(entity => ({ data: { id: `n:${entity.id}`, label: entity.canonicalName, record: entity, kind: 'entity', status: entity.status } })),
            ...graph.relations.map(edge => ({ data: { id: `e:${edge.id}`, source: `n:${edge.sourceEntityId}`, target: `n:${edge.targetEntityId}`, label: edge.predicate, record: edge, kind: 'relation', status: edge.status } }))]);
        cy?.layout({ name: 'circle', animate: false, fit: true, padding: 30 }).run();
        listing.replaceChildren();
        node('span', '键盘列表：', listing);
        [...graph.entities.map(record => [record, 'entity']), ...graph.relations.map(record => [record, 'relation'])].slice(0, 100)
            .forEach(([record, kind]) => button(listing, `${record.canonicalName || record.predicate} · ${record.status}`, () => display(record, kind)));
    };
    const refresh = async () => {
        const version = ++generation; const next = await load();
        if (disposed || version !== generation) return;
        snapshot = next; snapshot.assertCurrent(); selected = null;
        view = projectTemporalGraph(snapshot.state, snapshot.chat, { includeInactive: true }); facts = projectFacts(snapshot.state, snapshot.chat, { includeInactive: true });
        const refill = (element, entries) => { const previous = element.value; element.replaceChildren(); entries.forEach(([value, label]) => { const option = node('option', label, element); option.value = value; }); element.value = entries.some(([value]) => value === previous) ? previous : ''; };
        refill(predicate, [['', '全部'], ...[...new Set(view.relations.map(edge => edge.predicate))].sort().map(value => [value, value])]);
        refill(center, [['', '全局图谱'], ...view.entities.map(entity => [entity.id, entity.canonicalName])]);
        inspector.replaceChildren(); node('p', '点击实体或关系查看详情、来源及审计记录。', inspector);
        reviewBody.replaceChildren();
        const pending = view.pending.filter(item => item.status === 'pending'); const disputed = view.relations.filter(edge => edge.status === 'disputed');
        node('p', `${pending.length} 个实体待消歧，${disputed.length} 条关系待裁决。下面最多各显示 100 条。`, reviewBody);
        pending.slice(0, 100).forEach(record => button(reviewBody, `待消歧：${record.name}`, () => { display(record, 'pending'); action.value = 'resolve_pending'; editor.open = true; renderFields(); }));
        disputed.slice(0, 100).forEach(record => button(reviewBody, `待裁决：${record.predicate}`, () => { display(record, 'relation'); action.value = 'resolve_conflict'; editor.open = true; renderFields(); }));
        const factSection = node('details', undefined, reviewBody); node('summary', `事实 / 推断 (${facts.length})`, factSection);
        facts.slice(0, 100).forEach(record => button(factSection, `${record.text.slice(0, 100)} · ${record.status}`, () => display(record, 'fact')));
        const providers = projectProviders(snapshot.state, snapshot.chat);
        node('h4', '外部状态与字段映射 · 只读', reviewBody);
        node('p', '普通文字卡无需外部状态。此处展示 MVU / LoreState 的提供者状态、字段路径及映射；修正操作不会写入它们。', reviewBody);
        node('pre', JSON.stringify(providers, null, 2), reviewBody);
        const audit = node('details', undefined, reviewBody); node('summary', '用户修正记录（最近 100 条）', audit);
        node('pre', JSON.stringify(Object.values(snapshot.state.corrections || {}).slice(-100), null, 2), audit);
        renderFields(); render();
    };
    button(toolbar, '刷新', () => { refresh().catch(fail); });
    button(toolbar, '适应视图', () => cy?.fit(undefined, 30));
    button(toolbar, '旧版节点图', () => { Promise.resolve().then(openLegacy).catch(fail); });
    if (openHistory) button(toolbar, '历史构建 / 回滚', () => { Promise.resolve().then(openHistory).then(refresh).catch(fail); });
    for (const element of [search, type, predicate, history, center, hops]) element.addEventListener('change', render);
    action.addEventListener('change', renderFields);
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy || disposed) return;
        busy = true; save.disabled = true; status.textContent = '正在保存修正…';
        try {
            snapshot.assertCurrent();
            const command = { action: action.value, ...Object.fromEntries(new FormData(form)) };
            const loserSelect = form.elements.namedItem('loserIds');
            if (loserSelect) command.loserIds = [...loserSelect.selectedOptions].map(option => option.value);
            for (const key of ['validFrom', 'validUntil']) {
                if (!command[key]) delete command[key];
                else if (Number.isFinite(Number(command[key]))) command[key] = Number(command[key]);
            }
            await correct(command, snapshot); await refresh(); status.textContent = '修正已保存；已保留用户来源和历史记录。';
        } catch (error) { fail(error); } finally { busy = false; save.disabled = false; }
    });
    const popup = context.callGenericPopup(root, context.POPUP_TYPE.TEXT, '', { wide: true, wider: true, large: true, allowVerticalScrolling: true });
    // Dispose as soon as the popup closes, including during lazy script loading.
    const closing = Promise.resolve(popup).finally(() => { disposed = true; generation++; cy?.destroy(); });
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

import { translateShellText as i18n, formatShellText } from '../../atria-shell/localization.js';
const i18nFormat = (key, ...values) => formatShellText(key, values);
import { nativePromptUiActive } from '../../native/generation-compat.js';
import { mountMemoryRouting } from './native-routing-ui.js';

const MEMORY_VIEWS = Object.freeze([
    ['graph', 'Graph'],
    ['list', 'List'],
    ['sources', 'Sources'],
]);

const ENTITY_LIMIT = 250;
const RELATION_LIMIT = 600;

function recordEpisodeIds(record) {
    const refs = [
        ...(record?.supports || []),
        ...(record?.names || []),
        ...(record?.merges || []),
        ...(record?.resolutions || []),
        ...(record?.supersededBy || []),
        record?.resolution || {},
        record || {},
    ];
    return [...new Set(refs.flatMap(ref => ref?.episodeIds || []))];
}


function toggleCard({ host, el, label, description, checked, onChange, disabled = false }) {
    const row = el('label', undefined, host);
    row.className = 'workspace-memory-toggle-card';
    const copy = el('span', undefined, row);
    el('strong', label, copy);
    el('small', description, copy);
    const input = el('input', undefined, row);
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.checked = checked;
    input.disabled = disabled;
    if (disabled) row.classList.add('is-disabled');
    input.addEventListener('change', () => onChange(input.checked));
    return input;
}

function metric({ host, el, label, value, hint = '' }) {
    const card = el('div', undefined, host);
    card.className = 'workspace-memory-metric';
    el('small', label, card);
    el('strong', String(value ?? '—'), card);
    if (hint) el('span', hint, card);
}

function sourceLabel(episode) {
    return i18nFormat('Message ${0} · ${1}', episode?.sourceFloor ?? '—', i18n(episode?.status || 'unknown'));
}

export function createMemoryWorkspace({ getContext }) {
    let activeView = 'graph';
    let query = '';
    let entityType = '';
    let includeHistory = false;
    let selected = null;

    return function renderMemory(parent, ui) {
        const { el, button, inspector, getView } = ui;
        const controller = new AbortController();
        const context = getContext();
        const service = context.getCapabilityApi?.('memory-graph')?.getWorkspacePorts?.(context);
        let disposed = false;
        let settingsDisposer = () => {};
        let graphInstance = null;
        let snapshot = null;
        let computed = null;
        let loadError = '';
        let refreshVersion = 0;
        const pending = new Set();

        parent.replaceChildren();
        if (inspector) {
            inspector.replaceChildren();
            inspector.hidden = true;
        }

        // Graph-Inspector page: a control rail (status, switches, statistics,
        // recall, maintenance), the knowledge graph / list / sources, then the
        // record inspector beside it. The graph always has a list equivalent.
        const page = el('section', undefined, parent);
        page.className = 'workspace-memory-page';
        const rail = el('aside', undefined, page);
        rail.className = 'workspace-memory-rail';
        rail.setAttribute('aria-label', i18n('Memory controls'));
        const main = el('section', undefined, page);
        main.className = 'workspace-memory-main';
        const heading = el('h2', 'Long-term memory', main);
        heading.className = 'workspace-visually-hidden';

        const status = el('p', '', rail);
        status.className = 'workspace-memory-load-status';
        status.setAttribute('role', 'status');
        const railBody = el('div', undefined, rail);
        railBody.className = 'workspace-memory-rail__body';

        const nav = el('div', undefined, main);
        nav.className = 'workspace-memory-toolbar';
        const filterSlot = el('div', undefined, nav);
        filterSlot.className = 'workspace-memory-filter-slot';
        const viewSwitch = el('div', undefined, nav);
        viewSwitch.className = 'atria-segmented workspace-memory-views';
        viewSwitch.setAttribute('role', 'group');
        viewSwitch.setAttribute('aria-label', i18n('Memory views'));
        for (const [id, label] of MEMORY_VIEWS) {
            const item = button(viewSwitch, label, () => {
                activeView = id;
                renderView();
            });
            item.className = 'atria-segmented__item';
            item.dataset.memoryView = id;
        }

        const content = el('section', undefined, main);
        content.className = 'workspace-memory-content';

        if (!service) {
            // Memory loads during startup; a deep link can open this page first.
            status.textContent = i18n('Memory is starting…');
            let attempts = 0, timer = 0, inner = null;
            const retry = () => {
                if (controller.signal.aborted) return;
                const next = getContext();
                if (next.getCapabilityApi?.('memory-graph')?.getWorkspacePorts?.(next)) { inner = renderMemory(parent, ui); return; }
                if (++attempts >= 40) { status.textContent = i18n('Memory OS is not available in this host.'); return; }
                timer = setTimeout(retry, 400);
            };
            timer = setTimeout(retry, 400);
            return () => { controller.abort(); clearTimeout(timer); inner?.(); };
        }

        const settings = () => service.getStatus?.() || {
            sourceWritesEnabled: false,
            enabled: false,
            recallEnabled: false,
            autoExtractionEnabled: false,
            autoCompressionEnabled: false,
            updateEvery: 1,
        };

        const syncNav = () => {
            for (const item of viewSwitch.children) {
                const active = item.dataset.memoryView === activeView;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', String(active));
            }
        };

        const loadData = async () => {
            if (disposed || !page.isConnected) return;
            const version = ++refreshVersion;
            loadError = '';
            const current = settings();
            if (!current.enabled) {
                snapshot = null;
                computed = null;
                status.textContent = i18n('Memory OS is disabled.');
                renderAll();
                return;
            }
            status.textContent = i18n('Loading memory…');
            try {
                const nextSnapshot = await service.load();
                if (disposed || version !== refreshVersion) return;
                const nextComputed = await service.inspect(nextSnapshot);
                nextSnapshot.assertCurrent();
                if (disposed || version !== refreshVersion) return;
                snapshot = nextSnapshot;
                computed = nextComputed;
                status.textContent = i18nFormat('${0} entities · ${1} relations', computed.graph.entities.length, computed.graph.relations.length);
                renderAll();
            } catch (error) {
                if (disposed || version !== refreshVersion || error?.name === 'AbortError') return;
                snapshot = null;
                computed = null;
                loadError = error?.message || String(error);
                status.textContent = loadError;
                renderAll();
            }
        };

        const operation = async (key, control, action, refresh = true) => {
            if (disposed || !page.isConnected || pending.has(key)) return;
            pending.add(key); if (control) { control.disabled = true; control.setAttribute('aria-busy', 'true'); }
            try {
                status.textContent = i18n('Working…');
                const result = await action();
                if (disposed || !page.isConnected) return;
                if (result?.cancelled) status.textContent = '';
                else if (refresh) await loadData();
                else status.textContent = i18n('Done.');
            } catch (error) {
                if (!disposed && page.isConnected) { status.textContent = error?.message || String(error); status.setAttribute('role', 'alert'); }
            } finally {
                pending.delete(key); if (control) { control.disabled = false; control.removeAttribute('aria-busy'); }
            }
        };
        const setControl = async (name, value) => {
            await operation('control:' + name, null, () => service.setControl?.(name, value));
            if (!disposed && page.isConnected) renderAll();
        };

        let inspectorReturnFocus = null;
        const showRecord = (record, kind) => {
            if (!inspector || !snapshot) return;
            try {
                snapshot.assertCurrent();
            } catch (error) {
                status.textContent = error.message;
                return;
            }
            if (!inspector.contains(parent.ownerDocument.activeElement)) inspectorReturnFocus = parent.ownerDocument.activeElement;
            selected = { record, kind };
            inspector.hidden = false;
            inspector.replaceChildren();

            const head = el('div', undefined, inspector);
            head.className = 'workspace-inspector-heading';
            el('span', kind === 'entity' ? 'Entity' : kind === 'relation' ? 'Relation' : 'Fact', head).className = 'workspace-eyebrow';
            el('h3', record.canonicalName || record.predicate || record.text || record.id, head);
            el('span', record.status || 'active', head).className = `workspace-status-chip is-${record.status || 'active'}`;
            const close = button(head, 'Close inspector', () => {
                inspector.hidden = true;
                if (inspectorReturnFocus?.isConnected) inspectorReturnFocus.focus();
                else parent.querySelector('[data-memory-view="' + activeView + '"]')?.focus();
            });
            close.className = 'workspace-inspector-close'; close.focus();

            const data = el('section', undefined, inspector);
            data.className = 'workspace-inspector-section';
            el('h4', 'Details', data);
            const dl = el('dl', undefined, data);
            dl.className = 'workspace-kv';
            const entries = kind === 'entity'
                ? [['Type', record.type], ['Aliases', (record.aliases || []).join(', ') || '—'], ['ID', record.id]]
                : kind === 'relation'
                    ? [['Predicate', record.predicate], ['Source', record.sourceEntityId], ['Target', record.targetEntityId], ['ID', record.id]]
                    : [['Status', record.status], ['ID', record.id]];
            for (const [label, value] of entries) {
                el('dt', label, dl);
                el('dd', String(value ?? '—'), dl);
            }

            const ids = recordEpisodeIds(record);
            const sources = el('section', undefined, inspector);
            sources.className = 'workspace-inspector-section';
            el('h4', i18nFormat('Sources · ${0}', ids.length), sources);
            if (!ids.length) el('p', 'No source episode is attached to this record.', sources).className = 'workspace-hint';
            for (const id of ids.slice(0, 24)) {
                const episode = snapshot.state.episodes?.[id];
                if (!episode) continue;
                const item = el('details', undefined, sources);
                el('summary', sourceLabel(episode), item);
                el('pre', episode.content || '', item);
            }

            const runUses = getView?.().memoryUsers?.(record.id) || [];
            const uses = el('section', undefined, inspector);
            uses.className = 'workspace-inspector-section';
            el('h4', i18nFormat('Used this run by · ${0}', runUses.length), uses);
            if (!runUses.length) el('p', 'No observed use in the selected run.', uses).className = 'workspace-hint';
            for (const use of runUses.slice(0, 30)) {
                const row = el('div', undefined, uses);
                row.className = 'workspace-memory-use-row';
                el('strong', use.agentId || use.nodeId || use.runId, row);
                el('span', use.stepId || '', row);
            }

            const raw = el('details', undefined, inspector);
            raw.className = 'workspace-inspector-section';
            el('summary', 'Raw record', raw);
            el('pre', JSON.stringify(record, null, 2), raw);
        };

        const railSection = label => {
            const section = el('section', undefined, railBody);
            section.className = 'workspace-memory-rail__section';
            el('h3', label, section);
            return section;
        };
        const renderRail = () => {
            settingsDisposer?.();
            settingsDisposer = () => {};
            railBody.replaceChildren();
            const current = settings();
            // When off, the banner below carries the state; the chip would only repeat it.
            const state = el('span', current.enabled ? 'Memory is available' : 'Memory is disabled', railBody);
            state.hidden = !current.enabled;
            state.className = 'workspace-status-chip is-' + (current.enabled ? 'active' : 'disabled');
            railBody.append(status);

            // Off is a state with a reason and a way back (status protocol 04). The other
            // switches keep their values but do nothing until Memory is on, so they are disabled.
            if (!current.enabled) {
                const off = el('section', undefined, railBody);
                off.className = 'workspace-memory-off';
                el('strong', 'Memory is off', off);
                el('p', 'Replies do not recall stored memories, and new conversation is not recorded.', off);
                button(off, 'Turn on Memory', () => setControl('enabled', true)).className = 'workspace-memory-off__action';
            }
            const controls = railSection('Switches');
            controls.classList.add('workspace-memory-control-grid');
            toggleCard({ host: controls, el, label: 'Memory', description: 'Keep memory active for this conversation.', checked: current.enabled,
                onChange: value => void setControl('enabled', value) });
            const dependent = !current.enabled;
            toggleCard({ host: controls, el, label: 'Recall', description: 'Inject relevant memories into replies.', checked: current.recallEnabled, disabled: dependent,
                onChange: value => void setControl('recallEnabled', value) });
            toggleCard({ host: controls, el, label: 'Source writes', description: 'Allow extraction to add source-backed facts and relations.', checked: current.sourceWritesEnabled, disabled: dependent,
                onChange: value => void setControl('sourceWritesEnabled', value) });
            toggleCard({ host: controls, el, label: 'Auto extraction', description: 'Extract new memories as chat progresses.', checked: current.autoExtractionEnabled, disabled: dependent,
                onChange: value => void setControl('autoExtractionEnabled', value) });
            toggleCard({ host: controls, el, label: 'Auto compression', description: 'Compact older memory using the schema.', checked: current.autoCompressionEnabled, disabled: dependent,
                onChange: value => void setControl('autoCompressionEnabled', value) });

            const metrics = railSection('Statistics');
            const grid = el('div', undefined, metrics);
            grid.className = 'workspace-memory-metrics';
            // Unknown is not zero: until a snapshot has loaded, counts read "—".
            metric({ host: grid, el, label: 'Entities', value: computed ? computed.graph.entities.length : null });
            metric({ host: grid, el, label: 'Relations', value: computed ? computed.graph.relations.length : null });
            metric({ host: grid, el, label: 'Facts', value: computed ? computed.facts.length : null });
            metric({ host: grid, el, label: 'Pending', value: computed ? computed.graph.pending?.filter(item => item.status === 'pending').length || 0 : null });
            metric({ host: grid, el, label: 'Episodes', value: snapshot ? Object.keys(snapshot.state.episodes || {}).length : null });
            metric({ host: grid, el, label: 'This run recalls', value: getView?.().recalls?.length || 0 });

            const recent = getView?.().recalls || [];
            if (recent.length) {
                const evidence = railSection(i18nFormat('Recent recall evidence · ${0}', recent.length));
                for (const recallEvent of [...recent].reverse().slice(0, 12)) {
                    const row = el('div', undefined, evidence);
                    row.className = 'workspace-memory-recall-row';
                    el('strong', recallEvent.agentId || recallEvent.runId, row);
                    el('span', i18nFormat('${0} references', recallEvent.references?.length || 0), row);
                    el('small', recallEvent.stepId || '', row);
                }
            }
            renderMaintenance(railSection('Maintenance'));
        };

        const renderKnowledge = () => {
            const tools = el('div', undefined, filterSlot);
            tools.className = 'workspace-memory-filterbar';
            const search = el('input', undefined, tools);
            search.type = 'search';
            search.placeholder = i18n('Search memory');
            search.setAttribute('aria-label', i18n('Search memory'));
            search.value = query;
            const type = el('select', undefined, tools);
            type.setAttribute('aria-label', i18n('Entity type'));
            const types = ['', ...new Set((computed?.graph.entities || []).map(entity => entity.type).filter(Boolean))];
            for (const value of types) {
                const option = el('option', value || i18n('All types'), type);
                option.value = value;
            }
            type.value = entityType;
            const historyLabel = el('label', 'Include history', tools);
            historyLabel.className = 'workspace-toggle-row';
            const history = el('input', undefined, historyLabel);
            history.type = 'checkbox';
            history.checked = includeHistory;

            const fit = button(tools, 'Fit', () => graphInstance?.fit?.(undefined, 24));
            fit.hidden = activeView !== 'graph';
            const body = el('div', undefined, content);
            body.className = 'workspace-memory-knowledge-layout';
            const graph = el('div', undefined, body);
            graph.className = 'workspace-memory-native-graph';
            graph.hidden = activeView !== 'graph';
            const list = el('section', undefined, body);
            list.className = 'workspace-memory-record-list';
            list.hidden = activeView !== 'list';
            const footer = el('p', '', content);
            footer.className = 'workspace-memory-limit';

            let paintVersion = 0;
            const paint = () => {
                const version = ++paintVersion;
                query = search.value;
                entityType = type.value;
                includeHistory = history.checked;
                const needle = query.trim().toLowerCase();
                let entities = (computed?.graph.entities || []).filter(entity => (includeHistory || entity.status === 'active')
                    && (!entityType || entity.type === entityType)
                    && (!needle || [entity.canonicalName, ...(entity.aliases || [])].some(value => String(value || '').toLowerCase().includes(needle))));
                let relations = (computed?.graph.relations || []).filter(edge => includeHistory || edge.status === 'active');
                const ids = new Set(entities.map(entity => entity.id));
                relations = relations.filter(edge => ids.has(edge.sourceEntityId) && ids.has(edge.targetEntityId));
                entities = entities.slice(0, ENTITY_LIMIT);
                const visibleIds = new Set(entities.map(entity => entity.id));
                relations = relations.filter(edge => visibleIds.has(edge.sourceEntityId) && visibleIds.has(edge.targetEntityId)).slice(0, RELATION_LIMIT);

                list.replaceChildren();
                footer.textContent = i18nFormat('Showing ${0} / ${1} entities. The graph shows at most ${2} entities and ${3} relations; not shown does not mean absent.', entities.length, (computed?.graph.entities || []).length, ENTITY_LIMIT, RELATION_LIMIT);
                for (const entity of entities.slice(0, 100)) {
                    const item = button(list, undefined, () => showRecord(entity, 'entity'));
                    item.className = 'workspace-memory-record';
                    const copy = el('span', undefined, item);
                    el('strong', entity.canonicalName, copy);
                    el('small', `${entity.type} · ${entity.status}`, copy);
                    el('span', String(relations.filter(edge => edge.sourceEntityId === entity.id || edge.targetEntityId === entity.id).length), item).className = 'workspace-memory-degree';
                }

                if (!entities.length) el('p', 'No matching memory entities.', list).className = 'workspace-empty-copy';
                graph.replaceChildren();
                if (graph.hidden) return;
                if (!entities.length) {
                    el('p', 'No matching memory entities.', graph).className = 'workspace-empty-copy';
                    return;
                }
                const fallback = el('div', undefined, graph);
                fallback.className = 'workspace-memory-graph-fallback';
                el('p', 'Preparing graph…', fallback).className = 'workspace-hint';

                if (typeof service.loadGraphLibrary !== 'function') {
                    fallback.textContent = i18n('Graph rendering is unavailable in this host.');
                    return;
                }
                void service.loadGraphLibrary().then(cytoscape => {
                    if (disposed || !graph.isConnected || version !== paintVersion) return;
                    graphInstance?.destroy?.();
                    graph.replaceChildren();
                    const colors = getComputedStyle(parent);
                    const color = key => colors.getPropertyValue(key).trim();
                    graphInstance = cytoscape({
                        container: graph,
                        elements: [
                            ...entities.map(entity => ({ data: { id: `n:${entity.id}`, label: entity.canonicalName, record: entity, kind: 'entity', status: entity.status } })),
                            ...relations.map(edge => ({ data: { id: `e:${edge.id}`, source: `n:${edge.sourceEntityId}`, target: `n:${edge.targetEntityId}`, label: edge.predicate, record: edge, kind: 'relation', status: edge.status } })),
                        ],
                        style: [
                            { selector: 'node', style: { label: 'data(label)', width: 38, height: 38, 'background-color': color('--surface-raised'), 'border-width': 1.5, 'border-color': color('--line-strong'), color: color('--text-1'), 'font-size': 11, 'font-weight': 600, 'text-valign': 'center', 'text-halign': 'center' } },
                            { selector: 'node:selected', style: { 'border-color': color('--tone-lumen'), 'border-width': 2.5 } },
                            { selector: 'edge', style: { label: 'data(label)', width: 1, 'target-arrow-shape': 'triangle', 'arrow-scale': 0.7, 'curve-style': 'bezier', color: color('--text-3'), 'line-color': color('--line-strong'), 'target-arrow-color': color('--line-strong'), 'font-size': 9, 'text-background-color': color('--surface-app'), 'text-background-opacity': 1, 'text-background-padding': 2 } },
                            { selector: '[status != "active"]', style: { opacity: 0.5, 'border-style': 'dashed', 'line-style': 'dashed' } },
                        ],
                        layout: { name: 'circle', animate: false, fit: true, padding: 24 },
                        wheelSensitivity: 0.2,
                        pixelRatio: 1,
                    });
                    graphInstance.on('tap', 'node, edge', event => showRecord(event.target.data('record'), event.target.data('kind')));
                }).catch(error => {
                    if (!disposed && graph.isConnected) fallback.textContent = error.message;
                });
            };

            search.addEventListener('input', paint);
            type.addEventListener('change', paint);
            history.addEventListener('change', paint);
            paint();
        };

        const renderSources = () => {
            if (!snapshot) {
                el('p', loadError || 'Enable Memory OS to inspect sources.', content).className = 'workspace-empty-copy';
                return;
            }
            const state = snapshot.state;
            const sections = el('div', undefined, content);
            sections.className = 'workspace-memory-sources';

            const providers = el('section', undefined, sections);
            providers.className = 'workspace-memory-source-section';
            el('h3', 'State providers', providers);
            const providerEntries = Object.entries(state.providerSources || {});
            if (!providerEntries.length) el('p', 'No external state provider is active.', providers).className = 'workspace-hint';
            for (const [providerId, source] of providerEntries) {
                const snapshotRecord = state.providerSnapshots?.[source.snapshotId];
                const row = el('article', undefined, providers);
                row.className = 'workspace-memory-source-card';
                el('strong', providerId, row);
                el('span', source.status || 'unknown', row).className = `workspace-status-chip is-${source.status || 'unknown'}`;
                el('small', snapshotRecord ? i18nFormat('${0} mapped fields', snapshotRecord.fields?.length || 0) : 'No current snapshot', row);
            }

            const chat = el('section', undefined, sections);
            chat.className = 'workspace-memory-source-section';
            el('h3', i18nFormat('Chat episodes · ${0}', Object.keys(state.episodes || {}).length), chat);
            for (const [id, episode] of Object.entries(state.episodes || {}).slice(-100).reverse()) {
                const item = el('details', undefined, chat);
                el('summary', `${sourceLabel(episode)} · ${id.slice(0, 8)}`, item);
                el('pre', episode.content || '', item);
            }

            const corrections = el('section', undefined, sections);
            corrections.className = 'workspace-memory-source-section';
            const correctionValues = Object.values(state.corrections || {}).slice(-100).reverse();
            el('h3', i18nFormat('Manual corrections · ${0}', correctionValues.length), corrections);
            if (!correctionValues.length) el('p', 'No manual corrections.', corrections).className = 'workspace-hint';
            for (const correction of correctionValues) {
                const item = el('details', undefined, corrections);
                el('summary', correction.reason || correction.action || correction.id, item);
                el('pre', JSON.stringify(correction, null, 2), item);
            }
        };

        const renderMaintenance = host => {
            if (nativePromptUiActive() && service.getNativeRoutes) {
                try { mountMemoryRouting(host, service); } catch (error) { status.textContent = error.message; }
            }
            const actions = el('div', undefined, host);
            actions.className = 'workspace-memory-maintenance-actions';

            const runAction = (name, action, { refresh = true } = {}) => {
                const control = button(actions, name, () => void operation(name, control, () => action?.(), refresh));
                control.disabled = pending.has(name);
            };

            runAction('History build / rollback', service.openHistory);
            runAction('Manual compression', service.manualCompress);
            runAction('Rebuild vectors', service.rebuildVectors);
            runAction('Export memory', service.exportGraph, { refresh: false });
            button(actions, 'Refresh memory', () => void loadData());

            const importLabel = el('label', 'Import memory', actions);
            importLabel.className = 'workspace-file-action';
            const importInput = el('input', undefined, importLabel);
            importInput.type = 'file';
            importInput.accept = '.json,application/json';
            importInput.setAttribute('aria-label', i18n('Import memory'));
            importInput.addEventListener('change', () => {
                const file = importInput.files?.[0]; importInput.value = '';
                if (file) void operation('import', importInput, () => service.importGraph?.(file));
            });

            const danger = el('section', undefined, host);
            danger.className = 'workspace-memory-danger-zone';
            el('h4', 'Danger zone', danger);
            el('p', 'Reset removes the current chat memory graph and its vector index. This cannot be undone.', danger).className = 'workspace-hint';
            const reset = button(danger, 'Reset current chat memory', () => void operation('reset', reset, () => service.resetGraph?.()));
            reset.disabled = pending.has('reset');
            reset.className = 'workspace-danger';

            const advanced = el('details', undefined, host);
            advanced.className = 'workspace-memory-advanced';
            el('summary', 'Advanced memory settings and maintenance', advanced);
            const settingsHost = el('div', undefined, advanced);
            settingsHost.className = 'workspace-memory-advanced-host';
            let mounted = false;
            advanced.addEventListener('toggle', () => {
                if (!advanced.open || mounted) return;
                mounted = true;
                settingsDisposer = service.mountSettings?.(settingsHost) || (() => {});
            });
        };

        const renderView = () => {
            syncNav();
            content.replaceChildren();
            filterSlot.replaceChildren();
            graphInstance?.destroy?.();
            graphInstance = null;
            if (inspector) {
                inspector.replaceChildren();
                inspector.hidden = true;
            }
            selected = null;
            if (activeView === 'sources') renderSources();
            else renderKnowledge();
        };
        const renderAll = () => { renderRail(); renderView(); };

        renderAll();
        void loadData();

        return {
            updateRun() {
                if (disposed) return;
                renderRail();
                if (selected && inspector && !inspector.hidden) showRecord(selected.record, selected.kind);
            },
            dispose() {
                disposed = true;
                refreshVersion++;
                controller.abort();
                graphInstance?.destroy?.();
                graphInstance = null;
                settingsDisposer?.();
                if (inspector) {
                    inspector.replaceChildren();
                    inspector.hidden = true;
                }
            },
        };
    };
}

import { i18n, i18nFormat } from '../../i18n.js';

const MEMORY_VIEWS = Object.freeze([
    ['overview', 'Overview'],
    ['knowledge', 'Knowledge'],
    ['sources', 'Sources'],
    ['maintenance', 'Maintenance'],
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


function toggleCard({ host, el, label, description, checked, onChange }) {
    const row = el('label', undefined, host);
    row.className = 'workspace-memory-toggle-card';
    const copy = el('span', undefined, row);
    el('strong', label, copy);
    el('small', description, copy);
    const input = el('input', undefined, row);
    input.type = 'checkbox';
    input.checked = checked;
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
    return `Message ${episode?.sourceFloor ?? '—'} · ${episode?.status || 'unknown'}`;
}

export function createMemoryWorkspace({ getContext }) {
    let activeView = 'overview';
    let query = '';
    let entityType = '';
    let includeHistory = false;
    let selected = null;

    return function renderMemory(parent, ui) {
        const { el, button, inspector, getView } = ui;
        const controller = new AbortController();
        const context = getContext();
        const service = context.getExtensionApi?.('memory-graph')?.getWorkspacePorts?.(context);
        let disposed = false;
        let settingsDisposer = () => {};
        let graphInstance = null;
        let snapshot = null;
        let computed = null;
        let loadError = '';
        let refreshVersion = 0;

        parent.replaceChildren();
        if (inspector) {
            inspector.replaceChildren();
            inspector.hidden = true;
        }

        const page = el('section', undefined, parent);
        page.className = 'workspace-memory-page';

        const heading = el('div', undefined, page);
        heading.className = 'workspace-page-heading';
        const title = el('div', undefined, heading);
        el('span', 'Memory OS', title).className = 'workspace-eyebrow';
        el('h3', 'Long-term memory', title);
        el('p', 'Knowledge, provenance and maintenance for the current conversation.', title).className = 'workspace-hint';

        const status = el('div', '', heading);
        status.className = 'workspace-memory-load-status';
        status.setAttribute('role', 'status');

        const nav = el('div', undefined, page);
        nav.className = 'workspace-subnav';
        for (const [id, label] of MEMORY_VIEWS) {
            const item = button(nav, label, () => {
                activeView = id;
                renderView();
            });
            item.dataset.memoryView = id;
        }

        const content = el('section', undefined, page);
        content.className = 'workspace-memory-content';

        if (!service) {
            status.textContent = i18n('Memory OS is not available in this host.');
            return () => controller.abort();
        }

        const settings = () => service.getStatus?.() || {
            memoryOsEnabled: false,
            enabled: false,
            recallEnabled: false,
            autoExtractionEnabled: false,
            autoCompressionEnabled: false,
            recallMethod: 'llm',
            updateEvery: 1,
        };

        const syncNav = () => {
            for (const item of nav.children) {
                const active = item.dataset.memoryView === activeView;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', String(active));
            }
        };

        const loadData = async () => {
            const version = ++refreshVersion;
            loadError = '';
            const current = settings();
            if (!current.memoryOsEnabled) {
                snapshot = null;
                computed = null;
                status.textContent = i18n('Memory OS is disabled.');
                renderView();
                return;
            }
            status.textContent = i18n('Loading memory…');
            try {
                const nextSnapshot = await service.load();
                const nextComputed = await service.inspect(nextSnapshot);
                nextSnapshot.assertCurrent();
                if (disposed || version !== refreshVersion) return;
                snapshot = nextSnapshot;
                computed = nextComputed;
                status.textContent = i18nFormat('${0} entities · ${1} relations', computed.graph.entities.length, computed.graph.relations.length);
                renderView();
            } catch (error) {
                if (disposed || version !== refreshVersion || error?.name === 'AbortError') return;
                snapshot = null;
                computed = null;
                loadError = error?.message || String(error);
                status.textContent = loadError;
                renderView();
            }
        };

        const setControl = async (name, value) => {
            try {
                status.textContent = i18n('Saving…');
                await service.setControl?.(name, value);
                await loadData();
            } catch (error) {
                status.textContent = error?.message || String(error);
            }
        };

        const showRecord = (record, kind) => {
            if (!inspector || !snapshot) return;
            try {
                snapshot.assertCurrent();
            } catch (error) {
                status.textContent = error.message;
                return;
            }
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
            });
            close.className = 'workspace-inspector-close';

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

        const renderOverview = () => {
            const current = settings();
            const hero = el('section', undefined, content);
            hero.className = 'workspace-memory-overview-hero';
            const heroCopy = el('div', undefined, hero);
            el('span', 'Memory OS', heroCopy).className = 'workspace-eyebrow';
            el('h3', current.memoryOsEnabled ? 'Memory is available' : 'Memory OS is disabled', heroCopy);
            el('p', current.memoryOsEnabled
                ? 'Atria can extract, recall and audit long-term knowledge for this conversation.'
                : 'Enable Memory OS to load source-backed facts and the world graph.', heroCopy).className = 'workspace-hint';

            const controls = el('div', undefined, content);
            controls.className = 'workspace-memory-control-grid';
            toggleCard({ host: controls, el, label: 'Memory OS', description: 'Source-backed facts and world graph.', checked: current.memoryOsEnabled,
                onChange: value => void setControl('memoryOsEnabled', value) });
            toggleCard({ host: controls, el, label: 'Memory', description: 'Keep memory active for this conversation.', checked: current.enabled,
                onChange: value => void setControl('enabled', value) });
            toggleCard({ host: controls, el, label: 'Recall', description: 'Inject relevant memories into replies.', checked: current.recallEnabled,
                onChange: value => void setControl('recallEnabled', value) });
            toggleCard({ host: controls, el, label: 'Auto extraction', description: 'Extract new memories as chat progresses.', checked: current.autoExtractionEnabled,
                onChange: value => void setControl('autoExtractionEnabled', value) });
            toggleCard({ host: controls, el, label: 'Auto compression', description: 'Compact older memory using the schema.', checked: current.autoCompressionEnabled,
                onChange: value => void setControl('autoCompressionEnabled', value) });

            const recall = el('label', 'Recall method', controls);
            recall.className = 'workspace-memory-toggle-card workspace-memory-select-card';
            const select = el('select', undefined, recall);
            for (const [value, label] of [['llm', 'LLM Recall'], ['rag', 'RAG Recall']]) {
                const option = el('option', label, select);
                option.value = value;
            }
            select.value = current.recallMethod;
            select.addEventListener('change', () => void setControl('recallMethod', select.value));

            const metrics = el('div', undefined, content);
            metrics.className = 'workspace-memory-metrics';
            metric({ host: metrics, el, label: 'Entities', value: computed?.graph.entities.length || 0 });
            metric({ host: metrics, el, label: 'Relations', value: computed?.graph.relations.length || 0 });
            metric({ host: metrics, el, label: 'Facts', value: computed?.facts.length || 0 });
            metric({ host: metrics, el, label: 'Pending', value: computed?.graph.pending?.filter(item => item.status === 'pending').length || 0 });
            metric({ host: metrics, el, label: 'Episodes', value: snapshot ? Object.keys(snapshot.state.episodes || {}).length : 0 });
            metric({ host: metrics, el, label: 'This run recalls', value: getView?.().recalls?.length || 0 });

            const recent = getView?.().recalls || [];
            if (recent.length) {
                const evidence = el('section', undefined, content);
                evidence.className = 'workspace-memory-overview-section';
                const head = el('div', undefined, evidence);
                head.className = 'workspace-section-heading';
                el('h3', 'Recent recall evidence', head);
                el('span', String(recent.length), head).className = 'workspace-hint';
                for (const recallEvent of [...recent].reverse().slice(0, 12)) {
                    const row = el('div', undefined, evidence);
                    row.className = 'workspace-memory-recall-row';
                    el('strong', recallEvent.agentId || recallEvent.runId, row);
                    el('span', i18nFormat('${0} references', recallEvent.references?.length || 0), row);
                    el('small', recallEvent.stepId || '', row);
                }
            }
        };

        const renderKnowledge = () => {
            const tools = el('div', undefined, content);
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

            const body = el('div', undefined, content);
            body.className = 'workspace-memory-knowledge-layout';
            const graph = el('div', undefined, body);
            graph.className = 'workspace-memory-native-graph';
            const list = el('section', undefined, body);
            list.className = 'workspace-memory-record-list';

            const paint = () => {
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
                const summary = el('p', i18nFormat('${0} entities · ${1} relations', entities.length, relations.length), list);
                summary.className = 'workspace-hint';
                for (const entity of entities.slice(0, 100)) {
                    const item = button(list, undefined, () => showRecord(entity, 'entity'));
                    item.className = 'workspace-memory-record';
                    const copy = el('span', undefined, item);
                    el('strong', entity.canonicalName, copy);
                    el('small', `${entity.type} · ${entity.status}`, copy);
                    el('span', String(relations.filter(edge => edge.sourceEntityId === entity.id || edge.targetEntityId === entity.id).length), item).className = 'workspace-memory-degree';
                }

                graph.replaceChildren();
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
                    if (disposed || !graph.isConnected) return;
                    graphInstance?.destroy?.();
                    graph.replaceChildren();
                    graphInstance = cytoscape({
                        container: graph,
                        elements: [
                            ...entities.map(entity => ({ data: { id: `n:${entity.id}`, label: entity.canonicalName, record: entity, kind: 'entity', status: entity.status } })),
                            ...relations.map(edge => ({ data: { id: `e:${edge.id}`, source: `n:${edge.sourceEntityId}`, target: `n:${edge.targetEntityId}`, label: edge.predicate, record: edge, kind: 'relation', status: edge.status } })),
                        ],
                        style: [
                            { selector: 'node', style: { label: 'data(label)', 'background-color': '#779ddd', color: '#ddd', 'font-size': 11 } },
                            { selector: 'edge', style: { label: 'data(label)', width: 1.5, 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', color: '#bbb', 'font-size': 9 } },
                            { selector: '[status != "active"]', style: { opacity: 0.45 } },
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

        const renderMaintenance = () => {
            const hero = el('section', undefined, content);
            hero.className = 'workspace-memory-maintenance-hero';
            el('h3', 'Build and maintenance', hero);
            el('p', 'History rebuilds, schema work and destructive operations live here instead of the everyday memory view.', hero).className = 'workspace-hint';

            const actions = el('div', undefined, content);
            actions.className = 'workspace-memory-maintenance-actions';
            button(actions, 'History build / rollback', () => {
                Promise.resolve(service.openHistory?.()).then(() => loadData()).catch(error => { status.textContent = error.message; });
            });
            button(actions, 'Refresh memory', () => void loadData());

            const advanced = el('details', undefined, content);
            advanced.className = 'workspace-memory-advanced';
            el('summary', 'Advanced memory settings and maintenance', advanced);
            const host = el('div', undefined, advanced);
            host.className = 'workspace-memory-advanced-host';
            let mounted = false;
            advanced.addEventListener('toggle', () => {
                if (!advanced.open || mounted) return;
                mounted = true;
                settingsDisposer = service.mountSettings?.(host) || (() => {});
            });
        };

        const renderView = () => {
            syncNav();
            content.replaceChildren();
            graphInstance?.destroy?.();
            graphInstance = null;
            settingsDisposer?.();
            settingsDisposer = () => {};
            if (inspector) {
                inspector.replaceChildren();
                inspector.hidden = true;
            }
            selected = null;
            if (activeView === 'overview') renderOverview();
            else if (activeView === 'knowledge') renderKnowledge();
            else if (activeView === 'sources') renderSources();
            else renderMaintenance();
        };

        renderView();
        void loadData();

        return {
            updateRun() {
                if (disposed) return;
                if (activeView === 'overview') renderView();
                else if (selected && inspector && !inspector.hidden) showRecord(selected.record, selected.kind);
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

const GROUPS = Object.freeze([
    ['memory', 'Memory'],
    ['search', 'Web Access'],
    ['chat', 'Chat'],
    ['lorebook', 'Lorebook'],
    ['note', 'Notes'],
    ['message', 'Message'],
    ['draft', 'Draft'],
    ['agent', 'Agents'],
    ['other', 'Other'],
]);

function toolGroup(name) {
    const key = String(name || '').split('_', 1)[0];
    return GROUPS.some(([id]) => id === key) ? key : 'other';
}

function normalizeTools(tools) {
    return [...new Map((tools || []).map(tool => [tool.name, tool])).values()]
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function renderToolPermissionPanel({ parent, el, button, agent, tools, i18n, onToolToggle = null }) {
    const catalog = normalizeTools(tools);
    const root = el('section', undefined, parent);
    root.className = 'workspace-permission-panel';

    const toolbar = el('div', undefined, root);
    toolbar.className = 'workspace-permission-toolbar';

    const search = el('input', undefined, toolbar);
    search.type = 'search';
    search.placeholder = i18n('Search tools');
    search.setAttribute('aria-label', i18n('Search tools'));

    const actions = el('div', undefined, toolbar);
    actions.className = 'workspace-permission-actions';
    button(actions, 'Allow all', () => {
        agent.tools = ['*'];
        paint();
    });
    button(actions, 'Deny all', () => {
        agent.tools = [];
        paint();
    });

    const list = el('div', undefined, root);
    list.className = 'workspace-permission-groups';

    const isAllowed = name => {
        const planAllowed = agent.tools?.includes('*') === true || agent.tools?.includes(name) === true;
        const tool = catalog.find(item => item.name === name);
        return planAllowed && (typeof tool?.effectiveEnabled === 'boolean' ? tool.effectiveEnabled : true);
    };
    const setAllowed = (name, allowed) => {
        if (agent.tools?.includes('*')) agent.tools = catalog.map(tool => tool.name);
        const selected = new Set(agent.tools || []);
        if (allowed) selected.add(name); else selected.delete(name);
        agent.tools = [...selected];
        const tool = catalog.find(item => item.name === name);
        if (tool && typeof tool.effectiveEnabled === 'boolean') tool.effectiveEnabled = Boolean(allowed);
        if (typeof onToolToggle === 'function') onToolToggle(name, Boolean(allowed));
    };

    const paint = () => {
        list.replaceChildren();
        const needle = search.value.trim().toLowerCase();
        for (const [groupId, groupLabel] of GROUPS) {
            const entries = catalog.filter(tool => toolGroup(tool.name) === groupId)
                .filter(tool => !needle || [tool.name, tool.displayName, tool.description].some(value => String(value || '').toLowerCase().includes(needle)));
            if (!entries.length) continue;
            const group = el('section', undefined, list);
            group.className = 'workspace-permission-group';
            const heading = el('div', undefined, group);
            heading.className = 'workspace-permission-group-heading';
            el('strong', i18n(groupLabel), heading);
            el('span', String(entries.length), heading);
            const entriesHost = el('div', undefined, group);
            entriesHost.className = 'workspace-permission-items';
            for (const tool of entries) {
                const row = el('label', undefined, entriesHost);
                row.className = 'workspace-permission-item';
                const copy = el('span', undefined, row);
                const name = el('strong', tool.displayName || tool.name, copy);
                name.title = tool.name;
                if (tool.description) el('small', tool.description, copy);
                if (tool.missing) el('small', i18n('Missing from current host'), copy);
                const toggle = el('input', undefined, row);
                toggle.type = 'checkbox';
                toggle.checked = isAllowed(tool.name);
                toggle.disabled = tool.missing === true;
                toggle.addEventListener('change', () => setAllowed(tool.name, toggle.checked));
            }
        }
        if (!list.children.length) {
            const empty = el('p', 'No matching tools', list);
            empty.className = 'workspace-hint';
        }
    };

    search.addEventListener('input', paint);
    paint();
    return root;
}

export function renderCapabilityPanel({ parent, el, button, plan, agent, capabilities, effectiveCapabilities, i18n }) {
    const root = el('section', undefined, parent);
    root.className = 'workspace-capability-editor';

    const agentSection = el('section', undefined, root);
    agentSection.className = 'workspace-capability-group';
    const agentHead = el('div', undefined, agentSection);
    agentHead.className = 'workspace-permission-group-heading';
    el('strong', 'Agent permissions', agentHead);

    const rows = el('div', undefined, agentSection);
    rows.className = 'workspace-capability-rows';
    for (const capability of capabilities) {
        const row = el('div', undefined, rows);
        row.className = 'workspace-capability-row';
        const label = el('div', undefined, row);
        el('strong', i18n(capability), label);
        el('small', capability, label);
        const select = el('select', undefined, row);
        select.setAttribute('aria-label', capability);
        for (const [value, text] of [['allow', 'Allow'], ['deny', 'Deny']]) {
            const option = el('option', i18n(text), select);
            option.value = value;
        }
        select.value = agent.capabilities?.[capability] === true ? 'allow' : 'deny';
        select.addEventListener('change', () => {
            (agent.capabilities ||= {})[capability] = select.value === 'allow';
        });
    }

    for (const node of plan.nodes.filter(item => item.agentId === agent.id)) {
        const nodeSection = el('details', undefined, root);
        nodeSection.className = 'workspace-capability-node';
        el('summary', `${i18n('Node ceiling')} · ${node.nodeId}`, nodeSection);
        const effective = effectiveCapabilities(plan, node);
        const nodeRows = el('div', undefined, nodeSection);
        nodeRows.className = 'workspace-capability-rows';
        for (const capability of capabilities) {
            const row = el('div', undefined, nodeRows);
            row.className = 'workspace-capability-row';
            const label = el('div', undefined, row);
            el('strong', i18n(capability), label);
            el('small', i18nFormatSafe(i18n, 'Effective: ${0}', effective[capability] ? i18n('Allowed') : i18n('Denied')), label);
            const select = el('select', undefined, row);
            select.setAttribute('aria-label', `${node.nodeId} · ${capability}`);
            for (const [value, text] of [['allow', 'Allow'], ['deny', 'Deny']]) {
                const option = el('option', i18n(text), select);
                option.value = value;
            }
            select.value = node.capabilities?.[capability] === true ? 'allow' : 'deny';
            select.addEventListener('change', () => {
                (node.capabilities ||= {})[capability] = select.value === 'allow';
            });
        }
        button(nodeSection, 'Match agent permissions', () => {
            node.capabilities = structuredClone(agent.capabilities || {});
            for (const select of nodeSection.querySelectorAll('select')) {
                const capability = select.getAttribute('aria-label').split(' · ').at(-1);
                select.value = node.capabilities[capability] === true ? 'allow' : 'deny';
            }
        });
    }

    return root;
}

function i18nFormatSafe(i18n, template, value) {
    return i18n(template).replace('${0}', value);
}

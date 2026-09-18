import { i18n } from '../i18n.js';

export const WORKSPACE_SECTIONS = Object.freeze([
    { id: 'orchestration', label: 'Orchestration', icon: 'fa-diagram-project' },
    { id: 'run', label: 'Run', icon: 'fa-play' },
    { id: 'memory', label: 'Memory', icon: 'fa-brain' },
    { id: 'diagnostics', label: 'Diagnostics', icon: 'fa-stethoscope' },
]);

const el = (tag, className, parent) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    parent?.append(node);
    return node;
};

function icon(name, parent) {
    const node = el('i', `fa-solid ${name}`, parent);
    node.setAttribute('aria-hidden', 'true');
    return node;
}

/**
 * Build the product-level Workspace chrome.
 *
 * The shell owns layout, focusable global navigation and the contextual
 * inspector column. Feature pages own only their page contents.
 */
export function createWorkspaceShell({ onNavigate, onClose, onStop, onToggleOrchestration }) {
    const root = el('section', 'atria-workspace', document.body);
    root.id = 'agent-memory-workspace';
    root.hidden = true;
    root.setAttribute('aria-label', i18n('Atria Workspace'));

    const header = el('header', 'atria-workspace-header', root);
    const brand = el('div', 'atria-workspace-brand', header);
    const title = el('h2', '', brand);
    title.textContent = i18n('Atria Workspace');
    const context = el('p', 'atria-workspace-context', brand);
    context.textContent = i18n('Agent orchestration and long-term memory');

    const headerMeta = el('div', 'atria-workspace-header-meta', header);
    const presetChip = el('span', 'atria-workspace-preset-chip', headerMeta);
    presetChip.textContent = i18n('No preset');
    const orchestrationLabel = el('label', 'atria-workspace-orchestration-toggle', headerMeta);
    const orchestrationText = el('span', '', orchestrationLabel);
    orchestrationText.textContent = i18n('Orchestration');
    const orchestrationToggle = el('input', '', orchestrationLabel);
    orchestrationToggle.type = 'checkbox';
    orchestrationToggle.setAttribute('aria-label', i18n('Orchestration enabled'));
    orchestrationToggle.addEventListener('change', () => onToggleOrchestration?.(orchestrationToggle.checked));

    const headerStatus = el('div', 'atria-workspace-header-status', header);
    headerStatus.setAttribute('role', 'status');

    const headerActions = el('div', 'atria-workspace-header-actions', header);
    const stop = el('button', 'atria-workspace-action atria-workspace-stop', headerActions);
    stop.type = 'button';
    stop.hidden = true;
    stop.setAttribute('aria-label', i18n('Stop Run'));
    stop.addEventListener('click', onStop);
    icon('fa-stop', stop);
    const stopText = el('span', '', stop);
    stopText.textContent = i18n('Stop Run');

    const close = el('button', 'atria-workspace-action atria-workspace-close', headerActions);
    close.type = 'button';
    close.setAttribute('aria-label', i18n('Close'));
    close.addEventListener('click', onClose);
    icon('fa-xmark', close);

    const frame = el('div', 'atria-workspace-frame', root);
    const nav = el('nav', 'atria-workspace-nav', frame);
    nav.setAttribute('aria-label', i18n('Workspace views'));

    for (const section of WORKSPACE_SECTIONS) {
        const item = el('button', 'atria-workspace-nav-item', nav);
        item.type = 'button';
        item.dataset.section = section.id;
        item.setAttribute('aria-controls', 'workspace-content');
        item.addEventListener('click', () => onNavigate(section.id));
        icon(section.icon, item);
        const label = el('span', '', item);
        label.textContent = i18n(section.label);
    }

    const main = el('main', 'atria-workspace-main', frame);
    main.id = 'workspace-content';
    main.tabIndex = -1;

    const inspector = el('aside', 'atria-workspace-inspector', frame);
    inspector.setAttribute('aria-label', i18n('Context Inspector'));
    inspector.tabIndex = -1;
    inspector.hidden = true;

    const mobileNav = el('nav', 'atria-workspace-mobile-nav', root);
    mobileNav.setAttribute('aria-label', i18n('Workspace views'));
    for (const section of WORKSPACE_SECTIONS) {
        const item = el('button', 'atria-workspace-mobile-nav-item', mobileNav);
        item.type = 'button';
        item.dataset.section = section.id;
        item.addEventListener('click', () => onNavigate(section.id));
        icon(section.icon, item);
        const label = el('span', '', item);
        label.textContent = i18n(section.label);
    }

    return {
        root,
        header,
        title,
        context,
        headerMeta,
        presetChip,
        orchestrationToggle,
        headerStatus,
        stop,
        stopText,
        close,
        nav,
        mobileNav,
        main,
        inspector,
    };
}

export function syncWorkspaceNavigation(shell, activeSection) {
    for (const nav of [shell.nav, shell.mobileNav]) {
        for (const item of nav.children) {
            const active = item.dataset.section === activeSection;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-current', active ? 'page' : 'false');
        }
    }
}

export function focusWorkspaceSection(shell, section) {
    shell.nav.querySelector(`[data-section="${CSS.escape(section)}"]`)?.focus({ preventScroll: true });
}

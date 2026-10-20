// One Agents frame for every section: Memory first (P-03), then Run · Plan
// (V3 Host projections; Runs and Plans switch inside it) and diagnostics.
import { translateShellText as tl } from './localization.js';

export const AGENT_TABS = Object.freeze([
    Object.freeze(['memory', 'Memory']),
    Object.freeze(['runs', 'Run · Plan']),
    Object.freeze(['diagnostics', 'Diagnostics & replay']),
]);

export function buildAgentsFrame(documentRef, { active, onSelect }) {
    const element = (tag, className, text) => {
        const node = documentRef.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const root = element('section', 'atria-domain-workspace');
    root.dataset.atriaDomainWorkspace = 'agents';
    const header = element('header', 'atria-domain-workspace__header');
    const title = element('h1', '', tl('Agents'));
    title.dataset.atriaLargeTitle = 'true';
    header.append(title);
    const nav = element('nav', 'atria-domain-workspace__nav');
    nav.setAttribute('aria-label', tl('Agents sections'));
    for (const [id, label] of AGENT_TABS) {
        const tab = element('button', 'atria-domain-workspace__tab', tl(label));
        tab.type = 'button';
        tab.dataset.atriaDomainSection = id;
        if (id === 'runs') {
            const seal = element('span', 'atria-seal', 'V3');
            seal.dataset.seal = 'current';
            tab.append(seal);
        }
        tab.addEventListener('click', () => onSelect(id));
        nav.append(tab);
    }
    const body = element('div', 'atria-domain-workspace__body');
    root.append(header, nav, body);
    const select = section => {
        const tabId = section === 'plans' ? 'runs' : section;
        for (const tab of nav.querySelectorAll('[data-atria-domain-section]')) {
            const selected = tab.dataset.atriaDomainSection === tabId;
            tab.classList.toggle('is-selected', selected);
            tab.setAttribute('aria-current', selected ? 'page' : 'false');
        }
    };
    select(active);
    return { root, nav, body, select };
}

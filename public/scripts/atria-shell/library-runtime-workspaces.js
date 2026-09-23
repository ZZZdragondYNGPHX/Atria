import { mountPromptLibrary } from '../native/prompt-authoring.js';
import { mountNativeRuntimeWorkspace } from '../native/runtime-workspace.js';
import {
    createAtriaStatePanel,
} from './primitives.js';
import { translateShellText } from './localization.js';
import { applyAtriaPattern } from './patterns.js';
import {
    mountNativeWorksWorkspace,
    mountNativeWorldKnowledgeWorkspace,
} from '../native/library-workspaces.js';

function createLocalizedStatePanel(documentRef, kind, options = {}) {
    return createAtriaStatePanel(documentRef, kind, {
        ...options,
        title: translateShellText(options.title),
        message: translateShellText(options.message),
    });
}

export const LIBRARY_SECTIONS = Object.freeze([
    Object.freeze({ id: 'works', label: 'Works' }),
    Object.freeze({ id: 'worlds-knowledge', label: 'Worlds & Knowledge' }),
    Object.freeze({ id: 'prompt-programs', label: 'Prompt Programs' }),
    Object.freeze({ id: 'prompt-modules', label: 'Prompt Modules' }),
    Object.freeze({ id: 'generation-profiles', label: 'Generation Profiles' }),
    Object.freeze({ id: 'skills', label: 'Skills' }),
]);

export const RUNTIME_SECTIONS = Object.freeze([
    Object.freeze({ id: 'routes', label: 'Routes' }),
    Object.freeze({ id: 'models', label: 'Models' }),
    Object.freeze({ id: 'connections', label: 'Connections' }),
    Object.freeze({ id: 'profiles', label: 'Profiles' }),
    Object.freeze({ id: 'diagnostics', label: 'Diagnostics' }),
]);

function sectionById(list, id, fallbackId) {
    return list.find(item => item.id === id)
        || list.find(item => item.id === fallbackId)
        || list[0];
}

export function normalizeLibrarySection(route) {
    const childId = String(route?.child?.id || '').trim();
    if (!childId || childId === 'works' || childId.startsWith('work:')) return 'works';
    if (
        childId === 'worlds-knowledge'
        || childId === 'worlds'
        || childId === 'knowledge'
        || childId.startsWith('world:')
        || childId.startsWith('knowledge:')
    ) return 'worlds-knowledge';
    return sectionById(LIBRARY_SECTIONS, childId.split(':')[0], 'works').id;
}

export function normalizeRuntimeSection(route) {
    const childId = String(route?.child?.id || '').trim();
    const id = childId.split(':')[0];
    const aliases = { overview: 'routes', roles: 'routes', retrieval: 'connections', presets: 'profiles', capabilities: 'models' };
    return sectionById(RUNTIME_SECTIONS, aliases[id] || id, 'routes').id;
}

function buildDomainFrame(documentRef, {
    domain,
    sections,
    activeSection,
    onNavigate,
}) {
    const root = documentRef.createElement('section');
    root.className = 'atria-domain-workspace';
    root.dataset.atriaDomainWorkspace = domain;
    applyAtriaPattern(root, domain === 'library' ? 'master-detail' : 'runtime-status');

    const nav = documentRef.createElement('nav');
    nav.className = 'atria-domain-workspace__nav';
    nav.setAttribute('aria-label', translateShellText(domain === 'library' ? 'Library sections' : 'Runtime sections'));

    const body = documentRef.createElement('div');
    body.className = 'atria-domain-workspace__body';

    for (const item of sections) {
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'atria-domain-workspace__tab';
        button.dataset.atriaDomainSection = item.id;
        button.textContent = translateShellText(item.label);
        button.classList.toggle('is-selected', item.id === activeSection);
        button.setAttribute('aria-current', item.id === activeSection ? 'page' : 'false');
        button.addEventListener('click', () => onNavigate(item.id));
        nav.append(button);
    }

    root.append(nav, body);
    return { root, nav, body };
}

function updateDomainTabs(frame, activeSection) {
    for (const button of frame.nav.querySelectorAll('[data-atria-domain-section]')) {
        const selected = button.dataset.atriaDomainSection === activeSection;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-current', selected ? 'page' : 'false');
    }
}

async function mountSkillsWorkspace({ document: documentRef, body }) {
    const context = globalThis.Atria?.getContext?.();
    const skills = await import('../skills/skill-manager-panel.js');

    const root = documentRef.createElement('section');
    root.className = 'atria-skill-workspace-host';
    root.dataset.atriaWorkspaceEmbedded = 'true';
    body.replaceChildren(root);

    let release;
    let firstPopup = true;
    const lifecycle = new Promise(resolve => { release = resolve; });
    const embeddedContext = Object.create(context || null);
    const originalPopup = context?.callGenericPopup?.bind(context);
    embeddedContext.callGenericPopup = (html, type, title, options) => {
        if (!firstPopup) {
            if (!originalPopup) return Promise.resolve(null);
            return originalPopup(html, type, title, options);
        }
        firstPopup = false;
        root.innerHTML = String(html || '');
        return lifecycle;
    };

    const task = skills.openSkillManagerPanel({
        context: embeddedContext,
        t: context?.translate || (value => value),
    }).catch(error => {
        if (!root.isConnected) return;
        root.replaceChildren(createLocalizedStatePanel(documentRef, 'error', {
            title: 'Skills',
            message: error?.message || String(error),
        }));
    });

    return {
        root,
        dispose() {
            release?.();
            void task;
            root.remove();
        },
    };
}

async function mountLibrarySection(args) {
    const section = normalizeLibrarySection(args.route);
    if (section === 'works') return mountNativeWorksWorkspace(args);
    if (section === 'worlds-knowledge') return mountNativeWorldKnowledgeWorkspace(args);
    if (['prompt-programs', 'prompt-modules', 'generation-profiles'].includes(section)) return mountPromptLibrary(args);
    return await mountSkillsWorkspace(args);
}

async function mountRuntimeSection(args) {
    return mountNativeRuntimeWorkspace({ ...args, section: normalizeRuntimeSection(args.route) });
}

function createDomainController({
    document: documentRef,
    slot,
    route,
    host,
    domain,
    sections,
    normalizeSection,
    mountSection,
}) {
    let disposed = false;
    let sequence = 0;
    let sectionController = null;
    let currentSection = normalizeSection(route);

    const frame = buildDomainFrame(documentRef, {
        domain,
        sections,
        activeSection: currentSection,
        onNavigate: section => (
            domain === 'library'
                ? host.openLibrarySection(section)
                : host.openRuntimeSection(section)
        ),
    });
    slot.replaceChildren(frame.root);

    async function activate(nextRoute) {
        if (disposed) return;
        const nextSection = normalizeSection(nextRoute);
        updateDomainTabs(frame, nextSection);

        if (currentSection === nextSection && sectionController) {
            sectionController.updateRoute?.(nextRoute);
            sectionController.updateSection?.(nextSection);
            return;
        }

        currentSection = nextSection;
        const token = ++sequence;
        await Promise.resolve(sectionController?.dispose?.());
        if (disposed || token !== sequence) return;

        frame.body.replaceChildren(createLocalizedStatePanel(documentRef, 'loading', {
            title: sectionById(sections, nextSection, sections[0].id).label,
            message: 'Loading workspace…',
        }));

        let mounted;
        try {
            mounted = await mountSection({
                document: documentRef,
                body: frame.body,
                slot,
                route: nextRoute,
                host,
            });
        } catch (error) {
            if (disposed || token !== sequence) return;
            const panel = createLocalizedStatePanel(documentRef, 'error', {
                title: sectionById(sections, nextSection, sections[0].id).label,
                message: error?.message || String(error),
            });
            frame.body.replaceChildren(panel);
            mounted = { root: panel, dispose: () => panel.remove() };
        }

        if (disposed || token !== sequence) {
            await Promise.resolve(mounted?.dispose?.());
            return;
        }
        sectionController = mounted || {};
    }

    void activate(route);

    return {
        root: frame.root,
        updateRoute(nextRoute) {
            void activate(nextRoute);
        },
        dispose() {
            disposed = true;
            sequence += 1;
            const previous = sectionController;
            sectionController = null;
            void Promise.resolve(previous?.dispose?.());
            frame.root.remove();
        },
    };
}

export function mountLibraryDomainWorkspace(args) {
    return createDomainController({
        ...args,
        domain: 'library',
        sections: LIBRARY_SECTIONS,
        normalizeSection: normalizeLibrarySection,
        mountSection: mountLibrarySection,
    });
}

export function mountRuntimeDomainWorkspace(args) {
    return createDomainController({
        ...args,
        domain: 'runtime',
        sections: RUNTIME_SECTIONS,
        normalizeSection: normalizeRuntimeSection,
        mountSection: mountRuntimeSection,
    });
}

import { el, action } from '../native/library-ui.js';
import { translateShellText as tl, formatShellText as fmt } from './localization.js';

export const LEARNING_STORAGE_KEY = 'atri_learning_v1';
export const LEARNING_LESSONS = Object.freeze([
    { id: 'identity', section: 'Getting started', title: 'Identity and language', route: ['openUtility', 'account'], instruction: 'Review your account name here. Use Language settings to change the interface language. Your story identity remains yours when you replay a lesson.' },
    { id: 'navigation', section: 'Getting started', title: 'Find your way around', route: ['openPlay'], instruction: 'Use the sidebar or bottom navigation to switch between Play, Library, Build, Agents and Runtime. Search also opens resources and commands. Return to this lesson at any time.' },
    { id: 'connections', section: 'Runtime setup', title: 'Connect a provider', route: ['openRuntimeSection', 'connections'], instruction: 'Create a connection with your provider endpoint and stored Secret. You can check the connection here. If you do not have access yet, skip this lesson and return later.' },
    { id: 'models', section: 'Runtime setup', title: 'Choose a model', route: ['openRuntimeSection', 'models'], instruction: 'Create a model profile linked to your connection. Choose a model ID and suitable context/output limits. A connection alone does not select a model for a story.' },
    { id: 'routes', section: 'Runtime setup', title: 'Configure a Runtime Route', route: ['openRuntimeSection', 'routes'], instruction: 'A route joins a connection, model, exact Generation Profile and exact Prompt Program for a role. Review those references before saving. Library contains the Prompt and Generation resources.' },
    { id: 'works', section: 'Stories and resources', title: 'Explore and import works', route: ['openLibrarySection', 'works'], instruction: 'Open an installed work or import an Atria package. Review permissions and version details before installing. Package originals are read-only; independent Library copies can be edited.' },
    { id: 'sessions', section: 'Stories and resources', title: 'Start or reopen a session', route: ['openLibrarySection', 'works'], instruction: 'Reopen a session under My Games. To start a new story, open a work in Library and choose its playable entry. A session keeps the exact work version it started with.' },
    { id: 'play', section: 'Stories and resources', title: 'Play your story', route: ['openPlay'], instruction: 'In an open session, write a message and send when your Runtime Route is ready. The inspector and session controls provide context and recovery actions. You can practise without sending or spending tokens.' },
    { id: 'knowledge', section: 'Stories and resources', title: 'Manage Worlds and Knowledge', route: ['openLibrarySection', 'knowledge'], instruction: 'Search Knowledge entries, expand one row, or draft an entry toggle. Review and save an immutable revision. Existing bindings keep their exact revision until you explicitly update them. Worlds provide shared setting and state.' },
    { id: 'prompt', section: 'Stories and resources', title: 'Adjust Prompt choices', route: ['openRuntimeSection', 'diagnostics'], instruction: 'Select a route and open its Prompt choices. Save an override for a toggle or exclusive choice, or restore authored defaults. These choices also appear in the Play inspector and do not create Prompt revisions.' },
    { id: 'saves', section: 'Recovery and help', title: 'Save and recover', route: ['openLibrarySection', 'works'], instruction: 'Use session controls to create and load SavePoints. Under My Games, Manage exports a session; Import save restores an Atria save. Recovery requires the matching exact work version.' },
    { id: 'settings', section: 'Recovery and help', title: 'Settings and ongoing help', route: ['openUtility', 'settings'], instruction: 'Adjust appearance, language and accessibility here. Learning center stays available from Settings and the account menu. Diagnostics helps inspect failures; completing this guide never removes it.' },
]);

export function normalizeLearningProgress(value) {
    const ids = new Set(LEARNING_LESSONS.map(lesson => lesson.id));
    return { version: 1, last: ids.has(value?.last) ? value.last : 'identity', completed: [...new Set(Array.isArray(value?.completed) ? value.completed.filter(id => ids.has(id)) : [])], active: value?.active === true };
}

let afterIdentityPending = false;
let mountedCenter = null;
export function continueLearningAfterIdentity() {
    afterIdentityPending = true;
    mountedCenter?.afterIdentity();
}

/** A focused Shell learning state machine; navigation and account storage remain authoritative. */
export function mountLearningCenter({ document: doc, shell, host, storage }) {
    let progress, indexView = true, minimized = false, returnFocus;
    const panel = el(doc, 'aside', 'atri-learning-center'); panel.hidden = true;
    panel.setAttribute('aria-label', tl('Learning center'));
    shell.slots.stage.parentElement.parentElement.prepend(panel);
    const load = () => {
        let value; try { value = JSON.parse(storage.getItem(LEARNING_STORAGE_KEY) || 'null'); } catch { /* Recover corrupt progress without touching product data. */ }
        progress = normalizeLearningProgress(value);
    };
    const persist = () => storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(progress));
    const current = () => LEARNING_LESSONS.find(lesson => lesson.id === progress.last);
    const navigate = () => {
        shell.setDockOpen(false);
        const [method, ...args] = current().route; host[method](...args);
    };
    function close() {
        if (panel.hidden) return false;
        progress.active = false; persist(); panel.hidden = true;
        if (returnFocus?.isConnected) returnFocus.focus();
        return true;
    }
    function select(id) {
        progress.last = id; progress.active = true; indexView = false; minimized = false; persist(); navigate(); render();
        panel.querySelector('h2')?.focus();
    }
    function render() {
        panel.replaceChildren(); panel.hidden = false;
        const header = el(doc, 'div', 'atri-learning-header', undefined, panel);
        const title = el(doc, 'h2', '', tl(indexView ? 'Learning center' : current().title), header); title.tabIndex = -1;
        if (!indexView) action(doc, header, minimized ? 'Show lesson' : 'Minimize lesson', () => { minimized = !minimized; render(); });
        action(doc, header, 'Close guide', close);
        if (minimized) return;
        const content = el(doc, 'div', 'atri-learning-content', undefined, panel);
        if (indexView) {
            el(doc, 'p', '', tl('Learn in the real interface. Resume, jump to any lesson, or review a completed lesson without resetting your data.'), content);
            action(doc, content, 'Resume learning', () => select(progress.last));
            const list = el(doc, 'nav', 'atri-learning-index', undefined, content); list.setAttribute('aria-label', tl('Lessons'));
            let section;
            for (const lesson of LEARNING_LESSONS) {
                if (section !== lesson.section) { section = lesson.section; el(doc, 'h3', '', tl(section), list); }
                const row = el(doc, 'div', '', undefined, list);
                action(doc, row, lesson.title, () => select(lesson.id));
                el(doc, 'span', 'atri-library-meta', tl(progress.completed.includes(lesson.id) ? 'Completed' : 'Not completed'), row);
            }
        } else {
            const index = LEARNING_LESSONS.indexOf(current());
            el(doc, 'p', 'atri-library-meta', fmt('Lesson ${0} of ${1}', [index + 1, LEARNING_LESSONS.length]), content);
            el(doc, 'p', '', tl(current().instruction), content);
            el(doc, 'p', 'atri-library-meta', tl('Use the real controls below. Next marks this lesson reviewed; Skip leaves it unfinished.'), content);
            const controls = el(doc, 'div', 'atri-library-actions', undefined, content);
            action(doc, controls, 'Previous lesson', () => select(LEARNING_LESSONS[index - 1].id), { disabled: index === 0 });
            action(doc, controls, 'Return to lesson surface', navigate);
            action(doc, controls, 'Restart lesson', () => { progress.completed = progress.completed.filter(id => id !== progress.last); select(progress.last); });
            if (progress.last === 'identity') action(doc, controls, 'Language settings', () => host.openUtility('settings'));
            if (progress.last === 'settings') action(doc, controls, 'Diagnostics', () => host.openUtility('diagnostics'));
            action(doc, controls, 'Skip lesson', () => index < LEARNING_LESSONS.length - 1 ? select(LEARNING_LESSONS[index + 1].id) : close());
            action(doc, controls, index === LEARNING_LESSONS.length - 1 ? 'Finish guide' : 'Next lesson', () => {
                progress.completed = [...new Set([...progress.completed, progress.last])]; persist();
                if (index < LEARNING_LESSONS.length - 1) select(LEARNING_LESSONS[index + 1].id);
                else { progress.active = false; persist(); indexView = true; render(); }
            }, { primary: true });
            action(doc, controls, 'All lessons', () => { indexView = true; render(); });
        }
    }
    const onBack = event => { if (close()) event.preventDefault(); };
    const onLanguage = () => { if (!panel.hidden) render(); };
    const api = {
        open() { returnFocus = doc.activeElement; load(); progress.active = true; persist(); indexView = true; minimized = false; render(); panel.querySelector('h2')?.focus(); },
        afterIdentity() { afterIdentityPending = false; load(); progress.completed = [...new Set([...progress.completed, 'identity'])]; select('navigation'); },
        restore() { load(); if (afterIdentityPending) api.afterIdentity(); else if (progress.active) select(progress.last); },
        close,
        dispose() { doc.removeEventListener('atria-learning-back', onBack); doc.removeEventListener('atria-language-changed', onLanguage); panel.remove(); if (mountedCenter === api) mountedCenter = null; },
    };
    doc.addEventListener('atria-learning-back', onBack); doc.addEventListener('atria-language-changed', onLanguage);
    mountedCenter = api;
    return api;
}

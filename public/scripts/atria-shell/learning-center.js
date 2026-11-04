import { el, action } from '../native/library-ui.js';
import { translateShellText as tl, formatShellText as fmt } from './localization.js';
import { createAtriaIcon } from './icons.js';

export const LEARNING_STORAGE_KEY = 'atri_learning_v1';
// Ids are stored progress; keep them stable when lessons are reworded.
export const LEARNING_LESSONS = Object.freeze([
    { id: 'identity', section: 'Getting started', title: 'Name and language', route: ['openUtility', 'account'], instruction: 'This is the name characters call you. To change the interface language, open Settings; Atria reloads to apply it.' },
    { id: 'connections', section: 'Getting started', title: 'Connect a chat model', route: ['openRuntimeSection', 'routes'], instruction: 'Choose your AI service, paste its API key and pick a model. Atria tests the connection before saving. No key yet? Skip this lesson and come back later.' },
    { id: 'navigation', section: 'Getting started', title: 'Find your way around', route: ['openPlay'], instruction: 'The Dock switches between Play, Library, Build, Agents and Runtime. Search and your account are in the top-right corner.' },
    { id: 'routes', section: 'Models and services', title: 'Fine-tune a model', route: ['openRuntimeSection', 'routes'], instruction: 'Open an API preset to change its model, temperature or reply length. Stories that use it pick up the change on their next reply. Image, MCP and A2A services are under Services.' },
    { id: 'works', section: 'Stories', title: 'Find and import stories', route: ['openLibrarySection', 'works'], instruction: 'Open an installed work or import an Atria package. Check its permissions before installing. Installed originals are read-only; make a Library copy to edit one.' },
    { id: 'sessions', section: 'Stories', title: 'Start or reopen a story', route: ['openLibrarySection', 'games'], instruction: 'My stories lists the stories you have started. To begin a new one, open a work in Library and choose where to start. A story keeps the work version it began with.' },
    { id: 'play', section: 'Stories', title: 'Play a story', route: ['openPlay'], instruction: 'Type a message and send it once a model is connected. The side panel shows context and recovery actions. You can look around without sending anything.' },
    { id: 'knowledge', section: 'Stories', title: 'Worlds and knowledge', route: ['openLibrarySection', 'worlds-knowledge'], instruction: 'Search knowledge entries, edit one and save it as a new version. Stories keep the version they were given until you update them.' },
    { id: 'prompt', section: 'Stories', title: 'Prompt choices', route: ['openRuntimeSection', 'diagnostics'], instruction: 'In Diagnostics, pick an API preset and open its prompt choices. Switch options or restore the author’s defaults. The same choices appear beside the story in Play.' },
    { id: 'saves', section: 'Recovery and help', title: 'Save and recover', route: ['openLibrarySection', 'games'], instruction: 'Create and load save points from the story controls. In My stories you can export a story or import an Atria save. A save loads only with the same work version.' },
    { id: 'settings', section: 'Recovery and help', title: 'Settings and help', route: ['openUtility', 'settings'], instruction: 'Appearance, language and accessibility are here. The Learning Center stays available here and in the account menu.' },
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
    const iconButton = (parent, label, icon, handler) => {
        const button = action(doc, parent, label, handler);
        button.classList.add('atri-learning-icon'); button.setAttribute('aria-label', tl(label)); button.title = tl(label);
        button.replaceChildren(createAtriaIcon(doc, icon, { size: 16 }));
        return button;
    };
    function render() {
        panel.replaceChildren(); panel.hidden = false;
        panel.dataset.view = indexView ? 'index' : minimized ? 'minimized' : 'lesson';
        const header = el(doc, 'div', 'atri-learning-header', undefined, panel);
        const heading = el(doc, 'div', 'atri-learning-heading', undefined, header);
        const index = LEARNING_LESSONS.indexOf(current());
        if (!indexView) el(doc, 'p', 'atri-learning-eyebrow', fmt('Lesson ${0} of ${1} · ${2}', [index + 1, LEARNING_LESSONS.length, tl(current().section)]), heading);
        const title = el(doc, 'h2', '', tl(indexView ? 'Learning center' : current().title), heading); title.tabIndex = -1;
        const tools = el(doc, 'div', 'atri-learning-tools', undefined, header);
        if (!indexView) iconButton(tools, minimized ? 'Show lesson' : 'Minimize lesson', minimized ? 'chevron-down' : 'chevron-up', () => { minimized = !minimized; render(); });
        iconButton(tools, 'Close guide', 'close', close);
        if (minimized) return;
        const content = el(doc, 'div', 'atri-learning-content', undefined, panel);
        if (indexView) {
            const done = progress.completed.length;
            el(doc, 'p', 'atri-learning-lead', tl('Short lessons that use the real interface. Taking or repeating a lesson never changes your data.'), content);
            const start = el(doc, 'div', 'atri-learning-start', undefined, content);
            const next = LEARNING_LESSONS.find(lesson => !progress.completed.includes(lesson.id));
            action(doc, start, next ? fmt(done ? 'Continue: ${0}' : 'Start: ${0}', [tl(next.title)]) : 'Review from the start', () => select((next || LEARNING_LESSONS[0]).id), { primary: true });
            el(doc, 'span', 'atri-learning-progress', fmt('${0} of ${1} done', [done, LEARNING_LESSONS.length]), start);
            const nav = el(doc, 'nav', 'atri-learning-index', undefined, content); nav.setAttribute('aria-label', tl('Lessons'));
            let list;
            for (const lesson of LEARNING_LESSONS) {
                if (list?.dataset.section !== lesson.section) {
                    const group = el(doc, 'section', 'atri-learning-group', undefined, nav);
                    el(doc, 'h3', '', tl(lesson.section), group);
                    list = el(doc, 'ol', '', undefined, group); list.dataset.section = lesson.section;
                }
                const item = el(doc, 'li', '', undefined, list);
                const complete = progress.completed.includes(lesson.id);
                const button = el(doc, 'button', 'atri-learning-lesson', undefined, item); button.type = 'button';
                button.dataset.state = complete ? 'done' : 'todo';
                const mark = el(doc, 'span', 'atri-learning-mark', undefined, button); mark.setAttribute('aria-hidden', 'true');
                if (complete) mark.append(createAtriaIcon(doc, 'check', { size: 12 }));
                el(doc, 'span', 'atri-learning-lesson__title', tl(lesson.title), button);
                el(doc, 'span', 'atri-learning-visually-hidden', tl(complete ? 'Completed' : 'Not completed'), button);
                button.addEventListener('click', () => select(lesson.id));
            }
        } else {
            el(doc, 'p', 'atri-learning-instruction', tl(current().instruction), content);
            const controls = el(doc, 'div', 'atri-learning-actions', undefined, content);
            const secondary = el(doc, 'div', 'atri-learning-actions__aside', undefined, controls);
            action(doc, secondary, 'All lessons', () => { indexView = true; render(); panel.querySelector('h2')?.focus(); }).dataset.variant = 'plain';
            action(doc, secondary, 'Show me where', navigate).dataset.variant = 'plain';
            if (progress.last === 'identity') action(doc, secondary, 'Language settings', () => host.openUtility('settings')).dataset.variant = 'plain';
            if (progress.last === 'settings') action(doc, secondary, 'Diagnostics', () => host.openUtility('diagnostics')).dataset.variant = 'plain';
            const primary = el(doc, 'div', 'atri-learning-actions__main', undefined, controls);
            action(doc, primary, 'Previous lesson', () => select(LEARNING_LESSONS[index - 1].id), { disabled: index === 0 });
            action(doc, primary, 'Skip lesson', () => index < LEARNING_LESSONS.length - 1 ? select(LEARNING_LESSONS[index + 1].id) : close());
            action(doc, primary, index === LEARNING_LESSONS.length - 1 ? 'Finish guide' : 'Done, next lesson', () => {
                progress.completed = [...new Set([...progress.completed, progress.last])]; persist();
                if (index < LEARNING_LESSONS.length - 1) select(LEARNING_LESSONS[index + 1].id);
                else { progress.active = false; persist(); indexView = true; render(); panel.querySelector('h2')?.focus(); }
            }, { primary: true });
        }
    }
    const onBack = event => { if (close()) event.preventDefault(); };
    const onLanguage = () => { if (!panel.hidden) render(); };
    const api = {
        open() { returnFocus = doc.activeElement; load(); progress.active = true; persist(); indexView = true; minimized = false; render(); panel.querySelector('h2')?.focus(); },
        afterIdentity() { afterIdentityPending = false; load(); progress.completed = [...new Set([...progress.completed, 'identity'])]; select(LEARNING_LESSONS[1].id); },
        // A reload keeps the user's page (and deep links); only the lesson panel returns.
        restore() { load(); if (afterIdentityPending) api.afterIdentity(); else if (progress.active) { indexView = false; minimized = false; render(); } },
        close,
        dispose() { doc.removeEventListener('atria-learning-back', onBack); doc.removeEventListener('atria-language-changed', onLanguage); panel.remove(); if (mountedCenter === api) mountedCenter = null; },
    };
    doc.addEventListener('atria-learning-back', onBack); doc.addEventListener('atria-language-changed', onLanguage);
    mountedCenter = api;
    return api;
}

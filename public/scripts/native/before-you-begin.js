import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { runtimeRequest } from './runtime-client.js';
import { openConnectModelWizard } from './connect-model-wizard.js';

/*
 * "Before you begin" (blueprint §4.1): the three real first steps, in order.
 * Each card states what is already true from the original authorities
 * (Runtime routes, installed works); nothing is sampled or invented.
 */
export async function renderBeforeYouBegin({ document: doc, root, works = [], host, onChanged }) {
    let configuration = null;
    try { configuration = await runtimeRequest('/configuration'); } catch { /* The model card then offers setup and says the state is unknown. */ }
    const fallbackIds = new Set((configuration?.routes || []).flatMap(item => item.fallbackRouteRefs.map(ref => ref.runtimeRouteId)));
    const narrator = configuration?.routes.find(item => item.role === 'role.narrator' && !fallbackIds.has(item.runtimeRouteId));
    const model = narrator && configuration.models.find(item => item.modelProfileId === narrator.modelProfileRef?.modelProfileId);

    const el = (tag, className, text, parent) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = tl(text); parent?.append(node); return node; };
    const section = el('section', 'atria-begin', undefined, root);
    section.setAttribute('aria-labelledby', 'atria-begin-title');
    const title = el('h2', 'atria-begin__title', 'Before you begin', section); title.id = 'atria-begin-title';
    const list = el('ol', 'atria-begin__steps', undefined, section);
    const card = ({ number, heading, body, done, doneText, actions }) => {
        const item = el('li', 'atria-begin__step', undefined, list);
        item.dataset.done = String(Boolean(done));
        const mark = el('span', 'atria-begin__mark', undefined, item);
        if (done) mark.append(createAtriaIcon(doc, 'check', { size: 16 })); else mark.textContent = String(number);
        const text = el('div', 'atria-begin__text', undefined, item);
        el('h3', '', heading, text);
        const detail = el('p', '', undefined, text); detail.textContent = done ? doneText : tl(body);
        const bar = el('div', 'atria-begin__actions', undefined, text);
        for (const [label, action, primary] of actions) {
            const button = el('button', primary ? 'atria-begin__button atria-begin__button--primary' : 'atria-begin__button', label, bar);
            button.type = 'button'; button.addEventListener('click', action);
        }
        return item;
    };
    const connect = () => openConnectModelWizard({ document: doc, host, onDone: () => onChanged?.() });
    card({ number: 1, heading: 'Connect a model', done: Boolean(model),
        body: configuration ? 'A model writes the story as you play. Connect Anthropic, OpenAI, Google, a local model or another service.' : 'Model setup could not be read. You can still connect a model now.',
        doneText: model ? fmt('Stories are written by ${0}.', [model.displayName]) : '',
        actions: model ? [['Change model…', connect]] : [['Connect a model', connect, true]] });
    card({ number: 2, heading: 'Get a work', done: works.length > 0,
        body: 'Install a .atria work, or import a story you saved elsewhere.',
        doneText: fmt('${0} installed. Open one from Library to start a story.', [works.length]),
        actions: [['Install .atria', () => host?.openLibrarySection?.('install'), !works.length && Boolean(model)], ['Import a save', () => host?.openLibrarySection?.('import-save')], ...(works.length ? [['Open Library', () => host?.openLibrarySection?.('works')]] : [])] });
    card({ number: 3, heading: 'Or write your own', done: false,
        body: 'Create a project in Studio and preview it as a reader would see it.',
        actions: [['Open Studio', () => host?.openBuild?.()]] });
    return { complete: Boolean(model) && works.length > 0, element: section };
}

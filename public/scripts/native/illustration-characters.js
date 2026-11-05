import { translateShellText as t, formatShellText as f } from '../atria-shell/localization.js';
import { illustrationSettingsClient } from './illustration-client.js';
import { updateIllustrationSettings } from './illustration-setup.js';
import { mountTagEditor, splitTags } from './illustration-tags.js';
import { el, icon, action, field, input, toggle } from './illustration-kit.js';

const blank = doc => ({ id: 'draw_' + doc.defaultView.crypto.randomUUID().replaceAll('-', ''), name: '', aliases: [], fixedPrompt: '', defaultClothing: '', enabled: true, storyActorId: '' });

/** Character appearance library. Characters named in a selected passage join its illustration automatically. */
export function mountIllustrationCharacters({ document: doc, parent, packageId = '', say, onChanged = () => {}, participants = () => [] }) {
    const root = el(doc, 'div', { className: 'atri-ill-stack' });
    parent.append(root);
    let settings = null, editing = null, disposed = false;
    const run = job => async (...args) => { try { await job(...args); } catch (error) { say(t('Could not save the character. ') + (error.message || ''), 'error'); } };
    async function reload() { settings = (await illustrationSettingsClient.read()).value; if (!disposed) render(); }
    const enabledHere = character => character.enabled && (!packageId || (settings.works[packageId]?.characterIds ?? []).includes(character.id));
    async function save(character, { remove = false } = {}) {
        await updateIllustrationSettings(value => {
            value.characters = value.characters.filter(item => item.id !== character.id);
            for (const work of Object.values(value.works)) work.characterIds = work.characterIds.filter(id => id !== character.id || !remove);
            if (remove) return;
            value.characters.push(character);
            if (packageId) { value.works[packageId] ??= { characterIds: [] }; if (!value.works[packageId].characterIds.includes(character.id)) value.works[packageId].characterIds.push(character.id); }
        });
        editing = null; say(remove ? t('Character removed.') : f('Saved ${0}.', [character.name])); await reload(); onChanged();
    }
    async function setHere(character, on) {
        await updateIllustrationSettings(value => {
            const target = value.characters.find(item => item.id === character.id); if (target && on) target.enabled = true;
            if (!packageId) { if (target) target.enabled = on; return; }
            value.works[packageId] ??= { characterIds: [] };
            const ids = value.works[packageId].characterIds.filter(id => id !== character.id);
            value.works[packageId].characterIds = on ? [...ids, character.id] : ids;
        });
        say(on ? f('${0} will appear in this story’s illustrations.', [character.name]) : f('${0} will not be added automatically.', [character.name])); await reload(); onChanged();
    }
    function editor(character) {
        const draft = structuredClone(character);
        const name = input(doc, draft.name, value => { draft.name = value.trim(); }, { placeholder: t('As written in the story') });
        const aliases = input(doc, draft.aliases.join(', '), value => { draft.aliases = splitTags(value); }, { placeholder: t('Nicknames, titles…') });
        const looks = mountTagEditor(doc, { value: draft.fixedPrompt, label: t('Appearance'), onChange: value => { draft.fixedPrompt = value; } });
        const outfit = mountTagEditor(doc, { value: draft.defaultClothing, label: t('Usual outfit'), onChange: value => { draft.defaultClothing = value; } });
        const form = el(doc, 'form', { className: 'atri-ill-card atri-ill-stack', attrs: { 'aria-label': draft.name || t('New character') } }, [
            field(doc, t('Name'), name), field(doc, t('Other names'), aliases, t('Separate with commas. Any of these names in a passage brings this character in.')),
            el(doc, 'div', { className: 'atri-ill-field' }, [el(doc, 'span', { text: t('Appearance') }), looks.root, el(doc, 'small', { text: t('Stable traits: hair, eyes, build, age. Tags in English work best for most models.') })]),
            el(doc, 'div', { className: 'atri-ill-field' }, [el(doc, 'span', { text: t('Usual outfit') }), outfit.root]),
            el(doc, 'div', { className: 'atri-ill-row' }, [
                action(doc, t('Save character'), run(async () => { name.dispatchEvent(new Event('change')); aliases.dispatchEvent(new Event('change')); if (!draft.name) { say(t('Give the character a name.'), 'error'); name.focus(); return; } await save(draft); }), { variant: 'primary' }),
                action(doc, t('Cancel'), () => { editing = null; render(); }, { variant: 'plain' }), el(doc, 'span', { className: 'atri-ill-spacer' }),
                settings.characters.some(item => item.id === draft.id) ? action(doc, t('Delete'), run(() => save(draft, { remove: true })), { variant: 'destructive', icon: 'trash', size: 'sm' }) : null]),
        ]);
        form.addEventListener('submit', event => event.preventDefault());
        queueMicrotask(() => name.focus());
        return form;
    }
    function render() {
        root.replaceChildren(el(doc, 'p', { className: 'atri-ill-muted', text: t('Describe how characters look once. When their name appears in a passage, their appearance is added so they stay consistent across images.') }));
        if (editing && !settings.characters.some(item => item.id === editing.id)) root.append(editor(editing));
        if (!settings.characters.length && !editing) root.append(el(doc, 'div', { className: 'atri-ill-empty' }, [icon(doc, 'users', 28), el(doc, 'p', { text: t('No characters yet.') })]));
        const list = el(doc, 'ul', { className: 'atri-ill-list' });
        for (const character of [...settings.characters].sort((a, b) => Number(enabledHere(b)) - Number(enabledHere(a)) || a.name.localeCompare(b.name))) {
            if (editing?.id === character.id) { list.append(el(doc, 'li', {}, [editor(character)])); continue; }
            const summary = [character.aliases.join(' / '), splitTags(character.fixedPrompt).slice(0, 4).join(', ')].filter(Boolean).join(' · ') || t('No appearance yet');
            list.append(el(doc, 'li', { className: 'atri-ill-card atri-ill-char' }, [
                el(doc, 'span', { className: 'atri-ill-avatar', text: [...character.name][0] ?? '?', attrs: { 'aria-hidden': 'true' } }),
                el(doc, 'button', { className: 'atri-ill-char-main', attrs: { type: 'button', 'aria-label': f('Edit ${0}', [character.name]) }, on: { click: () => { editing = character; render(); } } },
                    [el(doc, 'strong', { text: character.name }), el(doc, 'span', { className: 'atri-ill-muted', text: summary })]),
                toggle(doc, packageId ? f('Use ${0} in this story', [character.name]) : f('Use ${0}', [character.name]), enabledHere(character), run(on => setHere(character, on))),
            ]));
        }
        root.append(list, el(doc, 'div', {}, [action(doc, t('Add character'), () => { editing = blank(doc); render(); }, { icon: 'plus' })]));
        // Speakers already in the story can be added with one click, then described.
        const known = new Set(settings.characters.flatMap(item => [item.name, ...item.aliases]));
        const fromStory = participants().filter(item => !known.has(item.displayName) && editing?.name !== item.displayName);
        if (fromStory.length) root.append(el(doc, 'section', { className: 'atri-ill-stack', attrs: { 'aria-label': t('In this story') } }, [
            el(doc, 'h3', { className: 'atri-ill-subhead', text: t('In this story') }),
            el(doc, 'div', { className: 'atri-ill-row atri-ill-wrap' }, fromStory.map(item => action(doc, f('Add ${0}', [item.displayName]), () => {
                editing = { ...blank(doc), name: item.displayName, storyParticipantId: item.participantId }; render();
            }, { size: 'sm', icon: 'plus' })))]));
    }
    const ready = reload().catch(error => say(t('Could not load characters. ') + (error.message || ''), 'error'));
    return { root, ready, reload, dispose() { disposed = true; root.remove(); } };
}

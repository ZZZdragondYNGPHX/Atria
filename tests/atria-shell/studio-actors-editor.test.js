/** @jest-environment jsdom */
import { describe, expect, jest, test } from '@jest/globals';
import { mountStudioActorsEditor, patchStudioActors, validateStudioActors } from '../../public/scripts/native/studio-actors-editor.js';
const id = letter => 'actor_' + letter.repeat(32);
const actor = (letter = 'a') => ({ actorId: id(letter), displayName: 'Same name', role: 'guide', profile: { description: { rich: [null, false, 2] }, personality: 'Quiet', examples: 'First', mes_example: 'Second', plugin: { flags: [null, true], weight: 0.75 }, scenario: null, systemPrompt: [false, null], postHistoryInstructions: 'Tail' }, metadata: { plugin: { list: [null, false, 3] } } });
const project = actors => ({ package: { actors, entryPoints: [{ entryPointId: 'entrypoint_' + 'a'.repeat(32), actorIds: actors.length ? [actors[0].actorId] : [], primaryActorId: actors[0]?.actorId }] }, resources: [{ untouched: true }], dependencies: { resources: ['exact'] } });
function setup(value = actor(), collection = false) {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const source = project(collection ? value : [value]); const onReview = jest.fn();
    const editor = mountStudioActorsEditor({ document, root, value, projectSource: source, onReview, collection });
    const click = label => [...root.querySelectorAll('button')].find(item => item.textContent === label).click();
    const input = (name, value) => { const node = root.querySelector(`[name="${name}"]`); node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); return node; };
    return { root, onReview, editor, click, input, source };
}
describe('Actors display and canonical draft', () => {
    test('common text, structured JSON and Source share one draft without mutating the source or aliases', () => {
        const original = actor(); const { root, click, input, onReview, editor } = setup(original);
        expect(root.querySelector('textarea[name="profile.description"]')).toBeNull();
        input('displayName', 'Renamed'); input('profile.personality', 'Changed'); input('profile.postHistoryInstructions', 'Changed tail'); input('profile.plugin.weight', '1.5');
        click('Source'); const source = root.querySelector('[aria-label="Actors resource JSON"]');
        const expected = { ...original, displayName: 'Renamed', profile: { ...original.profile, personality: 'Changed', postHistoryInstructions: 'Changed tail', plugin: { ...original.profile.plugin, weight: 1.5 } } };
        expect(JSON.parse(source.value)).toEqual(expected); click('Fields'); click('Review Changes');
        expect(onReview).toHaveBeenCalledWith(expected); expect(JSON.parse(editor.getSource())).toEqual(expected);
        expect(original).toEqual(actor());
    });
    test('missing profile keys stay absent until edited and role can be removed explicitly', async () => {
        const value = { actorId: id('a'), displayName: ' ', profile: {}, metadata: {} }; const { click, input, onReview, root } = setup(value);
        click('Review Changes'); expect(onReview).toHaveBeenLastCalledWith(value); await Promise.resolve();
        input('profile.description', ''); input('role', 'custom'); click('Remove role');
        click('Review Changes'); expect(onReview).toHaveBeenLastCalledWith({ ...value, profile: { description: '' } });
        expect(root.querySelector('[data-atria-draft-dirty]').dataset.atriaDraftDirty).toBe('true');

    });
    test('unknown and legacy top-level keys and malformed JSON retain exact Source and never stage', () => {
        const { root, click, onReview, editor } = setup(); click('Source'); const source = root.querySelector('textarea');
        for (const value of ['{ invalid', JSON.stringify({ ...actor(), surprise: { retained: true }, characterId: 'legacy' })]) {
            source.value = value; source.dispatchEvent(new Event('input', { bubbles: true })); click('Review Changes');
            expect(editor.getSource()).toBe(value); expect(onReview).not.toHaveBeenCalled(); expect(root.querySelector('[role="alert"]')).not.toBeNull();
        }
        expect(root.querySelector('[role="alert"]').textContent).toContain('surprise, characterId');
    });
    test('invalid Actor root remains recoverable through Source without offering an ignored field edit', () => {
        const { root, click, onReview } = setup(); click('Source');
        const source = root.querySelector('textarea'); source.value = 'null'; source.dispatchEvent(new Event('input', { bubbles: true }));
        click('Fields'); expect(root.querySelector('textarea')).toBeNull(); click('Review Changes'); expect(onReview).not.toHaveBeenCalled();
        click('Source'); const recovered = root.querySelector('textarea'); expect(recovered.value).toBe('null');
        recovered.value = JSON.stringify(actor()); recovered.dispatchEvent(new Event('input', { bubbles: true })); click('Review Changes'); expect(onReview).toHaveBeenCalledWith(actor());
    });
    test('collection add, reorder, explicit ID edits and referenced removal clone the whole project', () => {
        const a = actor(), b = actor('b'), c = actor('c'); const source = project([a, b]);
        const next = patchStudioActors(source, a.actorId, [b, a, c], true);
        expect(next).toEqual({ ...source, package: { ...source.package, actors: [b, a, c] } }); expect(source.package.actors).toEqual([a, b]);
        expect(() => patchStudioActors(source, a.actorId, [b], true)).toThrow(/EntryPoints/);
        expect(() => patchStudioActors(source, a.actorId, { ...a, actorId: id('c') })).toThrow(/EntryPoints/);
        expect(() => patchStudioActors(source, a.actorId, [a, a], true)).toThrow(/Duplicate/);
        expect(patchStudioActors(project([]), undefined, [], true).package.actors).toEqual([]);
        const { root, click, onReview } = setup([a, b], true); expect(root.querySelector('textarea')).not.toBeNull(); click('Review Changes'); expect(onReview).toHaveBeenCalledWith([a, b]);
    });
    test('identity, role and object errors focus fields while arbitrary profile JSON stays valid', () => {
        const { input, click, root, onReview } = setup(); const role = input('role', ''); click('Review Changes');
        expect(document.activeElement).toBe(role); expect(role.getAttribute('aria-invalid')).toBe('true'); expect(onReview).not.toHaveBeenCalled();
        const source = project([actor()]);
        for (const patch of [{ role: '' }, { role: 'a'.repeat(129) }, { actorId: 'unresolved' }, { profile: [] }, { metadata: null }, { displayName: '' }]) expect(() => validateStudioActors([{ ...actor(), ...patch }], source)).toThrow();
        expect(() => validateStudioActors([{ ...actor(), role: null }], source)).not.toThrow();
        expect(root.querySelector('[role="alert"]').textContent).toContain('role');
    });
});

/**
 * @jest-environment jsdom
 */
import { render as renderCeaCpa } from '../../../public/scripts/iteration-library/simulation-review/renderers/cea-cpa.js';
import { appendShared, appendToolSourceChip } from '../../../public/scripts/iteration-library/simulation-review/renderers/shared.js';

const noopI18n = (k, fallback) => fallback ?? k;

function getPaths(root) {
    return Array.from(root.querySelectorAll('[data-loc-path]')).map(el => el.getAttribute('data-loc-path'));
}

function renderSources(sources) {
    const root = document.createElement('div');
    for (const source of sources) appendToolSourceChip(appendShared.section(root, 'Original source', null), source);
    return root;
}

test('cea-cpa renderer tags Final Output and Reasoning paths', () => {
    const root = renderCeaCpa({
        finalOutput: 'Hi there.',
        reasoning: 'thinking...',
        assembledPrompt: { systemPrompt: 'sys', messages: [{ role: 'user', content: 'hello' }] },
        worldInfoHits: [],
    }, noopI18n);
    const paths = getPaths(root);
    expect(paths).toContain('Final Output');
    expect(paths).toContain('Reasoning');
    expect(paths).toContain('Assembled Prompt → System');
    expect(paths).toContain('Assembled Prompt → User #1');
});

test('CEA and CPA rendering marks exactly one final-output section and collapses process wrappers', () => {
    // The popup's autoscroll + Expand-all toggle rely on:
    //   - `[data-sim-final-output="true"]` on the section the user
    //     came to see (Final Output). Exactly one per popup.
    //   - `[data-collapsible="true"]` + `.atria-sim-section--collapsed`
    //     on every process wrapper so the popup opens compact and
    //     the toggle can re-collapse them after expanding.
    const ceaRoot = renderCeaCpa({
        finalOutput: 'X',
        reasoning: 'thinking',
        assembledPrompt: { systemPrompt: 'sys', messages: [{ role: 'user', content: 'hi' }] },
    }, noopI18n);
    const cpaRoot = renderCeaCpa({
        finalOutput: 'Preset response', reasoning: 'Preset reasoning',
        assembledPrompt: { systemPrompt: 'preset system', messages: [{ role: 'user', content: 'preset query' }] },
    }, noopI18n);
    [ceaRoot, cpaRoot].forEach(root => {
        const finals = root.querySelectorAll('[data-sim-final-output="true"]');
        expect(finals.length).toBe(1);
        // The final-output section is NEVER collapsible — the user
        // opened the popup specifically to see it.
        expect(finals[0].getAttribute('data-collapsible')).toBeNull();
        // At least one process section exists and is collapsible.
        const collapsibles = root.querySelectorAll('[data-collapsible="true"]');
        expect(collapsibles.length).toBeGreaterThan(0);
        // Every collapsible starts collapsed by default.
        collapsibles.forEach(s => {
            expect(s.classList.contains('atria-sim-section--collapsed')).toBe(true);
        });
    });
});

describe('tool-source chip rendering (FINAL.1)', () => {
    // The retained shared source projection uses `appendToolSourceChip`.
    // Builtin and unknown calls render no chip;
    // profile / extension / st-bridge each get their own label.

    function chipsOf(root) {
        return Array.from(root.querySelectorAll('.sim-review-tool-chip[class*="--source-"]'))
            .map(el => ({
                text: el.textContent,
                classList: Array.from(el.classList),
            }));
    }

    test('shared projection emits [profile] / [ext] / [ST] chips for non-builtin sources', () => {
        const root = renderSources(['builtin', 'profile', 'extension', 'st-bridge', null]);

        const chips = chipsOf(root);
        // Exactly 3 chips: profile, ext, ST. builtin + missing-source render no chip.
        expect(chips).toHaveLength(3);
        expect(chips.map(c => c.text).sort()).toEqual(['[ST]', '[ext]', '[profile]']);
        // Each chip carries the family + the source-specific modifier class
        // so styles.css can color them per layer.
        expect(chips.find(c => c.text === '[profile]').classList).toContain('sim-review-tool-chip--source-profile');
        expect(chips.find(c => c.text === '[ext]').classList).toContain('sim-review-tool-chip--source-extension');
        expect(chips.find(c => c.text === '[ST]').classList).toContain('sim-review-tool-chip--source-st-bridge');
    });

    test('shared projection emits a profile source alongside builtin work', () => {
        const root = renderSources(['builtin', 'profile']);

        const chips = chipsOf(root);
        expect(chips).toHaveLength(1);
        expect(chips[0].text).toBe('[profile]');
    });

    test('shared projection retains distinct extension and profile sources', () => {
        const root = renderSources(['extension', 'profile']);

        const chips = chipsOf(root);
        expect(chips).toHaveLength(2);
        expect(chips.map(c => c.text).sort()).toEqual(['[ext]', '[profile]']);
    });

    test('shared projection retains the original ST source label', () => {
        const root = renderSources(['st-bridge']);

        const chips = chipsOf(root);
        expect(chips).toHaveLength(1);
        expect(chips[0].text).toBe('[ST]');
    });

    test('unknown source values produce no chip (defensive: future layer additions or broken traces)', () => {
        const root = renderSources(['unknown', 'whatever-new', '', null]);
        expect(chipsOf(root)).toHaveLength(0);
    });
});

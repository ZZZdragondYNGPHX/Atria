/** @jest-environment jsdom */
import { expect, jest, test } from '@jest/globals';
import { createAtriaPaperTransition } from '../../public/scripts/atria-shell/paper-transition.js';

test('late close completion cannot hide a reopened paper, and disposal cancels its animations', async () => {
    const root = document.createElement('section'); root.hidden = true;
    const panel = document.createElement('div'), scrim = document.createElement('div'); root.append(scrim, panel); document.body.append(root);
    const completions = [], cancellations = [];
    for (const node of [panel, scrim]) node.animate = jest.fn(() => {
        let finish; const finished = new Promise(resolve => { finish = resolve; }); completions.push(finish);
        const cancel = jest.fn(); cancellations.push(cancel); return { finished, cancel };
    });
    const paper = createAtriaPaperTransition({ root, panel, scrim, closedTransform: () => 'translateY(100%)', reducedMotion: () => false, instant: () => false });
    paper.present(true); paper.present(false); const oldClose = completions[2]; paper.present(true);
    oldClose(); await Promise.resolve();
    expect(root.hidden).toBe(false); expect(root.inert).toBe(false); expect(root.getAttribute('aria-hidden')).toBe('false');
    paper.dispose(); expect(cancellations.every(cancel => cancel.mock.calls.length > 0)).toBe(true); root.remove();
});

test('keyboard presentation is immediate and reduced motion keeps only an opacity transition', () => {
    const root = document.createElement('section'); root.hidden = true; const panel = document.createElement('div'), scrim = document.createElement('div'); root.append(scrim, panel);
    const animate = jest.fn(() => ({ finished: new Promise(() => {}), cancel() {} })); panel.animate = scrim.animate = animate;
    let keyboard = true;
    const paper = createAtriaPaperTransition({ root, panel, scrim, closedTransform: () => 'translateY(100%)', reducedMotion: () => true, instant: () => keyboard });
    paper.present(true); expect(animate).not.toHaveBeenCalled();
    paper.present(false); expect(root.hidden).toBe(true);
    keyboard = false; paper.present(true);
    expect(animate.mock.calls[0][0].every(frame => frame.transform === 'none')).toBe(true);
    expect(animate.mock.calls[0][1].duration).toBe(100); paper.dispose();
});

/** @jest-environment jsdom */
import { expect, jest, test } from '@jest/globals';
import { mountPaneResizer } from '../../public/scripts/atria-shell/pane-resizer.js';
test('keyboard sizing is bounded by available content width and collapsing retains the mounted pane', () => {
    const root = document.createElement('section'), pane = document.createElement('aside'); root.append(pane); document.body.append(root);
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });
    pane.getBoundingClientRect = () => ({ left: 0, top: 0, right: 250, bottom: 700, width: Number.parseInt(root.style.getPropertyValue('--width')) || 250, height: 700 });
    const onCollapse = jest.fn(), resizer = mountPaneResizer({ document, root, pane, property: '--width', label: 'Resource tree width', min: 180, max: () => 500, onCollapse });
    const key = key => resizer.element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    key('End'); expect(root.style.getPropertyValue('--width')).toBe('500px'); key('ArrowRight'); expect(root.style.getPropertyValue('--width')).toBe('500px');
    key('Home'); expect(root.style.getPropertyValue('--width')).toBe('180px'); key('Enter'); expect(onCollapse).toHaveBeenCalledTimes(1); expect(pane.isConnected).toBe(true);
    expect(resizer.element.getAttribute('aria-valuenow')).toBe('180'); resizer.dispose(); root.remove();
});

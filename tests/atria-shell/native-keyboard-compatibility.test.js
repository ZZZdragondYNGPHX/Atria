/** @jest-environment jsdom */
import { expect, test, jest } from '@jest/globals';
import { initAccessibility } from '../../public/scripts/a11y.js';

test('legacy compatibility preserves explicit roles and leaves native keyboard activation to the browser', async () => {
    document.body.innerHTML = '<button class="menu_button" role="tab" tabindex="-1">Archive</button><button class="menu_button" role="menuitem">Open</button><div class="menu_button">Legacy</div>';
    const previousCSS = globalThis.CSS; globalThis.CSS = { supports: () => false };
    const { initKeyboard } = await import('../../public/scripts/keyboard.js');
    initAccessibility(); initKeyboard();
    await new Promise(resolve => setTimeout(resolve, 0));
    const [tab, menu, legacy] = document.body.children;
    expect(tab.getAttribute('role')).toBe('tab'); expect(tab.tabIndex).toBe(-1);
    expect(menu.getAttribute('role')).toBe('menuitem'); expect(legacy.getAttribute('role')).toBe('button');
    const nativeClick = jest.fn(), fallbackClick = jest.fn();
    tab.addEventListener('click', nativeClick); legacy.addEventListener('click', fallbackClick);
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(nativeClick).not.toHaveBeenCalled();
    legacy.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }));
    legacy.addEventListener('keydown', event => event.preventDefault(), { once: true });
    legacy.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(fallbackClick).not.toHaveBeenCalled();
    legacy.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fallbackClick).toHaveBeenCalledTimes(1);
    document.body.replaceChildren();
    globalThis.CSS = previousCSS;
});

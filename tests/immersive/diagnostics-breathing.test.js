/** @jest-environment jsdom */

import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { createImmersiveDiagnostics } from '../../public/scripts/immersive/diagnostics.js';
import { createImmersiveBreathing } from '../../public/scripts/immersive/breathing.js';

afterEach(() => {
    jest.useRealTimers();
    document.body.className = '';
});

describe('immersive diagnostics handoff', () => {
    test('final failure exposes retry and Diagnostics Workspace handoff without technical dump', () => {
        document.body.innerHTML = '<div id="send_form"></div>';
        const retry = jest.fn();
        const openDiagnostics = jest.fn();
        const diagnostics = createImmersiveDiagnostics({ document, retry, openDiagnostics });
        diagnostics.setEnabled(true);
        diagnostics.reportFailure({ message: 'HTTP 502 provider detail', owner: 'provider-x' });

        const root = document.getElementById('atriaImmersiveFailure');
        expect(root.hidden).toBe(false);
        expect(root.textContent).toContain('Response did not complete');
        expect(root.textContent).not.toContain('HTTP 502');
        [...root.querySelectorAll('button')].find(button => button.textContent === 'Retry').click();
        expect(retry).toHaveBeenCalledTimes(1);

        diagnostics.reportFailure({ message: 'again' });
        [...root.querySelectorAll('button')].find(button => button.textContent === 'View reason').click();
        expect(openDiagnostics).toHaveBeenCalledTimes(1);
        diagnostics.dispose();
    });
});

describe('immersive idle breathing', () => {
    test('rests after inactivity and wakes on user input without disabling controls', () => {
        jest.useFakeTimers();
        document.body.innerHTML = '<textarea id="input"></textarea>';
        const breathing = createImmersiveBreathing({ document, idleMs: 1000 });
        breathing.setEnabled(true);

        jest.advanceTimersByTime(1000);
        expect(document.body.classList.contains('atria-immersive-resting')).toBe(true);

        document.dispatchEvent(new Event('pointermove'));
        expect(document.body.classList.contains('atria-immersive-resting')).toBe(false);

        document.getElementById('input').focus();
        jest.advanceTimersByTime(1000);
        expect(document.body.classList.contains('atria-immersive-resting')).toBe(false);
        breathing.dispose();
    });
});

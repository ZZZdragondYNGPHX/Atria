/** @jest-environment jsdom */

import { describe, expect, jest, test } from '@jest/globals';
import { applyHudBudget, createImmersiveProviderRegistry } from '../../public/scripts/immersive/providers.js';
import { createImmersiveHud } from '../../public/scripts/immersive/hud.js';

describe('immersive provider registry', () => {
    test('priority merges explicit scene data and respects HUD budget', async () => {
        const registry = createImmersiveProviderRegistry();
        registry.register({
            id: 'base',
            priority: 10,
            scene: { title: 'Old Town', background: 'base.jpg' },
            hud: {
                primary: [{ id: 'p1', label: 'Time', value: 'Night' }, { id: 'p2', label: 'Extra', value: 'Overflow' }],
                secondary: ['Quest A', 'Quest B', 'Quest C'],
                ambient: ['Rain', 'Cold', 'Wind'],
            },
        });
        registry.register({
            id: 'scene',
            priority: 100,
            scene: { background: 'provider.jpg' },
        });

        const snapshot = registry.getSnapshot();
        expect(snapshot.scene).toEqual({ background: 'provider.jpg', title: 'Old Town' });
        expect(snapshot.hud.summary.primary).toHaveLength(1);
        expect(snapshot.hud.summary.secondary).toHaveLength(2);
        expect(snapshot.hud.summary.ambient).toHaveLength(2);
        expect(snapshot.hud.details.length).toBeGreaterThanOrEqual(3);
    });

    test('provider failures are isolated from the registry and other providers', async () => {
        const onError = jest.fn();
        const registry = createImmersiveProviderRegistry({ onError });
        registry.register({ id: 'healthy', priority: 1, scene: { title: 'Safe' } });
        registry.register({
            id: 'broken',
            priority: 2,
            async getState() {
                throw new Error('provider exploded');
            },
        });

        await expect(registry.refresh()).resolves.toBeDefined();
        expect(registry.getSnapshot().scene.title).toBe('Safe');
        expect(onError).toHaveBeenCalledTimes(1);
    });

    test('a broken error reporter is also isolated', async () => {
        const registry = createImmersiveProviderRegistry({
            onError() {
                throw new Error('reporter failed');
            },
        });
        registry.register({
            id: 'broken-reporter-case',
            async getState() {
                throw new Error('provider failed');
            },
        });

        await expect(registry.refresh()).resolves.toBeDefined();
        expect(registry.getSnapshot().providers).toEqual([{ id: 'broken-reporter-case', priority: 0 }]);
    });

    test('unregister disposes provider resources', () => {
        const dispose = jest.fn();
        const registry = createImmersiveProviderRegistry();
        registry.register({ id: 'temporary', dispose });
        expect(registry.unregister('temporary')).toBe(true);
        expect(dispose).toHaveBeenCalledTimes(1);
    });
});

describe('immersive HUD', () => {
    test('details dialog traps focus and restores it to the trigger', () => {
        if (typeof HTMLDialogElement !== 'undefined') {
            HTMLDialogElement.prototype.showModal ??= function () {
                this.setAttribute('open', '');
            };
            HTMLDialogElement.prototype.close ??= function () {
                this.removeAttribute('open');
            };
        }
        const hud = createImmersiveHud({ document });
        hud.setEnabled(true);
        hud.render({
            hud: applyHudBudget({
                primary: ['Scene'],
                details: [
                    { label: 'Quest', value: 'Find the key' },
                    { label: 'Status', value: 'Ready' },
                ],
            }),
            actions: [],
        });

        const trigger = document.querySelector('.atria-immersive-hud-details-button');
        trigger.focus();
        trigger.click();
        const dialog = document.getElementById('atriaImmersiveHudDetails');
        expect(dialog.open || dialog.hasAttribute('open')).toBe(true);
        expect(dialog.contains(document.activeElement)).toBe(true);

        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(dialog.open || dialog.hasAttribute('open')).toBe(false);
        expect(document.activeElement).toBe(trigger);
        hud.dispose();
    });

    test('renders only budgeted summary items and exposes overflow details', () => {
        const hud = createImmersiveHud({ document });
        hud.setEnabled(true);
        hud.render({
            hud: applyHudBudget({
                primary: ['Primary A', 'Primary B'],
                secondary: ['Secondary A', 'Secondary B', 'Secondary C'],
                ambient: ['Ambient A', 'Ambient B', 'Ambient C'],
            }),
            actions: [],
        });

        expect(document.querySelectorAll('.atria-immersive-hud-primary')).toHaveLength(1);
        expect(document.querySelectorAll('.atria-immersive-hud-secondary')).toHaveLength(2);
        expect(document.querySelectorAll('.atria-immersive-hud-ambient')).toHaveLength(2);
        expect(document.getElementById('atriaImmersiveHudDetails').open).toBe(false);
        expect(document.querySelector('.atria-immersive-hud-details-button').hidden).toBe(false);
        hud.dispose();
    });
});

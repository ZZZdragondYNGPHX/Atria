/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { mountLearningCenter, LEARNING_STORAGE_KEY } from '../../public/scripts/atria-shell/learning-center.js';

test('guide navigates real workspaces, replays, persists completion/resume and consumes Back without trapping input', () => {
    document.body.innerHTML = '<main><div><section id="stage"></section></div></main>';
    const values = new Map(); const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const host = Object.fromEntries(['openPlay', 'openUtility', 'openLibrarySection', 'openRuntimeSection'].map(key => [key, jest.fn()]));
    const shell = { slots: { stage: document.getElementById('stage') }, setDockOpen: jest.fn() };
    const guide = mountLearningCenter({ document, shell, host, storage });
    const click = text => [...document.querySelectorAll('button')].find(node => node.textContent === text).click();
    guide.afterIdentity(); expect(host.openPlay).toHaveBeenCalled();
    click('Next lesson'); expect(host.openRuntimeSection).toHaveBeenLastCalledWith('connections');
    click('Skip lesson'); expect(host.openRuntimeSection).toHaveBeenLastCalledWith('models');
    guide.dispose();
    const restored = mountLearningCenter({ document, shell, host, storage }); restored.restore();
    expect(document.querySelector('h2').textContent).toBe('Choose a model');
    const progress = JSON.parse(values.get(LEARNING_STORAGE_KEY)); expect(progress.completed).toEqual(['identity', 'navigation']);
    click('Previous lesson'); expect(host.openRuntimeSection).toHaveBeenLastCalledWith('connections');
    click('All lessons'); click('Play your story'); expect(host.openPlay).toHaveBeenCalledTimes(2);
    const back = new CustomEvent('atria-learning-back', { cancelable: true }); expect(document.dispatchEvent(back)).toBe(false);
    expect(document.querySelector('aside').hidden).toBe(true);
    restored.open(); expect(document.querySelector('aside').hidden).toBe(false);
    expect(document.querySelector('[aria-modal=true]')).toBeNull();
    restored.dispose();
});

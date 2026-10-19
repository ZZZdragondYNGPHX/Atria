/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { mountActivityIsland } from '../../public/scripts/atria-shell/activity-island.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
let island;
afterEach(() => { island?.dispose(); document.body.replaceChildren(); });
function fixture({ tasks = [], runs = [], failed = false } = {}) {
    const root = document.createElement('main'); document.body.append(root);
    const shell = { root, environment: { get: () => ({ mode: 'expanded', width: 1280, keyboardOpen: false }), subscribe: () => () => {} } };
    const host = { openRun: jest.fn(), openProjectTask: jest.fn() };
    const studio = { listProjects: jest.fn(async () => [{ project: { projectId: 'project', displayName: 'Project' } }]), observeAgentTasks: jest.fn(async () => tasks) };
    const client = { listRuns: jest.fn(async () => { if (failed) throw new Error('offline'); return { items: runs, cursor: null }; }) };
    island = mountActivityIsland({ document, window, shell, host, studio, product: { listSessions: async () => [] }, client });
    return { root, host, studio, client };
}
test('activity reads task observations and opens exact original owners without taking any action', async () => {
    const { root, host, studio } = fixture({ tasks: [{ taskId: 'task', intent: 'Harbor scene', status: 'review', updatedAt: 1 }], runs: [{ runId: 'run', status: 'waiting_approval', updatedAt: 2 }] });
    await tick(); await tick();
    expect(studio.observeAgentTasks).toHaveBeenCalledWith('project');
    root.querySelector('.atria-activity-island__summary').click();
    const buttons = root.querySelectorAll('.atria-activity-island__open');
    buttons[0].click(); expect(host.openRun).toHaveBeenCalledWith('run');
    root.querySelector('.atria-activity-island__summary').click(); buttons[1].click(); expect(host.openProjectTask).toHaveBeenCalledWith('project', 'task', 'Harbor scene');
    expect(root.textContent).not.toContain('[object Object]');
});
test('no tasks means no fake activity, while a read failure remains discoverable', async () => {
    let { root } = fixture(); await tick(); await tick(); expect(root.querySelector('.atria-activity-island').hidden).toBe(true); island.dispose();
    ({ root } = fixture({ failed: true })); await tick(); await tick();
    expect(root.querySelector('.atria-activity-island').hidden).toBe(false); expect(root.textContent).toContain('Activity could not refresh');
});
test('Back collapses only the activity layer and returns focus to the summary', async () => {
    const { root } = fixture({ tasks: [{ taskId: 'task', intent: 'Harbor', status: 'working' }] }); await tick(); await tick();
    const summary = root.querySelector('.atria-activity-island__summary'); summary.click();
    const back = new CustomEvent('atria-activity-back', { cancelable: true }); expect(document.dispatchEvent(back)).toBe(false);
    expect(summary.getAttribute('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(summary);
    expect(document.dispatchEvent(new CustomEvent('atria-activity-back', { cancelable: true }))).toBe(true);
});

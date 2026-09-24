/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { mountProjectDeletion } from '../../public/scripts/native/project-lifecycle.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(client) {
    const root = document.createElement('div'); document.body.replaceChildren(root); const onDeleted = jest.fn();
    mountProjectDeletion({ document, root, project: { projectId: 'project_a', displayName: 'Harbor' }, revision: 'old', client, onDeleted });
    const button = label => [...root.querySelectorAll('button')].find(node => node.textContent === label);
    return { root, onDeleted, button };
}
test('delete waits for destructive confirmation and keeps captured revision across retry', async () => {
    const client = { deleteProject: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ deleted: true }) };
    const ui = setup(client); ui.button('Delete Project').click(); await tick();
    expect(ui.root.textContent).toContain('Installed Works, Sessions, Saves'); expect(client.deleteProject).not.toHaveBeenCalled();
    ui.button('Cancel').click(); await tick(); expect(client.deleteProject).not.toHaveBeenCalled();
    ui.button('Delete Project').click(); await tick(); ui.button('Delete project permanently').click(); await tick();
    expect(ui.root.textContent).toContain('offline'); expect(ui.onDeleted).not.toHaveBeenCalled();
    ui.button('Delete project permanently').click(); await tick();
    expect(client.deleteProject.mock.calls).toEqual([['project_a', 'old'], ['project_a', 'old']]);
    expect(ui.onDeleted).toHaveBeenCalledTimes(1);
});
test('conflict removes stale confirmation, reloads exact revision and requires another confirmation', async () => {
    const client = { deleteProject: jest.fn().mockRejectedValueOnce(Object.assign(new Error('stale'), { status: 409 })).mockResolvedValue({ deleted: true }),
        getProject: jest.fn(async () => ({ revision: { revision: 'new' }, source: { project: { displayName: 'Renamed harbor' } } })) };
    const ui = setup(client); ui.button('Delete Project').click(); await tick(); ui.button('Delete project permanently').click(); await tick();
    expect(ui.button('Delete project permanently')).toBeUndefined(); expect(ui.onDeleted).not.toHaveBeenCalled();
    ui.button('Reload project revision').click(); await tick();
    expect(ui.root.textContent).toContain('Renamed harbor'); expect(client.deleteProject).toHaveBeenCalledTimes(1);
    ui.button('Delete project permanently').click(); await tick();
    expect(client.deleteProject).toHaveBeenLastCalledWith('project_a', 'new'); expect(ui.onDeleted).toHaveBeenCalledTimes(1);
});

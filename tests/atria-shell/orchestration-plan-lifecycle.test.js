/** @jest-environment jsdom */
import { afterEach, beforeAll, expect, jest, test } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { mountPlanLibrary } from '../../public/scripts/native/orchestration/plan-workspace.js';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const button = label => [...document.querySelectorAll('button')].find(node => node.textContent === label);
const unknown = commandId => Object.assign(new Error('Outcome unknown'), { code: 'request_outcome_unknown', commandId, unknownOutcome: true });
const rootPlan = (title = 'Harbor', archived = false) => ({ planId: 'oplan_' + 'a'.repeat(32), viewState: { title, positions: {} }, draftVersion: 0, definitionHash: 'b'.repeat(64), currentPlanRevisionId: null,
    archived, definition: { nodes: [], edges: [] }, updatedAt: 0 });
beforeAll(() => { globalThis.structuredClone = value => JSON.parse(JSON.stringify(value)); Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: randomUUID }); });
afterEach(() => { document.body.replaceChildren(); });

test('creation with a lost response retries the same command and source draft instead of creating duplicates', async () => {
    const root = rootPlan(), onOpen = jest.fn(), client = { listPlans: jest.fn(async () => ({ items: [], cursor: null })),
        createPlan: jest.fn().mockImplementationOnce(async (_body, options) => { throw unknown(options.commandId); }).mockResolvedValue({ outcome: root }) };
    const ui = mountPlanLibrary({ document, root: document.body, client, onOpen }); await flush();
    document.querySelector('[aria-label="New Plan name"]').value = 'Harbor';
    document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush();
    expect(document.querySelector('[aria-label="New Plan name"]').disabled).toBe(true);
    button('Retry same creation').click(); await flush();
    expect(client.createPlan).toHaveBeenCalledTimes(2);
    expect(client.createPlan.mock.calls[1][0]).toEqual(client.createPlan.mock.calls[0][0]);
    expect(client.createPlan.mock.calls[1][1].commandId).toBe(client.createPlan.mock.calls[0][1].commandId);
    expect(onOpen).toHaveBeenCalledWith(root.planId, 'Harbor'); ui.dispose();
});

test('archive outcome recovery retains its command and exposes the archived row under its real filter', async () => {
    const root = rootPlan(), client = { listPlans: jest.fn(async (_cursor, _limit, _signal, filter) => ({ items: root.archived === filter.archived ? [root] : [], cursor: null })),
        archivePlan: jest.fn().mockImplementationOnce(async (_body, options) => { root.archived = true; root.draftVersion++; throw unknown(options.commandId); }).mockImplementation(async () => ({ outcome: root })) };
    const ui = mountPlanLibrary({ document, root: document.body, client, onOpen: jest.fn() }); await flush();
    button('Archive Plan').click(); await flush(); button('Retry same action').click(); await flush();
    expect(client.archivePlan.mock.calls[1][1].commandId).toBe(client.archivePlan.mock.calls[0][1].commandId);
    expect(document.body.textContent).toContain('Plan archived. Existing bindings keep their revisions.');
    const filter = document.querySelector('[data-field="plans.visibility"]'); filter.value = 'archived'; filter.dispatchEvent(new Event('change')); await flush();
    expect(button('Restore Plan')).toBeDefined(); expect(button('Delete draft')).toBeDefined(); ui.dispose();
});

test('an old list response cannot overwrite a newly selected archive filter', async () => {
    let finish;
    const client = { listPlans: jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ items: [rootPlan('Archived title', true)], cursor: null }) };
    const ui = mountPlanLibrary({ document, root: document.body, client, onOpen: jest.fn() }); await flush();
    const filter = document.querySelector('[data-field="plans.visibility"]'); filter.value = 'archived'; filter.dispatchEvent(new Event('change')); await flush();
    finish({ items: [rootPlan('Old active title')], cursor: null }); await flush();
    expect(document.body.textContent).toContain('Archived title'); expect(document.body.textContent).not.toContain('Old active title'); ui.dispose();
});

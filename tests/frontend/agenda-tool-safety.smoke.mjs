// Disposable server; simulated model replies exercise real browser Agenda runtime.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createBlankCharacter } from '../e2e/_lib/ui-character.js';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage();
    await page.goto(process.argv[2]);
    await page.waitForFunction(() => window.Atria?.getContext && !document.getElementById('preloader'));
    const onboarding = page.locator('dialog[open]').filter({ has: page.locator('#onboarding_ui_language_select') });
    if (await onboarding.count()) {
        await onboarding.locator('textarea').fill('Agenda Test');
        await onboarding.locator('.popup-button-ok').click();
        await onboarding.waitFor({ state: 'hidden' });
    }
    const name = `Agenda safety ${Date.now()}`;
    await createBlankCharacter(page, { name, firstmes: 'A test scene.' });
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: name }).click();
    await page.waitForFunction(name => window.Atria.getContext().characters[window.Atria.getContext().characterId]?.name === name, name);
    const result = await page.evaluate(async () => {
        const ctx = window.Atria.getContext(), context = Object.create(ctx);
        const { runAgendaOrchestration } = await import('/scripts/extensions/orchestrator/agenda-runtime.js');
        const { getCurrentRun } = await import('/scripts/extensions/orchestrator/run-state/store.js');
        const P = 'atri_orch_planner_step', W = 'atri_orch_submit_result';
        const profile = { mode: 'agenda', planner: { systemPrompt: 'Plan' }, agents: {
            worker: { purpose: 'Inspect facts', systemPrompt: 'PRIVATE WORKER atri_orch_submit_result', tools: {} },
            finalizer: { systemPrompt: 'Summarize guidance', tools: {} },
        }, finalAgentId: 'finalizer', limits: { plannerMaxRounds: 3, maxConcurrentAgents: 1, maxTotalRuns: 4 } };
        const response = (name, args) => ({ toolCalls: [{ name, args, raw: { id: 'call_fixture', type: 'function', function: { name, arguments: JSON.stringify(args) } } }] });
        const dispatch = { dispatches: [{ todo_id: 'main', agent: 'worker', task_brief: 'inspect', input_run_ids: [] }] };
        const replies = [response(W, { text: 'wrong args' }), response(P, dispatch), response(W, { text: 'evidence' }),
            response(P, { todo_ops: [{ op: 'set_status', todo_id: 'main', status: 'done' }], finalize: 'ready' }), response(W, { text: 'guidance' })];
        const requests = [];
        context.generateTask = async request => {
            requests.push({ name: request.tools[0].function.name, stream: request.stream, repair: request.temperature === 0 });
            if (request.tools[0].function.name === P && JSON.stringify(request.taskMessages).includes('PRIVATE WORKER')) throw new Error('Worker prompt leaked');
            return replies.shift();
        };
        const completed = await runAgendaOrchestration(context, {}, [{ role: 'user', content: 'test' }], profile);
        const abort = new AbortController(); let cancelCalls = 0;
        context.generateTask = async () => { cancelCalls++; abort.abort(); return response(P, dispatch); };
        try { await runAgendaOrchestration(context, { signal: abort.signal }, [{ role: 'user', content: 'test' }], profile); } catch { /* expected */ }
        return { requests, text: completed.stageOutputs[0].nodes[0].output, cancelCalls, cancelStatus: getCurrentRun().status };
    });
    assert.equal(result.text, 'guidance'); assert.equal(result.cancelCalls, 1); assert.equal(result.cancelStatus, 'aborted');
    assert.equal(result.requests.length, 5); assert(result.requests.every(request => request.stream === false));
    assert.equal(result.requests[1].repair, true);
    console.log(JSON.stringify({ browser: browser.version(), ...result }, null, 2));
} finally {
    await browser.close();
}

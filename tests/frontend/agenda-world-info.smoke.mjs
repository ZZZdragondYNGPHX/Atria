// Real Atria browser runtime, worldbook storage and prompt builder; only model sender is simulated.
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
        await onboarding.locator('textarea').fill('Agenda regression');
        await onboarding.locator('.popup-button-ok').click();
        await onboarding.waitFor({ state: 'hidden' });
    }
    const name = `Agenda bindings ${Date.now()}`;
    await createBlankCharacter(page, { name, firstmes: 'A test scene.' });
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: name }).click();
    await page.waitForFunction(name => window.Atria.getContext().characters[window.Atria.getContext().characterId]?.name === name, name);
    const result = await page.evaluate(async () => {
        const ctx = window.Atria.getContext(), context = Object.create(ctx);
        const wi = await import('/scripts/world-info.js');
        const { generateTask } = await import('/scripts/generate-task.js');
        const { runAgendaOrchestration } = await import('/scripts/extensions/orchestrator/agenda-runtime.js');
        const { createWorkspaceFactoryPreset, workspaceHostProfile } = await import('/scripts/extensions/orchestrator/workspace/host-presets.js');

        const P = 'atri_orch_planner_step';
        const books = ['agenda_main', '__MEMORY_GRAPH__', 'agenda_extra', 'agenda_chat', 'agenda_global'];
        for (const [index, book] of books.entries()) {
            await ctx.saveWorldInfo(book, { entries: { 0: { ...ctx.worldInfoEntry.template, uid: 0, key: [], constant: true,
                disable: false, order: 100, position: index === 2 ? 4 : 0, content: `FIXTURE_BOOK_${index}`, probability: 100, useProbability: false } } }, true);
        }
        await ctx.updateWorldInfoList();
        ctx.characters[ctx.characterId].data.extensions.world = books[0];
        wi.world_info.charLore ||= [];
        wi.world_info.charLore.push({ name: ctx.getCharaFilename(ctx.characterId), extraBooks: [books[1], books[2]] });
        ctx.chatWorldInfo.setSelection([books[3]]);
        await ctx.worldInfoEntry.setGlobalSelection(books[4], true, { save: false });
        await ctx.worldInfoEntry.setGlobalSelection(books[1], true, { save: false }); // duplicated global + character binding must survive
        ctx.extensionSettings.orchestrator ||= {};
        ctx.extensionSettings.orchestrator.toolCallRetryMax = 0;
        ctx.extensionSettings.orchestrator.rpmLimit = 0;
        const profile = workspaceHostProfile(createWorkspaceFactoryPreset('agenda', 'builtin-agenda'));
        const messages = [{ role: 'user', content: 'Inspect this test scene.' }];
        const normal = await ctx.resolveWorldInfoForMessages(messages);
        let plannerCalls = 0;
        const requests = [], summaries = [];
        const oldDebug = console.debug;
        console.debug = (...args) => { if (args[0] === '[orchestrator-agenda] World book bindings') summaries.push(args[1]); oldDebug(...args); };
        context.generateTask = async request => {
            const tool = request.tools[0].function.name;
            return generateTask(request, { _injected: {
                profileResolver: () => ({ requestApi: 'openai', apiSettingsOverride: null }),
                senders: { getOpenAiRuntime: () => ({ oai_settings: { stream_openai: false } }),
                    sendOpenAIRequest: async (_type, prompt) => {
                        const text = JSON.stringify(prompt);
                        requests.push({ tool, included: books.map((_, i) => text.includes(`FIXTURE_BOOK_${i}`)) });
                        let args;
                        if (tool === P) args = ++plannerCalls % 2 === 1 ? { dispatches: ['distiller', 'lorebook_reader'].map(agent => ({ todo_id: 'main', agent, task_brief: `inspect ${agent}`, input_run_ids: [] })) } : { finalize: 'ready' };
                        else args = { text: 'verified guidance' };
                        return { choices: [{ message: { content: '', tool_calls: [{ id: 'fixture', type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] };
                    } },
            } });
        };
        try {
            const completed = await runAgendaOrchestration(context, normal, messages, profile);
            return { presetId: 'builtin-agenda', output: completed.stageOutputs[0].nodes[0].output,
                normalIncluded: books.map((_, i) => JSON.stringify(normal).includes(`FIXTURE_BOOK_${i}`)),
                requests, summaries };
        } finally { console.debug = oldDebug; }
    });
    assert.deepEqual(result.normalIncluded, [true, true, true, true, true]);
    for (const request of result.requests) assert.deepEqual(request.included, [true, true, true, false, false]);
    assert.equal(result.requests.length, 5);
    assert.equal(result.output, 'verified guidance');
    assert(result.summaries.every(s => s.character_main === 1 && s.character_additional === 2 && s.chat_skipped === 1 && s.global_skipped === 1));
    console.log(JSON.stringify({ browser: browser.version(), ...result }, null, 2));
} finally { await browser.close(); }

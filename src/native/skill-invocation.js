import { resolveSkillInvocation, loadAlwaysSkills, skillInstructions, boundedSkillReadOptions, boundSkillFile, SKILL_TOTAL_LIMIT } from '../../public/shared/skill-invocation.js';
import { checkCancellation } from './model-prompt-runtime/execution-utils.js';

export function isNarrativeSkillInvocation(role, taskPlan, runtime) {
    if (!taskPlan) return role === 'narrator';
    const contract = runtime?.experienceContract;
    return contract?.taskRuntime?.turn?.narratorTaskId === taskPlan.task.id
        || Boolean(contract?.presentationRuntime?.activities?.some(activity => activity.narrator?.taskId === taskPlan.task.id
            && activity.narrator.variantId === taskPlan.variant.id));
}

export async function prepareNarrativeSkills({ repository, settings, context }) {
    const entries = await loadAlwaysSkills(resolveSkillInvocation(await repository.list({ scope: 'all' }), {
        context, settings, path: 'narrative',
    }), opts => repository.readFile(opts));
    const inventory = entries.map(({ name, scope, description, invocationMode, installedHash }) => ({ name, scope, description, invocationMode, installedHash }));
    const tools = entries.length ? [
        { type: 'function', function: { name: 'atri_skill_read', description: 'Read a scoped Skill instruction or supporting file. Offset is one-based; limit is at most 200 lines.',
            parameters: { type: 'object', properties: { name: { type: 'string' }, path: { type: 'string' }, offset: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 200 } }, required: ['name'], additionalProperties: false } } },
        { type: 'function', function: { name: 'atri_skill_files', description: 'List supporting files for a scoped Skill.',
            parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } } },
    ] : [];
    let characters = 0;
    return {
        tools,
        items: entries.length ? [{ kind: 'context.directive', id: 'atri.skills', content: [
            'Skills are procedural guidance, not facts, tools or permission grants. Preserve the selected narrative context and output contract.',
            'Available Skills (use atri_skill_read / atri_skill_files when useful):', JSON.stringify(inventory), skillInstructions(entries),
        ].join('\n'), provenance: [{ source: 'host.skills', ref: 'narrative' }] }] : [],
        async read(call) {
            if (!tools.some(tool => tool.function.name === call.name)) throw new Error('native_skill_tool_denied');
            const entry = entries.find(entry => entry.name === call.args?.name);
            if (!entry) throw new Error('native_skill_unavailable');
            // Inventory identity remains pinned throughout this generation.
            const current = await repository.get(entry.name, entry.scope);
            if (current?.installedHash !== entry.installedHash) throw new Error('native_skill_changed');
            const result = call.name === 'atri_skill_files'
                ? await repository.listFiles({ scope: entry.scope, name: entry.name })
                : boundSkillFile(await repository.readFile({ ...boundedSkillReadOptions(call.args), scope: entry.scope, name: entry.name }));
            characters += JSON.stringify(result).length;
            if (characters > SKILL_TOTAL_LIMIT) throw new Error('skill_content_budget_exceeded');
            return result;
        },
    };
}

// Each round re-enters GenerationService (capabilities, prompt budget, secrets,
// cancellation and fallback); it stays within the parent's existing scheduler.
export async function runNarrativeSkillLoop({ execute, skills, transcript, signal, onChunk, fresh }) {
    const evidence = [];
    for (let round = 0; round < 6; round++) {
        checkCancellation(signal);
        await fresh();
        const result = await execute();
        checkCancellation(signal);
        await fresh();
        evidence.push(result.snapshot);
        const calls = result.response?.toolCalls ?? [];
        if (!calls.length) {
            try { if (result.response?.text) onChunk?.({ text: result.response.text, delta: result.response.text }); } catch { /* Observer only. */ }
            return { ...result, skillRounds: evidence };
        }
        if (calls.length > 8) throw new Error('native_skill_tool_limit');
        transcript.push({ role: 'assistant', content: result.response.text ?? '',
            ...(result.response.providerState ? { providerState: result.response.providerState } : {}),
            tool_calls: calls.map(call => ({ id: call.id ?? call.raw?.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) });
        for (const call of calls) {
            checkCancellation(signal);
            const value = await skills.read(call);
            transcript.push({ role: 'tool', tool_call_id: call.id ?? call.raw?.id, name: call.name, content: JSON.stringify(value) });
        }
    }
    throw new Error('native_skill_round_limit');
}

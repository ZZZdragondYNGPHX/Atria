import { resolveSkillInvocation, pinSkillEntries, skillReadPin, loadAlwaysSkills, skillInstructions, boundedSkillReadOptions, boundSkillFile, SKILL_TOTAL_LIMIT } from '../../public/shared/skill-invocation.js';
import { checkCancellation } from './model-prompt-runtime/execution-utils.js';
import { fields } from '../../public/shared/native-values.js';
import { performance } from 'node:perf_hooks';
import { hashNativeDocument as hash } from './repositories/common.js';

const completionProofs = new WeakMap();
export function verifyProjectSkillCompletion(proof, { repository, bindingDigest, inputHash, operation }) {
    const record = completionProofs.get(proof);
    if (!record || record.repository !== repository || record.bindingDigest !== bindingDigest
        || record.evidence.inputHash !== inputHash || record.evidence.operation !== operation)
        throw Object.assign(new TypeError('Invalid original Skill completion proof'), { code: 'native_skill_completion_proof_invalid' });
    return record.evidence;
}

// The existing Studio Task owns this work. A catalog consumes cached client
// inventory; repository reads are measured only in this server process.
export async function executeProjectSkillWork({ operation, input, compute, repository, settings, projectId, signal, onCompleted, completionBindingDigest }) {
    if (!['list', 'pin', 'read', 'files', 'catalog'].includes(operation)) throw Object.assign(new TypeError('Invalid Skill operation'), { code: 'native_skill_execution_invalid' });
    const allowed = { list: ['context'], pin: ['scope', 'name', 'expectedHash'], read: ['scope', 'name', 'version', 'path', 'offset', 'limit', 'full'],
        files: ['scope', 'name', 'version'], catalog: ['names'] };
    fields(input, allowed[operation], 'Skill work input');
    const kind = { list: 'skill_inventory', pin: 'skill_pin', read: input.full ? 'skill_load' : 'skill_read', files: 'skill_read', catalog: 'skill_inventory' }[operation];
    const descriptor = { operation, input, ...(operation === 'list' ? { settings, projectId } : {}) };
    checkCancellation(signal);
    await compute.assertCurrent();
    const ticket = await compute.beforeLocalWork({ items: 1, inputBytes: Buffer.byteLength(JSON.stringify(descriptor), 'utf8'), indexPath: 'studio.skill:' + operation, kind });
    if (operation === 'catalog') {
        await compute.settleLocalWork(ticket, null);
        await compute.assertCurrent();
        checkCancellation(signal); return { admitted: true };
    }
    const started = performance.now(), cpu = process.cpuUsage(); let outcome = 'failed', result;
    try {
        checkCancellation(signal); await compute.assertCurrent();
        if (operation === 'list') result = resolveSkillInvocation(await repository.list({ scope: 'all' }),
            { context: { ...input.context, projectId }, settings, path: 'studio' });
        if (operation === 'pin') result = await repository.pin(input);
        if (operation === 'read') {
            const { full, ...options } = input;
            if (!full) boundedSkillReadOptions(options);
            result = boundSkillFile(await repository.readFile(options));
        }
        if (operation === 'files') result = { files: (await repository.listFiles(input)).map(file => ({ path: file.path, size: file.buffer.length, isBinary: file.isBinary })), version: input.version };
        checkCancellation(signal); await compute.assertCurrent();
        outcome = 'completed';
    } catch (error) { if (signal?.aborted) outcome = 'cancelled'; throw error; } finally {
        const used = process.cpuUsage(cpu);
        await compute.settleLocalWork(ticket, { wallMs: performance.now() - started, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome });
    }
    checkCancellation(signal); await compute.assertCurrent();
    if (onCompleted && ['read', 'files'].includes(operation)) {
        const proof = Object.freeze({});
        completionProofs.set(proof, { repository, bindingDigest: completionBindingDigest,
            evidence: Object.freeze({ protocol: 'skill', operation, inputHash: hash(input), resultHash: hash(result), version: input.version ?? null }) });
        try { await onCompleted(proof); } finally { completionProofs.delete(proof); }
    }
    return result;
}

export function isNarrativeSkillInvocation(role, taskPlan, runtime) {
    if (!taskPlan) return role === 'narrator';
    const contract = runtime?.experienceContract;
    return contract?.taskRuntime?.turn?.narratorTaskId === taskPlan.task.id
        || Boolean(contract?.presentationRuntime?.activities?.some(activity => activity.narrator?.taskId === taskPlan.task.id
            && activity.narrator.variantId === taskPlan.variant.id));
}

export async function prepareNarrativeSkills({ repository, settings, context, work = (_kind, _input, operation) => operation() }) {
    const selected = await work('skill_inventory', { scope: 'all', context, settings, path: 'narrative' }, async () =>
        resolveSkillInvocation(await repository.list({ scope: 'all' }), { context, settings, path: 'narrative' }));
    const entries = await loadAlwaysSkills(await pinSkillEntries(selected,
        opts => work('skill_pin', opts, () => repository.pin(opts))),
    opts => work('skill_load', opts, () => repository.readFile(opts)));
    const inventory = entries.map(({ name, scope, description, invocationMode, installedHash, version }) => ({ name, scope, description, invocationMode, installedHash, version }));
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
            const result = call.name === 'atri_skill_files'
                ? { files: (await repository.listFiles({ scope: entry.scope, name: entry.name, ...skillReadPin(entry) })).map(file => ({ path: file.path, size: file.buffer.length, isBinary: file.isBinary })) }
                : boundSkillFile(await repository.readFile({ ...boundedSkillReadOptions(call.args), scope: entry.scope, name: entry.name, ...skillReadPin(entry) }));
            characters += JSON.stringify(result).length;
            if (characters > SKILL_TOTAL_LIMIT) throw new Error('skill_content_budget_exceeded');
            return result;
        },
    };
}

// Each round re-enters GenerationService (capabilities, prompt budget, secrets,
// cancellation and fallback); it stays within the parent's existing scheduler.
export async function completeNarrativeSkillTools({ calls, skills, transcript, signal, persist }) {
    for (const call of calls) {
        checkCancellation(signal);
        const value = await skills.read(call);
        transcript.push({ role: 'tool', tool_call_id: call.id ?? call.raw?.id, name: call.name, content: JSON.stringify(value) });
        await persist?.();
    }
}
export async function runNarrativeSkillLoop({ execute, skills, transcript, signal, onChunk, fresh, persist,
    roundCount = () => transcript.filter(message => message.role === 'assistant').length }) {
    const evidence = [];
    while (true) {
        checkCancellation(signal);
        await fresh();
        if (roundCount() >= 6) throw new Error('native_skill_round_limit');
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
            tool_calls: calls.map(call => ({ id: call.id ?? call.raw?.id, type: 'function', function: { name: call.name,
                arguments: typeof call.raw?.function?.arguments === 'string' ? call.raw.function.arguments : JSON.stringify(call.args) } })) });
        await persist?.();
        await completeNarrativeSkillTools({ calls, skills, transcript, signal, persist });
    }
}

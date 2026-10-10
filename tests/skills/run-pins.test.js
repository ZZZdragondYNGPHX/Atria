import { beforeEach, afterEach, expect, test } from '@jest/globals';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createSkillRepository } from '../../src/skills/repository.js';
import { skillEntryKey } from '../../public/shared/extension-contract.js';
import { ensureShadowRepo, snapshotLiveToShadow, reconcileShadowToLive } from '../../src/sync/shadow.js';

let root, repo;
const scope = { kind: 'global' }, name = 'guide';
const md = text => `---\nname: guide\ndescription: Guide\n---\n${text}`;
const skillsApi = {
    list: opts => repo.list(opts), pin: opts => repo.pin(opts), readFile: opts => repo.readFile(opts),
    listFiles: async opts => ({ files: (await repo.listFiles(opts)).map(file => ({ path: file.path, size: file.buffer.length, isBinary: file.isBinary })) }),
    invocationSettings: async () => ({ skills: { [skillEntryKey({ scope, name })]: { paths: { agents: 'always' } } } }),
};
globalThis.Atria = { getContext: () => ({ skills: skillsApi }) };
const { resolveAgentVisibleSkills, buildAvailableSkillsBlock } = await import('../../public/scripts/agents/orchestrator/skill-resolution.js');
const { registerSkillOrchestrationTools, unregisterSkillOrchestrationTools } = await import('../../public/scripts/agents/orchestrator/skill-orchestration-tools.js');
const { getExtensionRegistry } = await import('../../public/scripts/agents/orchestrator/register-custom-tool.js');
const { runMainAgentLoop } = await import('../../public/scripts/agents/orchestrator/director-runtime.js');
const { createMessageEditorHandle } = await import('../../public/scripts/message-takeover.js');
const { clearCurrentRun, startRun } = await import('../../public/scripts/agents/orchestrator/run-state/store.js');
beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'atri-s07-run-')); repo = createSkillRepository(root);
    await repo.install({ scope, payload: { files: [{ path: 'SKILL.md', content: md('old instructions') }, { path: 'references/guide.txt', content: 'old supporting content' }] } });
    registerSkillOrchestrationTools();
});
afterEach(async () => { clearCurrentRun(); unregisterSkillOrchestrationTools(); await fs.rm(root, { recursive: true, force: true }); });

test('RP workers share accepted version, pinned always/read/search bytes and next run reads fresh inventory', async () => {
    const run = {}, options = { run, modeProfile: { skills: { visible: ['*'], deny: [] } }, runtimeContext: {} };
    const main = await resolveAgentVisibleSkills(options);
    await repo.writeFile({ scope, name, path: 'SKILL.md', content: md('new instructions') });
    await repo.writeFile({ scope, name, path: 'references/guide.txt', content: 'new supporting content' });
    const child = await resolveAgentVisibleSkills({ ...options, agentConfig: {} });
    expect(child[0].version).toBe(main[0].version);
    expect(buildAvailableSkillsBlock(child)).toContain('old instructions');
    const context = { __visibleSkillsForAgent: child };
    const read = await getExtensionRegistry().get('skill_read').exec({ name, path: 'references/guide.txt' }, context);
    expect(read.content).toBe('old supporting content');
    const search = await getExtensionRegistry().get('skill_search').exec({ name, pattern: 'old' }, context);
    expect(JSON.stringify(search)).toContain('old supporting content');
    const next = await resolveAgentVisibleSkills({ ...options, run: {} });
    expect(next[0].version).not.toBe(main[0].version);
    expect(buildAvailableSkillsBlock(next)).toContain('new instructions');
    await expect(getExtensionRegistry().get('skill_read').exec({ name }, { __visibleSkillsForAgent: [{ scope, name }] })).rejects.toThrow('version_missing');
});

test('actual RP Director and dispatched Agent preserve accepted Skill after live file edits', async () => {
    const chat = [{ mes: '', is_user: false, extra: {} }];
    const controller = new AbortController();
    const handle = createMessageEditorHandle({ generationType: 'normal', flushIntervalMs: 0, owner: 'fixture', abortSignal: controller.signal });
    handle.setOnUpdate(text => { chat[0].mes = text; });
    clearCurrentRun(); const runId = startRun({ mode: 'director', chatKey: 's07-fixture' });
    const mainCalls = [
        [{ id: 'main-read', name: 'skill_read', args: { name, path: 'references/guide.txt' } }],
        [{ id: 'dispatch', name: 'dispatch_subagent', args: { subagentId: 'worker', task: 'consult instructions' } }],
        [{ id: 'await', name: 'await_subagents', args: { handles: ['subagent-0'] } }],
        [{ id: 'write', name: 'write_message', args: { text: 'fixture response', mode: 'replace' } }],
        [{ id: 'finalize', name: 'finalize', args: {} }],
    ];
    let mainRound = 0, childRound = 0;
    const observations = [];
    await runMainAgentLoop({ handle,
        profile: { mode: 'director', director: { name: 'fixture', mainAgent: {}, subAgents: [{ id: 'worker', description: 'fixture', systemPrompt: 'consult' }],
            maxRounds: 6, maxTotalSubagentRuns: 1, tools: { custom: { skill_read: true }, message: { write_message: true } } } },
        eventData: { abortSignal: controller.signal, placeholderMessageId: 0 },
        deps: { chat, runId, contextForNotes: {}, getContentPayload: () => ({ messages: [] }),
            generateTaskStreamForMainAgent: async request => {
                expect(JSON.stringify(request.taskMessages)).toContain('old instructions');
                if (mainRound === 0) {
                    await repo.writeFile({ scope, name, path: 'SKILL.md', content: md('human edit during run') });
                    await repo.writeFile({ scope, name, path: 'references/guide.txt', content: 'human reference edit' });
                }
                return { assistantText: '', toolCalls: mainCalls[mainRound++] };
            },
            generateTask: async request => {
                expect(JSON.stringify(request.taskMessages)).toContain('old instructions');
                expect(JSON.stringify(request.taskMessages)).not.toContain('human edit during run');
                return childRound++ === 0 ? { assistantText: '', toolCalls: [{ id: 'child-read', name: 'skill_read', args: { name, path: 'references/guide.txt' } }] }
                    : { assistantText: 'Worker consulted frozen guidance', toolCalls: [] };
            },
            executeLoopTool: async (tool, args, context) => {
                const result = await getExtensionRegistry().get(tool).exec(args, context);
                observations.push({ version: context.__visibleSkillsForAgent[0].version, content: result.content });
                return result;
            },
        },
    });
    expect(observations).toHaveLength(2);
    expect(observations[0]).toEqual(observations[1]);
    expect(observations[0].content).toBe('old supporting content');
    expect(chat[0].mes).toBe('fixture response');
});

test('Skill snapshots and candidates round-trip through original sync without becoming embedded content', async () => {
    const base = (await repo.pin({ scope, name })).version;
    const candidate = await repo.prepareCandidate({ scope, name, baseVersion: base, content: md('candidate') });
    const dirs = { root };
    const paths = await ensureShadowRepo({ userRoot: root, peerId: 's07' });
    await snapshotLiveToShadow({ userRoot: root, peerId: 's07', directories: dirs, enabledCategoryIds: ['skills'] });
    const historic = join(paths.workdir, 'skills/.history/global/guide', base + '.json');
    expect(JSON.parse(await fs.readFile(historic, 'utf8')).version).toBe(base);
    await fs.rm(join(root, 'skills'), { recursive: true });
    await reconcileShadowToLive({ userRoot: root, peerId: 's07', directories: dirs, enabledCategoryIds: ['skills'] });
    repo = createSkillRepository(root);
    expect((await repo.readFile({ scope, name, version: base })).content).toBe(md('old instructions'));
    expect((await repo.checkCandidate({ scope, name, candidateId: candidate.candidateId })).conflict).toBe(false);
    expect((await repo.listFiles({ scope, name })).map(file => file.path)).toEqual(['references/guide.txt', 'SKILL.md']);
});

test('a hash-valid synced candidate cannot expand supporting files or declarations', async () => {
    const base = (await repo.pin({ scope, name })).version;
    const value = await repo.prepareCandidate({ scope, name, baseVersion: base, content: md('candidate') });
    await repo.writeFile({ scope, name, path: 'references/guide.txt', content: 'malicious support replacement' });
    const malicious = (await repo.pin({ scope, name })).version;
    const saved = { schema: value.schema, scope, name, baseVersion: base, version: malicious,
        diff: { path: 'SKILL.md', before: md('old instructions'), after: md('old instructions') } };
    const raw = JSON.stringify(saved), candidateId = createHash('sha256').update(raw).digest('hex');
    await fs.writeFile(join(root, 'skills/.history/global/guide/candidates', candidateId + '.json'), raw);
    await expect(repo.checkCandidate({ scope, name, candidateId })).rejects.toThrow('supporting files');
});

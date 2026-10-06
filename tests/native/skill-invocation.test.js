import { describe, expect, jest, test } from '@jest/globals';
import { skillEntryKey } from '../../public/shared/extension-contract.js';
import { resolveSkillInvocation, loadAlwaysSkills, boundedSkillReadOptions, boundSkillFile } from '../../public/shared/skill-invocation.js';
import { prepareNarrativeSkills, runNarrativeSkillLoop, isNarrativeSkillInvocation } from '../../src/native/skill-invocation.js';

const global = { name: 'guide', scope: { kind: 'global' }, installedHash: '1'.repeat(64) };
const work = { ...global, scope: { kind: 'package', packageId: 'work', packageVersionId: 'exact' }, installedHash: '2'.repeat(64) };
const context = { packageId: 'work', packageVersionId: 'exact' };
const settingsFor = (entry, paths) => ({ skills: { [skillEntryKey(entry)]: { paths } } });

describe('shared Skill invocation', () => {
    test.each(['narrative', 'studio', 'agents'])('%s honors exact scope before off, without global resurrection', path => {
        const entries = [global, work, { ...work, scope: { ...work.scope, packageVersionId: 'foreign' } }];
        expect(resolveSkillInvocation(entries, { context, path, settings: settingsFor(work, { [path]: 'off' }) })).toEqual([]);
        expect(resolveSkillInvocation(entries, { context, path })[0].installedHash).toBe('2'.repeat(64));
    });
    test('per-path choices, metadata defaults and folders do not alter identity or scope', () => {
        const settings = settingsFor(work, { narrative: 'always', studio: 'on-demand' });
        settings.skills[skillEntryKey(work)].folderId = 'folder';
        expect(resolveSkillInvocation([work], { context, path: 'agents', settings })).toEqual([]);
        expect(resolveSkillInvocation([work], { context, path: 'narrative', settings })[0].invocationMode).toBe('always');
        expect(resolveSkillInvocation([{ ...global, metadata: { 'atria-paths': 'studio' } }], { path: 'narrative' })).toEqual([]);
        expect(resolveSkillInvocation([work], { path: 'studio', context: { ...context, skillIds: ['other'] } })).toEqual([]);
    });
    test('always cannot override either Agent deny list or the effective visible list', () => {
        const settings = settingsFor(global, { agents: 'always' });
        for (const options of [
            { modeProfile: { skills: { visible: ['*'], deny: ['guide'] } } },
            { agentConfig: { skills: { visible: ['+'], deny: ['guide'] } } },
            { modeProfile: { skills: { visible: [] } } },
        ]) expect(resolveSkillInvocation([global], { path: 'agents', settings, ...options })).toEqual([]);
    });
    test('always reads only resolved instructions and fails on oversized content', async () => {
        const read = jest.fn(async () => ({ content: 'instructions' }));
        const entries = [{ ...global, invocationMode: 'always' }, { ...work, invocationMode: 'on-demand' }];
        const loaded = await loadAlwaysSkills(entries, read);
        expect(read).toHaveBeenCalledTimes(1);
        expect(loaded[0].alwaysContent).toBe('instructions');
        await expect(loadAlwaysSkills(entries, async () => ({ content: 'x'.repeat(32769) }))).rejects.toThrow('budget');
        expect(() => boundedSkillReadOptions({ path: '../private' })).toThrow();
        expect(() => boundedSkillReadOptions({ limit: 201 })).toThrow();
        expect(() => boundSkillFile({ content: 'x'.repeat(32769) })).toThrow();
    });
});

describe('narrative read-only loop', () => {
    test('Task Narrator selection follows Turn/Activity declarations rather than a borrowed model route role', () => {
        const taskPlan = { task: { id: 'prose' }, variant: { id: 'default' } };
        expect(isNarrativeSkillInvocation('narrator', null)).toBe(true);
        expect(isNarrativeSkillInvocation('orchestrator', null)).toBe(false);
        expect(isNarrativeSkillInvocation('narrator', taskPlan, {})).toBe(false);
        expect(isNarrativeSkillInvocation('orchestrator', taskPlan, { experienceContract: { taskRuntime: { turn: { narratorTaskId: 'prose' } } } })).toBe(true);
        expect(isNarrativeSkillInvocation('memory', taskPlan, { experienceContract: { presentationRuntime: {
            activities: [{ narrator: { taskId: 'prose', variantId: 'default' } }],
        } } })).toBe(true);
    });
    function repo() {
        return { list: async () => [global, work], get: async () => work, pin: async opts => ({ version: opts.expectedHash }),
            readFile: jest.fn(async () => ({ content: 'reference', totalLines: 250 })), listFiles: async () => ({ files: [{ path: 'ref.md' }] }) };
    }
    test('supporting reads enforce pinned scope/hash and bounded pagination', async () => {
        const repository = repo();
        const skills = await prepareNarrativeSkills({ repository, context });
        await skills.read({ name: 'atri_skill_read', args: { name: 'guide', path: 'ref.md', offset: 201, limit: 50 } });
        expect(repository.readFile).toHaveBeenCalledWith({ scope: work.scope, name: 'guide', path: 'ref.md', offset: 201, limit: 50, version: work.installedHash });
        await expect(skills.read({ name: 'atri_skill_read', args: { name: 'other' } })).rejects.toThrow('unavailable');
        await expect(skills.read({ name: 'write', args: { name: 'guide' } })).rejects.toThrow('denied');
        repository.get = async () => ({ ...work, installedHash: 'changed' });
        await skills.read({ name: 'atri_skill_read', args: { name: 'guide' } });
        expect(repository.readFile.mock.calls.at(-1)[0].version).toBe(work.installedHash);
    });
    test('only final prose is published; provider state and every budgeted request remain in evidence', async () => {
        const skills = await prepareNarrativeSkills({ repository: repo(), context });
        const call = { id: 'read', name: 'atri_skill_read', args: { name: 'guide' } };
        const execute = jest.fn().mockResolvedValueOnce({ snapshot: { round: 1 }, response: { text: 'consulting', providerState: { signed: true }, toolCalls: [call] } })
            .mockResolvedValueOnce({ snapshot: { round: 2 }, response: { text: 'Final prose', toolCalls: [] } });
        const transcript = []; const onChunk = jest.fn(); const fresh = jest.fn();
        const result = await runNarrativeSkillLoop({ skills, execute, transcript, onChunk, fresh });
        expect(result.skillRounds).toHaveLength(2);
        expect(transcript[0].providerState).toEqual({ signed: true });
        expect(transcript[1]).toMatchObject({ role: 'tool', tool_call_id: 'read' });
        expect(onChunk).toHaveBeenCalledTimes(1);
        expect(onChunk.mock.calls[0][0].text).toBe('Final prose');
        expect(fresh).toHaveBeenCalledTimes(4);
    });
    test('round limit, cancellation and stale anchors stop without publishing prose', async () => {
        const skills = { read: async () => ({ content: 'ok' }) };
        const execute = jest.fn(async () => ({ snapshot: {}, response: { text: '', toolCalls: [{ id: 'a', name: 'atri_skill_read', args: {} }] } }));
        const options = { skills, execute, transcript: [], fresh: async () => {} };
        await expect(runNarrativeSkillLoop(options)).rejects.toThrow('round_limit');
        expect(execute).toHaveBeenCalledTimes(6);
        execute.mockClear();
        await expect(runNarrativeSkillLoop({ ...options, signal: AbortSignal.abort() })).rejects.toThrow();
        await expect(runNarrativeSkillLoop({ ...options, fresh: async () => { throw new Error('stale'); } })).rejects.toThrow('stale');
        expect(execute).not.toHaveBeenCalled();
    });
});

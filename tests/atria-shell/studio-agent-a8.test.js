/** @jest-environment jsdom */
import { serialize, deserialize } from 'node:v8';
globalThis.structuredClone = value => deserialize(serialize(value));

import { skillEntryKey } from '../../public/shared/extension-contract.js';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    buildNativeProjectAgentSystemPrompt,
    mountNativeStudioAgent,
    runNativeStudioAgentTask,
} from '../../public/scripts/native/studio-agent.js';

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return payload; },
    };
}

const projectId = 'project_11111111111111111111111111111111';
const baseRevision = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const taskId = 'agenttask_11111111111111111111111111111111';

function task(status = 'planned') {
    return {
        sequence: 0,
        attempts: [],
        conversation: [{ role: 'user', content: 'Rename the project safely' }],
        taskId,
        projectId,
        intent: 'Rename the project safely',
        status,
        baseRevision,
        plan: status === 'planning' ? null : {
            summary: 'Rename project',
            steps: [{ id: 'step_1', title: 'Rename project', impact: 'low', status: 'pending' }],
        },
        operations: [],
        workspace: null,
        inspection: null,
        validation: null,
        preview: null,
        simulation: null,
        repairRound: 0,
        maxRepairRounds: 3,
        review: status === 'review' ? { required: true, highImpact: false } : null,
        changeSets: [],
        timeline: [],
    };
}

function context(status = 'planned') {
    return {
        task: task(status),
        project: {
            source: {
                project: { projectId, displayName: 'Studio Project' },
                package: { name: 'Studio Work', version: '1.0.0', entryPoints: [] },
            },
            files: [],
            revision: { projectId, revision: baseRevision },
        },
        resources: [],
        registry: {
            descriptors: [{
                resourceType: 'plugin.quest',
                displayName: 'Quest',
                provider: { kind: 'plugin', pluginId: 'example.quest' },
                capabilities: ['read', 'update'],
            }],
        },
        closure: { resources: [] },
        tools: [
            {
                type: 'function',
                function: {
                    name: 'atri_agent_set_plan',
                    parameters: { type: 'object' },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'atri_agent_prepare_review',
                    parameters: { type: 'object' },
                },
            },
        ],
        policy: {
            sourceFallbackOnly: true,
            humanReviewRequired: true,
            silentRebase: false,
            maxRepairRounds: 3,
        },
    };
}

describe('A8 Native Studio Project Agent client', () => {
    let calls;
    let generationRound;

    beforeEach(() => {
        calls = [];
        generationRound = 0;
        globalThis.Atria = {
            getContext: () => ({
                getRequestHeaders: () => ({ 'X-CSRF-Token': 'test' }),
                modelFixture: jest.fn(async options => {
                    calls.push({ type: 'generate', options });
                    generationRound += 1;
                    if (generationRound === 1) {
                        return {
                            assistantText: ' I will first define the project plan. ',
                            providerState: { schemaVersion: 1, checkpointId: 'a'.repeat(64), bindingFingerprint: 'b'.repeat(64), text: ' I will first define the project plan. ', calls: [] },
                            toolCalls: [{
                                raw: { id: 'call_plan' },
                                name: 'atri_agent_set_plan',
                                args: {
                                    summary: 'Rename project',
                                    steps: [{ id: 'step_1', title: 'Rename project', impact: 'low' }],
                                },
                            }],
                        };
                    }
                    return {
                        assistantText: 'The proposal is ready for human review.',
                        toolCalls: [{
                            raw: { id: 'call_review' },
                            name: 'atri_agent_prepare_review',
                            args: {},
                        }],
                    };
                }),
            }),
        };

        globalThis.fetch = jest.fn(async (url, options = {}) => {
            const path = String(url);
            const method = options.method || 'GET';
            const body = options.body ? JSON.parse(options.body) : null;
            calls.push({ type: 'fetch', path, method, body });
            if (path === '/api/native/generation/execute') {
                const result = await globalThis.Atria.getContext().modelFixture(body);
                return response({ response: result, snapshot: { runtimeRouteId: 'route_fixture' } });
            }

            if (path.endsWith('/resume')) return response(task());
            if (path.endsWith('/generation/begin')) return response({ ...task(), attempts: [{ attemptId: 'attempt_fixture' }] });
            if (path.endsWith('/generation/finish')) return response({ ...task(calls.some(item => item.body?.name === 'atri_agent_prepare_review') ? 'review' : 'planned'), conversation: body.conversation });
            if (path.endsWith(`/projects/${projectId}/preflight`) && method === 'POST') {
                return response({
                    projectId,
                    revision: { projectId, revision: baseRevision },
                    manifest: { packageId: 'package_test' },
                    packageVersion: { packageVersionId: 'packageVersion_test' },
                    preflight: { requiredPermissions: [] },
                });
            }
            if (path === '/api/native/extensions/settings') return response({ value: { skills: {} } });
            if (path === '/api/skills?scope=all') {
                return response([{
                    name: 'project-guidance',
                    installedHash: 'c'.repeat(64),
                    description: 'Project-specific authoring guidance',
                    scope: { kind: 'project', projectId },
                }]);
            }
            if (path.startsWith('/api/skills/') && path.endsWith('/pin')) return response({ version: body.expectedHash });
            if (path.endsWith(`/projects/${projectId}/agent/tasks/${taskId}/context`)) {
                const reviewPosted = calls.some(item => (
                    item.type === 'fetch'
                    && item.path.endsWith('/tool')
                    && item.body?.name === 'atri_agent_prepare_review'
                ));
                return response(context(reviewPosted ? 'review' : 'planned'));
            }
            if (path.endsWith(`/projects/${projectId}/agent/tasks/${taskId}`) && method === 'GET') {
                const reviewPosted = calls.some(item => (
                    item.type === 'fetch'
                    && item.path.endsWith('/tool')
                    && item.body?.name === 'atri_agent_prepare_review'
                ));
                return response(task(reviewPosted ? 'review' : 'planned'));
            }
            if (path.endsWith('/tool') && method === 'POST') {
                return response(task(body.name === 'atri_agent_prepare_review' ? 'review' : 'planned'));
            }
            if (path.endsWith(`/projects/${projectId}/agent/tasks`) && method === 'GET') {
                return response([]);
            }
            throw new Error('Unexpected request ' + method + ' ' + path);
        });
    });

    afterEach(() => {
        delete globalThis.Atria;
        delete globalThis.fetch;
    });

    test('system prompt treats Task/Workspace/ChangeSet as authority and exposes plugin + Skill context', () => {
        const prompt = buildNativeProjectAgentSystemPrompt(context(), [{
            name: 'project-guidance',
            description: 'Know-how',
            scope: { kind: 'project', projectId },
        }]);
        expect(prompt).toContain('Intent → Plan → Workspace → Operations → ChangeSet → Validate → Simulate / Preview → Review → Commit');
        expect(prompt).toContain('You cannot commit');
        expect(prompt).toContain(baseRevision);
        expect(prompt).toContain('plugin.quest');
        expect(prompt).toContain('project-guidance');
        expect(prompt).toContain('source.write/move/delete are low-level fallback only');
    });

    test('model tool loop stops at Review and never calls Commit by itself', async () => {
        const result = await runNativeStudioAgentTask({
            projectId,
            taskId,
            messages: [{ role: 'user', content: 'Rename the project safely' }],
        });

        expect(result.task.status).toBe('review');
        expect(calls.filter(item => item.type === 'generate')).toHaveLength(2);
        const secondRequest = calls.filter(item => item.type === 'fetch' && item.path === '/api/native/generation/execute')[1].body;
        expect(secondRequest.messages).toContainEqual(expect.objectContaining({ role: 'assistant', content: ' I will first define the project plan. ',
            providerState: expect.objectContaining({ checkpointId: 'a'.repeat(64) }) }));
        expect(calls.filter(item => item.type === 'fetch' && item.path.endsWith('/tool')).map(item => item.body.name))
            .toEqual(['atri_agent_set_plan', 'atri_agent_prepare_review']);
        expect(calls.some(item => item.type === 'fetch' && item.path.endsWith('/commit'))).toBe(false);

        const firstGeneration = calls.find(item => item.type === 'generate');
        expect(firstGeneration.options.role).toBe('studio');
        expect(firstGeneration.options.revision).toBe(baseRevision);
        expect(firstGeneration.options.tools.some(item => item.function.name === 'atri_agent_read_skill')).toBe(true);
        expect(firstGeneration.options.tools.some(item => item.function.name.includes('commit'))).toBe(false);
    });

    test('G04 changed authoritative Task prompt resets native state into public tool observations', async () => {
        const fetchOriginal = globalThis.fetch;
        globalThis.fetch = jest.fn(async (url, options = {}) => {
            if (String(url).endsWith('/context')) {
                const planPosted = calls.some(item => item.path?.endsWith('/tool') && item.body?.name === 'atri_agent_set_plan');
                return response(context(planPosted ? 'planned' : 'planning'));
            }
            return fetchOriginal(url, options);
        });
        const updates = [];
        await runNativeStudioAgentTask({ projectId, taskId, onUpdate: value => updates.push(value) });
        const second = calls.filter(item => item.type === 'fetch' && item.path === '/api/native/generation/execute')[1].body;
        expect(second.messages.some(message => message.providerState)).toBe(false);
        expect(second.messages.some(message => message.role === 'user' && message.content.startsWith('Previous tool observation'))).toBe(true);
        expect(updates.some(value => value.continuation?.reason === 'semantic_prefix_changed')).toBe(true);
    });

    test('AI panel can mount while generation is unavailable without mutating the project', async () => {
        globalThis.Atria = {
            getContext: () => ({
                getRequestHeaders: () => ({ 'X-CSRF-Token': 'test' }),
            }),
        };
        document.body.innerHTML = '<aside id="ai"></aside>';
        const slot = document.getElementById('ai');
        const logs = [];
        const controller = mountNativeStudioAgent({
            document,
            slot,
            projectId,
            getRevision: () => ({ revision: baseRevision }),
            onLog: (...args) => logs.push(args),
        });
        await Promise.resolve();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(slot.dataset.atriaStudioAi).toBe('agent');
        expect(slot.textContent).toContain('Project Agent');
        expect(slot.textContent).toContain('AI is optional');
        expect(calls.some(item => item.type === 'fetch' && /workspaces\/execute|\/commit/.test(item.path))).toBe(false);
        controller.dispose();
    });
    test('Studio applies path preferences and reads scoped supporting files through the actual tool loop', async () => {
        const original = globalThis.fetch;
        const always = { name: 'always-guide', installedHash: 'c'.repeat(64), scope: { kind: 'project', projectId }, description: 'Always instructions' };
        const demand = { name: 'reference-guide', installedHash: 'd'.repeat(64), scope: { kind: 'global' }, description: 'Reference instructions' };
        const hidden = { name: 'agents-only', scope: { kind: 'global' }, metadata: { 'atria-paths': 'agents' } };
        let round = 0; const prompts = []; const reads = [];
        globalThis.fetch = jest.fn(async (url, options = {}) => {
            const path = String(url);
            if (path === '/api/skills?scope=all') return response([always, demand, hidden]);
            if (path === '/api/native/extensions/settings') return response({ value: { skills: {
                [skillEntryKey(always)]: { paths: { studio: 'always', narrative: 'off' } },
            } } });
            if (path.startsWith('/api/skills/')) {
                if (path.endsWith('/pin')) return response({ version: JSON.parse(options.body).expectedHash });
                reads.push(path);
                return response({ content: path.includes('ref.md') ? 'Supporting reference' : 'LOADED ALWAYS', totalLines: 205 });
            }
            if (path === '/api/native/generation/execute') {
                prompts.push(JSON.parse(options.body)); round++;
                return response({ response: round === 1 ? { text: '', toolCalls: [{ id: 'r', name: 'atri_agent_read_skill', args: { name: demand.name, path: 'ref.md', offset: 201, limit: 5 } }] }
                    : { assistantText: 'Done', toolCalls: [] }, snapshot: {} });
            }
            return original(url, options);
        });
        await runNativeStudioAgentTask({ projectId, taskId });
        expect(prompts[0].messages[0].content).toContain('LOADED ALWAYS');
        expect(prompts[0].messages[0].content).toContain('reference-guide');
        expect(prompts[0].messages[0].content).not.toContain('agents-only');
        expect(reads).toHaveLength(2);
        expect(reads[1]).toContain('global/reference-guide/file?path=ref.md&offset=201&limit=5');
        expect(prompts[1].messages.at(-1).content).toContain('Supporting reference');
    });

    test('Studio off paths cannot be read by naming them directly', async () => {
        const original = globalThis.fetch;
        globalThis.fetch = jest.fn(async (url, options = {}) => {
            if (String(url) === '/api/native/extensions/settings') return response({ value: { skills: {
                [skillEntryKey({ name: 'project-guidance', scope: { kind: 'project', projectId } })]: { paths: { agents: 'always' } },
            } } });
            if (String(url) === '/api/native/generation/execute') return response({ response: { toolCalls: [
                { id: 'r', name: 'atri_agent_read_skill', args: { name: 'project-guidance' } },
            ] }, snapshot: {} });
            return original(url, options);
        });
        await expect(runNativeStudioAgentTask({ projectId, taskId })).rejects.toThrow('not available');
    });

    test('Agent Commit is blocked by a human draft and a committed Task cannot be replayed after a list failure', async () => {
        let committed = false; const commit = jest.fn(); const notify = jest.fn(); const projectCommitted = jest.fn();
        globalThis.fetch = jest.fn(async (url, options = {}) => {
            if (String(url).endsWith('/commit')) { commit(); committed = true; return response(task('completed')); }
            if (String(url).endsWith('/agent/tasks')) return committed ? response({ message: 'List unavailable' }, 503) : response([task('review')]);
            if (String(url).endsWith('/' + taskId)) return response(task(committed ? 'completed' : 'review'));
            throw new Error('Unexpected ' + url);
        });
        document.body.innerHTML = '<aside id="ai"></aside>'; const slot = document.getElementById('ai');
        const beforeCommit = jest.fn(() => false);
        const controller = mountNativeStudioAgent({ document, slot, projectId, getRevision: () => ({ revision: baseRevision }), beforeCommit, onTaskState: notify, onProjectCommitted: projectCommitted });
        const flush = () => new Promise(resolve => setTimeout(resolve, 0)); await flush();
        const select = slot.querySelector('select'); select.value = taskId; select.dispatchEvent(new Event('change')); await flush();
        const button = () => [...slot.querySelectorAll('button')].find(node => node.textContent === 'Review & Commit');
        button().click(); await flush(); expect(commit).not.toHaveBeenCalled();
        beforeCommit.mockReturnValue(true); button().click(); await flush();
        expect(commit).toHaveBeenCalledTimes(1); expect(projectCommitted).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls.at(-1)[0].status).toBe('completed'); expect(button()).toBeUndefined();
        expect(slot.querySelector('[role="alert"]')).not.toBeNull(); controller.dispose();
    });

    test('failed Commit response reconciles completion and refreshes the Project once', async () => {
        let committed = false; const commit = jest.fn();
        const refresh = jest.fn(async () => { throw new Error('Refresh unavailable'); });
        globalThis.fetch = jest.fn(async url => {
            if (String(url).endsWith('/commit')) { committed = true; commit(); return response({ error: 'native_studio_failed' }, 500); }
            if (String(url).endsWith('/agent/tasks')) return response([task(committed ? 'completed' : 'review')]);
            if (String(url).endsWith('/' + taskId)) return response(task(committed ? 'completed' : 'review'));
            throw new Error('Unexpected request');
        });
        document.body.innerHTML = '<aside id="ai"></aside>'; const slot = document.getElementById('ai');
        const controller = mountNativeStudioAgent({ document, slot, projectId, getRevision: () => ({ revision: baseRevision }), onProjectCommitted: refresh });
        const flush = () => new Promise(resolve => setTimeout(resolve, 0)); await flush();
        const select = slot.querySelector('select'); select.value = taskId; select.dispatchEvent(new Event('change')); await flush();
        [...slot.querySelectorAll('button')].find(node => node.textContent === 'Review & Commit').click(); await flush();
        expect(commit).toHaveBeenCalledTimes(1); expect(refresh).toHaveBeenCalledTimes(1);
        expect(slot.textContent).toContain('completed'); expect(slot.querySelector('[role="alert"]').textContent).toBe('Refresh unavailable');
        expect([...slot.querySelectorAll('button')].some(node => node.textContent === 'Review & Commit')).toBe(false);
        controller.dispose();
    });

});

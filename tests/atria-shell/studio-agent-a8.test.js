/** @jest-environment jsdom */

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
                            providerState: { binding: { provider: 'anthropic', connectionProfileId: 'exact-connection', model: 'exact-model' }, content: [{ type: 'thinking', signature: 'signed-tool-round' }] },
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

            if (path.endsWith(`/projects/${projectId}/preflight`) && method === 'POST') {
                return response({
                    projectId,
                    revision: { projectId, revision: baseRevision },
                    manifest: { packageId: 'package_test' },
                    packageVersion: { packageVersionId: 'packageVersion_test' },
                    preflight: { requiredPermissions: [] },
                });
            }
            if (path === '/api/skills?scope=all') {
                return response([{
                    name: 'project-guidance',
                    description: 'Project-specific authoring guidance',
                    scope: { kind: 'project', projectId },
                }]);
            }
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
            providerState: expect.objectContaining({ content: [{ type: 'thinking', signature: 'signed-tool-round' }] }) }));
        expect(calls.filter(item => item.type === 'fetch' && item.path.endsWith('/tool')).map(item => item.body.name))
            .toEqual(['atri_agent_set_plan', 'atri_agent_prepare_review']);
        expect(calls.some(item => item.type === 'fetch' && item.path.endsWith('/commit'))).toBe(false);

        const firstGeneration = calls.find(item => item.type === 'generate');
        expect(firstGeneration.options.role).toBe('studio');
        expect(firstGeneration.options.revision).toBe(baseRevision);
        expect(firstGeneration.options.tools.some(item => item.function.name === 'atri_agent_read_skill')).toBe(true);
        expect(firstGeneration.options.tools.some(item => item.function.name.includes('commit'))).toBe(false);
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
});

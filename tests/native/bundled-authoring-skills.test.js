import { beforeAll, afterAll, test, expect } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, posix } from 'node:path';
import { importBundledSkills } from '../../src/skills/bundled.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { resolveSkillInvocation } from '../../public/shared/skill-invocation.js';
import { listAuthoringReferences, readAuthoringReference } from '../../src/native/authoring-reference.js';
import { compileFrontend } from '../../src/native/frontend/compiler.js';
import { runNativeStudioAgentTask } from '../../public/scripts/native/studio-agent.js';
import { runStudioScenario } from '../../src/native/studio-scenario.js';
import { createGitClient } from '../../src/git/client.js';
import { AssetStore, KnowledgeRepo, ProjectAgentService, ProjectStore, StudioPreviewHost, StudioService, WorldRepo } from '../../src/native/index.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

const names = ['atri-native-work-authoring', 'atri-native-ui-authoring', 'atri-native-runtime-authoring', 'atri-native-world-authoring', 'atri-native-verification'];
const defaultRoot = fileURLToPath(new URL('../../default', import.meta.url));
const scope = { kind: 'global' };
let h, repository;
beforeAll(async () => {
    h = await makeTempFsEngine(); repository = createSkillRepository(join(h.dataRoot, h.handle));
    await importBundledSkills({ defaultRoot, repository });
});
afterAll(async () => { await h?.cleanup(); });

test.each(names)('%s installs with resolvable, bounded supporting files and path defaults', async name => {
    const entry = await repository.get(name, scope);
    expect(entry.metadata['atria-paths']).toBe('studio,agents');
    for (const path of ['studio', 'agents']) expect(resolveSkillInvocation([entry], { path })[0].invocationMode).toBe('on-demand');
    expect(resolveSkillInvocation([entry], { path: 'narrative' })).toEqual([]);
    expect(resolveSkillInvocation([entry], { path: 'agents', agentConfig: { skills: { deny: [name] } } })).toEqual([]);
    const files = await repository.listFiles({ scope, name });
    for (const file of files.filter(item => item.path.endsWith('.md'))) {
        const { content } = await repository.readFile({ scope, name, path: file.path, offset: 1, limit: 200 });
        expect(content.length).toBeLessThan(12000);
        for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
            const target = posix.normalize(posix.join(posix.dirname(file.path), match[1]));
            expect(files.map(item => item.path)).toContain(target);
            expect((await repository.readFile({ scope, name, path: target })).content.length).toBeGreaterThan(0);
        }
    }
});

test('all referenced catalog topics are current readable contracts', async () => {
    const ids = ['project', 'package', 'capabilities', 'ui-document', 'ui-actions', 'messages', 'tasks', 'lifecycle', 'presentation', 'information', 'content', 'continuity', 'shared', 'scenario'];
    const catalog = listAuthoringReferences();
    for (const id of ids) {
        expect(catalog.references.some(item => item.id === id)).toBe(true);
        expect((await readAuthoringReference({ id, limit: 200 })).content.length).toBeGreaterThan(0);
    }
});

test('mocked Studio model reads references, proposes compiler-valid v3 and reaches real Review without committing', async () => {
    const example = async (name, file) => JSON.parse(await readFile(join(defaultRoot, 'skills/global', name, 'examples', file), 'utf8'));
    const source = await example(names[0], 'project.json');
    const ui = (await readAuthoringReference({ id: 'example-frontend-v3' })).content;
    const aui = (await readAuthoringReference({ id: 'example-aui-v3' })).content;
    const scenario = await example(names[4], 'scenario.json');
    expect(compileFrontend({ source: 'frontend.json', files: new Map([['frontend.json', Buffer.from(ui)], ['Main.aui', Buffer.from(aui)]]), mode: 'component' }).entry).toContain('index.json');
    const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
    const studio = new StudioService({ projectStore, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend: 'builtin' }),
        previewHost: new StudioPreviewHost(), simulationRunner: runStudioScenario });
    const agent = new ProjectAgentService({ studio });
    const created = await studio.createProject(h.handle, source);
    const projectId = source.project.projectId;
    const task = await agent.createTask(h.handle, projectId, { intent: 'Create a local UI using the bundled Native authoring Skill', baseRevision: created.revision.revision });
    const next = structuredClone(source); next.package.capabilities.push('game-runtime');
    next.package.runtime = { experience: { mode: 'component', frontend: { kind: 'native', version: 3, source: 'frontend.json' } } };
    const rounds = [
        [['atri_agent_list_skills', {}], ['atri_agent_skill_files', { name: names[1] }]],
        [['atri_agent_read_skill', { name: names[1], path: 'references/ui.md' }], ['atri_agent_read_skill', { name: names[1], path: 'examples/ui.json' }], ['atri_agent_api_catalog', { query: 'ui' }]],
        [['atri_agent_api_read', { id: 'frontend' }], ['atri_agent_set_plan', { summary: 'Add local UI', steps: [{ id: 'ui', title: 'Add local UI', impact: 'low' }] }]],
        [['atri_agent_project_save', { source: next, stepId: 'ui' }], ['atri_agent_source_write', { path: 'frontend.json', content: ui, encoding: 'utf8', stepId: 'ui' }], ['atri_agent_source_write', { path: 'Main.aui', content: aui, encoding: 'utf8', stepId: 'ui' }]],
        [['atri_agent_prepare_review', { simulationOptions: { scenario } }]],
    ];
    const previousFetch = globalThis.fetch, previousAtria = globalThis.Atria;
    let generationCalls = 0;
    const reads = [];
    globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
    globalThis.fetch = async (url, options = {}) => {
        const address = new URL(url, 'http://fixture'); const body = options.body ? JSON.parse(options.body) : {};
        let result;
        if (address.pathname === '/api/native/generation/execute') {
            const calls = rounds[generationCalls++]; if (!calls) throw new Error('Unexpected model round');
            result = { response: { assistantText: '', toolCalls: calls.map(([name, args], index) => ({ id: 'call_' + generationCalls + '_' + index, name, args })) } };
        } else if (address.pathname === '/api/skills') result = await repository.list({ scope: 'all' });
        else if (address.pathname === '/api/native/extensions/settings') result = { value: { schemaVersion: 1, folders: [], skills: {} } };
        else if (address.pathname.startsWith('/api/skills/global/')) {
            const [, , , , name, operation] = address.pathname.split('/');
            if (operation === 'files') result = { files: await repository.listFiles({ scope, name }) };
            else { const path = address.searchParams.get('path'); reads.push(path); result = await repository.readFile({ scope, name, path, offset: Number(address.searchParams.get('offset')), limit: Number(address.searchParams.get('limit')) }); }
        } else if (address.pathname.endsWith('/context')) result = await agent.getContext(h.handle, projectId, task.taskId);
        else if (address.pathname.endsWith('/preflight')) result = await studio.preflightProject(h.handle, projectId, body);
        else if (address.pathname.endsWith('/tool')) result = await agent.executeTool(h.handle, projectId, task.taskId, body);
        else if (address.pathname.endsWith('/' + task.taskId)) result = agent.getTask(h.handle, projectId, task.taskId);
        else throw new Error('Unexpected request: ' + url);
        return { ok: true, json: async () => result };
    };
    try {
        const result = await runNativeStudioAgentTask({ projectId, taskId: task.taskId });
        expect(reads).toEqual(['references/ui.md', 'examples/ui.json']);
        expect(result.task.status).toBe('review');
        expect(result.task.validation.status).toBe('passed');
        expect(result.task.simulation.status).toBe('completed');
        expect(result.task.simulation.result).toMatchObject({ status: 'passed', providerCalls: 0, persisted: false });
        expect(generationCalls).toBe(5);
        expect((await studio.getProject(h.handle, projectId)).source.package.runtime).toBeUndefined();
    } finally { globalThis.fetch = previousFetch; globalThis.Atria = previousAtria; }
}, 30000);

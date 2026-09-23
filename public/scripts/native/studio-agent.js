import { executeNativeGeneration } from './generation-client.js';
import { nativeStudioClient } from './studio-client.js';

const MAX_MODEL_ROUNDS = 12;
const STOP_STATES = new Set(['review', 'blocked', 'conflict', 'taken_over', 'completed']);
const SKILL_TOOL_NAMES = new Set(['atri_agent_list_skills', 'atri_agent_read_skill']);

function clone(value) {
    return value == null ? value : structuredClone(value);
}

function requestHeaders() {
    return globalThis.Atria?.getContext?.()?.getRequestHeaders?.() || {};
}

function scopePath(scope) {
    if (scope?.kind === 'global') return 'global';
    if (scope?.kind === 'project') return `project/${scope.projectId}`;
    if (scope?.kind === 'package') return `package/${scope.packageId}/${scope.packageVersionId}`;
    return null;
}

async function listNativeSkills(projectId, packageRef = null) {
    const response = await fetch('/api/skills?scope=all', { headers: requestHeaders() });
    if (!response.ok) return [];
    const payload = await response.json();
    const entries = Array.isArray(payload) ? payload : (payload?.entries || []);
    return entries.filter(entry => {
        if (entry?.scope?.kind === 'global') return true;
        if (entry?.scope?.kind === 'project') return entry.scope.projectId === projectId;
        if (entry?.scope?.kind === 'package' && packageRef?.packageVersionId) {
            return entry.scope.packageId === packageRef.packageId
                && entry.scope.packageVersionId === packageRef.packageVersionId;
        }
        return false;
    });
}

function resolvedSkillInventory(entries) {
    const score = entry => (
        entry?.scope?.kind === 'package' ? 3
            : entry?.scope?.kind === 'project' ? 2
                : entry?.scope?.kind === 'global' ? 1 : 0
    );
    const merged = new Map();
    for (const entry of entries) {
        const current = merged.get(entry.name);
        if (!current || score(entry) >= score(current)) merged.set(entry.name, entry);
    }
    return [...merged.values()].sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

async function readNativeSkill(entries, name) {
    const entry = resolvedSkillInventory(entries).find(item => item.name === name);
    if (!entry) throw new Error('Native Skill is not available in the current project scope: ' + name);
    const encodedScope = scopePath(entry.scope);
    if (!encodedScope) throw new Error('Native Skill does not use an A5 Native scope');
    const response = await fetch(
        `/api/skills/${encodeURIComponent(encodedScope)}/${encodeURIComponent(entry.name)}/file?path=SKILL.md&limit=12000`,
        { headers: requestHeaders() },
    );
    if (!response.ok) throw new Error('Native Skill read failed (' + response.status + ')');
    return response.json();
}

function skillTools() {
    return [
        {
            type: 'function',
            function: {
                name: 'atri_agent_list_skills',
                description: 'List A5 Native Skills resolved for this project. Read-only; use Skills for know-how, not project state.',
                parameters: { type: 'object', properties: {}, additionalProperties: false },
            },
        },
        {
            type: 'function',
            function: {
                name: 'atri_agent_read_skill',
                description: 'Read the resolved SKILL.md for one A5 Native Skill by name. Read-only.',
                parameters: {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                    required: ['name'],
                    additionalProperties: false,
                },
            },
        },
    ];
}

function summarizeSkills(entries) {
    return resolvedSkillInventory(entries).map(entry => ({
        name: entry.name,
        scope: entry.scope,
        description: entry.description || entry.frontmatter?.description || '',
    }));
}

function pluginResourceDescriptors(context) {
    return (context?.registry?.descriptors || [])
        .filter(item => item.provider?.kind === 'plugin')
        .map(item => ({
            resourceType: item.resourceType,
            displayName: item.displayName,
            pluginId: item.provider.pluginId,
            capabilities: item.capabilities,
        }));
}

export function buildNativeProjectAgentSystemPrompt(context, skillEntries = []) {
    const task = context.task;
    const project = context.project;
    const skills = summarizeSkills(skillEntries);
    const plugins = pluginResourceDescriptors(context);
    return [
        'You are the Atria Project Agent operating inside Native Studio.',
        'The Project Task, Plan, Workspace, Authoring Operations, ChangeSet and Project revision are authoritative. Conversation text is only an auxiliary interface.',
        '',
        'Required lifecycle: Intent → Plan → Workspace → Operations → ChangeSet → Validate → Simulate / Preview → Review → Commit.',
        'You cannot commit. Stop at Review; the human performs Commit from Studio.',
        'Every write is only a proposal. The server forces origin.kind="agent", pins the Task baseRevision, and routes writes through StudioService.',
        'Never request a silent rebase. If the Project revision changes, stop at the conflict boundary and let the human decide.',
        'Prefer structured/domain Authoring Operations. source.write/move/delete are low-level fallback only.',
        'Library relationships must use exact revisions. Never invent or resolve "latest".',
        'Use A2 Resource Graph tools for discovery/references/dependency closure, A5 Skills for know-how, and plugin-defined Resource Registry descriptors when relevant.',
        'Before proposing writes, call atri_agent_set_plan once with concrete semantic steps.',
        'When your proposed operation set is coherent, call atri_agent_prepare_review. That dry-runs the Workspace, validates it and inspects Native Preview/simulation without committing.',
        'If validation/evaluation fails and Task status is repair, diagnose the diagnostics, call atri_agent_reset_operations, propose a corrected set, then call prepare_review again. Repair rounds are bounded by server policy.',
        'High-impact edits still stop at the same human Review gate.',
        '',
        'Task intent:',
        String(task.intent || ''),
        '',
        'Pinned baseRevision:',
        String(task.baseRevision || ''),
        '',
        'Current Project summary:',
        JSON.stringify({
            project: project?.source?.project || null,
            package: {
                name: project?.source?.package?.name || null,
                version: project?.source?.package?.version || null,
                entryPoints: project?.source?.package?.entryPoints || [],
            },
            files: project?.files || [],
        }),
        '',
        'Plugin authoring resource contributions:',
        JSON.stringify(plugins),
        '',
        'Resolved Native Skill inventory (read with atri_agent_read_skill only when useful):',
        JSON.stringify(skills),
    ].join('\n');
}

function normalizeToolCalls(result) {
    return (Array.isArray(result?.toolCalls) ? result.toolCalls : [])
        .map((call, index) => ({
            id: String(call?.raw?.id || call?.id || `agent_call_${Date.now()}_${index}`),
            name: String(call?.name || '').trim(),
            args: call?.args && typeof call.args === 'object' ? call.args : {},
        }))
        .filter(call => call.name);
}

function assistantToolMessage(text, calls) {
    return {
        role: 'assistant',
        content: text || '',
        tool_calls: calls.map(call => ({
            id: call.id,
            type: 'function',
            function: {
                name: call.name,
                arguments: JSON.stringify(call.args || {}),
            },
        })),
    };
}

function toolResultMessage(call, result) {
    return {
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify(result),
    };
}

async function executeModelTool(projectId, taskId, call, skillEntries) {
    if (call.name === 'atri_agent_list_skills') {
        return { skills: summarizeSkills(skillEntries) };
    }
    if (call.name === 'atri_agent_read_skill') {
        return readNativeSkill(skillEntries, String(call.args?.name || ''));
    }
    return nativeStudioClient.executeAgentTool(projectId, taskId, {
        name: call.name,
        args: call.args || {},
    });
}

export async function runNativeStudioAgentTask({
    projectId,
    taskId,
    messages = [],
    onUpdate = () => {},
    abortSignal = undefined,
    maxModelRounds = MAX_MODEL_ROUNDS,
}) {
    let context = await nativeStudioClient.getAgentContext(projectId, taskId);
    const preflight = await nativeStudioClient.preflight(
        projectId,
        context.task.baseRevision,
    ).catch(() => null);
    const packageRef = preflight?.packageVersion?.packageVersionId
        ? {
            packageId: preflight.manifest?.packageId || context.project?.source?.project?.packageId,
            packageVersionId: preflight.packageVersion.packageVersionId,
        }
        : null;
    const skillEntries = await listNativeSkills(projectId, packageRef).catch(() => []);
    const transcript = [...messages];
    if (!transcript.length) transcript.push({ role: 'user', content: context.task.intent });

    for (let round = 0; round < maxModelRounds; round += 1) {
        if (abortSignal?.aborted) throw new Error('Project Agent request aborted');
        context = await nativeStudioClient.getAgentContext(projectId, taskId);
        if (STOP_STATES.has(context.task.status)) {
            onUpdate({ task: context.task, messages: transcript });
            return { task: context.task, messages: transcript };
        }

        const tools = [...(context.tools || []), ...skillTools()];
        const allowed = new Set(tools.map(item => item.function.name));
        const result = await executeNativeGeneration({
            role: 'studio',
            source: { projectId, taskId, revision: context.task.baseRevision },
            messages: [
                { role: 'system', content: buildNativeProjectAgentSystemPrompt(context, skillEntries) },
                ...transcript,
            ],
            tools,
            abortSignal,
        });

        const text = String(result?.assistantText || '').trim();
        const calls = normalizeToolCalls(result).filter(call => allowed.has(call.name));
        if (!calls.length) {
            if (text) transcript.push({ role: 'assistant', content: text });
            onUpdate({ task: context.task, messages: transcript });
            return { task: context.task, messages: transcript };
        }

        transcript.push(assistantToolMessage(text, calls));
        for (const call of calls) {
            if (abortSignal?.aborted) throw new Error('Project Agent request aborted');
            const toolResult = await executeModelTool(projectId, taskId, call, skillEntries);
            transcript.push(toolResultMessage(call, toolResult));
            if (!SKILL_TOOL_NAMES.has(call.name)) {
                const task = toolResult?.taskId ? toolResult : await nativeStudioClient.getAgentTask(projectId, taskId);
                onUpdate({ task, messages: transcript, toolCall: call, toolResult });
                if (STOP_STATES.has(task.status)) return { task, messages: transcript };
            } else {
                onUpdate({ task: context.task, messages: transcript, toolCall: call, toolResult });
            }
        }
    }

    const task = await nativeStudioClient.getAgentTask(projectId, taskId);
    return { task, messages: transcript };
}

function node(documentRef, tag, className = '') {
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    return element;
}

function actionButton(documentRef, label, handler, { primary = false, disabled = false } = {}) {
    const button = node(documentRef, 'button', 'menu_button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    if (primary) button.dataset.variant = 'primary';
    button.addEventListener('click', handler);
    return button;
}

function formatTaskStatus(task) {
    if (!task) return 'No active task';
    return `${task.status} · repair ${task.repairRound}/${task.maxRepairRounds}`;
}

function renderPlan(documentRef, task) {
    const section = node(documentRef, 'section', 'atria-project-agent-plan');
    const heading = node(documentRef, 'h4');
    heading.textContent = 'Plan';
    section.append(heading);
    if (!task?.plan?.steps?.length) {
        const empty = node(documentRef, 'p');
        empty.textContent = 'No plan yet.';
        section.append(empty);
        return section;
    }
    const list = node(documentRef, 'ol');
    for (const step of task.plan.steps) {
        const item = node(documentRef, 'li');
        item.dataset.status = step.status;
        item.textContent = `${step.title} · ${step.status} · ${step.impact}`;
        list.append(item);
    }
    section.append(list);
    return section;
}

function renderConversation(documentRef, messages) {
    const section = node(documentRef, 'section', 'atria-project-agent-conversation');
    section.dataset.auxiliary = 'true';
    for (const message of messages.slice(-24)) {
        if (message.role === 'tool') continue;
        const row = node(documentRef, 'div', 'atria-project-agent-message');
        row.dataset.role = message.role;
        row.textContent = String(message.content || '').trim() || (message.tool_calls?.length ? 'Working with Project tools…' : '');
        if (row.textContent) section.append(row);
    }
    return section;
}

export function mountNativeStudioAgent({
    document: documentRef,
    slot,
    projectId,
    getRevision,
    onProjectCommitted = async () => {},
    onTaskState = () => {},
    onLog = () => {},
}) {
    let disposed = false;
    let activeTask = null;
    let tasks = [];
    let messages = [];
    let running = false;
    let controller = null;

    const notifyTask = () => {
        if (activeTask) onTaskState(clone(activeTask));
    };

    slot.dataset.atriaStudioAi = 'agent';
    slot.classList.add('atria-project-agent');

    const render = () => {
        if (disposed) return;
        slot.replaceChildren();
        const header = node(documentRef, 'header', 'atria-project-agent-header');
        const title = node(documentRef, 'div');
        const h3 = node(documentRef, 'h3');
        h3.textContent = 'Project Agent';
        const status = node(documentRef, 'span');
        status.textContent = formatTaskStatus(activeTask);
        title.append(h3, status);
        header.append(title);

        const taskSelect = node(documentRef, 'select');
        taskSelect.setAttribute('aria-label', 'Project Tasks');
        const blank = node(documentRef, 'option');
        blank.value = '';
        blank.textContent = 'Project Tasks';
        taskSelect.append(blank);
        for (const task of tasks) {
            const option = node(documentRef, 'option');
            option.value = task.taskId;
            option.textContent = `${task.intent.slice(0, 44)} · ${task.status}`;
            option.selected = task.taskId === activeTask?.taskId;
            taskSelect.append(option);
        }
        taskSelect.addEventListener('change', async () => {
            if (!taskSelect.value) return;
            activeTask = await nativeStudioClient.getAgentTask(projectId, taskSelect.value);
            messages = [{ role: 'user', content: activeTask.intent }];
            notifyTask();
            render();
        });
        header.append(taskSelect);
        slot.append(header);

        if (!activeTask) {
            const form = node(documentRef, 'div', 'atria-project-agent-new-task');
            const input = node(documentRef, 'textarea');
            input.placeholder = 'Describe the project change you want…';
            input.setAttribute('aria-label', 'Project Agent intent');
            const create = actionButton(documentRef, 'Create Task', async () => {
                const intent = input.value.trim();
                if (!intent || running) return;
                running = true;
                render();
                try {
                    const revision = getRevision();
                    activeTask = await nativeStudioClient.createAgentTask(projectId, {
                        intent,
                        baseRevision: revision?.revision,
                    });
                    tasks = await nativeStudioClient.listAgentTasks(projectId);
                    messages = [{ role: 'user', content: intent }];
                    notifyTask();
                    onLog('agent', 'Created Project Task', activeTask);
                    running = false;
                    await continueTask();
                } catch (error) {
                    onLog('error', error?.message || String(error), error?.details);
                } finally {
                    running = false;
                    render();
                }
            }, { primary: true, disabled: running });
            form.append(input, create);
            const note = node(documentRef, 'p');
            note.textContent = 'AI is optional. Human Studio editing remains fully available when Project Agent is unused or unavailable.';
            form.append(note);
            slot.append(form);
            return;
        }

        slot.append(renderPlan(documentRef, activeTask));

        const progress = node(documentRef, 'section', 'atria-project-agent-progress');
        const progressTitle = node(documentRef, 'h4');
        progressTitle.textContent = 'Progress';
        const pre = node(documentRef, 'pre');
        pre.textContent = JSON.stringify({
            taskId: activeTask.taskId,
            baseRevision: activeTask.baseRevision,
            operations: activeTask.operations?.length || 0,
            changes: activeTask.inspection?.changes || [],
            validation: activeTask.validation || null,
            preview: activeTask.preview ? {
                previewId: activeTask.preview.previewId,
                experience: activeTask.preview.experience,
            } : null,
            simulation: activeTask.simulation || null,
            review: activeTask.review || null,
            history: (activeTask.timeline || []).slice(-8).map(item => ({
                type: item.type,
                at: item.at,
            })),
        }, null, 2);
        progress.append(progressTitle, pre);
        slot.append(progress, renderConversation(documentRef, messages));

        const actions = node(documentRef, 'div', 'atria-project-agent-actions');
        if (!STOP_STATES.has(activeTask.status) || activeTask.status === 'review') {
            actions.append(actionButton(documentRef, running ? 'Working…' : 'Continue', () => void continueTask(), {
                disabled: running || activeTask.status === 'review',
            }));
        }
        if (activeTask.status === 'review') {
            actions.append(actionButton(documentRef, activeTask.review?.highImpact ? 'Review & Commit High-impact Changes' : 'Review & Commit', async () => {
                if (running) return;
                running = true;
                render();
                try {
                    activeTask = await nativeStudioClient.commitAgentTask(projectId, activeTask.taskId);
                    tasks = await nativeStudioClient.listAgentTasks(projectId);
                    notifyTask();
                    onLog('agent', 'Committed Project Agent ChangeSet', activeTask.changeSets?.at(-1));
                    await onProjectCommitted(activeTask);
                } catch (error) {
                    onLog(error.status === 409 ? 'conflict' : 'error', error?.message || String(error), error?.details);
                    activeTask = await nativeStudioClient.getAgentTask(projectId, activeTask.taskId).catch(() => activeTask);
                } finally {
                    running = false;
                    render();
                }
            }, { primary: true }));
        }
        if (!['completed', 'taken_over'].includes(activeTask.status)) {
            actions.append(actionButton(documentRef, 'Human Takeover', async () => {
                if (running) controller?.abort();
                activeTask = await nativeStudioClient.takeOverAgentTask(projectId, activeTask.taskId);
                tasks = await nativeStudioClient.listAgentTasks(projectId);
                notifyTask();
                onLog('agent', 'Human takeover activated', activeTask);
                render();
            }));
        }
        actions.append(actionButton(documentRef, 'New Task', () => {
            activeTask = null;
            messages = [];
            render();
        }));
        slot.append(actions);
    };

    async function continueTask() {
        if (!activeTask || running) return;
        running = true;
        controller = new AbortController();
        render();
        try {
            const result = await runNativeStudioAgentTask({
                projectId,
                taskId: activeTask.taskId,
                messages,
                abortSignal: controller.signal,
                onUpdate(update) {
                    if (disposed) return;
                    if (update.task) activeTask = clone(update.task);
                    if (update.messages) messages = clone(update.messages);
                    notifyTask();
                    render();
                },
            });
            activeTask = result.task;
            messages = result.messages;
            tasks = await nativeStudioClient.listAgentTasks(projectId);
            notifyTask();
            onLog('agent', `Project Agent stopped at ${activeTask.status}`, activeTask);
        } catch (error) {
            if (!controller.signal.aborted) {
                onLog(error.status === 409 ? 'conflict' : 'error', error?.message || String(error), error?.details);
            }
            activeTask = await nativeStudioClient.getAgentTask(projectId, activeTask.taskId).catch(() => activeTask);
            notifyTask();
        } finally {
            controller = null;
            running = false;
            render();
        }
    }

    void nativeStudioClient.listAgentTasks(projectId)
        .then(result => {
            if (disposed) return;
            tasks = result || [];
            render();
        })
        .catch(error => {
            onLog('error', error?.message || String(error));
            render();
        });
    render();

    return {
        async refresh() {
            tasks = await nativeStudioClient.listAgentTasks(projectId);
            if (activeTask) {
                activeTask = await nativeStudioClient.getAgentTask(projectId, activeTask.taskId);
                notifyTask();
            }
            render();
        },
        dispose() {
            disposed = true;
            controller?.abort();
        },
    };
}

import { skillInstructions } from './skill-invocation.js';
import { projectAgentResumeMessages } from './project-agent-conversation.js';

export function projectAgentSkillTools() {
    return [
        { type: 'function', function: { name: 'atri_agent_skill_files', description: 'List supporting files available inside one resolved Skill.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } } },
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
                description: 'Read SKILL.md or a supporting file in one resolved Skill. Paginated and read-only; follow references instead of guessing API details.',
                parameters: {
                    type: 'object',
                    properties: { name: { type: 'string' }, path: { type: 'string' }, offset: { type: 'integer', minimum: 1, description: 'One-based line offset' }, limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Maximum lines to read' } },
                    required: ['name'],
                    additionalProperties: false,
                },
            },
        },
    ];
}

export function summarizeProjectAgentSkills(entries) {
    return entries.map(entry => ({
        name: entry.name,
        scope: entry.scope,
        version: entry.version,
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

export function projectAgentPromptInputs(context) {
    const task = Object.fromEntries(['intent', 'baseRevision', 'status', 'plan', 'operations', 'validation', 'repairRound', 'maxRepairRounds', 'strategyVersionId', 'conversation']
        .filter(key => context.task[key] !== undefined).map(key => [key, context.task[key]]));
    return { task, project: context.project, registry: context.registry, tools: context.tools };
}

export function buildNativeProjectAgentSystemPrompt(context, skillEntries = [], toolNames = null) {
    const { task, project } = projectAgentPromptInputs(context);
    const skills = summarizeProjectAgentSkills(skillEntries);
    const plugins = pluginResourceDescriptors(context);
    const available = (...names) => toolNames === null || names.every(name => toolNames.includes(name));
    return [
        'You are the Atria Project Agent operating inside Native Studio.',
        'The Project Task, Plan, Workspace, Authoring Operations, ChangeSet and Project revision are authoritative. Conversation text is only an auxiliary interface.',
        '',
        'Required lifecycle: Intent → Plan → Workspace → Operations → ChangeSet → Validate → Simulate / Preview → Review → Commit.',
        'You cannot commit. Stop at Review; the human performs Commit from Studio.',
        'Every write is only a proposal. The server forces origin.kind="agent", pins the Task baseRevision, and routes writes through StudioService.',
        'Never request a silent rebase. If the Project revision changes, stop at the conflict boundary and let the human decide.',
        'Prefer structured/domain Authoring Operations. source.write/move/delete are low-level fallback only.',
        available('atri_agent_frontend_graph', 'atri_agent_frontend_patch') ? 'For native@3, inspect atri_agent_frontend_graph then propose atri_agent_frontend_patch by Component/Node/Binding semantic ID and contentHash. Edit authoring source only. Preview uses the production Compiler/Renderer. Keep component uses, typed targets and Operation intent intact.' : null,
        'Library relationships must use exact revisions. Never invent or resolve "latest".',
        'Use A2 Resource Graph tools for discovery/references/dependency closure, A5 Skills for know-how, and plugin-defined Resource Registry descriptors when relevant.',
        available('atri_agent_api_catalog', 'atri_agent_api_read') ? 'Discover current Native Experience contracts with atri_agent_api_catalog and read relevant pages using atri_agent_api_read. This includes Native Frontend v3, Tasks, lifecycle, Activity/Scene, information, Continuity, Shared/Realm and Scenario. Never invent a field from a capability name.' : null,
        available('atri_agent_skill_files', 'atri_agent_read_skill') ? 'Skills may link supporting files: list them with atri_agent_skill_files, then read the relevant path with atri_agent_read_skill. Follow pagination when a file is truncated.' : null,
        available('atri_agent_set_plan') ? 'Before proposing writes, call atri_agent_set_plan once with concrete semantic steps.' : null,
        available('atri_agent_prepare_review') ? 'When your proposed operation set is coherent, call atri_agent_prepare_review. That dry-runs the Workspace, validates it and inspects Native Preview/simulation without committing.' : null,
        available('atri_agent_reset_operations', 'atri_agent_prepare_review') ? 'If validation/evaluation fails and Task status is repair, diagnose the diagnostics, call atri_agent_reset_operations, propose a corrected set, then call prepare_review again. Repair rounds are bounded by server policy.' : null,
        'High-impact edits still stop at the same human Review gate.',
        toolNames === null ? null : 'Only these tools are authorized for this exact request: ' + JSON.stringify(toolNames)
            + '. If a required action is unavailable, report the blocker and stop. Do not invent or call unlisted tools, including Skill and plugin tools.',
        '',
        'Task intent:',
        String(task.intent || ''),
        '',
        'Pinned baseRevision:',
        String(task.baseRevision || ''),
        '',
        'Current authoritative Task state (resume from these proposals; never repeat saved operations from conversation):',
        JSON.stringify({ status: task.status, plan: task.plan, operations: task.operations, validation: task.validation, repairRound: task.repairRound, maxRepairRounds: task.maxRepairRounds, strategyVersionId: task.strategyVersionId }),
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
        available('atri_agent_read_skill') ? 'Resolved Native Skill inventory (read with atri_agent_read_skill only when useful):' : 'Resolved Native Skill inventory (additional Skill tools are unavailable for this request):',
        JSON.stringify(skills),
        skillInstructions(skillEntries),
    ].filter(line => line !== null).join('\n');
}

// Original message assembly, shared by the Native runner and its admitted
// Context compilation. This function reads no service and grants no authority.
export function buildNativeProjectModelRound({ context, skillEntries = [], modelTranscript, previousSystem, tools: scopedTools }) {
    const tools = scopedTools === undefined ? [...(context.tools || []), ...projectAgentSkillTools()] : scopedTools;
    const system = buildNativeProjectAgentSystemPrompt(context, skillEntries, scopedTools === undefined ? null : tools.map(tool => tool.function.name));
    const initial = context.task.conversation?.length ? context.task.conversation : [{ role: 'user', content: context.task.intent }];
    const transcript = modelTranscript ?? projectAgentResumeMessages(initial);
    const systemChanged = previousSystem !== undefined && system !== previousSystem && transcript.some(message => message.providerState);
    const selected = systemChanged ? projectAgentResumeMessages(transcript) : transcript;
    return { system, tools, messages: [{ role: 'system', content: system }, ...selected], modelTranscript: selected, systemChanged };
}

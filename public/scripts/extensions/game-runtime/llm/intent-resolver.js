const NO_CHANGE_TOOL_NAME = 'game_no_change';
const MAX_RESOLVED_COMMANDS = 8;
const SAFE_TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function commandToolName(commandId) {
    const base = 'game_command_' + String(commandId || '')
        .replace(/[^A-Za-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!SAFE_TOOL_NAME_PATTERN.test(base)) {
        throw new Error(`Command '${commandId}' cannot map to a safe model tool name`);
    }
    return base;
}

export function buildIntentResolverTools(catalog) {
    const tools = Array.isArray(catalog?.tools) ? catalog.tools : [];
    const mapping = new Map();
    const transportTools = [];

    for (const tool of tools) {
        const name = commandToolName(tool.commandId);
        if (mapping.has(name)) {
            throw new Error(
                `Intent Resolver tool-name collision between '${mapping.get(name)}' and '${tool.commandId}'`,
            );
        }
        mapping.set(name, tool.commandId);
        transportTools.push({
            type: 'function',
            function: {
                name,
                description: String(tool.description || '').trim()
                    || ('Execute game command ' + tool.commandId),
                parameters: clone(tool.inputSchema || {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                }),
            },
        });
    }

    transportTools.push({
        type: 'function',
        function: {
            name: NO_CHANGE_TOOL_NAME,
            description: 'Use only when the user input does not resolve to any currently available game command.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    reason: {
                        type: 'string',
                        maxLength: 240,
                    },
                },
            },
        },
    });

    return Object.freeze({
        tools: Object.freeze(transportTools),
        mapping,
    });
}

export function buildIntentResolverMessages(turnContext) {
    if (!turnContext || typeof turnContext !== 'object') {
        throw new Error('Intent Resolver requires Turn Context');
    }

    const system = [
        'You are the Atria Intent Resolver.',
        'Resolve the user input into zero or more of the provided typed game command tools.',
        'Do not narrate the story and do not calculate game consequences.',
        'Do not invent numeric state deltas, event results, HP changes, inventory mutations, RNG outcomes, or World State patches.',
        'Choose command arguments only from the user input, authoritative observation, and command schemas.',
        'If no available command applies, call game_no_change.',
        'Never call game_no_change together with a game command.',
    ].join('\n');

    const payload = {
        turn_id: turnContext.turnId,
        branch: {
            id: turnContext.anchor?.branchId,
            floor: turnContext.anchor?.floor,
            swipe: turnContext.anchor?.swipe,
        },
        user_input: turnContext.userInput,
        authoritative_observation: turnContext.observation,
        fact_precedence: turnContext.authority?.precedence || [],
    };

    return [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) },
    ];
}

export function validateIntentResolution(result, options = {}) {
    const toolCalls = Array.isArray(result?.toolCalls) ? result.toolCalls : [];
    const mapping = options.mapping instanceof Map ? options.mapping : new Map();
    const validateCommand = options.validateCommand;
    if (typeof validateCommand !== 'function') {
        throw new Error('Intent Resolver validation requires validateCommand()');
    }
    if (toolCalls.length === 0) {
        throw new Error('Intent Resolver returned no tool calls');
    }
    if (toolCalls.length > MAX_RESOLVED_COMMANDS) {
        throw new Error('Intent Resolver returned too many command calls');
    }

    const noChangeCalls = toolCalls.filter(call => call?.name === NO_CHANGE_TOOL_NAME);
    if (noChangeCalls.length > 0) {
        if (toolCalls.length !== 1) {
            throw new Error('Intent Resolver cannot mix game_no_change with commands');
        }
        return Object.freeze({
            decision: 'no_change',
            commands: Object.freeze([]),
            reason: String(noChangeCalls[0]?.args?.reason || '').trim(),
        });
    }

    const commands = [];
    for (const call of toolCalls) {
        const name = String(call?.name || '').trim();
        const commandId = mapping.get(name);
        if (!commandId) {
            throw new Error(`Intent Resolver returned unknown tool '${name}'`);
        }

        const args = call?.args === undefined ? {} : clone(call.args);
        const validation = validateCommand(commandId, args);
        if (!validation?.ok) {
            const errors = Array.isArray(validation?.errors)
                ? validation.errors.slice(0, 8).join('; ')
                : 'invalid arguments';
            throw new Error(
                `Intent Resolver proposed invalid command '${commandId}': ${errors}`,
            );
        }

        commands.push(Object.freeze({
            id: commandId,
            args: clone(validation.args ?? args),
        }));
    }

    return Object.freeze({
        decision: 'commands',
        commands: Object.freeze(commands),
        reason: '',
    });
}

export function createIntentResolver(options = {}) {
    const generateTask = options.generateTask
        || globalThis.Atria?.getContext?.()?.generateTask;
    if (typeof generateTask !== 'function') {
        throw new Error('Intent Resolver requires generateTask()');
    }
    if (typeof options.validateCommand !== 'function') {
        throw new Error('Intent Resolver requires validateCommand()');
    }

    return Object.freeze({
        async resolve(turnContext, catalog, requestOptions = {}) {
            const transport = buildIntentResolverTools(catalog);
            const taskMessages = buildIntentResolverMessages(turnContext);
            const result = await generateTask({
                taskMessages,
                promptMode: 'task',
                includeCharacterCard: false,
                worldInfoSource: 'none',
                tools: [...transport.tools],
                toolChoice: 'required',
                functionCallMode: requestOptions.functionCallMode || 'auto',
                functionCallOptions: requestOptions.functionCallOptions || null,
                apiPresetName: requestOptions.apiPresetName || '',
                llmPresetName: requestOptions.llmPresetName || '',
                abortSignal: requestOptions.abortSignal,
                stream: false,
                temperature: requestOptions.temperature ?? 0,
                substituteMacros: false,
            });

            const resolution = validateIntentResolution(result, {
                mapping: transport.mapping,
                validateCommand: options.validateCommand,
            });
            return Object.freeze({
                ...resolution,
                requestInfo: clone(result?.requestInfo || null),
                usage: clone(result?.usage || null),
            });
        },
    });
}

export const INTENT_RESOLVER_NO_CHANGE_TOOL = NO_CHANGE_TOOL_NAME;

import { assertExactResourceRef, assertPromptIR, assertPromptModule, assertPromptProgram, assertRequestContextPlan } from './contracts.js';
import { immutable } from './execution-utils.js';
import { bindValues, evaluateCondition, interpolate, promptError, readVariable, typedValue } from './prompt-values.js';

export const PROMPT_TARGETS = Object.freeze([
    'system.foundation', 'system.character', 'system.world', 'system.style', 'system.response',
    'agent.task', 'agent.evidence', 'agent.constraints',
    'context.before_history', 'context.after_history', 'context.before_input', 'context.after_input',
    'response.post_history', 'response.prefill',
]);
const refKey = value => JSON.stringify(assertExactResourceRef(value));

// Reads only the exact closure already validated by RouteResolver, never a Library head.
export function flattenPromptProgram(resolved, { validateBindings = true } = {}) {
    const resources = new Map();
    for (const entry of resolved.resources) {
        const key = refKey(entry.ref);
        if (resources.has(key)) promptError('duplicate_resource');
        resources.set(key, entry.resource);
    }
    const active = new Set();
    const read = (ref, type) => {
        const exact = assertExactResourceRef(ref, type);
        const resource = resources.get(refKey(exact));
        if (!resource) promptError('exact_resource_missing');
        const normalized = type === 'core.prompt-program' ? assertPromptProgram(resource) : assertPromptModule(resource);
        const id = type === 'core.prompt-program' ? normalized.promptProgramId : normalized.promptModuleId;
        if (id !== exact.resourceId || normalized.revision !== exact.revision) promptError('exact_resource_mismatch');
        return normalized;
    };
    const flatten = ref => {
        const key = refKey(ref);
        if (active.has(key) || active.size >= 64) promptError('derive_cycle');
        active.add(key);
        const program = read(ref, 'core.prompt-program');
        const result = program.parentRef ? flatten(program.parentRef) : {
            stages: [], parameters: {}, locals: {}, artifacts: {}, exclusiveTargets: [], responseDirective: {}, provenance: [],
        };
        for (const field of ['parameters', 'locals', 'artifacts']) {
            for (const [name, definition] of Object.entries(program[field] || {})) {
                if (Object.hasOwn(result[field], name) && JSON.stringify(result[field][name]) !== JSON.stringify(definition)) promptError('derive_definition_conflict');
                Object.defineProperty(result[field], name, { value: definition, enumerable: true, configurable: true });
            }
        }
        result.exclusiveTargets = [...new Set([...result.exclusiveTargets, ...(program.exclusiveTargets || [])])];
        if (Object.keys(program.responseDirective).length) result.responseDirective = program.responseDirective;
        for (const stage of program.stages) {
            const existing = result.stages.find(item => item.stageId === stage.stageId);
            if (existing) {
                if (JSON.stringify(existing.condition) !== JSON.stringify(stage.condition)
                    || JSON.stringify(existing.targets) !== JSON.stringify(stage.targets)
                    || JSON.stringify(existing.consumes) !== JSON.stringify(stage.consumes || [])) promptError('derive_stage_conflict');
                for (const moduleRef of stage.moduleRefs) {
                    if (existing.modules.some(item => item.id === moduleRef.resourceId)) promptError('duplicate_module');
                    existing.modules.push({ id: moduleRef.resourceId, ref: moduleRef, module: read(moduleRef, 'core.prompt-module'), config: {} });
                }
            } else result.stages.push({ ...stage, consumes: stage.consumes || [], modules: stage.moduleRefs.map(moduleRef => ({
                id: moduleRef.resourceId, ref: moduleRef, module: read(moduleRef, 'core.prompt-module'), config: {},
            })) });
        }
        const operated = new Set();
        for (const operation of program.derive) {
            if (operated.has(operation.moduleId)) promptError('derive_operation_conflict');
            operated.add(operation.moduleId);
            const entries = result.stages.flatMap(stage => stage.modules.filter(item => item.id === operation.moduleId));
            if (operation.op === 'add') {
                if (entries.length || operation.replacementRef.resourceId !== operation.moduleId) promptError('derive_add_conflict');
                const module = read(operation.replacementRef, 'core.prompt-module');
                const stages = result.stages.filter(stage => module.stages.includes(stage.stageId));
                if (!stages.length) promptError('module_stage');
                stages.forEach(stage => stage.modules.push({ id: operation.moduleId, ref: operation.replacementRef, module, config: {} }));
            } else {
                if (!entries.length) promptError('derive_module_missing');
                for (const entry of entries) {
                    if (operation.op === 'disable') entry.disabled = true;
                    if (operation.op === 'replace') {
                        entry.ref = operation.replacementRef;
                        entry.module = read(entry.ref, 'core.prompt-module');
                        entry.config = {};
                        entry.disabled = false;
                    }
                    if (operation.op === 'configure') {
                        // Configuration means typed module parameters, never authority or arbitrary patches.
                        if (Object.keys(operation.config).some(name => !Object.hasOwn(entry.module.parameters, name))) promptError('parameter_unknown');
                        entry.config = { ...entry.config, ...operation.config };
                    }
                }
            }
        }
        result.provenance.push({ source: 'prompt.program', ref: key });
        active.delete(key);
        return result;
    };
    const result = flatten(resolved.route.promptProgramRef);
    for (const stage of result.stages) {
        if (new Set(stage.modules.map(item => item.id)).size !== stage.modules.length) promptError('duplicate_module');
        if (stage.targets.some(target => !PROMPT_TARGETS.includes(target))) promptError('target_unknown');
        for (const { module, config, disabled } of stage.modules) {
            if (disabled) continue;
            if (!PROMPT_TARGETS.includes(module.target) || !module.stages.includes(stage.stageId)
                || (stage.targets.length && !stage.targets.includes(module.target))) promptError('module_target_stage');
            if (validateBindings) bindValues(module.parameters, config);
        }
    }
    return immutable(result);
}

export class PromptCompiler {
    constructor({ hostDefinitions = {} } = {}) {
        this.hostDefinitions = immutable(hostDefinitions);
    }

    preparePrompt = args => this.compile(args).promptIr;

    compile({ request, resolved, contextPlan }) {
        const plan = immutable(assertRequestContextPlan(contextPlan));
        if (plan.requestId !== request.requestId) promptError('request_identity');
        const program = flattenPromptProgram(resolved);
        const values = immutable(request.prompt || {});
        if (Object.keys(values).some(key => !['parameters', 'locals', 'artifacts', 'host', 'stageIds'].includes(key))) promptError('request_field');
        const env = {
            host: bindValues(this.hostDefinitions, values.host),
            param: bindValues(program.parameters, values.parameters),
            local: bindValues(program.locals, values.locals), artifact: {}, module: {},
        };
        const declarations = { host: this.hostDefinitions, param: program.parameters, local: program.locals, artifact: {}, module: {} };
        const stages = program.stages.map(stage => stage.stageId);
        const selected = values.stageIds ?? stages;
        if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length || selected.some(id => !stages.includes(id))) promptError('projection_invalid');
        for (const [name, definition] of Object.entries(program.artifacts)) {
            if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || ['constructor', 'prototype'].includes(name)) promptError('variable_name');
            if (!stages.includes(definition.stageId)) promptError('artifact_producer');
        }
        if (values.artifacts !== undefined && (!values.artifacts || typeof values.artifacts !== 'object' || Array.isArray(values.artifacts))) promptError('artifact_invalid');
        for (const [name, artifact] of Object.entries(values.artifacts || {})) {
            const definition = program.artifacts[name];
            if (!Object.hasOwn(program.artifacts, name) || !artifact || Object.keys(artifact).some(key => !['stageId', 'value'].includes(key))
                || artifact.stageId !== definition.stageId) promptError('artifact_invalid');
            env.artifact[name] = typedValue(artifact.value, definition.type);
        }
        const blocks = [];
        const diagnostics = [];
        const provenance = [...plan.provenance, ...program.provenance];
        for (const [index, stage] of program.stages.entries()) {
            declarations.artifact = {};
            for (const name of stage.consumes) {
                const definition = program.artifacts[name];
                if (!Object.hasOwn(program.artifacts, name) || stages.indexOf(definition.stageId) >= index) promptError('artifact_scope');
                Object.defineProperty(declarations.artifact, name, { value: definition, enumerable: true });
            }
            if (!selected.includes(stage.stageId)) continue;
            const read = path => readVariable(path, env, declarations);
            declarations.module = {}; env.module = {};
            if (!evaluateCondition(stage.condition, read)) {
                diagnostics.push({ stageId: stage.stageId, status: 'condition-false' });
                continue;
            }
            for (const name of stage.consumes) if (!Object.hasOwn(env.artifact, name)) promptError('artifact_missing');
            const modules = [...stage.modules].sort((a, b) => PROMPT_TARGETS.indexOf(a.module.target) - PROMPT_TARGETS.indexOf(b.module.target)
                || b.module.priority - a.module.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            for (const entry of modules) {
                const { module } = entry;
                if (entry.disabled) { diagnostics.push({ stageId: stage.stageId, moduleId: entry.id, status: 'disabled' }); continue; }
                if (!PROMPT_TARGETS.includes(module.target) || !module.stages.includes(stage.stageId)
                    || (stage.targets.length && !stage.targets.includes(module.target))) promptError('module_target_stage');
                env.module = bindValues(module.parameters, entry.config);
                declarations.module = module.parameters;
                if (!evaluateCondition(module.condition, read)) {
                    diagnostics.push({ stageId: stage.stageId, moduleId: entry.id, status: 'condition-false' });
                    continue;
                }
                blocks.push({ target: module.target, content: interpolate(module.body, read) });
                provenance.push({ source: 'prompt.module', ref: refKey(entry.ref) });
                diagnostics.push({ stageId: stage.stageId, moduleId: entry.id, status: 'included', target: module.target });
            }
        }
        const directive = program.responseDirective;
        if (Object.keys(directive).some(key => !['body', 'stages'].includes(key))) promptError('response_directive');
        if (directive.stages !== undefined && (!Array.isArray(directive.stages) || directive.stages.some(id => !stages.includes(id)))) promptError('response_directive');
        if (directive.body !== undefined && (!directive.stages || directive.stages.some(id => selected.includes(id)))) {
            declarations.artifact = {}; declarations.module = {};
            blocks.push({ target: 'response.post_history', content: interpolate(directive.body, path => readVariable(path, env, declarations)) });
        }
        for (const target of new Set(['response.prefill', ...program.exclusiveTargets])) {
            if (!PROMPT_TARGETS.includes(target)) promptError('target_unknown');
            if (blocks.filter(block => block.target === target).length > 1) promptError('exclusive_target_conflict');
        }
        const ir = { schemaVersion: 1, requestId: request.requestId, directives: [], contextSlots: [], history: [], input: '', responseDirectives: [],
            tools: request.tools || [], outputContract: request.outputContract ?? null, provenance };
        const input = [];
        const ids = new Set();
        for (const item of plan.items) {
            if (item.id && ids.has(item.id)) promptError('context_duplicate');
            if (item.id) ids.add(item.id);
            provenance.push(...item.provenance);
            if (item.kind === 'context.history') ir.history.push(item.content);
            else if (item.kind === 'context.input') input.push(item.content);
            else if (item.kind === 'context.directive') ir.directives.push(item.content);
            else ir.contextSlots.push({ target: 'context.before_history', content: item.content });
        }
        if (input.some(item => typeof item !== 'string')) promptError('context_input');
        ir.input = input.join('\n');
        for (const block of blocks) {
            if (block.target.startsWith('system.') || block.target.startsWith('agent.')) ir.directives.push(block.content);
            else if (block.target === 'response.post_history') ir.responseDirectives.push(block.content);
            else if (block.target === 'response.prefill') ir.prefill = block.content;
            else ir.contextSlots.push(block);
        }
        return immutable({ promptIr: assertPromptIR(ir), diagnostics, selectedStages: stages.filter(id => selected.includes(id)) });
    }
}

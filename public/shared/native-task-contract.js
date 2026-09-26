import { fields, json, text } from '../scripts/native/experience/ui/v2-values.js';
import { compileDataSchema } from '../scripts/native/experience/ui/message-templates.js';
import { validateSchemaValue } from '../scripts/native/experience/world/schema.js';
import { normalizeEventInterpretationRequest, validateEventInterpretation } from '../scripts/native/experience/llm/event-interpreter.js';
import { assertOutcomeShape } from './native-message-contract.js';

export const TASK_STATE_NAMESPACE = 'atri_task_results';
export const EXECUTION_CLASSES = Object.freeze(['turn_blocking', 'interactive', 'background', 'maintenance']);
export function taskId(value) {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(value) || ['constructor', 'prototype', '__proto__'].includes(value)) throw new TypeError('Invalid Task identifier');
    return value;
}
function list(value, limit, convert) {
    if (!Array.isArray(value) || value.length > limit) throw new TypeError('Task list limit');
    const result = value.map(convert);
    if (new Set(result.map(item => item.id ?? item)).size !== result.length) throw new TypeError('Duplicate Task identifier');
    return result;
}
function choice(value, allowed) {
    if (!allowed.includes(value)) throw new TypeError('Unsupported Task policy');
    return value;
}
function exact(value) {
    fields(value, ['resourceId', 'revision'], 'Task exact resource');
    if (!/^[a-z]+_[a-f0-9]{32}$/.test(value.resourceId)) throw new TypeError('Task resource must be exact');
    if (!text(value.revision, 128)) throw new TypeError('Task resource revision required');
    return value;
}
export function assertTaskValue(value, schema) {
    const result = json(value);
    if (!validateSchemaValue(result, schema).ok) throw new TypeError('Task value violates schema');
    return result;
}
export function assertSemanticOutcome(value, request) {
    value = assertOutcomeShape(value);
    fields(value, ['requestId', 'interpretation'], 'Semantic outcome');
    if (value.requestId !== request.id) throw new TypeError('Outcome request mismatch');
    return json({ requestId: value.requestId, interpretation: validateEventInterpretation(value.interpretation, request).interpretation });
}
export function assertTaskRuntime(value) {
    value = json(value);
    fields(value, ['schemaVersion', 'slots', 'tasks', 'turn'], 'Task runtime');
    if (value.schemaVersion !== 1) throw new TypeError('Task runtime version');
    const slots = list(value.slots, 16, item => {
        fields(item, ['id', 'requiredCapabilities'], 'Task slot');
        return { id: taskId(item.id), requiredCapabilities: list(item.requiredCapabilities, 16, taskId) };
    });
    const tasks = list(value.tasks, 64, item => {
        fields(item, ['id', 'bindingSlotId', 'executionClass', 'inputSchema', 'context', 'resultPolicy', 'variants', 'interpretation', 'queuePolicy'], 'Model Task');
        taskId(item.id);
        if (!slots.some(slot => slot.id === item.bindingSlotId)) throw new TypeError('Unknown Task slot');
        choice(item.executionClass, EXECUTION_CLASSES);
        const inputSchema = compileDataSchema(item.inputSchema);
        const context = list(item.context, 4, v => choice(v, ['input', 'history', 'world', 'knowledge']));
        fields(item.resultPolicy, ['resultClass', 'sink', 'applyCommand'], 'Task result policy');
        const policies = { advisory: 'proposal', turn_context: 'turn', presentation: 'artifact', world_outcome_proposal: 'proposal' };
        if (!Object.hasOwn(policies, item.resultPolicy.resultClass) || policies[item.resultPolicy.resultClass] !== item.resultPolicy.sink) throw new TypeError('Result authority/sink mismatch');
        if (item.resultPolicy.applyCommand !== undefined) {
            taskId(item.resultPolicy.applyCommand);
            if (item.resultPolicy.resultClass !== 'advisory') throw new TypeError('Only advisory proposals may declare Apply Command');
        }
        const queuePolicy = choice(item.queuePolicy ?? 'fifo', ['fifo', 'latest']);
        if (queuePolicy === 'latest' && (item.resultPolicy.resultClass === 'world_outcome_proposal' || item.resultPolicy.applyCommand)) throw new TypeError('Authority-producing Tasks cannot supersede confirmed work');
        const variants = list(item.variants, 8, variant => {
            fields(variant, ['id', 'prompt', 'generation', 'outputSchema', 'requiredCapabilities'], 'Task Variant');
            return { id: taskId(variant.id), prompt: exact(variant.prompt), generation: exact(variant.generation),
                outputSchema: compileDataSchema(variant.outputSchema), requiredCapabilities: list(variant.requiredCapabilities, 16, taskId) };
        });
        if (!variants.length) throw new TypeError('Task requires a Variant');
        const interpretation = item.interpretation === undefined ? undefined : normalizeEventInterpretationRequest(item.interpretation);
        if ((item.resultPolicy.resultClass === 'world_outcome_proposal') !== Boolean(interpretation)) throw new TypeError('Outcome Task requires semantic interpretation contract');
        return { ...item, queuePolicy, inputSchema, context, variants, ...(interpretation ? { interpretation } : {}) };
    });
    const requests = tasks.filter(task => task.interpretation).map(task => task.interpretation.id);
    if (new Set(requests).size !== requests.length) throw new TypeError('Duplicate interpretation request');
    let turn;
    if (value.turn !== undefined) {
        fields(value.turn, ['policy', 'stages', 'interpreterTaskId', 'narratorTaskId'], 'Package Turn');
        choice(value.turn.policy, ['authority-first', 'narrative-outcome']);
        const stages = list(value.turn.stages, 4, taskId);
        if (stages.some(id => !tasks.some(task => task.id === id && task.resultPolicy.resultClass === 'turn_context' && task.executionClass === 'turn_blocking'))) throw new TypeError('Turn stages must be bounded turn_context Tasks');
        const interpreter = tasks.find(task => task.id === value.turn.interpreterTaskId);
        if (value.turn.narratorTaskId !== undefined && !tasks.some(task => task.id === value.turn.narratorTaskId
            && task.resultPolicy.resultClass === 'presentation' && task.executionClass === 'turn_blocking')) throw new TypeError('Turn Narrator must be a presentation Task');
        if (value.turn.policy === 'narrative-outcome' && (!interpreter || interpreter.resultPolicy.resultClass !== 'world_outcome_proposal')) throw new TypeError('Turn requires semantic Interpreter');
        if (value.turn.policy === 'authority-first' && value.turn.interpreterTaskId !== undefined) throw new TypeError('Authority-first cannot reconcile narrative');
        turn = { ...value.turn, stages };
    }
    return json({ schemaVersion: 1, slots, tasks, ...(turn ? { turn } : {}) });
}

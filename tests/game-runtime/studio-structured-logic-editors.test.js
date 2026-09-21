import { describe, expect, test } from '@jest/globals';

import {
    LOGIC_EDITOR_SECTION,
    addLogicEntry,
    applyFormulaExpression,
    applyLogicEntryFieldPatch,
    buildLogicSectionEditorModel,
    parseLogicStructuredDocument,
    removeLogicEntry,
    validateDeclarativeLogicSource,
    validateFormulaExpression,
} from '../../public/scripts/extensions/character-editor-assistant/studio/structured-logic-editors.js';

const logic = {
    commands: [{
        id: 'strike',
        description: 'Strike the target',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['amount'],
            properties: {
                amount: { type: 'integer', minimum: 1, maximum: 20 },
            },
        },
        validators: [{
            id: 'can_strike',
            formula: 'args.amount <= world.hp',
            error: 'too much damage',
        }],
        events: [{
            type: 'DamageDealt',
            payload: { amount: { formula: 'args.amount' } },
        }],
        llm: { expose: true },
    }],
    reducers: [{
        type: 'DamageDealt',
        payloadSchema: {
            type: 'object',
            properties: { amount: { type: 'integer' } },
        },
        assign: {
            hp: { formula: 'max(0, world.hp - args.amount)' },
        },
    }],
    rules: [{
        id: 'death',
        on: 'DamageDealt',
        priority: 10,
        when: 'world.hp == 0',
        events: [{ type: 'EntityDied', payload: {} }],
    }],
    interpretations: [{
        eventType: 'implicit_threat',
        command: 'strike',
        when: 'args.confidence >= 0.75',
        args: {
            amount: { formula: 'args.amount' },
        },
    }],
};

describe('Game Studio structured Game Logic editors', () => {
    test('projects Commands without changing the source shape', () => {
        const model = buildLogicSectionEditorModel(logic, LOGIC_EDITOR_SECTION.COMMANDS);
        expect(model.editor).toBe('game_logic');
        expect(model.section).toBe('commands');
        expect(model.entries).toHaveLength(1);
        expect(model.entries[0]).toMatchObject({
            label: 'strike',
            fields: {
                id: 'strike',
                description: 'Strike the target',
                llmExpose: true,
            },
        });
        expect(logic.commands[0].id).toBe('strike');
    });

    test('projects Formula Editor rows from validators, templates, reducers, rules and mappings', () => {
        expect(buildLogicSectionEditorModel(logic, 'commands').formulas.map(row => row.expression))
            .toEqual(['args.amount <= world.hp', 'args.amount']);
        expect(buildLogicSectionEditorModel(logic, 'reducers').formulas.map(row => row.expression))
            .toEqual(['max(0, world.hp - args.amount)']);
        expect(buildLogicSectionEditorModel(logic, 'rules').formulas.map(row => row.expression))
            .toEqual(['world.hp == 0']);
        expect(buildLogicSectionEditorModel(logic, 'interpretations').formulas.map(row => row.expression))
            .toEqual(['args.confidence >= 0.75', 'args.amount']);
    });

    test('edits Command fields on the real declarative document and recompiles the whole source', () => {
        let next = applyLogicEntryFieldPatch(logic, 'commands', 0, 'description', 'Heavy strike');
        next = applyLogicEntryFieldPatch(next, 'commands', 0, 'llmExpose', false);
        next = applyLogicEntryFieldPatch(
            next,
            'commands',
            0,
            'events',
            '[{"type":"DamageDealt","payload":{"amount":{"formula":"args.amount * 2"}}}]',
        );

        expect(next.commands[0].description).toBe('Heavy strike');
        expect(next.commands[0].llm.expose).toBe(false);
        expect(next.commands[0].events[0].payload.amount.formula).toBe('args.amount * 2');
        expect(logic.commands[0].description).toBe('Strike the target');
        expect(validateDeclarativeLogicSource(next)).toBe(true);
    });

    test('edits Reducer, Rule and Interpretation sections through their current R3 fields', () => {
        const reducer = applyLogicEntryFieldPatch(
            logic,
            'reducers',
            0,
            'assign',
            '{"hp":{"formula":"world.hp - args.amount"},"lastDamage":{"formula":"args.amount"}}',
        );
        expect(reducer.reducers[0].assign.lastDamage.formula).toBe('args.amount');

        const rule = applyLogicEntryFieldPatch(logic, 'rules', 0, 'on', '["DamageDealt","PoisonTick"]');
        expect(rule.rules[0].on).toEqual(['DamageDealt', 'PoisonTick']);

        const mapping = applyLogicEntryFieldPatch(
            logic,
            'interpretations',
            0,
            'args',
            '{"amount":{"formula":"min(20, args.amount)"}}',
        );
        expect(mapping.interpretations[0].args.amount.formula).toBe('min(20, args.amount)');
    });

    test('Formula Editor patches the exact source path and rejects invalid Formula AST syntax', () => {
        const model = buildLogicSectionEditorModel(logic, 'rules');
        const next = applyFormulaExpression(
            logic,
            model.formulas[0].path,
            'world.hp <= 0 && args.force == true',
        );
        expect(next.rules[0].when).toBe('world.hp <= 0 && args.force == true');
        expect(() => validateFormulaExpression('world.hp ** 2')).toThrow();
        expect(() => applyFormulaExpression(
            logic,
            model.formulas[0].path,
            'world.hp ** 2',
        )).toThrow();
    });

    test('add/remove keeps the declarative source valid', () => {
        const withCommand = addLogicEntry(logic, 'commands');
        expect(withCommand.commands).toHaveLength(2);
        expect(withCommand.commands[1].id).toBe('new_command');

        const withoutCommand = removeLogicEntry(withCommand, 'commands', 1);
        expect(withoutCommand).toEqual(logic);

        const withRule = addLogicEntry(logic, 'rules');
        expect(withRule.rules[1]).toMatchObject({
            id: 'new_rule',
            on: 'NewEvent',
        });
    });

    test('rejects malformed field JSON and invalid whole-source logic', () => {
        expect(() => applyLogicEntryFieldPatch(
            logic,
            'commands',
            0,
            'events',
            '{bad json',
        )).toThrow(/valid JSON/);

        expect(() => parseLogicStructuredDocument(
            'commands',
            '{"commands":[{"id":"bad id","events":[]}]}',
        )).toThrow(/Command id/);
    });
});

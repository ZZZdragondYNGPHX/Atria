import { describe, expect, test } from '@jest/globals';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { authorityFixture, closed } from '../native/helpers/authority-fixture.js';

const compile = ({ logic, contract }) => compileDeclarativeLogic(logic, { experienceContract: contract });
const at = (value, path) => path.split('.').reduce((item, key) => item[key], value);
const set = (value, path, next) => { const parts = path.split('.'); const key = parts.pop(); (parts.length ? at(value, parts.join('.')) : value)[key] = next; };
function standalone() {
    const fixture = authorityFixture(); fixture.logic.derivedPublications = []; fixture.logic.transactions[0].derivedPublications = [];
    return fixture;
}

describe('C1 declarative Transaction surface', () => {
    test('compiles all four static effect families without executing or mutating declarations', () => {
        const fixture = authorityFixture(); const before = structuredClone(fixture);
        const result = compile(fixture);
        expect(result.transactions).toEqual(fixture.logic.transactions);
        expect(result.derivedPublications).toEqual(fixture.logic.derivedPublications);
        expect(result.commands).toEqual([]);
        expect(Object.isFrozen(result.transactions[0].effects[0].payload)).toBe(true);
        expect(fixture).toEqual(before);
        expect(result).not.toHaveProperty('executeTransaction');
    });
    test('accepts deterministic read-only transactions and bounded structured receipt values', () => {
        const f = standalone(); const tx = f.logic.transactions[0]; tx.effects = [];
        tx.resolution = { kind: 'deterministic', cases: [{ id: 'known', when: 'reads.note.text != ""', outcome: 'known' }], fallback: 'unknown' };
        tx.receipt.schema = closed({ entries: { type: 'array', maxItems: 2, items: closed({ label: { type: 'string', maxLength: 64 } }) } });
        tx.receipt.projection = { entries: [{ label: { formula: 'resolution.outcome' } }] };
        expect(compile(f).transactions[0]).toEqual(tx);
    });
    test('v3 retains v2 mutation shorthand and existing commands/reducers', () => {
        const f = authorityFixture(); f.logic.mutations = [{ id: 'heal', event: 'actor.healed', argsSchema: closed({ amount: { type: 'integer', minimum: 1, maximum: 8 } }), assign: { hp: { formula: 'world.hp + args.amount' } } }];
        const result = compile(f);
        expect(result.commands.map(item => item.id)).toEqual(['heal']);
        expect(result.reducers.find(item => item.type === 'actor.healed').reduce({ hp: 2 }, { payload: { amount: 3 } })).toEqual({ hp: 5 });
    });
    test.each([undefined, 1, 2])('legacy schemaVersion %s remains usable without capability or Transaction output', version => {
        const logic = version === 2 ? { schemaVersion: 2, mutations: [] } : version === 1 ? { schemaVersion: 1 } : {};
        expect(compileDeclarativeLogic(logic)).toEqual({ commands: [], reducers: [], rules: [], interpretations: [] });
        expect(() => compileDeclarativeLogic({ ...logic, transactions: [] })).toThrow();
    });
    test.each([undefined, {}, { schemaVersion: 1, capabilities: [], dataResources: [] }])('v3 requires its exact capability/runtime contract: %j', contract => {
        const f = authorityFixture(); f.contract = contract;
        expect(() => compile(f)).toThrow();
    });
    test.each(['', 'transactions.0', 'transactions.0.intent', 'transactions.0.inputSchema', 'transactions.0.reads.0',
        'transactions.0.reads.0.recordId', 'transactions.0.validators.0', 'transactions.0.resolution', 'transactions.0.resolution.cases.0',
        'transactions.0.effects.0', 'transactions.0.effects.0.payload', 'transactions.0.effects.0.payload.amount',
        'transactions.0.effects.1', 'transactions.0.effects.1.args', 'transactions.0.effects.2', 'transactions.0.effects.3',
        'transactions.0.receipt', 'transactions.0.receipt.schema', 'transactions.0.receipt.projection', 'derivedPublications.0', 'derivedPublications.0.reads.0', 'derivedPublications.0.effects.0'])('rejects extra fields at %s', path => {
        const f = authorityFixture(); (path ? at(f.logic, path) : f.logic).script = 'eval()';
        expect(() => compile(f)).toThrow();
    });
    test.each(['id', 'verb', 'inputSchema', 'intent', 'reads', 'validators', 'resolution', 'effects', 'derivedPublications', 'receipt'])('requires Transaction %s', key => {
        const f = authorityFixture(); delete f.logic.transactions[0][key]; expect(() => compile(f)).toThrow();
    });
    test.each([
        ['transactions.0.id', 'bad/id'], ['transactions.0.verb', 'constructor'], ['transactions.0.intent.expose', 1],
        ['transactions.0.reads.0.domainId', 'missing'], ['transactions.0.reads.0.fields', ['secret']], ['transactions.0.reads.0.fields', []],
        ['transactions.0.reads.0.fields', ['text', 'text']], ['transactions.0.reads.0.fields', ['__proto__']],
        ['transactions.0.reads.0.recordId', { formula: 'reads.note.text' }], ['transactions.0.reads.0.recordId', { formula: 'args.missing' }],
        ['transactions.0.effects.0.type', 'Undeclared'], ['transactions.0.effects.0.payload.amount', 'wrong type'],
        ['transactions.0.effects.1.domainId', 'missing'], ['transactions.0.effects.1.commandId', 'missing'],
        ['transactions.0.effects.1.domainId', { formula: 'args.target' }], ['transactions.0.effects.1.commandId', { formula: 'args.text' }],
        ['transactions.0.effects.1.args', { text: 'a', patch: {} }], ['transactions.0.effects.1.args', {}],
        ['transactions.0.effects.1.recordId', { formula: 'args.amount' }],
        ['transactions.0.effects.2.commandId', 'missing'], ['transactions.0.effects.2.ticks', 0], ['transactions.0.effects.2.ticks', 9],
        ['transactions.0.effects.3.workflowId', 'missing'], ['transactions.0.effects.3.transitionId', 'missing'],
        ['transactions.0.derivedPublications', ['missing']], ['transactions.0.derivedPublications', []],
        ['transactions.0.derivedPublications', ['notes.publication', 'notes.publication']],
        ['transactions.0.resolution.kind', 'eval'], ['transactions.0.resolution.sides', 1001], ['transactions.0.resolution.sides', 1],
        ['transactions.0.resolution.cases.0.when', 'resolution.outcome == "success"'],
        ['transactions.0.receipt.maxBytes', 32769], ['transactions.0.receipt.maxBytes', 0],
        ['transactions.0.inputSchema.additionalProperties', true], ['transactions.0.inputSchema.properties.text.maxLength', undefined],
        ['transactions.0.inputSchema.properties.amount.default', 1], ['transactions.0.inputSchema.required', ['missing']],
        ['transactions.0.validators.0.formula', 'args.amount'], ['transactions.0.validators.0.error', { formula: 'reads.note.text' }],
        ['derivedPublications.0.reads.0.recordId', { formula: 'args.target' }],
        ['derivedPublications.0.effects.0.domainId', 'missing'], ['derivedPublications.0.effects.0.commandId', 'missing'],
        ['derivedPublications.0.effects.0.args.text', { formula: 'reads.missing.text' }],
    ])('rejects schema/reference violation %s', (path, value) => {
        const f = authorityFixture(); set(f.logic, path, value); expect(() => compile(f)).toThrow();
    });
    test.each(['state.patch', 'namespace.write', 'json.patch', 'eval', 'script', 'world.command', 'task', 'dynamic.command'])('rejects forbidden effect %s', kind => {
        const f = authorityFixture(); f.logic.transactions[0].effects[0] = { kind };
        expect(() => compile(f)).toThrow(/Unsupported Transaction effect/);
    });
    test.each(['world.hp > 0', 'data.secret == 1', 'selectors.hidden == 1', 'rng.die(6) > 0', 'eval("1") == 1',
        'args.missing == 1', 'reads.missing.text == "x"', 'reads.note.secret == "x"', 'reads.note == null',
        'args.constructor == 1', 'args[args.target] == 1', 'args.amount = 1', '(() => true)()',
        'Math.random() > 0', 'args.text + 1 > 0', 'min() > 0', 'floor(1, 2) > 0'])('closes formula authority: %s', formula => {
        const f = authorityFixture(); f.logic.transactions[0].validators[0].formula = formula;
        expect(() => compile(f)).toThrow();
    });
    test.each(['reads.note.text', 'world.hidden', 'data.secret', 'resolution.secret', 'args', 'eval("hidden")'])('receipt cannot disclose %s', formula => {
        const f = authorityFixture(); f.logic.transactions[0].receipt.projection.label = { formula };
        expect(() => compile(f)).toThrow();
    });
    test('nested receipt fields cannot smuggle private references', () => {
        const f = authorityFixture(); const receipt = f.logic.transactions[0].receipt;
        receipt.schema = closed({ nested: { type: 'array', maxItems: 1, items: closed({ value: { type: 'string', maxLength: 256 } }) } });
        receipt.projection = { nested: [{ value: { formula: 'reads.note.text' } }] };
        expect(() => compile(f)).toThrow();
    });
    test.each(['transactions', 'transactions.0.reads', 'transactions.0.validators', 'transactions.0.resolution.cases', 'derivedPublications'])('rejects duplicate IDs in %s', path => {
        const f = authorityFixture(); const list = at(f.logic, path); list.push(structuredClone(list[0])); expect(() => compile(f)).toThrow(/Duplicate/);
    });
    test('rejects verb/ordinary-command/reducer identity ambiguity', () => {
        const f = authorityFixture(); const second = structuredClone(f.logic.transactions[0]); second.id = 'another'; f.logic.transactions.push(second);
        expect(() => compile(f)).toThrow(/Duplicate Transaction verb/);
        f.logic.transactions.pop(); f.logic.commands.push({ id: 'update_note', events: [] }); expect(() => compile(f)).toThrow(/collides/);
        f.logic.commands = []; f.logic.reducers.push(structuredClone(f.logic.reducers[0])); expect(() => compile(f)).toThrow(/Ambiguous/);
    });
    test('rejects missing or noncanonical clock declarations', () => {
        const f = authorityFixture(); delete f.contract.authorityRuntime.canonicalClockId; expect(() => compile(f)).toThrow(/canonical clock/);
        f.contract.lifecycleRuntime.clocks.push({ id: 'other', unit: 'tick', initialTick: 0 }); f.contract.authorityRuntime.canonicalClockId = 'other';
        expect(() => compile(f)).toThrow(/canonical clock/);
    });
    test('derived outputs cannot be direct transaction authority or cyclic/chained sources', () => {
        const f = authorityFixture(); f.logic.transactions[0].effects[1].domainId = 'public_notes'; expect(() => compile(f)).toThrow(/derived publication output/);
        f.logic.transactions[0].effects[1].domainId = 'notes'; f.logic.derivedPublications[0].reads[0].domainId = 'public_notes'; expect(() => compile(f)).toThrow(/derived output/);
    });
    test('derived publishers have single ownership and typed outputs only', () => {
        const f = authorityFixture(); f.logic.derivedPublications.push({ ...structuredClone(f.logic.derivedPublications[0]), id: 'another' });
        expect(() => compile(f)).toThrow(/multiple owners/);
        f.logic.derivedPublications.pop(); f.logic.derivedPublications[0].effects = [{ kind: 'world.event', type: 'NoteChanged', payload: { amount: 1 } }];
        expect(() => compile(f)).toThrow(/typed App Commands/);
    });
});

describe('C1 hard budgets include derived work and worst-case conditional effects', () => {
    test.each([
        ['transactions', 64], ['transactions.0.reads', 16], ['transactions.0.validators', 16], ['transactions.0.resolution.cases', 16],
    ])('accepts exact %s cap %i and rejects cap+1', (path, max) => {
        const f = standalone(); const items = at(f.logic, path); const original = structuredClone(items[0]);
        const item = index => ({ ...structuredClone(original), id: index ? 'item' + index : original.id, ...(path === 'transactions' ? { verb: 'verb' + index } : {}) });
        set(f.logic, path, Array.from({ length: max }, (_, index) => item(index)));
        expect(() => compile(f)).not.toThrow(); at(f.logic, path).push(item(max)); expect(() => compile(f)).toThrow(/limit/);
    });
    test.each([['world.event', 16, 0], ['app.command', 24, 1], ['clock.advance', 1, 2], ['workflow.transition', 1, 3]])('enforces %s cap %i even on false conditions', (kind, max, index) => {
        const f = standalone(); const tx = f.logic.transactions[0]; const effect = { ...tx.effects[index], when: 'false' };
        tx.effects = Array.from({ length: max }, () => structuredClone(effect)); expect(() => compile(f)).not.toThrow();
        tx.effects.push(structuredClone(effect)); expect(() => compile(f)).toThrow(/limit/);
    });
    test('enforces aggregate 32-effect ceiling', () => {
        const f = standalone(); const tx = f.logic.transactions[0]; const [world, app] = tx.effects;
        tx.effects = [...Array(16).fill(world), ...Array(16).fill(app)]; expect(() => compile(f)).not.toThrow();
        tx.effects.push(app); expect(() => compile(f)).toThrow(/limit/);
    });
    test('derived effects and private reads consume the same transaction/hook budget', () => {
        const f = authorityFixture(); const tx = f.logic.transactions[0]; tx.effects = Array(24).fill(tx.effects[1]);
        expect(() => compile(f)).toThrow(/app.command limit/);
        tx.effects = []; tx.reads = Array.from({ length: 16 }, (_, index) => ({ ...tx.reads[0], id: index ? 'read' + index : 'note' }));
        expect(() => compile(f)).toThrow(/read grants limit/);
    });
    test.each(['maxReadGrants', 'maxWorldEvents', 'maxAppCommands', 'maxEffects', 'maxReceiptBytes'])('enforces stricter package policy %s', key => {
        const f = authorityFixture(); f.contract.authorityRuntime.policy[key] = key === 'maxReceiptBytes' ? 10 : 0;
        expect(() => compile(f)).toThrow(/limit/);
    });
    test('accepts 16 explicit read fields and rejects a seventeenth', () => {
        const f = standalone(); const schema = f.contract.lifecycleRuntime.domains[0].recordSchema;
        for (let i = 1; i <= 16; i++) schema.properties['field' + i] = { type: 'string', maxLength: 8 };
        const grant = f.logic.transactions[0].reads[0]; grant.fields = ['text', ...Array.from({ length: 15 }, (_, i) => 'field' + (i + 1))];
        expect(() => compile(f)).not.toThrow(); grant.fields.push('field16'); expect(() => compile(f)).toThrow(/read fields list limit/);
    });
    test('accepts 16 single-layer publishers within aggregate budget and rejects 17', () => {
        const f = authorityFixture(); const tx = f.logic.transactions[0]; tx.effects = []; tx.reads = []; tx.validators = [];
        const prototype = f.logic.derivedPublications[0];
        f.logic.derivedPublications = Array.from({ length: 16 }, (_, i) => {
            const id = 'public_' + i;
            f.contract.lifecycleRuntime.domains.push({ ...structuredClone(f.contract.lifecycleRuntime.domains[1]), id });
            return { ...structuredClone(prototype), id, effects: [{ ...structuredClone(prototype.effects[0]), domainId: id }] };
        });
        tx.derivedPublications = f.logic.derivedPublications.map(item => item.id);
        expect(() => compile(f)).not.toThrow(); f.logic.derivedPublications.push({ ...prototype, id: 'extra' });
        expect(() => compile(f)).toThrow(/derived publications list limit/);
    });
    test('checks aggregate hook work even when no transaction selects a publication', () => {
        const f = authorityFixture(); const tx = f.logic.transactions[0]; tx.effects = []; tx.derivedPublications = [];
        const publication = f.logic.derivedPublications[0];
        f.contract.lifecycleRuntime.domains.push({ ...structuredClone(f.contract.lifecycleRuntime.domains[1]), id: 'public_second' });
        publication.effects = Array(12).fill(publication.effects[0]);
        f.logic.derivedPublications.push({ ...structuredClone(publication), id: 'second', effects: Array(13).fill({ ...publication.effects[0], domainId: 'public_second' }) });
        expect(() => compile(f)).toThrow(/app.command limit/);
    });
    test('bounds UTF-8 receipts rather than character count', () => {
        const f = authorityFixture(); const receipt = f.logic.transactions[0].receipt;
        receipt.projection.label = '汉'.repeat(40); receipt.maxBytes = 128;
        expect(() => compile(f)).toThrow(/receipt template byte/);
    });
    test.each(['x'.repeat(2049), '('.repeat(65) + 'true' + ')'.repeat(65), Array(200).fill('true').join(' && ')])('bounds formula parser work', formula => {
        const f = authorityFixture(); f.logic.transactions[0].validators[0].formula = formula; expect(() => compile(f)).toThrow(/complexity|bounded/);
    });
    test('does not invoke a schemaVersion accessor before checking JSON provenance', () => {
        const f = authorityFixture(); let called = false;
        Object.defineProperty(f.logic, 'schemaVersion', { enumerable: true, get() { called = true; return 3; } });
        expect(() => compile(f)).toThrow(/JSON field/); expect(called).toBe(false);
    });
    test.each(['getter', 'symbol', 'hidden', 'prototype', 'sparse', 'function', 'infinite', 'bytes', 'depth'])('rejects non-data/unbounded logic: %s', kind => {
        const f = authorityFixture(); const tx = f.logic.transactions[0];
        if (kind === 'getter') Object.defineProperty(tx, 'script', { enumerable: true, get() { throw new Error('getter ran'); } });
        if (kind === 'symbol') tx[Symbol('x')] = 1;
        if (kind === 'hidden') Object.defineProperty(tx, 'script', { value: true });
        if (kind === 'prototype') Object.setPrototypeOf(tx, { inherited: true });
        if (kind === 'sparse') tx.effects = Array(1);
        if (kind === 'function') tx.intent.description = () => 'script';
        if (kind === 'infinite') tx.resolution.sides = Infinity;
        if (kind === 'bytes') f.logic.oversized = Array(20).fill('a'.repeat(65536));
        if (kind === 'depth') { let value = {}; tx.deep = value; for (let i = 0; i < 30; i++) { value.child = {}; value = value.child; } }
        expect(() => compile(f)).toThrow();
        expect(() => compile(f)).not.toThrow('getter ran');
    });
});

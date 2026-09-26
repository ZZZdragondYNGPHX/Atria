import { readFileSync } from 'node:fs';
import { describe, expect, jest, test } from '@jest/globals';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { compileMessageBlocks, validateMessageBlocks, MESSAGE_ROOTS } from '../../public/scripts/native/experience/ui/message-templates.js';
import { expression, valueTemplate, UI_ROOTS } from '../../public/scripts/native/experience/ui/v2-values.js';
import { createUiState } from '../../public/scripts/native/experience/ui/v2-state.js';
import { compileExperienceComponentModel } from '../../public/scripts/native/experience/ui/component-model.js';

const fixture = () => JSON.parse(readFileSync(new URL('../native/fixtures/message-projection-v2.json', import.meta.url), 'utf8'));
const compile = raw => compileUiDocument(raw, { mode: 'component' });
const emptyDocument = () => ({ schemaVersion: 2, stateVersion: 1, views: [{ id: 'main', surface: 'chat.footer', mount: 'always', root: { id: 'root', type: 'text', props: { text: 'Ready' } } }] });
const withSchema = schema => {
    const raw = fixture().document;
    raw.messageBlocks.claim.dataSchema = { type: 'object', additionalProperties: false, properties: { value: schema }, required: ['value'] };
    return raw;
};
const projectValue = value => ({ schemaVersion: 1, flow: [{ kind: 'block', id: 'one', type: 'claim', version: 1, data: { value } }] });
const steps = [
    { op: 'ui.set', path: 'ui.details', value: true }, { op: 'ui.toggle', path: 'prefs.compact' }, { op: 'ui.reset', path: 'ui.details' },
];

describe('message document compiler', () => {
    test('compiles the usable prose/status/claim fixture with the same document compiler', () => {
        const { document: raw, projection } = fixture();
        const result = compile(raw);
        expect(result.conversation).toEqual({ mode: 'reader', profile: 'novel' });
        expect(Object.keys(result.messageBlocks)).toEqual(['prose', 'status', 'claim']);
        const claim = result.messageBlocks.claim;
        expect(claim).toMatchObject({ version: 1, maxInstances: 1, attachmentKind: 'claim', actionPolicy: 'active-tail' });
        expect(claim.document.views[0]).toMatchObject({ surface: 'chat.footer', mount: 'always' });
        expect(claim.document.messageBlocks).toEqual({});
        const context = { block: projection.flow[2].data, message: { messageId: 'm1' } };
        expect(claim.document.views[0].root.children[0].bindings.text.read(context)).toBe('Delivery reward (+25)');
        expect(claim.document.actions.claim.steps[0].args.read(context)).toEqual({ claimId: 'harbor_delivery' });
        expect(claim.document.actions.claim.steps[0].commandId).toBe('rewards.claim');
        expect(validateMessageBlocks(result, projection)).toBe(projection);
        expect(Object.isFrozen(claim)).toBe(true);
        expect(Object.isFrozen(claim.dataSchema.properties)).toBe(true);
        expect(Object.isFrozen(result.messageBlocks)).toBe(true);
        expect(raw.messageBlocks.prose.actionPolicy).toBeUndefined();
    });

    test('callback is the only subdocument compiler and receives isolated compile options', () => {
        const raw = fixture().document.messageBlocks;
        const compiler = jest.fn((document, options) => compileUiDocument(document, options));
        const result = compileMessageBlocks(raw, compiler);
        expect(compiler).toHaveBeenCalledTimes(3);
        expect(compiler).toHaveBeenLastCalledWith(raw.claim.document, { mode: 'component', message: true, actionPolicy: 'active-tail' });
        expect(result.prose).toMatchObject({ attachmentKind: null, actionPolicy: 'ui-only' });
    });

    test('optional fields default without changing ordinary UI or v1', () => {
        expect(compile(emptyDocument())).toMatchObject({ conversation: { mode: 'feed', profile: 'default' }, messageBlocks: {} });
        const raw = fixture().document;
        delete raw.messageBlocks.prose.maxInstances;
        expect(compile(raw).messageBlocks.prose.maxInstances).toBe(32);
        expect(compileExperienceComponentModel({ id: 'v1', type: 'text', props: { text: 'Original' } }, { mode: 'component' }).nodeCount).toBe(1);
        expect(() => compileExperienceComponentModel(raw, { mode: 'component' })).toThrow();
        expect(expression('world.hp + selectors.bonus').read({ world: { hp: 2 }, selectors: { bonus: 3 } })).toBe(5);
    });

    test.each(['feed', 'latest', 'reader'].flatMap(mode => ['default', 'novel', 'dialogue'].map(profile => [mode, profile])))('normalizes conversation %s/%s', (mode, profile) => {
        expect(compile({ ...emptyDocument(), conversation: { mode, profile } }).conversation).toEqual({ mode, profile });
    });
    test.each([null, [], { mode: 'stream' }, { profile: 'unknown' }, { mode: null }, { profile: null }, { script: 'x' }])('rejects malformed conversation %#', conversation => {
        expect(() => compile({ ...emptyDocument(), conversation })).toThrow();
    });
    test('partial conversation declarations use independent defaults', () => {
        expect(compile({ ...emptyDocument(), conversation: { profile: 'novel' } }).conversation).toEqual({ mode: 'feed', profile: 'novel' });
        expect(compile({ ...emptyDocument(), conversation: { mode: 'latest' } }).conversation).toEqual({ mode: 'latest', profile: 'default' });
    });

    test.each([
        doc => { doc.messageBlocks = {}; }, doc => { doc.conversation = {}; }, doc => { doc.opening = {}; }, doc => { doc.selectors = {}; },
        doc => { doc.localState.details.scope = 'session'; }, doc => { doc.preferences.compact.scope = 'mount'; },
        doc => { doc.views.push({ ...doc.views[0], id: 'second' }); }, doc => { doc.views = []; },
        doc => { doc.views[0].mount = 'on-demand'; }, doc => { doc.views[0].surface = 'chat.header'; },
        doc => { doc.views[0].surface = 'chat.after'; }, doc => { doc.views[0].surface = 'app.root'; },
        doc => { doc.views[0].root.children.push({ id: 'native', type: 'native-slot', props: { component: 'composer' } }); },
    ])('rejects nested capabilities and invalid message lifetimes/surfaces %#', mutate => {
        const raw = fixture().document; mutate(raw.messageBlocks.claim.document);
        expect(() => compile(raw)).toThrow();
    });

    test('message drafts reset per mount and preferences retain existing player/device scopes', () => {
        const raw = fixture().document;
        raw.messageBlocks.claim.document.preferences.device = { type: 'boolean', default: true, scope: 'device' };
        const doc = compile(raw).messageBlocks.claim.document;
        const write = jest.fn();
        const first = createUiState(doc, { write }); first.set('ui.details', true);
        expect(write).not.toHaveBeenCalled();
        const next = createUiState(doc);
        expect(next.snapshot()).toMatchObject({ ui: { details: false }, prefs: { compact: false, device: true } });
        first.set('prefs.compact', true);
        expect(write).toHaveBeenCalledWith('prefs', 'compact', 'player', true);
    });
});

describe('message expression roots', () => {
    test('exact roots are opt-in for expressions and recursively nested values', () => {
        expect(MESSAGE_ROOTS).toEqual(['ui', 'prefs', 'data', 'env', 'block', 'message', 'item', 'index', 'event', 'form']);
        expect(UI_ROOTS).not.toContain('block'); expect(UI_ROOTS).not.toContain('message');
        for (const root of MESSAGE_ROOTS) expect(expression(root, MESSAGE_ROOTS).read({ [root]: 'value' })).toBe('value');
        const raw = { nested: [{ template: '{{block.label}}' }, { expr: 'message.messageId' }] };
        expect(valueTemplate(raw, MESSAGE_ROOTS).read({ block: { label: 'Claim' }, message: { messageId: 'm1' } })).toEqual({ nested: ['Claim', 'm1'] });
        expect(() => valueTemplate(raw)).toThrow(/root/);
        for (const root of ['block', 'message']) {
            const doc = emptyDocument(); doc.views[0].root.bindings = { text: { expr: root + '.label' } };
            expect(() => compile(doc)).toThrow(/root/);
        }
    });

    const paths = [
        ['binding expression', (doc, root) => { doc.views[0].root.children[0].bindings.text = { expr: root + '.value' }; }],
        ['binding template', (doc, root) => { doc.views[0].root.children[0].bindings.text = { template: '{{' + root + '.value}}' }; }],
        ['action argument', (doc, root) => { doc.actions.claim.steps[0].args = { nested: [{ template: '{{' + root + '.value}}' }] }; }],
        ['action value', (doc, root) => { doc.actions.details.steps = [{ op: 'ui.set', path: 'ui.details', value: { nested: [{ expr: root + '.value' }] } }]; }],
        ['action condition', (doc, root) => { doc.actions.claim.steps[0].when = root + '.value'; }],
        ['constraint condition', (doc, root) => { doc.actions.claim.constraints = [{ when: root + '.value', status: 'allowed', reasonCode: 'ok', playerMessage: 'OK' }]; }],
        ['loop source', (doc, root) => { doc.views[0].root.children[2].children[0].source = root + '.items'; }],
        ['loop key', (doc, root) => { doc.views[0].root.children[2].children[0].key = root + '.id'; }],
        ['loop binding', (doc, root) => { doc.views[0].root.children[2].children[0].children[0].bindings.text = { template: '{{' + root + '.value}}' }; }],
    ];
    test.each(['world', 'selectors', 'state', 'live', 'window'].flatMap(root => paths.map(([name, mutate]) => [root, name, mutate])))('rejects %s hidden in %s', (root, name, mutate) => {
        const raw = fixture().document; mutate(raw.messageBlocks.claim.document, root);
        expect(() => compile(raw)).toThrow(/root/);
    });
});

describe('message action policies', () => {
    test.each(['ui-only', 'active-tail', 'fork-from-anchor'])('%s allows only declared local state/preference writes', policy => {
        const raw = fixture().document; raw.messageBlocks.claim.actionPolicy = policy;
        raw.messageBlocks.claim.document.actions = { local: { steps } };
        raw.messageBlocks.claim.document.views = emptyDocument().views;
        expect(compile(raw).messageBlocks.claim.document.actions.local.steps).toHaveLength(3);
        raw.messageBlocks.claim.document.actions.local.steps = [{ op: 'ui.set', path: 'world.hp', value: 1 }];
        expect(() => compile(raw)).toThrow(/Undeclared/);
    });
    const commands = [{ op: 'command.dispatch', commandId: 'claims.accept', args: { id: { expr: 'block.claimId' } } },
        { op: 'composer.set', value: { template: '{{block.label}}' } }, { op: 'composer.append', value: 'Yes' },
        { op: 'composer.clear' }, { op: 'composer.focus' }, { op: 'composer.submit' }];
    test.each(commands)('typed dispatch and Composer operation $op require an active-tail/fork policy', step => {
        const raw = fixture().document;
        raw.messageBlocks.claim.document.actions.claim.steps = [step];
        for (const policy of ['active-tail', 'fork-from-anchor']) {
            raw.messageBlocks.claim.actionPolicy = policy;
            expect(compile(raw).messageBlocks.claim.document.actions.claim.steps[0].op).toBe(step.op);
        }
        delete raw.messageBlocks.claim.actionPolicy;
        expect(() => compile(raw)).toThrow(/actionPolicy/);
    });
    const denied = [{ op: 'command.simulate', commandId: 'claim' }, { op: 'surface.open', view: 'other' },
        { op: 'surface.close', view: 'other' }, { op: 'opening.next' }, { op: 'opening.back' }, { op: 'opening.confirm' }, { op: 'action.compensate', actionId: 'claim' }];
    test.each(denied)('message actions always reject $op', step => {
        for (const policy of ['ui-only', 'active-tail', 'fork-from-anchor']) {
            const raw = fixture().document; raw.messageBlocks.claim.actionPolicy = policy;
            raw.messageBlocks.claim.document.actions.claim.steps = [step];
            expect(() => compile(raw)).toThrow(/actionPolicy/);
        }
    });
    test('rejects compensation metadata, multiple authority writes, untyped/dynamic commands', () => {
        for (const mutate of [
            action => { action.compensation = 'refund'; },
            action => { action.steps.push({ op: 'command.dispatch', commandId: 'second' }); },
            action => { action.steps[0].commandId = { expr: 'block.command' }; },
            action => { delete action.steps[0].commandId; },
            action => { action.steps = []; },
            action => { action.steps = Array.from({ length: 33 }, () => ({ op: 'composer.focus' })); },
        ]) {
            const raw = fixture().document; mutate(raw.messageBlocks.claim.document.actions.claim);
            expect(() => compile(raw)).toThrow();
        }
    });
});

describe('strict bounded message dataSchema', () => {
    test('zero lower bounds accept empty strings, arrays and closed objects', () => {
        for (const [schema, value] of [
            [{ type: 'string', minLength: 0, maxLength: 0 }, ''],
            [{ type: 'array', minItems: 0, maxItems: 0, items: { type: 'boolean' } }, []],
            [{ type: 'object', additionalProperties: false, properties: {}, required: [] }, {}],
        ]) {
            const projection = projectValue(value);
            expect(validateMessageBlocks(compile(withSchema(schema)), projection)).toBe(projection);
        }
    });
    test.each([
        [{ type: 'string', minLength: 1, maxLength: 4, enum: ['yes', 'no'] }, 'yes', ['', 'other', 1]],
        [{ type: 'number', minimum: 0, maximum: 2 }, 1.5, [-1, 3, '1', Infinity]],
        [{ type: 'integer', minimum: 1, maximum: 2 }, 2, [0, 1.5, 3, Number.MAX_SAFE_INTEGER + 1]],
        [{ type: 'boolean', enum: [true] }, true, [false, 1]],
        [{ type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', maxLength: 3 } }, ['ok'], [[], ['a', 'b', 'c'], [1]]],
        [{ type: 'object', additionalProperties: false, properties: { count: { type: 'integer' } }, required: ['count'] }, { count: 0 }, [{}, { count: 0, extra: true }, { count: Number.MAX_SAFE_INTEGER + 1 }]],
    ])('validates typed scalar and recursive bounds %#', (schema, valid, invalid) => {
        const definition = compile(withSchema(schema));
        const projection = projectValue(valid);
        expect(validateMessageBlocks(definition, projection)).toBe(projection);
        for (const value of invalid) expect(() => validateMessageBlocks(definition, projectValue(value))).toThrow();
    });
    test.each([
        null, {}, { type: 'null' }, { type: ['string', 'number'] }, { type: 'any' },
        { type: 'string' }, { type: 'string', maxLength: -1 }, { type: 'string', maxLength: 65537 },
        { type: 'string', minLength: -1, maxLength: 3 }, { type: 'string', minLength: 4, maxLength: 3 },
        { type: 'string', maxLength: 2.5 }, { type: 'string', maxLength: 2, pattern: '.*' },
        { type: 'string', maxLength: 2, enum: [] }, { type: 'string', maxLength: 2, enum: ['a', 'a'] },
        { type: 'string', maxLength: 2, enum: ['long'] }, { type: 'boolean', enum: [1] },
        { type: 'number', minimum: '0' }, { type: 'number', minimum: 3, maximum: 1 },
        { type: 'integer', minimum: 0.5 }, { type: 'integer', maximum: Number.MAX_SAFE_INTEGER + 1 },
        { type: 'boolean', maxLength: 2 }, { type: 'number', minimum: NaN },
        { type: 'array', maxItems: 2 }, { type: 'array', items: { type: 'boolean' } },
        { type: 'array', maxItems: 257, items: { type: 'boolean' } },
        { type: 'array', minItems: -1, maxItems: 2, items: { type: 'boolean' } },
        { type: 'array', minItems: 3, maxItems: 2, items: { type: 'boolean' } },
        { type: 'array', maxItems: 2, items: [{ type: 'boolean' }] },
        { type: 'object', properties: {} }, { type: 'object', additionalProperties: true, properties: {} },
        { type: 'object', additionalProperties: false },
        { type: 'object', additionalProperties: false, properties: {}, required: ['missing'] },
        { type: 'object', additionalProperties: false, properties: { a: { type: 'boolean' } }, required: ['a', 'a'] },
        { type: 'object', additionalProperties: false, properties: {}, required: 'a' },
        { type: 'boolean', $ref: '#' }, { type: 'boolean', default: true }, { type: 'boolean', code: 'return true' },
    ])('rejects malformed/unsupported schema %#', schema => {
        expect(() => compile(withSchema(schema))).toThrow();
    });
    test('caps recursive depth and schema property/node budgets', () => {
        let schema = { type: 'boolean' };
        for (let i = 0; i < 9; i++) schema = { type: 'array', maxItems: 1, items: schema };
        expect(() => compile(withSchema(schema))).toThrow(/complexity|nest/);
        const properties = Object.fromEntries(Array.from({ length: 129 }, (_, i) => ['p' + i, { type: 'boolean' }]));
        expect(() => compile(withSchema({ type: 'object', additionalProperties: false, properties }))).toThrow(/properties/);
        delete properties.p128;
        expect(() => compile(withSchema({ type: 'object', additionalProperties: false, properties: { a: { type: 'object', additionalProperties: false, properties }, b: { type: 'object', additionalProperties: false, properties } } }))).toThrow(/complexity/);
    });
});

describe('projection capabilities and declaration bounds', () => {
    test('the capability validator preserves canonical prose beyond the UI string limit', () => {
        const projection = { schemaVersion: 1, flow: [{ kind: 'prose', text: 'A'.repeat(65537) }] };
        expect(validateMessageBlocks(compile(emptyDocument()), projection)).toBe(projection);
    });
    test.each([null, [], 'bad'])('rejects malformed messageBlocks map %#', messageBlocks => {
        expect(() => compile({ ...emptyDocument(), messageBlocks })).toThrow();
    });
    test.each([0, -1, 33, 1.5, '1', null])('rejects maxInstances %s', maxInstances => {
        const raw = fixture().document; raw.messageBlocks.claim.maxInstances = maxInstances;
        expect(() => compile(raw)).toThrow(/maxInstances/);
    });
    test.each([
        entry => { entry.version = 0; }, entry => { entry.version = 2; }, entry => { entry.version = '1'; }, entry => { delete entry.version; },
        entry => { entry.attachmentKind = 'html'; }, entry => { entry.attachmentKind = null; },
        entry => { entry.actionPolicy = 'unrestricted'; }, entry => { entry.actionPolicy = null; },
        entry => { entry.script = 'x'; }, entry => { entry.dataSchema = { type: 'string', maxLength: 3 }; },
    ])('rejects undeclared capability/version/shape %#', mutate => {
        const raw = fixture().document; mutate(raw.messageBlocks.claim);
        expect(() => compile(raw)).toThrow();
    });
    test.each(['claim', 'payment_request', 'item_offer', 'action_ref'])('supports attachment metadata %s', attachmentKind => {
        const raw = fixture().document; raw.messageBlocks.claim.attachmentKind = attachmentKind;
        expect(compile(raw).messageBlocks.claim.attachmentKind).toBe(attachmentKind);
    });
    test('type and per-type instance caps accept their boundaries and reject excess', () => {
        const raw = emptyDocument(); const entry = fixture().document.messageBlocks.status;
        raw.messageBlocks = Object.fromEntries(Array.from({ length: 32 }, (_, i) => ['status.' + i, { ...entry, maxInstances: 32 }]));
        const definition = compile(raw);
        const projection = { schemaVersion: 1, flow: Array.from({ length: 32 }, (_, i) => ({ kind: 'block', id: 'b' + i, type: 'status.0', version: 1, data: { label: 'OK', value: i } })) };
        expect(validateMessageBlocks(definition, projection)).toBe(projection);
        projection.flow.push({ ...projection.flow[0], id: 'extra' });
        expect(() => validateMessageBlocks(definition, projection)).toThrow(/maxInstances/);
        raw.messageBlocks.extra = entry;
        expect(() => compile(raw)).toThrow(/32 types/);
    });
    test.each([
        projection => { projection.schemaVersion = 2; }, projection => { projection.flow = {}; },
        projection => { projection.flow[1].type = 'missing'; }, projection => { projection.flow[1].type = 'constructor'; },
        projection => { projection.flow[1].version = 2; }, projection => { delete projection.flow[1].version; },
        projection => { delete projection.flow[1].data; }, projection => { projection.flow[1].data.value = -1; },
        projection => { projection.flow[1].data.extra = true; }, projection => { projection.flow[1].data.value = () => 1; },
        projection => { projection.flow[1].template = 'injected'; }, projection => { projection.flow[1].tree = {}; },
        projection => { projection.flow[1].action = 'claim'; }, projection => { projection.flow[1].id = ''; },
        projection => { projection.flow.push({ ...projection.flow[1] }); },
        projection => { projection.flow.push({ ...projection.flow[2], id: 'second_claim' }); },
        projection => { projection.flow[1].kind = 'html'; }, projection => { projection.flow[0].action = 'claim'; },
    ])('rejects invalid projection type/version/data/structure %#', mutate => {
        const { document, projection } = fixture(); mutate(projection);
        expect(() => validateMessageBlocks(compile(document), projection)).toThrow();
    });
    test('empty projections require no capabilities; declared data remains inert text', () => {
        const projection = { schemaVersion: 1, flow: [] };
        expect(validateMessageBlocks(compile(emptyDocument()), projection)).toBe(projection);
        const definition = compile(withSchema({ type: 'string', maxLength: 128 }));
        const data = projectValue('{{world.hp}} <script>run()</script>');
        expect(validateMessageBlocks(definition, data)).toBe(data);
        expect(() => validateMessageBlocks(compile(emptyDocument()), data)).toThrow(/Undeclared/);
        expect(() => validateMessageBlocks(definition, { schemaVersion: 1, flow: Array.from({ length: 129 }, () => ({ kind: 'prose', text: '' })) })).toThrow(/128/);
    });
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { assertMessageProjection, assertTurnEnvelope, assertConversationThread, MESSAGE_CONTRACT_LIMITS as LIMIT } from '../../public/shared/native-message-contract.js';
import { assertVariant } from '../../src/native/contracts.js';
import { buildAtriaPackageContainer, createNativeId, inspectAtriaSaveContainer } from '../../src/native/index.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { sessionFixture, installFixture, services } from './helpers/session-fixture.js';

const block = (patch = {}) => ({ kind: 'block', id: 'status_1', type: 'status', version: 1, data: { label: 'Health', value: 8 }, ...patch });
const projected = (node = block()) => ({ schemaVersion: 1, flow: [{ kind: 'prose', text: 'A' }, node, { kind: 'prose', text: 'B' }] });
const proseOnly = (text = 'AB') => ({ schemaVersion: 1, flow: [{ kind: 'prose', text }] });
const turn = (patch = {}) => ({ schemaVersion: 1, narrative: 'AB', projection: projected(), outcomes: [], diagnostics: [{ code: 'model.note', message: 'Advisory only' }], ...patch });
const thread = () => ({ schemaVersion: 1, threadId: 'thread_1', scope: { kind: 'session' }, participants: [{ id: 'a', label: 'Actor' }], messages: [{ id: 'm1', participantId: 'a', content: 'AB', projection: projected() }] });
const variant = (patch = {}) => ({ variantId: createNativeId('variant'), sessionId: createNativeId('session'), messageId: createNativeId('message'), content: 'AB', metadata: {}, createdAt: 1, ...patch });

function expectFrozen(value) {
    if (!value || typeof value !== 'object') return;
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectFrozen(child);
}

function nested(depth) {
    let value = { leaf: true };
    for (let i = 0; i < depth; i++) value = { child: value };
    return value;
}

describe('P2 pure MessageProjection contract', () => {
    test('copies/freezes flow and strict JSON without changing canonical prose', () => {
        const source = projected(block({ data: { rows: [{ value: 2, enabled: true, note: null }] } }));
        const result = assertMessageProjection(source, 'AB');
        expect(result).toEqual(source); expectFrozen(result);
        source.flow[1].data.rows[0].value = 99;
        expect(result.flow[1].data.rows[0].value).toBe(2);
        expect(() => result.flow.push({ kind: 'prose', text: 'C' })).toThrow();
        expect(assertMessageProjection({ schemaVersion: 1, flow: [] }, '').flow).toEqual([]);
    });

    test.each([
        ['canonical text mismatch', () => projected(), 'A B'],
        ['unknown projection key', () => ({ ...projected(), metadata: {} }), 'AB'],
        ['unknown prose key', () => ({ schemaVersion: 1, flow: [{ kind: 'prose', text: 'AB', data: {} }] }), 'AB'],
        ['unknown block tree', () => projected(block({ tree: {} })), 'AB'],
        ['unknown kind', () => projected({ kind: 'html', text: 'AB' }), 'AB'],
        ['unsupported schema', () => ({ ...projected(), schemaVersion: 2 }), 'AB'],
        ['unsupported block version', () => projected(block({ version: 2 })), 'AB'],
        ['invalid type', () => projected(block({ type: '../status' })), 'AB'],
        ['invalid local id', () => projected(block({ id: 'bad/id' })), 'AB'],
        ['non-record data', () => projected(block({ data: [] })), 'AB'],
        ['missing data', () => { const node = block(); delete node.data; return projected(node); }, 'AB'],
        ['missing prose text', () => ({ schemaVersion: 1, flow: [{ kind: 'prose' }] }), ''],
    ])('rejects %s', (_label, make, content) => {
        expect(() => assertMessageProjection(make(), content)).toThrow(TypeError);
    });

    test('unique block ids, reusable type identifiers and 128-node boundary', () => {
        const value = { schemaVersion: 1, flow: [block(), block({ id: 'status_2' })] };
        expect(assertMessageProjection(value, '').flow).toHaveLength(2);
        value.flow[1].id = value.flow[0].id;
        expect(() => assertMessageProjection(value, '')).toThrow(/duplicate/);
        const flow = Array.from({ length: LIMIT.flowNodes }, () => ({ kind: 'prose', text: '' }));
        expect(assertMessageProjection({ schemaVersion: 1, flow }, '').flow).toHaveLength(128);
        expect(() => assertMessageProjection({ schemaVersion: 1, flow: [...flow, flow[0]] }, '')).toThrow();
    });

    test.each([
        ['undefined', () => undefined], ['function', () => () => 1], ['bigint', () => 1n],
        ['NaN', () => NaN], ['Infinity', () => Infinity], ['Date', () => new Date()],
        ['Map', () => new Map()], ['class', () => new (class Data {})()],
        ['cycle', () => { const value = {}; value.self = value; return value; }],
        ['prototype pollution', () => JSON.parse('{"__proto__":{"polluted":true}}')],
        ['constructor', () => ({ constructor: {} })],
        ['sparse array', () => Array(1)],
        ['extra array key', () => Object.assign([], { custom: true })],
        ['symbol field', () => ({ [Symbol('hidden')]: 1 })],
        ['hidden field', () => Object.defineProperty({}, 'hidden', { value: 1 })],
    ])('rejects non-JSON/executable structure: %s', (_label, make) => {
        expect(() => assertMessageProjection(projected(block({ data: { value: make() } })), 'AB')).toThrow(TypeError);
    });

    test('does not invoke getters, toJSON or attacker-provided array iterators', () => {
        let calls = 0;
        const data = Object.defineProperty({}, 'value', { enumerable: true, get() { calls++; return 1; } });
        expect(() => assertMessageProjection(projected(block({ data })), 'AB')).toThrow();
        expect(() => assertMessageProjection(projected(block({ data: { toJSON() { calls++; return {}; } } })), 'AB')).toThrow();
        const flow = [];
        Object.defineProperty(flow, Symbol.iterator, { value() { calls++; return [][Symbol.iterator](); } });
        expect(() => assertMessageProjection({ schemaVersion: 1, flow }, '')).toThrow();
        const foreign = vm.runInNewContext('Object.defineProperty(Object.prototype, "schemaVersion", {get(){throw new Error("executed inherited getter")}}); ({flow:[]})');
        expect(() => assertMessageProjection(foreign, '')).toThrow(/missing a required field/);
        expect(calls).toBe(0);
    });

    test.each([
        ['depth', () => nested(LIMIT.dataDepth + 1)],
        ['record width', () => Object.fromEntries(Array.from({ length: LIMIT.dataKeys + 1 }, (_, i) => ['k' + i, 1]))],
        ['array length', () => ({ items: Array(LIMIT.dataArrayItems + 1).fill(null) })],
        ['string length', () => ({ text: 'x'.repeat(LIMIT.dataStringLength + 1) })],
        ['total characters', () => ({ items: Array(5).fill('x'.repeat(LIMIT.dataStringLength)) })],
        ['total nodes', () => ({ items: Array.from({ length: 40 }, () => Array(128).fill(0)) })],
    ])('bounds %s', (_label, make) => {
        expect(() => assertMessageProjection(projected(block({ data: make() })), 'AB')).toThrow();
    });

    test('runs without Node/browser globals and accepts cross-realm JSON records', async () => {
        const module = new vm.SourceTextModule(readFileSync(new URL('../../public/shared/native-message-contract.js', import.meta.url), 'utf8'), { context: vm.createContext({}) });
        await module.link(() => { throw new Error('Shared contract must have no imports'); });
        await module.evaluate();
        expect(module.namespace.assertMessageProjection(projected(), 'AB')).toEqual(projected());
        const foreign = vm.runInNewContext('({schemaVersion:1,flow:[{kind:"prose",text:"AB"}]})');
        expect(assertMessageProjection(foreign, 'AB')).toEqual(proseOnly());
    });

    test('Variant owns the optional projection; legacy v1 stays projection-free', () => {
        const source = projected();
        const result = assertVariant(variant({ projection: source }));
        expect(result.content).toBe('AB'); expectFrozen(result.projection);
        source.flow[1].data.value = 1;
        expect(result.projection.flow[1].data.value).toBe(8);
        expect(assertVariant(variant())).not.toHaveProperty('projection');
        expect(() => assertVariant(variant({ projection: undefined }))).toThrow();
        expect(() => assertVariant(variant({ projection: projected(), content: 'Corrupt' }))).toThrow(/canonical/);
        expect(() => assertVariant(variant({ tree: {} }))).toThrow(/unsupported/);
        expectFrozen(assertVariant(variant({ metadata: { atri_turn_diagnostics: turn().diagnostics } })).metadata.atri_turn_diagnostics);
        expect(() => assertVariant(variant({ metadata: { atri_turn_diagnostics: [{ code: 'note', message: '', exposure: true }] } }))).toThrow();
    });
});

describe('P2 TurnEnvelope and Conversation Thread', () => {
    test('returns detached frozen envelopes and read-only thread snapshots', () => {
        const source = turn(); const envelope = assertTurnEnvelope(source);
        expectFrozen(envelope); source.diagnostics[0].message = 'changed';
        expect(envelope.diagnostics[0].message).toBe('Advisory only');
        const value = thread(); const result = assertConversationThread(value);
        expectFrozen(result); value.messages[0].projection.flow[1].data.value = 1;
        expect(result.messages[0].projection.flow[1].data.value).toBe(8);
        expect(assertTurnEnvelope({ schemaVersion: 1, narrative: '', outcomes: [], diagnostics: [] })).not.toHaveProperty('projection');
        expect(assertConversationThread({ ...thread(), participants: [], messages: [] }).messages).toEqual([]);
        for (const kind of ['session', 'world', 'scene']) expect(assertConversationThread({ ...thread(), scope: { kind } }).scope).toEqual({ kind });
    });

    test.each([
        ['outcomes', { outcomes: [{ kind: 'world.write', path: 'hp', value: 99 }] }],
        ['missing outcomes', { outcomes: undefined }],
        ['missing diagnostics', { diagnostics: undefined }],
        ['unknown envelope fields', { statePatch: {} }],
        ['unknown diagnostic fields', { diagnostics: [{ code: 'note', message: 'Note', exposure: true }] }],
        ['oversized diagnostics', { diagnostics: Array(17).fill({ code: 'note', message: '' }) }],
        ['oversized message', { diagnostics: [{ code: 'note', message: 'x'.repeat(513) }] }],
        ['prose mismatch', { narrative: 'other' }],
    ])('rejects envelope %s', (_label, patch) => {
        expect(() => assertTurnEnvelope(turn(patch))).toThrow(TypeError);
    });

    test.each([
        ['authority', value => { value.unread = 1; }],
        ['scope authority', value => { value.scope.persist = true; }],
        ['unknown scope', value => { value.scope.kind = 'account'; }],
        ['invalid scope id', value => { value.scope = { kind: 'world', id: '' }; }],
        ['duplicate participants', value => { value.participants.push(value.participants[0]); }],
        ['unknown participant', value => { value.messages[0].participantId = 'missing'; }],
        ['duplicate messages', value => { value.messages.push(value.messages[0]); }],
        ['message metadata', value => { value.messages[0].metadata = {}; }],
        ['participant metadata', value => { value.participants[0].metadata = {}; }],
        ['corrupt prose', value => { value.messages[0].content = 'wrong'; }],
        ['too many participants', value => { value.participants = Array(65).fill(value.participants[0]); }],
        ['too many messages', value => { value.messages = Array(257).fill(value.messages[0]); }],
        ['total content', value => { value.messages = [0, 1].map(i => ({ id: 'm' + i, participantId: 'a', content: 'x'.repeat(LIMIT.contentLength) })); }],
    ])('rejects thread %s', (_label, mutate) => {
        const value = thread(); mutate(value);
        expect(() => assertConversationThread(value)).toThrow(TypeError);
    });
});

async function installProjectedFixture(h, { entryOverride = false, initialTimeline } = {}) {
    const fixture = sessionFixture();
    if (initialTimeline) fixture.manifest.entryPoints[0].initialTimeline = initialTimeline;
    const { document } = JSON.parse(readFileSync(new URL('./fixtures/message-projection-v2.json', import.meta.url), 'utf8'));
    const experience = { mode: 'component', componentModelVersion: 2, component: 'ui/messages.json' };
    fixture.manifest.runtime = { experience };
    if (entryOverride) {
        fixture.manifest.runtime.experience = { mode: 'text' };
        fixture.manifest.entryPoints[0].runtime = { experience };
    }
    const svc = services(h);
    const sourceFiles = new Map([['ui/messages.json', Buffer.from(JSON.stringify(document))]]);
    const { archive } = buildAtriaPackageContainer({ manifest: fixture.manifest, sourceFiles, assetPayloads: new Map() });
    await svc.packageInstaller.install(h.handle, archive);
    return { ...svc, ...fixture, sourceFiles, start: { packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId, entryPointId: fixture.entryPointId } };
}

const HARNESS = [['FsEngine', makeTempFsEngineHarness], ['SqliteEngine', makeTempSqliteEngineHarness]];
describe.each(HARNESS)('P2 committed projection - %s', (_name, make) => {
    let h;
    beforeEach(async () => { h = await make(); });
    afterEach(async () => { await h.cleanup(); });

    test('append/save/load/fork/restore retain one immutable Variant, not Timeline projection', async () => {
        const f = await installProjectedFixture(h);
        const initial = await f.core.create(h.handle, f.start);
        const sessionId = initial.session.sessionId;
        const source = projected();
        const view = await f.core.appendTimeline(h.handle, sessionId, { role: 'assistant', content: 'AB', projection: source });
        const original = view.variants.at(-1);
        expect(original.projection).toEqual(projected()); expectFrozen(original.projection);
        expect(view.timeline.at(-1)).not.toHaveProperty('projection');
        expect(view.timeline.at(-1).content).toBe('AB');
        source.flow[1].data.value = 42;
        await expect(f.sessionRepo.putVariant(h.handle, { ...original, projection: source })).rejects.toMatchObject({ code: 'native_immutable_conflict' });
        const save = await f.core.createSavePoint(h.handle, sessionId);
        const fork = await f.core.forkBranch(h.handle, sessionId);
        expect(fork.variants.at(-1)).toEqual(original);
        await f.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Future' });
        const restored = await f.core.restoreSavePoint(h.handle, sessionId, save.saveId);
        expect(restored.variants.at(-1)).toEqual(original);
        expect(restored.timeline.at(-1).content).toBe('AB');
        const reloaded = await services(h).core.load(h.handle, sessionId);
        expect(reloaded.variants.at(-1)).toEqual(original); expectFrozen(reloaded.variants.at(-1).projection);
        expect(JSON.parse(JSON.stringify(reloaded)).variants.at(-1).projection).toEqual(projected());
        const exported = await f.saveSystem.exportSnapshot(h.handle, sessionId, save.saveId);
        expect(inspectAtriaSaveContainer(exported.archive).save.closure.variants.find(item => item.variantId === original.variantId).projection).toEqual(projected());
        const target = await make();
        try {
            const other = services(target);
            await other.packageInstaller.install(target.handle, await f.assetStore.readBlob(h.handle, view.session.packageContentHash));
            const imported = await other.saveSystem.importSave(target.handle, exported.archive);
            const loaded = await other.core.load(target.handle, imported.session.sessionId);
            expect(loaded.variants.at(-1).projection).toEqual(projected());
        } finally { await target.cleanup(); }
    });

    test('creation validates projected opening Variants before publishing the Session', async () => {
        const good = await installProjectedFixture(h, { initialTimeline: [{ role: 'assistant', envelope: turn() }] });
        expect((await good.core.create(h.handle, good.start)).variants[0].projection).toEqual(projected());
        const bad = await installProjectedFixture(h, { initialTimeline: [{ role: 'assistant', content: 'AB', projection: projected(block({ type: 'missing' })) }] });
        const before = await bad.sessionRepo.list(h.handle);
        await expect(bad.core.create(h.handle, bad.start)).rejects.toThrow(/Undeclared/);
        expect(await bad.sessionRepo.list(h.handle)).toEqual(before);
    });

    test('normalizes assistant envelope on runtime append and keeps diagnostics off Timeline', async () => {
        const f = await installProjectedFixture(h, { entryOverride: true });
        const initial = await f.core.create(h.handle, f.start);
        const view = await f.core.applyRuntimeCommit(h.handle, initial.session.sessionId, { commands: [
            { type: 'append', draft: { role: 'user', content: 'AB', projection: projected() } },
            { type: 'append', draft: { role: 'assistant', envelope: turn(), content: 'AB', projection: projected(), metadata: { source: 'model' } } },
        ] });
        expect(view.variants.at(-1).projection).toEqual(projected());
        expect(view.variants.at(-1).metadata).toEqual({ source: 'model', atri_turn_diagnostics: turn().diagnostics });
        expect(view.timeline.at(-1).metadata).toEqual({ source: 'model' });
        expect(view.timeline.at(-1).content).toBe('AB');
        expect(view.variants.at(-1)).not.toHaveProperty('envelope');
        expect(view.states).toEqual(initial.states);
        expect((await services(h).core.load(h.handle, initial.session.sessionId)).variants.at(-1).metadata.atri_turn_diagnostics).toEqual(turn().diagnostics);
    });

    test('rejects envelope conflicts, outcomes and other roles before changing HEAD', async () => {
        const f = await installProjectedFixture(h);
        const before = await f.core.create(h.handle, f.start);
        const drafts = [
            { role: 'assistant', envelope: turn(), content: 'Conflict' },
            { role: 'assistant', envelope: turn(), projection: projected(block({ data: { label: 'Other', value: 8 } })) },
            { role: 'assistant', envelope: { schemaVersion: 1, narrative: 'AB', outcomes: [], diagnostics: [] }, projection: projected() },
            { role: 'assistant', envelope: turn({ outcomes: [{ kind: 'write' }] }) },
            { role: 'assistant', envelope: turn(), metadata: { atri_turn_diagnostics: [] } },
            { role: 'user', envelope: turn() },
            ...['system', 'tool', 'developer'].map(role => ({ role, content: 'AB', projection: projected() })),
        ];
        for (const draft of drafts) {
            await expect(f.core.appendTimeline(h.handle, before.session.sessionId, draft)).rejects.toThrow();
        }
        expect((await f.core.load(h.handle, before.session.sessionId)).revision).toEqual(before.revision);
    });

    test.each([
        ['undeclared type', block({ type: 'missing' })],
        ['unknown data key', block({ data: { label: 'Health', value: 8, arbitrary: 1 } })],
        ['injected tree', block({ data: { label: 'Health', value: 8, tree: { type: 'text' } } })],
        ['bad schema value', block({ data: { label: 'Health', value: '8' } })],
        ['unknown nested data key', block({ type: 'claim', data: { claimId: 'reward', label: 'Reward', amount: 1, details: [{ id: 'd1', text: 'Detail', arbitrary: true }] } })],
    ])('rejects %s before batch commit and again on load with valid integrity', async (_label, node) => {
        const f = await installProjectedFixture(h);
        const initial = await f.core.create(h.handle, f.start);
        const sessionId = initial.session.sessionId;
        await expect(f.core.applyRuntimeCommit(h.handle, sessionId, { commands: [
            { type: 'append', draft: { role: 'assistant', content: 'AB', projection: projected() } },
            { type: 'append', draft: { role: 'assistant', content: 'AB', projection: projected(node) } },
        ], statePatch: { atri_test: { changed: true } } })).rejects.toThrow();
        expect((await f.core.load(h.handle, sessionId)).revision).toEqual(initial.revision);
        const valid = await f.core.appendTimeline(h.handle, sessionId, { role: 'assistant', content: 'AB', projection: projected() });
        const last = valid.variants.at(-1);
        const key = { kind: 'atri_timeline_variant', handle: h.handle, sessionId, messageId: last.messageId, variantId: last.variantId };
        await h.engine.withTransaction(h.handle, async tx => {
            const record = await tx.getResource(key);
            record.doc.projection = projected(node); record.integrity = hashNativeDocument(record.doc);
            await tx.putResource(key, record);
        });
        await expect(services(h).core.load(h.handle, sessionId)).rejects.toThrow();
        expect((await f.sessionRepo.get(h.handle, sessionId)).headRevisionId).toBe(valid.revision.revisionId);
    });

    test('load rejects corrupted canonical prose even with recomputed resource integrity', async () => {
        const f = await installProjectedFixture(h); const first = await f.core.create(h.handle, f.start);
        const view = await f.core.appendTimeline(h.handle, first.session.sessionId, { role: 'assistant', envelope: turn() });
        const last = view.variants.at(-1);
        const key = { kind: 'atri_timeline_variant', handle: h.handle, sessionId: last.sessionId, messageId: last.messageId, variantId: last.variantId };
        await h.engine.withTransaction(h.handle, async tx => {
            const record = await tx.getResource(key); record.doc.content = 'Corrupt'; record.integrity = hashNativeDocument(record.doc);
            await tx.putResource(key, record);
        });
        await expect(f.core.load(h.handle, last.sessionId)).rejects.toThrow(/canonical/);
    });

    test('prose-only projection accepts legacy packages; blocks require pinned v2', async () => {
        const f = await installFixture(h); const first = await f.core.create(h.handle, f.start);
        expect(first.variants[0]).not.toHaveProperty('projection');
        const view = await f.core.appendTimeline(h.handle, first.session.sessionId, { role: 'user', content: 'AB', projection: proseOnly() });
        expect(view.variants.at(-1).projection).toEqual(proseOnly());
        await expect(f.core.appendTimeline(h.handle, first.session.sessionId, { role: 'assistant', envelope: turn() })).rejects.toThrow(/pinned UI Document v2/);
        expect((await services(h).core.load(h.handle, first.session.sessionId)).revision).toEqual(view.revision);
    });

    test('an installed newer template never replaces the Session pinned template', async () => {
        const f = await installProjectedFixture(h); const first = await f.core.create(h.handle, f.start);
        const files = new Map(f.sourceFiles); const doc = JSON.parse(files.get('ui/messages.json').toString());
        doc.messageBlocks.status.dataSchema.properties.value.maximum = 1;
        files.set('ui/messages.json', Buffer.from(JSON.stringify(doc)));
        const manifest = { ...f.manifest, packageVersionId: createNativeId('packageVersion'), version: '2.0.0' };
        await f.packageInstaller.install(h.handle, buildAtriaPackageContainer({ manifest, sourceFiles: files, assetPayloads: new Map() }).archive);
        const view = await f.core.appendTimeline(h.handle, first.session.sessionId, { role: 'assistant', content: 'AB', projection: projected() });
        expect(view.session.packageVersionId).toBe(f.start.packageVersionId);
        expect((await services(h).core.load(h.handle, first.session.sessionId)).variants.at(-1).projection).toEqual(projected());
        const newer = await f.core.create(h.handle, { ...f.start, packageVersionId: manifest.packageVersionId });
        await expect(f.core.appendTimeline(h.handle, newer.session.sessionId, { role: 'assistant', content: 'AB', projection: projected() })).rejects.toThrow();
    });
});

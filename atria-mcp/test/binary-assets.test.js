import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { BinaryAssets, BINARY_ASSET_CATALOG } from '../src/binary-assets.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const binding = { owner: 'fixture-owner', clientInstanceId: 'fixture-client', purpose: 'package-archive',
    sourceAuthority: 'native.studio.package', sourceScope: { projectId: 'project-1' }, sourceRevision: 'revision-1',
    allowedOperations: ['inspect', 'read', 'package.preflight', 'package.install'] };
const begin = (store, bytes = Buffer.from('abcdefgh'), changes = {}) => store.begin({ binding, contentHash: hash(bytes), totalBytes: bytes.length, mediaType: 'application/octet-stream', ...changes });
const write = (store, handle, bytes, offset = 0, changes = {}) => store.writeChunk(handle.handleId, { binding, offset, bytes, chunkHash: hash(bytes), ...changes });

test('cross-realm ordinary bindings are accepted without admitting class, exotic or polluted objects', () => {
    const foreign = runInNewContext('JSON.parse(input)', { input: JSON.stringify(binding) }), store = new BinaryAssets(), bytes = Buffer.from('realm');
    const handle = begin(store, bytes, { binding: foreign });
    store.writeChunk(handle.handleId, { binding: foreign, offset: 0, bytes, chunkHash: hash(bytes) });
    store.finalize(handle.handleId, { binding: foreign });
    assert.equal(store.inspect(handle.handleId, { binding: foreign }).state, 'complete');
    for (const candidate of [runInNewContext('new (class Binding { constructor(input) { Object.assign(this, JSON.parse(input)); } })(input)', { input: JSON.stringify(binding) }),
        new Date(), [], Object.assign(Object.create({}), binding), { ...binding, sourceScope: { constructor: 'pollution' } },
        { ...binding, sourceScope: JSON.parse('{"__proto__":"pollution"}') }, { ...binding, [Symbol('hidden')]: true }]) {
        assert.throws(() => begin(new BinaryAssets(), bytes, { binding: candidate }), /invalid/);
    }
    store.clear();
});

test('fixed authority, purpose, scope and binary metadata never grant business permission', () => {
    const store = new BinaryAssets({ maxChunkBytes: 4 }), bytes = Buffer.from('abcdefgh'), handle = begin(store, bytes);
    assert.equal(handle.state, 'receiving'); assert.match(handle.authorization, /independent approval/);
    assert.equal(write(store, handle, bytes.subarray(0, 4)).nextOffset, 4);
    assert.equal(write(store, handle, bytes.subarray(4), 4).nextOffset, 8);
    const complete = store.finalize(handle.handleId, { binding });
    assert.equal(complete.state, 'complete'); assert.equal(complete.contentHash, hash(bytes));
    assert.doesNotMatch(JSON.stringify(complete), /abcdefgh|YWJjZGVmZ2g|Buffer|"data"/);
    const payload = store.getBytes(handle.handleId, { binding, operation: 'package.preflight' });
    assert.deepEqual(payload.bytes, bytes); assert.equal(payload.size, 8);
    assert.throws(() => JSON.stringify(payload), /cannot be serialized/);
    assert.throws(() => JSON.stringify({ receipt: payload }), /cannot be serialized/);
    const copy = payload.bytes; copy.fill(0);
    assert.deepEqual(store.getBytes(handle.handleId, { binding, operation: 'package.install' }).bytes, bytes);
    const chunk = store.readChunk(handle.handleId, { binding, offset: 3, length: 4 });
    assert.equal(chunk.chunkHash, hash(bytes.subarray(3, 7))); assert.deepEqual(chunk.payload.bytes, bytes.subarray(3, 7));
    assert.throws(() => JSON.stringify(chunk), /cannot be serialized/);
    assert.throws(() => store.readChunk(handle.handleId, { binding, offset: 0, length: 5 }), /read length/);
    assert.throws(() => store.getBytes(handle.handleId, { binding, operation: 'host.execute' }), /not permitted/);
    assert.throws(() => store.getBytes(handle.handleId, { binding }), /explicit/);
    assert.throws(() => store.readChunk(handle.handleId, { binding, operation: 'inspect', offset: 0, length: 1 }), /explicit/);
    assert.deepEqual(store.inspect(handle.handleId, { binding: { ...binding, allowedOperations: [...binding.allowedOperations].reverse() } }), complete);
});

test('every identity dimension and allowed operations are bound exactly', () => {
    const store = new BinaryAssets(), handle = begin(store);
    const changes = [{ owner: 'other' }, { clientInstanceId: 'other' }, { sourceRevision: 'other' },
        { sourceScope: { projectId: 'other' } }, { sourceAuthority: 'native.asset' }, { allowedOperations: ['inspect'] },
        { purpose: 'mask-checkpoint', sourceAuthority: 'native.asset', allowedOperations: ['inspect', 'read'] }];
    for (const change of changes) {
        const other = { ...binding, ...change };
        assert.throws(() => store.inspect(handle.handleId, { binding: other }), /binding mismatch/);
        assert.throws(() => store.cancel(handle.handleId, { binding: other }), /binding mismatch/);
        assert.throws(() => write(store, handle, Buffer.from('abcd'), 0, { binding: other }), /binding mismatch/);
    }
    assert.equal(store.inspect(handle.handleId, { binding }).receivedBytes, 0);
    for (const change of [{ sourceAuthority: 'https://untrusted.test' }, { purpose: '__proto__' }, { allowedOperations: ['inspect', 'host.execute'] },
        { allowedOperations: ['inspect', 'inspect'] }, { sourceScope: {} }, { sourceScope: { constructor: 'bad' } }, { unknown: true }]) {
        assert.throws(() => begin(store, undefined, { binding: { ...binding, ...change } }), /Binary Asset/);
    }
    assert.throws(() => begin(store, undefined, { binding: { ...binding, allowedOperations: ['read'] } }), /allowed operations/);
    assert.throws(() => { store.maxTotalBytes = 1024 * 1024 * 1024; }, TypeError);
});

test('out of order, duplicate, corrupt and overlong chunks invalidate and erase staging', () => {
    const cases = [
        (store, handle) => write(store, handle, Buffer.from('abcd'), 1),
        (store, handle) => { write(store, handle, Buffer.from('abcd')); return write(store, handle, Buffer.from('abcd')); },
        (store, handle) => write(store, handle, Buffer.from('abcd'), 0, { chunkHash: '0'.repeat(64) }),
        (store, handle) => write(store, handle, Buffer.from('abcdefghi')),
        (store, handle) => write(store, handle, Buffer.alloc(0)),
        (store, handle) => write(store, handle, new Uint8Array(4)),
    ];
    for (const action of cases) {
        const store = new BinaryAssets({ maxChunkBytes: 8 }), handle = begin(store);
        assert.throws(() => action(store, handle), /Binary Asset/);
        assert.equal(store.inspect(handle.handleId, { binding }).state, 'invalid');
        assert.equal(store.capacity.reservedBytes, 0);
        assert.throws(() => store.finalize(handle.handleId, { binding }), /not receiving/);
        assert.throws(() => store.getBytes(handle.handleId, { binding, operation: 'read' }), /complete/);
    }
});

test('incomplete and full hash mismatches cannot produce completed handles', () => {
    for (const full of [false, true]) {
        const store = new BinaryAssets(), handle = begin(store, undefined, { contentHash: '0'.repeat(64) });
        write(store, handle, Buffer.from(full ? 'abcdefgh' : 'abcd'));
        assert.throws(() => store.finalize(handle.handleId, { binding }), full ? /complete content hash/ : /incomplete/);
        assert.equal(store.inspect(handle.handleId, { binding }).state, 'invalid');
        assert.equal(store.capacity.reservedBytes, 0);
    }
    const store = new BinaryAssets(), handle = begin(store);
    assert.throws(() => store.getBytes(handle.handleId, { binding, operation: 'read' }), /complete/);
});

test('native per-purpose limits, chunk, aggregate, count and TTL are bounded', () => {
    assert.equal(BINARY_ASSET_CATALOG['package-archive'].maxBytes, 128 * 1024 * 1024);
    assert.equal(BINARY_ASSET_CATALOG['resource-bundle'].maxBytes, 32 * 1024 * 1024);
    assert.equal(BINARY_ASSET_CATALOG['mask-checkpoint'].maxBytes, 16 * 1024 * 1024);
    const store = new BinaryAssets({ limitsByPurpose: { 'package-archive': 8 }, maxEntries: 2, maxTotalBytes: 12 });
    assert.throws(() => begin(store, Buffer.alloc(9)), /total bytes/);
    const first = begin(store), second = begin(store, Buffer.alloc(4));
    assert.throws(() => begin(store, Buffer.alloc(1)), /capacity/);
    store.cancel(first.handleId, { binding });
    assert.equal(store.capacity.reservedBytes, 4);
    assert.throws(() => begin(store, Buffer.alloc(8), { ttlMs: 900001 }), /TTL/);
    assert.throws(() => begin(store, Buffer.alloc(8), { mediaType: 'text/html' }), /media type/);
    assert.throws(() => begin(store, Buffer.alloc(8), { contentHash: 'bad' }), /content hash/);
    store.clear(); assert.equal(store.capacity.reservedBytes, 0); assert.equal(store.capacity.entries, 0);
    assert.throws(() => store.inspect(second.handleId, { binding }), /unknown/);
    for (const options of [{ maxChunkBytes: Infinity }, { maxEntries: 0 }, { maxTotalBytes: -1 }, { maxTtlMs: NaN },
        { limitsByPurpose: { unknown: 1 } }, { limitsByPurpose: { 'package-archive': 129 * 1024 * 1024 } }]) assert.throws(() => new BinaryAssets(options), /Binary Asset/);
});

test('expiry cancels staging and completed transfers without business retry', () => {
    let now = 0;
    const store = new BinaryAssets({ now: () => now, maxTotalBytes: 8, maxEntries: 1, maxTtlMs: 10 }), handle = begin(store);
    write(store, handle, Buffer.from('abcdefgh')); store.finalize(handle.handleId, { binding });
    now = handle.expiresAt;
    assert.throws(() => store.getBytes(handle.handleId, { binding, operation: 'read' }), /expired/);
    assert.equal(store.capacity.reservedBytes, 0); assert.equal(store.capacity.entries, 0);
    const next = begin(store); assert.notEqual(next.handleId, handle.handleId);
    assert.deepEqual(store.cancel(next.handleId, { binding }), { handleId: next.handleId, state: 'cancelled' });
    assert.throws(() => store.finalize(next.handleId, { binding }), /unknown/);
});

test('multi-megabyte payload crosses JSON response bounds using bounded internal chunks', () => {
    const store = new BinaryAssets(), bytes = Buffer.alloc(2 * 1024 * 1024 + 17, 0xa5), handle = begin(store, bytes);
    for (let offset = 0; offset < bytes.length; offset += store.maxChunkBytes) {
        const chunk = bytes.subarray(offset, Math.min(offset + store.maxChunkBytes, bytes.length));
        const progress = write(store, handle, chunk, offset);
        assert.ok(JSON.stringify(progress).length < 1500);
    }
    assert.equal(store.finalize(handle.handleId, { binding }).totalBytes, bytes.length);
    assert.equal(hash(store.getBytes(handle.handleId, { binding, operation: 'read' }).bytes), hash(bytes));
    store.clear();
    assert.equal(store.capacity.reservedBytes, 0);
});

import { createHash } from 'node:crypto';
import { NativeMcpArtifacts } from '../../src/native/mcp-artifacts.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const owner = 'source-owner', clientInstanceId = 'source-client', bindingHash = sha(Buffer.from('exact-metadata'));
const begin = (store, bytes, kind = 'extension-source-upload') => store.beginSource(owner,
    { clientInstanceId, contentHash: sha(bytes), totalBytes: bytes.length }, kind, bindingHash);
const complete = (store, bytes, kind) => {
    const stage = begin(store, bytes, kind);
    for (let offset = 0; offset < bytes.length; offset += stage.maxChunkBytes) {
        const chunk = bytes.subarray(offset, offset + stage.maxChunkBytes);
        store.write(owner, stage.artifactRef, offset, chunk, sha(chunk));
    }
    return store.finalize(owner, stage.artifactRef).artifactRef;
};

test('fixed-source purposes share bounded staging but cannot cross owner, client, metadata or consumer', async () => {
    const store = new NativeMcpArtifacts(), bytes = Buffer.alloc(2 * 1024 * 1024 + 7, 97);
    const ref = complete(store, bytes, 'extension-source-upload');
    await expect(store.withSource(owner, ref, 'extension-source-upload', bindingHash, value => value.equals(bytes))).resolves.toBe(true);
    await expect(store.withSource(owner, ref, 'skill-payload-upload', bindingHash, () => {})).rejects.toThrow('purpose');
    await expect(store.withSource(owner, ref, 'extension-source-upload', '0'.repeat(64), () => {})).rejects.toThrow('purpose');
    await expect(store.withSource('foreign', ref, 'extension-source-upload', bindingHash, () => {})).rejects.toThrow('not found');
    await expect(store.withSource(owner, { ...ref, clientInstanceId: 'foreign' }, 'extension-source-upload', bindingHash, () => {})).rejects.toThrow('binding');
    store.cancel(owner, ref); expect(store.capacity.reservedBytes).toBe(0);
});

test('source transfers retain domain limits, leases and whole/chunk integrity', async () => {
    let now = 0;
    const store = new NativeMcpArtifacts({ now: () => now, ttlMs: 10 }), bytes = Buffer.from('bounded source');
    expect(() => store.beginSource(owner, { clientInstanceId, contentHash: sha(bytes), totalBytes: 4 * 1024 * 1024 + 1 }, 'extension-source-upload', bindingHash)).toThrow();
    expect(() => begin(store, bytes, 'arbitrary-code')).toThrow();
    const ref = complete(store, bytes, 'skill-payload-upload'); let release;
    const consume = store.withSource(owner, ref, 'skill-payload-upload', bindingHash, async value => {
        await new Promise(resolve => { release = resolve; }); expect(value.equals(bytes)).toBe(true);
    });
    expect(() => store.cancel(owner, ref)).toThrow('use'); now = 10; store.cleanup();
    expect(store.capacity.reservedBytes).toBe(bytes.length); release(); await consume;
    expect(store.capacity.reservedBytes).toBe(0);
    const invalid = begin(store, bytes);
    expect(() => store.write(owner, invalid.artifactRef, 0, bytes, '0'.repeat(64))).toThrow('chunk');
    expect(store.capacity.reservedBytes).toBe(0);
});

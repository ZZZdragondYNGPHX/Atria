import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { NativeHostOwner } from '../../src/storage/native-host-owner.js';
import { NATIVE_RESOURCE_KINDS as K, assertNativeResourceKey } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { nativeRecord, putImmutable } from '../../src/native/repositories/common.js';
import { decodeNativeResourceKey, encodeNativeResourceKey, nativeResourceFileId } from '../../src/storage/engines/native-resource-key.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

function keys(handle) {
    const planId = createNativeId('orchestrationPlan');
    const runId = createNativeId('orchestrationRun');
    return [
        { kind: K.orchestrationPlan, handle, planId },
        { kind: K.orchestrationBinding, handle, bindingId: 'b'.repeat(64) },
        { kind: K.orchestrationRevision, handle, planId, planRevisionId: createNativeId('orchestrationRevision') },
        { kind: K.orchestrationRun, handle, runId },
        ...['attempt', 'patch', 'join', 'effect', 'receipt', 'approval', 'result', 'event', 'output'].map(recordType => ({ kind: K.orchestrationRecord, handle, runId, recordType, recordId: 'test-1' })),
        { kind: K.orchestrationCommand, handle, commandId: createNativeId('orchestrationCommand') },
        { kind: K.hostFence, handle },
        { kind: K.rpRunControl, handle, controlId: createNativeId('rpControl') },
    ];
}

describe.each(CONTRACT_HARNESSES)('$name V3 Native resource registration', ({ make }) => {
    let h;
    beforeEach(async () => { h = await make(); });
    afterEach(async () => { await h?.cleanup(); });

    test('all six metadata kinds and original domain control kinds round trip using original handlers', async () => {
        for (const key of keys(h.handle)) {
            expect(decodeNativeResourceKey(key.kind, key.handle, encodeNativeResourceKey(key))).toEqual(key);
            expect(nativeResourceFileId(key)).toMatch(/^[a-f0-9]{64}$/);
            const record = nativeRecord({ schemaVersion: 1, marker: key.kind });
            await h.engine.withTransaction(h.handle, async tx => {
                expect((await tx.putResourceIfMatch(key, null, record)).updated).toBe(true);
                expect((await tx.putResourceIfMatch(key, null, record)).updated).toBe(false);
                expect((await tx.putResourceIfMatch(key, '0'.repeat(64), nativeRecord({ changed: true }))).updated).toBe(false);
                expect((await tx.getResource(key)).doc).toEqual(record.doc);
            });
            expect(await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: key.kind, handle: h.handle }))).toEqual(expect.arrayContaining([expect.objectContaining({ key })]));
        }
    });

    test('immutable revision collision and a failed root/event/command transaction preserve prior state', async () => {
        const all = keys(h.handle), revision = all[2], root = all[3], event = all.find(k => k.recordType === 'event'), command = all.find(k => k.kind === K.orchestrationCommand);
        await h.engine.withTransaction(h.handle, tx => putImmutable(tx, revision, { version: 1 }));
        await expect(h.engine.withTransaction(h.handle, tx => putImmutable(tx, revision, { version: 2 }))).rejects.toMatchObject({ code: 'native_immutable_conflict' });
        await expect(h.engine.withTransaction(h.handle, async tx => {
            for (const key of [root, event, command]) await tx.putResource(key, nativeRecord({ version: 1 }));
            throw new Error('fault before commit');
        })).rejects.toThrow('fault before commit');
        for (const key of [root, event, command]) expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(key))).toBeNull();
        expect((await h.engine.withTransaction(h.handle, tx => tx.getResource(revision))).doc).toEqual({ version: 1 });
    });
});

test('unregistered record types, old IDs, unsafe keys and extra fields are rejected', () => {
    const root = keys('u')[3];
    expect(() => assertNativeResourceKey({ ...root, runId: 'legacy-run' })).toThrow();
    expect(() => assertNativeResourceKey({ ...root, sourcePath: '../other' })).toThrow();
    expect(() => assertNativeResourceKey({ ...root, kind: K.orchestrationRecord, recordType: 'arbitrary', recordId: 'x' })).toThrow();
    expect(() => assertNativeResourceKey({ ...root, kind: K.orchestrationRecord, recordType: 'event', recordId: '../x' })).toThrow();
});

describe('Storage lifetime owner on the current OS', () => {
    let root;
    const owners = [];
    const make = () => { const owner = new NativeHostOwner(); owners.push(owner); return owner; };
    beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-owner-')); });
    afterEach(async () => {
        await Promise.all(owners.splice(0).map(owner => owner.close()));
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('same owner coalesces acquisition; second owner fails; orderly release preserves identity', async () => {
        const first = make(), second = make();
        const identities = await Promise.all([first.acquireLocal(root), first.acquireLocal(root + path.sep + '.')]);
        expect(identities[0]).toEqual(identities[1]);
        await expect(second.acquireLocal(root)).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        await first.close();
        expect(await second.acquireLocal(root)).toEqual(identities[0]);
        expect(second.hostBootId).not.toBe(first.hostBootId);
    });

    test('partial identity fails closed without replacement', async () => {
        fs.writeFileSync(path.join(root, 'native-host.identity'), '{');
        await expect(make().acquireLocal(root)).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        expect(fs.readFileSync(path.join(root, 'native-host.identity'), 'utf8')).toBe('{');
    });

    test('a real second process is excluded and OS releases its guard after forced termination', async () => {
        const moduleUrl = new URL('../../src/storage/native-host-owner.js', import.meta.url).href;
        const script = `import { NativeHostOwner } from ${JSON.stringify(moduleUrl)}; const owner = new NativeHostOwner(); await owner.acquireLocal(process.argv[1]); process.stdout.write('READY\\n');`;
        const child = spawn(process.execPath, ['--input-type=module', '-e', script, root], { cwd: path.dirname(fileURLToPath(import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        const exited = new Promise(resolve => child.once('exit', resolve));
        try {
            await new Promise((resolve, reject) => {
                let output = '';
                child.stdout.on('data', data => { output += data; if (output.includes('READY')) resolve(); });
                child.once('error', reject);
                child.once('exit', code => reject(new Error('Owner child exited before ready: ' + code)));
            });
            await expect(make().acquireLocal(root)).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        } finally { child.kill('SIGKILL'); await exited; }
        await expect(make().acquireLocal(root)).resolves.toMatchObject({ schemaVersion: 1 });
    });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';
import { SqliteEngine } from '../../src/storage/engines/sqlite-engine.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';

test.each([
    ['fs', 'prepare', false], ['fs', 'publish', true], ['fs', 'install', true], ['fs', 'ack', true],
    ['sqlite', 'before_commit', false], ['sqlite', 'after_commit', true],
])('actual process termination: %s/%s preserves one complete durable outcome', async (mode, window, committed) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-v3-kill-'));
    const commandId = createNativeId('orchestrationCommand');
    const script = fileURLToPath(new URL('./fixtures/crash-child.mjs', import.meta.url));
    const child = spawn(process.execPath, [script, mode, root, window, commandId], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const exit = new Promise(resolve => child.once('exit', resolve));
    let engine;
    try {
        let timeout;
        try {
            await new Promise((resolve, reject) => {
                let output = '', diagnostics = '';
                timeout = setTimeout(() => reject(new Error('Crash child did not reach durability window: ' + diagnostics)), 10000);
                child.stdout.on('data', data => { output += data; if (output.includes('FAULT\n')) resolve(); });
                child.stderr.on('data', data => { diagnostics = (diagnostics + data).slice(-4000); });
                child.once('error', reject);
                child.once('exit', code => reject(new Error('Crash child exited before fault: ' + code + ' ' + diagnostics)));
            });
        } finally { clearTimeout(timeout); }
        child.kill('SIGKILL'); await exit;
        const dirs = { root, chats: path.join(root, 'chats'), groupChats: path.join(root, 'group-chats') };
        engine = new (mode === 'fs' ? FsEngine : SqliteEngine)({ directoriesByHandle: () => dirs });
        const lifecycle = attachNativeHostLifecycle(engine, { directoriesByHandle: () => dirs });
        const { command, roots, events } = await engine.withTransaction('u', async tx => ({
            command: await tx.getResource({ kind: K.orchestrationCommand, handle: 'u', commandId }),
            roots: await tx.listResources({ kind: K.orchestrationRun, handle: 'u' }),
            events: await tx.listResources({ kind: K.orchestrationRecord, handle: 'u', recordType: 'event' }),
        }));
        expect(roots).toHaveLength(committed ? 1 : 0);
        expect(events).toHaveLength(committed ? 1 : 0);
        if (!committed) { expect(command).toBeNull(); return; }
        const rootDoc = roots[0].doc;
        expect(command.doc.outcome).toEqual(rootDoc);
        expect(events[0].doc).toMatchObject({ runId: rootDoc.runId, eventSeq: rootDoc.eventSeq, type: 'admitted' });
        const runs = new RunRepository({ engine, authorize: async () => {}, admit: async () => { throw new Error('Recovery cannot re-admit/resend'); }, assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx) });
        const recovered = await runs.recover('u', createNativeId('orchestrationCommand'), { runId: rootDoc.runId, expectedEpoch: rootDoc.epoch, expectedStateVersion: rootDoc.stateVersion, expectedGraphRevision: rootDoc.graphRevision });
        expect(recovered.status).toBe('blocked');
        expect(recovered.hostBootId).not.toBe(rootDoc.hostBootId);
        expect(recovered.hostGeneration).toBeGreaterThan(rootDoc.hostGeneration);
        expect(recovered.budgetAuthorityRef).toEqual(rootDoc.budgetAuthorityRef);
    } finally {
        if (child.exitCode === null) { child.kill('SIGKILL'); await exit; }
        await engine?.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
}, 15000);

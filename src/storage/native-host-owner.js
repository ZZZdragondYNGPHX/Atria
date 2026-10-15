import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { durableMkdir, syncDirectory } from './durable-file.js';

const localVolumes = new Map();
const LOCAL_LINUX_FILESYSTEMS = new Set([0xef53, 0x58465342, 0x9123683e, 0x01021994, 0xf2f52010, 0x2fc12fc1]);

function assertLocalRoot(root) {
    if (process.platform === 'win32') {
        const volume = path.parse(root).root;
        if (!/^[A-Za-z]:\\$/.test(volume)) throw unavailable(new Error('Native Host requires a local drive root'));
        if (!localVolumes.has(volume.toLowerCase())) {
            // DriveInfo consults the OS drive type, including mapped SMB
            // drives. Only the validated drive letter enters this command.
            const type = Number(execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `[Console]::Write(([System.IO.DriveInfo]::new('${volume}')).DriveType.value__)`], { windowsHide: true, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim());
            if (![2, 3, 6].includes(type)) throw unavailable(new Error('Native Host requires local storage'));
            localVolumes.set(volume.toLowerCase(), true);
        }
    } else if (['linux', 'android'].includes(process.platform)) {
        if (!LOCAL_LINUX_FILESYSTEMS.has(Number(fs.statfsSync(root).type))) throw unavailable(new Error('Native Host filesystem has not demonstrated local ownership/durability'));
    } else {
        throw unavailable(new Error('Native Host ownership adapter is unavailable on this platform'));
    }
}

function unavailable(cause) {
    const error = new Error('Native storage writer ownership is unavailable', { cause });
    error.code = 'native_orchestration_writer_unavailable';
    return error;
}

/** Storage lifetime ownership, shared by every Native domain in this Host. */
export class NativeHostOwner {
    #guards = new Map();
    #pending = new Map();
    #valid = true;
    #closing = false;
    #releases = [];

    constructor() {
        this.hostBootId = randomUUID();
    }

    assertActive() {
        if (!this.#valid || this.#closing) throw unavailable();
    }

    invalidate() { this.#valid = false; }

    async acquireDatabase(engine) {
        this.assertActive();
        if (typeof engine.acquireNativeHostOwnership !== 'function') throw unavailable();
        let release;
        try { release = await engine.acquireNativeHostOwnership(() => this.invalidate()); } catch (error) { throw unavailable(error); }
        this.#releases.push(release);
        this.assertActive();
    }

    async acquireLocal(root) {
        this.assertActive();
        if (process.platform === 'win32' && path.resolve(root).startsWith('\\\\')) throw unavailable(new Error('Shared/network data roots are unsupported'));
        durableMkdir(root);
        const canonical = fs.realpathSync.native(root);
        assertLocalRoot(canonical);
        // Case aliases resolve to the same identity even on case-insensitive FS.
        const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
        if (this.#guards.has(key)) {
            const expected = this.#guards.get(key).identity;
            try {
                const actual = JSON.parse(fs.readFileSync(path.join(canonical, 'native-host.identity'), 'utf8'));
                if (!actual || Object.keys(actual).length !== 3 || actual.schemaVersion !== expected.schemaVersion
                    || actual.instanceId !== expected.instanceId || actual.guardAlgorithm !== expected.guardAlgorithm) throw new Error('Native Host identity changed while owned');
            } catch (cause) { this.invalidate(); throw unavailable(cause); }
            return expected;
        }
        if (this.#pending.has(key)) return this.#pending.get(key);
        const pending = this.#acquire(canonical, key);
        this.#pending.set(key, pending);
        try { return await pending; } finally { this.#pending.delete(key); }
    }

    async #acquire(root, key) {
        const file = path.join(root, 'native-host.identity');
        try {
            const fd = fs.openSync(file, 'wx', 0o600);
            try {
                fs.writeFileSync(fd, JSON.stringify({ schemaVersion: 1, instanceId: randomUUID(), guardAlgorithm: 1 }));
                fs.fsyncSync(fd);
            } finally { fs.closeSync(fd); }
            syncDirectory(root);
        } catch (error) {
            if (error.code !== 'EEXIST') throw unavailable(error);
        }
        let identity;
        try {
            identity = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!identity || Object.keys(identity).sort().join(',') !== 'guardAlgorithm,instanceId,schemaVersion'
                || identity.schemaVersion !== 1 || identity.guardAlgorithm !== 1
                || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(identity.instanceId)) {
                throw new TypeError('Invalid Native Host identity');
            }
        } catch (error) { throw unavailable(error); }
        const digest = createHash('sha256').update(identity.instanceId).digest();
        const port = 30000 + digest.readUInt32BE(0) % 20000;
        const server = net.createServer(socket => socket.destroy());
        try {
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
            });
        } catch (error) {
            server.close();
            throw unavailable(error);
        }
        // A guard is an OS lifetime resource, never a stale PID/TTL lease.
        server.on('error', () => { this.#valid = false; });
        server.on('close', () => { if (!this.#closing) this.#valid = false; });
        const result = Object.freeze({ ...identity });
        this.#guards.set(key, { server, identity: result });
        if (this.#closing || !this.#valid) {
            await new Promise(resolve => server.close(resolve));
            throw unavailable();
        }
        return result;
    }

    /** Call only after admission is stopped and all Engine writes are drained. */
    async close() {
        this.#closing = true;
        await Promise.allSettled([...this.#pending.values()]);
        await Promise.allSettled(this.#releases.splice(0).map(release => release()));
        await Promise.all([...this.#guards.values()].map(({ server }) => new Promise(resolve => server.close(resolve))));
        this.#guards.clear();
        this.#valid = false;
    }
}

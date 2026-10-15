import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash, randomUUID } from 'node:crypto';

import { durableMkdir, syncDirectory } from './durable-file.js';

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
        durableMkdir(root);
        const canonical = fs.realpathSync.native(root);
        // Case aliases resolve to the same identity even on case-insensitive FS.
        const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
        if (this.#guards.has(key)) return this.#guards.get(key).identity;
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

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { durableMkdir, syncDirectory } from './durable-file.js';

const LOCAL_LINUX_FILESYSTEMS = new Set([0xef53, 0x58465342, 0x9123683e, 0x01021994, 0xf2f52010, 0x2fc12fc1]);
const DARWIN_LOCAL_VOLUME_PROBE = `ObjC.import('Foundation');
function run(argv) {
    const url = $.NSURL.fileURLWithPath(argv[0]);
    const values = url.resourceValuesForKeysError($([$.NSURLVolumeIsLocalKey]), Ref());
    return Number(ObjC.unwrap(values.objectForKey($.NSURLVolumeIsLocalKey))) === 1 ? 'local' : 'remote';
}`;

function assertLocalRoot(root, localVolumes) {
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
        // Linux magic values are 32-bit; Android/libuv can sign-extend them.
        // Read as BigInt before narrowing so a uint64 value cannot lose bits.
        const type = Number(fs.statfsSync(root, { bigint: true }).type & 0xffffffffn);
        if (!LOCAL_LINUX_FILESYSTEMS.has(type)) throw unavailable(new Error(`Native Host filesystem has not demonstrated local ownership/durability (type=0x${type.toString(16)})`));
    } else if (process.platform === 'darwin') {
        // Fixed Foundation code, with the canonical path passed as argv.
        // Never interpolate a data-root string into an AppleScript or shell.
        const result = execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', DARWIN_LOCAL_VOLUME_PROBE, root], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
        if (result !== 'local') throw unavailable(new Error('Native Host requires a local volume'));
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
    #localVolumes = new Map();
    #pending = new Map();
    #valid = true;
    #closing = false;
    #releases = [];
    #databases = new Map();
    #engines = new Set();
    #closePromise;

    constructor() {
        this.hostBootId = randomUUID();
    }

    assertActive() {
        if (!this.#valid || this.#closing) throw unavailable();
    }

    invalidate() { this.#valid = false; }

    retainStorageEngine() {
        this.assertActive();
        const participant = {};
        this.#engines.add(participant);
        let released = false;
        const release = async () => {
            if (released) return;
            released = true;
            this.#engines.delete(participant);
            for (const [key, guard] of this.#guards) {
                guard.participants.delete(participant);
                if (!guard.persistent && !guard.participants.size) {
                    guard.retiring = true;
                    await new Promise(resolve => guard.server.close(resolve));
                    this.#guards.delete(key);
                }
            }
            if (!this.#engines.size) await this.close();
        };
        return { acquireLocal: root => this.acquireLocal(root, participant), release };
    }

    async acquireDatabase(engine) {
        this.assertActive();
        const key = engine.nativeHostOwnershipKey;
        try {
            if (typeof engine.assertNativeHostTopology !== 'function') throw new TypeError('Native SQL topology adapter is unavailable');
            engine.assertNativeHostTopology();
        } catch (error) { throw unavailable(error); }
        if (typeof engine.acquireNativeHostOwnership !== 'function' || !/^(mysql|postgres):[a-f0-9]{64}$/.test(key)) throw unavailable();
        if (!this.#databases.has(key)) {
            const pending = (async () => {
                let release;
                try { release = await engine.acquireNativeHostOwnership(() => this.invalidate()); } catch (error) { throw unavailable(error); }
                this.#releases.push(release);
            })();
            this.#databases.set(key, pending);
        }
        await this.#databases.get(key);
        this.assertActive();
    }

    async acquireLocal(root, participant = null) {
        this.assertActive();
        if (participant !== null && !this.#engines.has(participant)) throw unavailable();
        if (process.platform === 'win32' && path.resolve(root).startsWith('\\\\')) throw unavailable(new Error('Shared/network data roots are unsupported'));
        let canonical;
        try { durableMkdir(root); canonical = fs.realpathSync.native(root); } catch (cause) { throw unavailable(cause); }
        // Case aliases resolve to the same identity even on case-insensitive FS.
        const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
        if (this.#guards.has(key)) {
            const expected = this.#guards.get(key).identity;
            try {
                const actual = JSON.parse(fs.readFileSync(path.join(canonical, 'native-host.identity'), 'utf8'));
                if (!actual || Object.keys(actual).length !== 3 || actual.schemaVersion !== expected.schemaVersion
                    || actual.instanceId !== expected.instanceId || actual.guardAlgorithm !== expected.guardAlgorithm) throw new Error('Native Host identity changed while owned');
            } catch (cause) { this.invalidate(); throw unavailable(cause); }
            this.#claimLocal(key, participant);
            return expected;
        }
        if (this.#pending.has(key)) {
            const result = await this.#pending.get(key);
            this.#claimLocal(key, participant);
            return result;
        }
        const pending = this.#acquire(canonical, key);
        this.#pending.set(key, pending);
        try { const result = await pending; this.#claimLocal(key, participant); return result; } finally { this.#pending.delete(key); }
    }

    #claimLocal(key, participant) {
        const guard = this.#guards.get(key);
        if (!guard || guard.retiring || participant !== null && !this.#engines.has(participant)) throw unavailable();
        if (participant === null) guard.persistent = true;
        else guard.participants.add(participant);
    }

    async #acquire(root, key) {
        try { assertLocalRoot(root, this.#localVolumes); } catch (cause) { throw unavailable(cause); }
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
        const result = Object.freeze({ ...identity });
        const guard = { server, identity: result, participants: new Set(), persistent: false, retiring: false };
        server.on('error', () => { this.#valid = false; });
        server.on('close', () => { if (!this.#closing && !guard.retiring) this.#valid = false; });
        this.#guards.set(key, guard);
        if (this.#closing || !this.#valid) {
            await new Promise(resolve => server.close(resolve));
            throw unavailable();
        }
        return result;
    }

    /** Call only after admission is stopped and all Engine writes are drained. */
    close() {
        this.#closePromise ??= (async () => {
            this.#closing = true;
            await Promise.allSettled([...this.#pending.values(), ...this.#databases.values()]);
            await Promise.allSettled(this.#releases.splice(0).map(release => release()));
            await Promise.all([...this.#guards.values()].map(({ server }) => new Promise(resolve => server.close(resolve))));
            this.#guards.clear();
            this.#valid = false;
        })();
        return this.#closePromise;
    }
}

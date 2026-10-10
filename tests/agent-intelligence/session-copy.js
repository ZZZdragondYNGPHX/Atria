import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { installFixture, sessionFixture, services } from '../native/helpers/session-fixture.js';
import { hash } from './cases.js';

function verifyOwnedRoot(h, root, token) {
    if (fs.realpathSync(h.dataRoot) !== root || fs.readFileSync(path.join(root, '.s06-owned'), 'utf8') !== token) throw new Error('Session cleanup ownership mismatch');
}

/** Prove Native portability/isolation through the original save and Session authority.
 * Synthetic fixtures only. This does not imply that Native model generation ran.
 */
export async function withSyntheticSessionCopies(work) {
    const roots = [];
    async function owned() {
        const h = await makeTempFsEngine();
        const root = fs.realpathSync(h.dataRoot); const token = randomUUID();
        fs.writeFileSync(path.join(root, '.s06-owned'), token);
        roots.push({ h, root, token }); return h;
    }
    try {
        const source = await owned();
        const fixture = sessionFixture();
        const f = await installFixture(source, fixture);
        const initial = await f.core.create(source.handle, f.start);
        const before = hash(await f.core.load(source.handle, initial.session.sessionId));
        const exported = await f.saveSystem.exportSession(source.handle, initial.session.sessionId);
        const archive = await f.assetStore.readBlob(source.handle, initial.session.packageContentHash);
        const copies = {};
        for (const arm of ['baseline', 'candidate']) {
            const h = await owned(); const svc = services(h);
            await svc.packageInstaller.install(h.handle, archive);
            const snapshot = await svc.saveSystem.importSave(h.handle, exported.archive);
            if (hash(snapshot.timeline) !== hash(initial.timeline) || hash(snapshot.states) !== hash(initial.states)
                || snapshot.revision.revisionId !== initial.revision.revisionId) throw new Error('Session copy input mismatch');
            copies[arm] = { core: svc.core, handle: h.handle, sessionId: snapshot.session.sessionId,
                revisionId: snapshot.revision.revisionId, inputHash: hash({ timeline: snapshot.timeline, states: snapshot.states }) };
        }
        const result = await work(copies);
        const after = hash(await f.core.load(source.handle, initial.session.sessionId));
        if (before !== after) throw new Error('Session source changed during isolated evaluation');
        return { result, proof: { sourceBefore: before, sourceAfter: after,
            baselineInputHash: copies.baseline.inputHash, candidateInputHash: copies.candidate.inputHash,
            generationStatus: 'unavailable', effectDomain: 'runner_owned_copies' } };
    } finally {
        for (const { h, root, token } of roots.reverse()) {
            verifyOwnedRoot(h, root, token);
            h.cleanup();
        }
    }
}

import fs from 'node:fs';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { services } from './session-fixture.js';
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const engine = new FsEngine({ directoriesByHandle: () => input.dirs });
const core = services(input, engine).core;
const before = await core.load(input.handle, input.sessionId);
// Arm only the actual publication, after preparation reads have completed.
engine._durabilityFault = point => { if (point === input.stage) process.exit(71); };
const created = core._newEntry(before, { role: 'user', content: 'Crash boundary' });
const { hashNativeDocument } = await import('../../../src/native/repositories/common.js');
await core._publish(input.handle, before, { timeline: [...before.timeline, created.entry], entries: [created.entry], variants: [created.variant],
    commitId: 'request:process-loss', requestFingerprint: hashNativeDocument({ draft: { role: 'user', content: 'Crash boundary' }, expectedRevisionId: input.revisionId }) });

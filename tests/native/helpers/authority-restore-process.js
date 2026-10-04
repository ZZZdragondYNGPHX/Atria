// Separate process: no scheduler, selection pin or preparation proof can survive.
import { makeTempFsEngineHarness } from '../../storage/harness/contract-harness.js';
import { services } from './session-fixture.js';
import { seedGenerationProfiles } from './generation-fixture.js';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../../src/native/adapters/http-generation-provider.js';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const request = JSON.parse(Buffer.concat(chunks).toString());
const h = await makeTempFsEngineHarness();
try {
    const svc = services(h);
    await svc.packageInstaller.install(h.handle, Buffer.from(request.packageArchive, 'base64'));
    const base = await svc.saveSystem.importSave(h.handle, Buffer.from(request.saveArchive, 'base64'));
    const seeded = await seedGenerationProfiles({ ...h, endpoint: request.endpoint, roles: ['narrator', 'intent_resolver'] });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
        providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
    const result = await host.executeTurn(h.handle, request.input);
    process.stdout.write(JSON.stringify({ anchor: base.revision, revision: result.revision,
        receipts: result.states.atri_action_receipts.receipts, clock: result.states.atri_lifecycle.clocks.world }));
} finally { await h.cleanup(); }

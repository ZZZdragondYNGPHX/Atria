import { jest } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';

let h;
afterEach(async () => { await h?.cleanup(); });
test('Play preparation validates exact current Session, Route and Secret without inference', async () => {
    h = await makeTempFsEngineHarness(); const f = await installFixture(h), snapshot = await f.core.create(h.handle, f.start);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:7/v1/chat/completions', roles: ['narrator'] });
    const fetchImpl = jest.fn(), secret = jest.fn(async () => 'fixture');
    const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
        providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) }, secretPort: { resolveSecret: secret } });
    const input = { sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId, slotBindings: {} };
    expect(await host.preparePlay(h.handle, input)).toMatchObject({ prepared: true, sessionId: input.sessionId, revisionId: input.revisionId });
    expect(fetchImpl).not.toHaveBeenCalled(); expect(secret).toHaveBeenCalledTimes(1);
    secret.mockResolvedValue(null); await expect(host.preparePlay(h.handle, input)).rejects.toMatchObject({ code: 'generation_secret_unavailable' });
    await f.core.appendTimeline(h.handle, input.sessionId, { role: 'user', content: 'Changed' });
    await expect(host.preparePlay(h.handle, input)).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
    expect(fetchImpl).not.toHaveBeenCalled();
});

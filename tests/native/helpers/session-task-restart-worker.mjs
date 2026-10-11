import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { SqliteEngine } from '../../../src/storage/engines/sqlite-engine.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../../src/native/model-prompt-runtime/persistence.js';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { createResponsesGenerationProvider } from '../../../src/native/adapters/responses-generation-provider.js';
import { services } from './session-fixture.js';

let raw = ''; for await (const part of process.stdin) raw += part;
const { kind, handle, dirs, input, interrupt = null } = JSON.parse(raw);
const Engine = kind === 'fs' ? FsEngine : SqliteEngine;
const engine = new Engine({ directoriesByHandle: owner => { if (owner !== handle) throw new Error('Wrong fixture owner'); return dirs; } });
try {
    const persistence = new NativeModelPromptPersistence({ engine }), library = new VersionedJsonResourceHandler({ engine });
    const installed = services({ engine, handle, dirs }), guide = { name: 'guide', scope: { kind: 'global' }, installedHash: '1'.repeat(64) };
    const connection = (await persistence.listConnectionProfiles(handle))[0];
    if (!connection.endpoint.startsWith('http://127.0.0.1:')) throw new Error('Loopback fixture only');
    let reads = 0, counts = 0;
    const charge = installed.core.runs.chargeLocalWork.bind(installed.core.runs);
    installed.core.runs.chargeLocalWork = async (...args) => {
        const receipt = await charge(...args);
        if (args[4].kind === 'generation_count' && ++counts === 2 && interrupt === 'charged_count') {
            process.stdout.write(JSON.stringify({ stage: 'charged_count', reads }), () => process.exit(73));
            await new Promise(() => {});
        }
        return receipt;
    };
    const host = new NativeGenerationHost({ persistence, library, sessionCore: installed.core, packageInstaller: installed.packageInstaller,
        providers: { 'provider.openai-responses': createResponsesGenerationProvider() }, secretPort: { resolveSecret: async () => 'fixture-secret' },
        extensions: { settings: async () => ({ value: {} }) }, skillRepository: () => ({ list: async () => [guide],
            pin: async ({ expectedHash }) => ({ version: expectedHash }), readFile: async () => {
                reads++;
                if (interrupt === 'pending_read') {
                    process.stdout.write(JSON.stringify({ stage: 'pending_read', reads }), () => process.exit(73));
                    await new Promise(() => {});
                }
                return { content: 'Current pinned Task reference', totalLines: 1 };
            } }) });
    const result = await host.executeTask(handle, input);
    process.stdout.write(JSON.stringify({ record: result.record, reads }));
} finally { await engine.close(); }

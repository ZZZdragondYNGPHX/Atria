import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { SqliteEngine } from '../../../src/storage/engines/sqlite-engine.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../../src/native/model-prompt-runtime/persistence.js';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { createResponsesGenerationProvider } from '../../../src/native/adapters/responses-generation-provider.js';
import { services } from '../../agent-intelligence/project-fixture.js';

let input = ''; for await (const chunk of process.stdin) input += chunk;
const { kind, handle, dirs, request } = JSON.parse(input);
const Engine = kind === 'fs' ? FsEngine : SqliteEngine;
const engine = new Engine({ directoriesByHandle: owner => { if (owner !== handle) throw new Error('Wrong owner'); return dirs; } });
try {
    const persistence = new NativeModelPromptPersistence({ engine });
    const library = new VersionedJsonResourceHandler({ engine });
    const { studio, agent } = services({ engine, handle, dirs });
    const connection = (await persistence.listConnectionProfiles(handle))[0];
    if (!connection.endpoint.startsWith('http://127.0.0.1:')) throw new Error('Loopback fixture only');
    const host = new NativeGenerationHost({ persistence, library, studio, agent,
        providers: { 'provider.openai-responses': createResponsesGenerationProvider() }, secretPort: { resolveSecret: async () => 'task-runtime-credential' } });
    const result = await host.execute(handle, request);
    process.stdout.write(JSON.stringify({ text: result.response.text, observation: result.response.observation.nativeExecution }));
} finally { await engine.close(); }

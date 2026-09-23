import express from 'express';
import { getStorageEngine } from '../storage/index.js';
import { getUserDirectories } from '../users.js';
import { readSecret, SECRET_KEYS } from './secrets.js';
import { getNativeSessionServices } from './native-session.js';
import { getNativeStudioServices } from './native-studio.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../native/model-prompt-runtime/persistence.js';
import { NativeGenerationHost } from '../native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../native/adapters/http-generation-provider.js';

function services() {
    const { core, packageInstaller } = getNativeSessionServices();
    const { studio, agent } = getNativeStudioServices();
    return new NativeGenerationHost({
        persistence: new NativeModelPromptPersistence({ engine: getStorageEngine() }),
        library: new VersionedJsonResourceHandler({ engine: getStorageEngine() }),
        sessionCore: core, packageInstaller, studio, agent,
        providers: {
            'provider.openai-compatible': createHttpGenerationProvider(),
            'provider.raw-text': createHttpGenerationProvider({ format: 'raw-text' }),
        },
        secretPort: { resolveSecret: async (ref, { handle }) => {
            // Native refs identify one exact Secret ID. Never resolve the active key.
            for (const key of Object.values(SECRET_KEYS)) {
                const value = readSecret(getUserDirectories(handle), key, ref.secretId);
                if (value) return value;
            }
            return '';
        } },
    });
}

export function createNativeGenerationRouter(getHost = services) {
    const router = express.Router();
    router.post('/execute', async (request, response) => {
        const handle = request.user?.profile?.handle;
        if (!handle) return response.sendStatus(401);
        const controller = new AbortController();
        const streaming = request.headers.accept === 'text/event-stream';
        const emit = value => {
            if (!response.headersSent) response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
            response.write('data: ' + JSON.stringify(value) + '\n\n');
        };
        const abort = () => { if (!response.writableEnded) controller.abort(); };
        response.on('close', abort);
        try {
            const result = await getHost().execute(handle, request.body, controller.signal, streaming ? chunk => emit({ chunk }) : undefined);
            if (!controller.signal.aborted) {
                if (streaming) { emit({ result }); response.end(); } else response.json(result);
            }
        } catch (error) {
            const code = /^(native_generation_|generation_)[a-z_]+$/.test(error.code || '') ? error.code : 'native_generation_failed';
            if (!controller.signal.aborted) {
                if (response.headersSent) { emit({ error: code }); response.end(); } else response.status(code.includes('conflict') ? 409 : 400).json({ error: code });
            }
        } finally { response.off('close', abort); }
    });
    return router;
}

export const router = createNativeGenerationRouter();

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { dispatchSdComfy, __setWebSocketForTest, __resetWebSocketForTest } from '../src/atria-dispatch/providers/sd/comfy.js';

const fetchMock = jest.fn();
// Atria runs generation through DispatchContext and WS delivery. Exercise the
// real migrated provider, keeping the upstream output-selection regressions.
class CompletedSocket extends EventEmitter {
    constructor() {
        super();
        setImmediate(() => {
            this.emit('open');
            setImmediate(() => this.emit('message', JSON.stringify({ type: 'executing', data: { prompt_id: promptId, node: null } })));
        });
    }
    close() {}
}
let promptId;
async function generate() {
    const chunks = [];
    let error;
    await dispatchSdComfy({
        body: { url: 'http://127.0.0.1:8188', prompt: '{}' },
        signal: new AbortController().signal,
        fetch: fetchMock,
        inspection: { start: jest.fn(), attach: jest.fn(), startImage: jest.fn(), completeImage: jest.fn(), failImage: jest.fn() },
        emit: { head: jest.fn(), chunk: bytes => chunks.push(Buffer.from(bytes)), end: jest.fn(), error: value => { error = value; } },
    });
    return { status: error ? 500 : 200, json: async () => JSON.parse(Buffer.concat(chunks).toString()), text: async () => error?.message };
}

describe('ComfyUI generation', () => {
    afterEach(() => __resetWebSocketForTest());
    beforeEach(() => {
        fetchMock.mockReset();
        __setWebSocketForTest(CompletedSocket);
    });

    test('skips output nodes without images', async () => {
        promptId = 'prompt-1';
        fetchMock
            .mockResolvedValueOnce({ ok: true, json: async () => ({ prompt_id: 'prompt-1' }) })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    'prompt-1': {
                        status: { status_str: 'success' },
                        outputs: {
                            117: { a_images: [{ filename: 'comparison.png' }] },
                            197: { images: [{ filename: 'result.png', subfolder: '', type: 'temp' }] },
                        },
                    },
                }),
            })
            .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer });

        const response = await generate();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ format: 'png', data: 'AQID' });
    });

    test('falls back to gifs when no output node has images', async () => {
        promptId = 'prompt-2';
        fetchMock
            .mockResolvedValueOnce({ ok: true, json: async () => ({ prompt_id: 'prompt-2' }) })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    'prompt-2': {
                        status: { status_str: 'success' },
                        outputs: {
                            10: { text: ['some non-media output'] },
                            42: { gifs: [{ filename: 'animation.webp', subfolder: '', type: 'output' }] },
                        },
                    },
                }),
            })
            .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Uint8Array.from([4, 5, 6]).buffer });

        const response = await generate();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ format: 'webp', data: 'BAUG' });
    });

    test('reports an error when no output has images or gifs', async () => {
        promptId = 'prompt-3';
        fetchMock
            .mockResolvedValueOnce({ ok: true, json: async () => ({ prompt_id: 'prompt-3' }) })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    'prompt-3': {
                        status: { status_str: 'success' },
                        outputs: {
                            10: { text: ['no media at all'] },
                        },
                    },
                }),
            });

        const response = await generate();

        expect(response.status).toBe(500);
        expect(await response.text()).toContain('did not return any recognizable outputs');
    });
});

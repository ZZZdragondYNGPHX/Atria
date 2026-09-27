import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { parseAssetRange } from '../../src/native/asset-delivery.js';
let h, assets, app, ref;
beforeEach(async () => {
    h = await makeTempFsEngineHarness(); assets = services(h).assetStore;
    const bytes = Buffer.from('0123456789'); ref = { assetId: 'asset_' + 'a'.repeat(32), contentHash: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, mediaType: 'audio/mpeg', logicalName: 'Sample' };
    await assets.put(h.handle, ref, bytes);
    app = express(); app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
    app.use(createNativeSessionRouter(() => ({ assets })));
});
afterEach(async () => h?.cleanup());
const get = () => request(app).get('/asset/' + ref.assetId + '?contentHash=' + ref.contentHash).set('x-user', h.handle);
test('exact authenticated bytes, ETag, HEAD and single byte ranges use the existing blob store', async () => {
    const result = await get().expect(200); expect(result.body.toString()).toBe('0123456789'); expect(result.headers.etag).toBe('"' + ref.contentHash + '"');
    expect((await get().set('Range', 'bytes=2-5').expect(206)).body.toString()).toBe('2345');
    expect((await get().set('Range', 'bytes=-3').expect(206)).body.toString()).toBe('789');
    expect((await get().set('Range', 'bytes=6-').expect(206)).body.toString()).toBe('6789');
    await get().set('If-None-Match', '"' + ref.contentHash + '"').expect(304);
    await get().set('Range', 'bytes=2-5').set('If-Range', '"different"').expect(200);
    const head = await request(app).head('/asset/' + ref.assetId).set('x-user', h.handle).expect(200); expect(head.headers['content-length']).toBe('10'); expect(head.text).toBeUndefined();
});
test.each(['bytes=100-', 'bytes=3-2', 'bytes=-0', 'bytes=0-1,4-5', 'bytes=-', 'bytes=999999999999999999999-'])('invalid range %s returns 416 without bytes', async range => {
    const result = await get().set('Range', range).expect(416); expect(result.headers['content-range']).toBe('bytes */10');
});
test('hash pin mismatch, corruption and unauthenticated delivery fail closed', async () => {
    await request(app).get('/asset/' + ref.assetId).expect(401);
    await request(app).get('/asset/' + ref.assetId + '?contentHash=' + 'f'.repeat(64)).set('x-user', h.handle).expect(409);
    await request(app).get('/asset/' + ref.assetId + '?contentHash=latest').set('x-user', h.handle).expect(400);
    fs.writeFileSync(path.join(assets._blobRoot(h.handle), ref.contentHash.slice(0, 2), ref.contentHash), Buffer.from('0123broken'));
    const corrupt = await get().expect(409); expect(corrupt.body.error).toBe('native_asset_corrupt');
});
test('empty resource and excessive numeric suffix do not produce invalid streams', () => {
    expect(() => parseAssetRange('bytes=0-', 0)).toThrow(); expect(() => parseAssetRange('bytes=-9999999999999999999999', 10)).toThrow();
});

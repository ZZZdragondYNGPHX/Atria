import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, sessionFixture, services } from './helpers/session-fixture.js';
import { PersonaRepo } from '../../src/native/repositories/persona-repo.js';
import { EMPTY_PERSONA_FINGERPRINT as empty } from '../../src/native/persona-contract.js';
import { assertAtriaSave } from '../../src/native/contracts.js';
import { buildAtriaSaveContainer, inspectAtriaSaveContainer } from '../../src/native/save-container.js';

const png = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([30, 90, 150, 255]) });
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Persona Save/avatar %s', (_label, make) => {
    test('avatar decode and immutable hash, full Save v3 closure and independent cross-account recovery', async () => {
        const h = await make(), target = await make();
        try {
            const fixture = sessionFixture(), f = await installFixture(h, fixture), other = services(target);
            await other.packageInstaller.install(target.handle, await f.assetStore.readBlob(h.handle, (await f.packageInstaller.open(h.handle, fixture.manifest.packageId, fixture.manifest.packageVersionId)).packageVersion.packageContentHash));
            const personas = new PersonaRepo({ engine: h.engine, assetStore: f.assetStore }); f.core.personas = personas;
            const avatar = await personas.avatar(h.handle, { bytes: png.toString('base64'), mediaType: 'image/png' });
            expect(avatar.contentHash).toBe(createHash('sha256').update(png).digest('hex'));
            await expect(personas.avatar(h.handle, { bytes: png.toString('base64'), mediaType: 'image/jpeg' })).rejects.toMatchObject({ code: 'native_persona_invalid' });
            const huge = Buffer.from(png); huge.writeUInt32BE(4097, 16);
            await expect(personas.avatar(h.handle, { bytes: huge.toString('base64'), mediaType: 'image/png' })).rejects.toMatchObject({ code: 'native_persona_invalid' });
            const resource = await personas.create(h.handle, { expectedFingerprint: empty, content: { name: 'Avatar player', avatar, description: 'Player text', managementNotes: 'PRIVATE NOTE' } });
            const base = await f.core.create(h.handle, { ...f.start, personaSelection: resource.ref });
            await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Hello' });
            const point = await f.core.createSavePoint(h.handle, base.session.sessionId, { kind: 'manual' });
            for (const exported of [await f.saveSystem.exportSession(h.handle, base.session.sessionId), await f.saveSystem.exportSnapshot(h.handle, base.session.sessionId, point.saveId)]) {
                expect(exported.save.schemaVersion).toBe(3);
                expect(exported.save.closure.assetRefs).toContainEqual(avatar);
                expect(exported.save.closure.attachments.some(item => item.assetId === avatar.assetId)).toBe(true);
                expect(JSON.stringify(exported.save)).not.toContain('PRIVATE NOTE');
                const inspected = inspectAtriaSaveContainer(exported.archive);
                expect(inspected.assets.get(avatar.assetId)).toEqual(png);
                expect(() => assertAtriaSave({ ...exported.save, schemaVersion: 1 })).toThrow('Persona');
                const missing = structuredClone(exported.save); missing.closure.assetRefs = []; missing.closure.attachments = [];
                expect(() => assertAtriaSave(missing)).toThrow('avatar');
            }
            const exported = await f.saveSystem.exportSession(h.handle, base.session.sessionId);
            const restored = await other.saveSystem.importSave(target.handle, exported.archive);
            expect(restored.states.atri_player_persona.solo.ref).toEqual(resource.ref);
            expect((await other.assetStore.read(target.handle, avatar.assetId)).bytes).toEqual(png);
            const targetPersonas = new PersonaRepo({ engine: target.engine, assetStore: other.assetStore });
            expect((await targetPersonas.list(target.handle)).items).toEqual([]); expect((await targetPersonas.readDefault(target.handle)).selection).toBeNull();
            await expect(f.assetStore.deleteRef(h.handle, avatar.assetId)).rejects.toMatchObject({ code: 'native_asset_ref_referenced' });
            const refs = await other.assetStore.getReferences(target.handle, avatar.assetId);
            expect(refs.some(item => item.kind === 'persona-snapshot')).toBe(true);
            await expect(other.assetStore.deleteRef(target.handle, avatar.assetId)).rejects.toMatchObject({ code: 'native_asset_ref_referenced' });
            const corrupted = Buffer.from(png); corrupted[corrupted.length - 10] ^= 255;
            await expect(personas.avatar(h.handle, { bytes: corrupted.toString('base64'), mediaType: 'image/png' })).rejects.toMatchObject({ code: 'native_persona_invalid' });
            expect(() => buildAtriaSaveContainer({ save: { ...exported.save, schemaVersion: 9 }, assetPayloads: new Map() })).toThrow();
        } finally { await h.cleanup(); await target.cleanup(); }
    });
});

test.each([
    ['image/jpeg', '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AEh6FP//Z'],
    ['image/webp', 'UklGRjIAAABXRUJQVlA4ICYAAACQAQCdASoBAAEAAgA0JYgCdLoAA5gA/vd+L8UApHDnfm+x7McAAA=='],
    ['image/avif', 'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEDQgMg8YQAAAUAAAALATT236RuA=']
])('local installed codec validates %s without fetching', async (mediaType, bytes) => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installFixture(h), personas = new PersonaRepo({ engine: h.engine, assetStore: f.assetStore });
        const avatar = await personas.avatar(h.handle, { mediaType, bytes });
        expect(avatar.mediaType).toBe(mediaType);
        expect((await f.assetStore.read(h.handle, avatar.assetId)).bytes.toString('base64')).toBe(bytes);
    } finally { await h.cleanup(); }
});

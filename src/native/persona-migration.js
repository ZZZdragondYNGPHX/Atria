import { createHash } from 'node:crypto';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { createNativeId } from './identity.js';
import { hashNativeDocument } from './repositories/common.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { assertPersonaContent, personaFields, personaFailure, personaHash, EMPTY_PERSONA_FINGERPRINT as empty } from './persona-contract.js';
import { validateAvatar } from './repositories/persona-repo.js';

const object = value => Object.prototype.toString.call(value) === '[object Object]';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const migrationKey = (handle, sourceDigest) => ({ kind: K.personaMigration, handle, sourceDigest });

// Only uploaded bytes are accepted. A legacy filename never grants filesystem access.
export async function preflightPersonaMigration(repo, handle, input) {
    personaFields(input, ['rawSource', 'convertUser', 'avatars']);
    const { rawSource, convertUser = false, avatars = {} } = input;
    if (typeof rawSource !== 'string' || Buffer.byteLength(rawSource) > 16 * 1024 * 1024 || typeof convertUser !== 'boolean' || !object(avatars)) throw personaFailure();
    let source;
    try { source = JSON.parse(rawSource); } catch { throw personaFailure(); }
    if (!object(source) || (source.personas !== undefined && !object(source.personas)) || (source.persona_descriptions !== undefined && !object(source.persona_descriptions))) throw personaFailure();
    const keys = [...new Set([...Object.keys(source.personas ?? {}), ...Object.keys(source.persona_descriptions ?? {})])].sort();
    if (keys.length > 1000 || Object.keys(avatars).some(key => !keys.includes(key))) throw personaFailure();
    const sourceDigest = digest(Buffer.from(rawSource)), avatarInputs = Object.create(null), items = Object.create(null);
    let avatarBytes = 0;
    for (const legacyKey of keys) {
        const original = source.persona_descriptions?.[legacyKey] ?? {};
        if (!object(original)) throw personaFailure();
        const name = original.name ?? (Object.hasOwn(source.personas ?? {}, legacyKey) ? source.personas[legacyKey] : undefined);
        if (typeof name !== 'string' || (original.description !== undefined && typeof original.description !== 'string') || (original.title !== undefined && typeof original.title !== 'string')) throw personaFailure();
        const pending = ['legacy_injection_unmapped', 'legacy_bindings_unmapped'];
        let description = original.description ?? '';
        if (convertUser) description = description.replaceAll('{{user}}', name);
        if (/\{\{[^}]+\}\}/.test(description)) pending.push('macros_unmapped');
        if (original.lorebook) pending.push('lorebook_unmapped');
        let avatar = null;
        if (Object.hasOwn(avatars, legacyKey)) {
            const upload = avatars[legacyKey];
            personaFields(upload, ['bytes', 'mediaType']);
            if (typeof upload.bytes !== 'string' || upload.bytes.length > 12 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(upload.bytes)) throw personaFailure();
            const bytes = Buffer.from(upload.bytes, 'base64');
            avatarBytes += bytes.length;
            if (avatarBytes > 16 * 1024 * 1024) throw personaFailure();
            await validateAvatar(bytes, upload.mediaType);
            avatar = { contentHash: digest(bytes), size: bytes.length, mediaType: upload.mediaType };
            avatarInputs[legacyKey] = upload;
        } else pending.push('avatar_missing');
        const content = assertPersonaContent({ name, description, managementNotes: original.title ?? '', avatar: null });
        items[legacyKey] = { legacyKey, original, content, avatar, pending, warnings: ['creates_copy'], diff: { before: original.description ?? '', after: description } };
    }
    const supported = !Object.hasOwn(source, 'version') && !Object.hasOwn(source, 'schemaVersion');
    const plan = { schemaVersion: 1, sourceDigest, sourceFormat: 'legacy-personas-json', supported, items,
        defaultLegacyKey: typeof source.default_persona === 'string' ? source.default_persona : null, convertUser };
    const planDigest = hashNativeDocument(plan);
    const record = await repo._record(handle, K.personaMigration, { sourceDigest });
    return { ...plan, planDigest, expectedFingerprint: record?.integrity ?? empty, rawSource: Buffer.from(rawSource).toString('base64'), avatars: avatarInputs,
        warnings: [...(supported ? [] : ['unsupported_version']), 'legacy_json_is_not_complete_backup', 'unknown_source_fields_preserved'], receipt: record?.doc ?? null };
}

export async function applyPersonaMigration(repo, handle, input) {
    personaFields(input, ['rawSource', 'convertUser', 'avatars', 'planDigest', 'expectedFingerprint']);
    personaHash(input.planDigest); personaHash(input.expectedFingerprint);
    const plan = await preflightPersonaMigration(repo, handle, { rawSource: input.rawSource, convertUser: input.convertUser ?? false, avatars: input.avatars ?? {} });
    if (!plan.supported) throw personaFailure('native_persona_invalid', { reason: 'unsupported_version' });
    if (plan.planDigest !== input.planDigest) throw personaFailure('native_persona_conflict', { reason: 'plan_changed' });
    return repo.lock(handle, async () => {
        assertWritable();
        let existing = await repo._record(handle, K.personaMigration, { sourceDigest: plan.sourceDigest });
        if ((existing?.integrity ?? empty) !== input.expectedFingerprint) throw personaFailure('native_persona_conflict');
        if (existing && existing.doc.planDigest !== plan.planDigest) throw personaFailure('native_persona_conflict', { reason: 'source_already_reviewed_differently' });
        const doc = existing?.doc ?? { schemaVersion: 1, sourceDigest: plan.sourceDigest, sourceFormat: plan.sourceFormat, rawSource: plan.rawSource, planDigest: plan.planDigest,
            items: Object.fromEntries(Object.entries(plan.items).map(([key, item]) => [key, { ...item, personaId: createNativeId('persona'), revisionId: createNativeId('revision'),
                assetId: item.avatar ? createNativeId('asset') : null, status: 'prepared', target: null }])), defaultAdoption: { status: 'not_adopted', legacyKey: plan.defaultLegacyKey } };
        const save = async () => {
            existing = await repo.engine.withTransaction(handle, tx => repo._cas(tx, migrationKey(handle, plan.sourceDigest), doc, existing?.integrity ?? empty));
        };
        if (!existing) await save(); // Durable IDs precede every blob/ref/revision/root write.
        for (const [key, item] of Object.entries(doc.items)) {
            if (item.status === 'published') continue;
            try {
                const avatar = item.avatar ? { assetId: item.assetId, ...item.avatar } : null;
                const revision = { schemaVersion: 1, personaId: item.personaId, revisionId: item.revisionId, ...item.content, avatar };
                const target = { personaId: item.personaId, revisionId: item.revisionId, contentIdentity: hashNativeDocument(revision) };
                const root = await repo._record(handle, K.persona, { personaId: item.personaId });
                if (root) {
                    // Root may have committed just before the receipt write failed.
                    await repo.get(handle, { ref: target });
                } else {
                    if (avatar) await repo.assets.put(handle, avatar, Buffer.from(plan.avatars[key].bytes, 'base64'));
                    await repo._publish(handle, revision, empty, false);
                }
                item.target = target; item.status = 'published'; delete item.error;
            } catch (error) { item.status = 'failed'; item.error = error.code ?? 'publication_failed'; }
            await save();
        }
        return { receipt: doc, expectedFingerprint: existing.integrity, receiptSaved: true, published: Object.values(doc.items).every(item => item.status === 'published') };
    });
}

export async function readPersonaMigration(repo, handle, input) {
    personaFields(input, ['sourceDigest']); personaHash(input.sourceDigest);
    const record = await repo._record(handle, K.personaMigration, { sourceDigest: input.sourceDigest });
    if (!record) throw personaFailure('native_persona_unavailable');
    return { receipt: record.doc, expectedFingerprint: record.integrity };
}

export async function adoptPersonaMigrationDefault(repo, handle, input) {
    personaFields(input, ['sourceDigest', 'expectedFingerprint', 'expectedDefaultFingerprint']);
    personaHash(input.sourceDigest); personaHash(input.expectedFingerprint); personaHash(input.expectedDefaultFingerprint);
    return repo.lock(handle, async () => {
        assertWritable();
        const record = await repo._record(handle, K.personaMigration, { sourceDigest: input.sourceDigest });
        if (!record || record.integrity !== input.expectedFingerprint) throw personaFailure('native_persona_conflict');
        const item = record.doc.items[record.doc.defaultAdoption.legacyKey];
        if (!item || item.status !== 'published') throw personaFailure('native_persona_unavailable');
        await repo.capture(handle, item.target, 'migration');
        const defaultKey = { kind: K.personaDefault, handle };
        const defaultDoc = { schemaVersion: 1, selection: item.target };
        const actual = await repo._record(handle, K.personaDefault);
        const prior = record.doc.defaultAdoption;
        const recovering = prior.status === 'prepared' && prior.expectedDefaultFingerprint === input.expectedDefaultFingerprint
            && actual?.integrity === hashNativeDocument(defaultDoc);
        if (!recovering && (actual?.integrity ?? empty) !== input.expectedDefaultFingerprint) throw personaFailure('native_persona_conflict');
        const doc = record.doc;
        doc.defaultAdoption = { ...prior, status: 'prepared', expectedDefaultFingerprint: input.expectedDefaultFingerprint, target: item.target };
        const prepared = await repo.engine.withTransaction(handle, tx => repo._cas(tx, migrationKey(handle, input.sourceDigest), doc, record.integrity));
        if (!recovering) await repo.engine.withTransaction(handle, tx => repo._cas(tx, defaultKey, defaultDoc, input.expectedDefaultFingerprint));
        doc.defaultAdoption.status = 'adopted';
        const receipt = await repo.engine.withTransaction(handle, tx => repo._cas(tx, migrationKey(handle, input.sourceDigest), doc, prepared.integrity));
        return { selection: item.target, expectedFingerprint: hashNativeDocument(defaultDoc), receipt: doc, receiptFingerprint: receipt.integrity, published: true };
    });
}

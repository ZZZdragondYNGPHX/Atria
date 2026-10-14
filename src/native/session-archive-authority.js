import { hashNativeDocument } from './repositories/common.js';
import { ConflictError } from '../storage/errors.js';
import { fields } from '../../public/shared/native-values.js';
import { assertNativeId } from './identity.js';
import { preflightAtriaSaveContainer } from './save-container.js';

const archiveFields = (...args) => { try { fields(...args); } catch { throw new TypeError('Invalid Session Archive fields'); } };

export class NativeSessionArchiveAuthority {
    constructor({ product, artifacts, resolvePassword = null }) { this.product = product; this.artifacts = artifacts; this.resolvePassword = resolvePassword; }
    async _password(handle, ref, context) {
        archiveFields(ref, ['secretId', 'scope'], 'Archive password SecretRef');
        if (Object.keys(ref).length !== 2 || ref.scope !== 'player' || typeof ref.secretId !== 'string'
            || !/^[a-f0-9-]{36}$/i.test(ref.secretId) || !this.resolvePassword) throw new ConflictError('native_save_password_secret_unavailable');
        const value = await this.resolvePassword(handle, ref, { purpose: 'session-archive-password', ...context });
        if (typeof value !== 'string' || !value || value.length > 4096) throw new ConflictError('native_save_password_secret_unavailable');
        return value;
    }
    async export(handle, input) {
        archiveFields(input, ['sessionId', 'expectedRevisionId', 'saveId', 'clientInstanceId', 'passwordSecretRef'], 'Session Archive export');
        assertNativeId(input.sessionId, 'session'); assertNativeId(input.expectedRevisionId, 'revision');
        if (input.saveId !== undefined) assertNativeId(input.saveId, 'savePoint');
        const saves = this.product._saveSystem;
        return saves._sessions.withRunLock(handle, input.sessionId, async () => {
            const session = await saves._sessions.get(handle, input.sessionId);
            if (session?.headRevisionId !== input.expectedRevisionId) throw new ConflictError('native_session_head_conflict');
            const point = input.saveId ? await saves._saves.get(handle, input.sessionId, input.saveId) : null;
            if (input.saveId && !point) throw new ConflictError('native_save_point_conflict');
            let password;
            let archive;
            try {
                if (input.passwordSecretRef !== undefined) password = await this._password(handle, input.passwordSecretRef,
                    { operation: 'export', sessionId: input.sessionId, revisionId: point?.revisionId ?? session.headRevisionId, saveId: input.saveId ?? null });
                const options = password === undefined ? {} : { password };
                archive = input.saveId ? await this.product.exportSnapshot(handle, input.sessionId, input.saveId, options)
                    : await this.product.exportSession(handle, input.sessionId, options);
            } finally { password = undefined; }
            const header = preflightAtriaSaveContainer(archive), expectedRoot = point?.revisionId ?? session.headRevisionId;
            if (header.root.sessionId !== input.sessionId || header.root.revisionId !== expectedRoot) throw new ConflictError('native_save_export_source_conflict');
            return this.artifacts.captureSessionArchive(handle, input.clientInstanceId, input.sessionId, header.root.revisionId, input.saveId ?? null, archive);
        });
    }
    async preflight(handle, ref) {
        return this.artifacts.withSessionArchive(handle, ref, async archive => {
            const preflight = await this.product.preflightSaveImport(handle, archive);
            const existing = await this.product._saveSystem._sessions.get(handle, preflight.root.sessionId);
            return { artifactRef: ref, preflight, targetSessionFingerprint: hashNativeDocument(existing), target: existing ? { sessionId: existing.sessionId, headRevisionId: existing.headRevisionId } : null,
                effects: 'Native exact Save closure import; existing Session conflicts and Ironman rules remain authoritative' };
        });
    }
    async import(handle, input) {
        archiveFields(input, ['artifactRef', 'expectedPreflightFingerprint', 'passwordSecretRef'], 'Session Archive import');
        const view = await this.preflight(handle, input.artifactRef);
        if (hashNativeDocument(view) !== input.expectedPreflightFingerprint || view.preflight.dependency.status !== 'ready') throw new ConflictError('native_save_preflight_conflict');
        if (view.preflight.protection.requiresPassword && input.passwordSecretRef === undefined) throw new ConflictError('native_save_trusted_password_required');
        if (!view.preflight.protection.requiresPassword && input.passwordSecretRef !== undefined) throw new ConflictError('native_save_password_ref_unnecessary');
        return this.artifacts.withSessionArchive(handle, input.artifactRef, async archive => {
            let password;
            try {
                if (input.passwordSecretRef !== undefined) password = await this._password(handle, input.passwordSecretRef,
                    { operation: 'import', artifactRef: input.artifactRef, sessionId: view.preflight.root.sessionId, revisionId: view.preflight.root.revisionId });
                return await this.product.importSave(handle, archive,
                    { ...(password === undefined ? {} : { password }), expectedSessionFingerprint: view.targetSessionFingerprint, effectPolicy: 'no-background-model' });
            } finally { password = undefined; }
        });
    }
}

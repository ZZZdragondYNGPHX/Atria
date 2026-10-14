import { NativeSessionArchiveAuthority } from '../native/session-archive-authority.js';
import { SecretManager, SECRET_KEYS } from './secrets.js';
import { ConflictError } from '../storage/errors.js';

const passwordResolver = req => async (handle, ref, context) => {
    if (handle !== req.user?.profile?.handle || !req.user?.directories || context.purpose !== 'session-archive-password'
        || !['export', 'import'].includes(context.operation)) throw new ConflictError('native_save_password_secret_unavailable');
    return new SecretManager(req.user.directories).readSecret(SECRET_KEYS.ATRIA_SAVE_PASSWORD, ref.secretId);
};

// Shares the bounded artifact byte transport; Archive and Package consumers
// retain different exact source-kind checks and original business authorities.
export function mountNativeSessionArchives(router, route, artifacts) {
    router.get('/save-archives/password-references', route(async (req, res) => {
        if (!req.user?.directories) throw new ConflictError('native_save_password_secret_unavailable');
        res.json({ passwordSecretRefs: new SecretManager(req.user.directories).listReferences(SECRET_KEYS.ATRIA_SAVE_PASSWORD)
            .map(ref => ({ secretId: ref.secretId, scope: 'player' })) });
    }));
    router.post('/save-archives/begin', route(async (req, res, _, handle) => {
        res.json(artifacts.beginSessionArchive(handle, req.body));
    }));
    router.post('/save-archives/export', route(async (req, res, { product }, handle) => {
        res.json(await new NativeSessionArchiveAuthority({ product, artifacts, resolvePassword: passwordResolver(req) }).export(handle, req.body));
    }));
    router.post('/save-archives/preflight', route(async (req, res, { product }, handle) => {
        if (!req.body || Object.keys(req.body).join(',') !== 'artifactRef') throw new TypeError('Exact Archive reference required');
        res.json(await new NativeSessionArchiveAuthority({ product, artifacts }).preflight(handle, req.body.artifactRef));
    }));
    router.post('/save-archives/import', route(async (req, res, { product }, handle) => {
        const snapshot = await new NativeSessionArchiveAuthority({ product, artifacts, resolvePassword: passwordResolver(req) }).import(handle, req.body);
        res.json({ sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId,
            packageId: snapshot.session.packageId, packageVersionId: snapshot.session.packageVersionId });
    }));
}

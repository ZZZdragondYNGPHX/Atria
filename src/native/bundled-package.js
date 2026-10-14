import { createHash } from 'node:crypto';
import { PackageInstaller } from './package-composition.js';
import { withNativeResourceWrite } from './repositories/common.js';

// Distribution-owned defaults use the ordinary Package authority. This does
// not create a Session, choose Runtime routes, or send a generation request.
export async function seedBundledPackage(handle, archive, { sha256, packageRepo, assetStore }) {
    if (!/^[a-f0-9]{64}$/.test(sha256 || '')
        || createHash('sha256').update(archive).digest('hex') !== sha256) {
        throw new TypeError('Bundled Package checksum mismatch');
    }
    const installer = new PackageInstaller({ packageRepo, assetStore });
    const preflight = installer.preflight(archive);
    // Only the shipped story's bounded generation permission is pre-approved.
    // A future bundle needing another capability must go through explicit review.
    if (preflight.permissions.some(({ permission }) => permission !== 'generation')) {
        throw new TypeError('Unsupported bundled Package permission');
    }
    return withNativeResourceWrite(handle, 'package:' + preflight.packageId, async () => {
        if (await packageRepo.get(handle, preflight.packageId)) return false;
        await installer.install(handle, archive, { grantedPermissions: ['generation'] });
        return true;
    });
}

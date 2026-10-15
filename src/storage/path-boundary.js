import fs from 'node:fs';
import path from 'node:path';

/** The configured account root is the boundary; links below it are not paths. */
export function assertAccountPath(root, candidate) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    const unsafe = () => Object.assign(new TypeError('Storage path escapes its account or crosses a symbolic link'), { code: 'E_INVALID_PATH' });
    if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) throw unsafe();
    let current = path.resolve(root);
    for (const part of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        try { if (fs.lstatSync(current).isSymbolicLink()) throw unsafe(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return path.resolve(candidate);
}

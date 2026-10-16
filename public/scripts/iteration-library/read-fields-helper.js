// Schema/profile roots are persisted JSON. Serialization belongs to the tool
// transport; reading must preserve authored content without truncation.
export function readFieldsByPaths(root, paths) {
    if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string' || !path)) {
        throw new Error('invalid_args: paths must be an array of non-empty path strings.');
    }
    const missing = [];
    const entries = paths.map(path => {
        let value = root;
        for (const key of path.split(/[.[\]]/).filter(Boolean)) {
            value = value != null && Object.hasOwn(value, key) ? value[key] : undefined;
        }
        if (value === undefined) missing.push(path);
        return [path, value === undefined ? null : value];
    });
    return Object.fromEntries([...entries, ['missing_paths', missing]]);
}

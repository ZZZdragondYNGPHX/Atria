// Only PackageInstaller registers an admitted immutable archive. Authoring and
// ad-hoc Maps have no identity and keep their exact-byte compilation path.
const archives = new WeakMap();
export function registerPackageDeclarations(opened, archive) {
    archives.set(opened.sourceFiles, { archive, assets: opened.assets });
    return opened;
}
export function packageDeclarationKey(installed) {
    const entry = archives.get(installed.sourceFiles);
    return entry && entry.assets === installed.assets && entry.archive.manifest === installed.manifest ? entry.archive : null;
}

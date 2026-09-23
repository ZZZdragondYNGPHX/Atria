import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertAtriaPluginContract } from './authoring-contracts.js';

export const ATRIA_HOST_PLUGIN_MANIFEST = 'atria.plugin.json';

export async function loadAtriaHostPluginDirectory(
    directory,
    { boundary, grantedPermissions = [], importer = specifier => import(specifier) } = {},
) {
    if (!boundary || typeof boundary.activate !== 'function') {
        throw new TypeError('Atria Host Plugin loader requires a HostPluginBoundary');
    }
    const root = path.resolve(String(directory || ''));
    const manifestPath = path.join(root, ATRIA_HOST_PLUGIN_MANIFEST);
    const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const manifest = assertAtriaPluginContract(raw);
    if (!manifest.host) throw new Error('Atria Host Plugin manifest does not declare host execution');

    const entrypoint = path.resolve(root, manifest.host.entrypoint);
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    if (!entrypoint.startsWith(prefix)) {
        throw new Error('Atria Host Plugin entrypoint escapes its plugin directory');
    }
    const module = await importer(pathToFileURL(entrypoint).href);
    await boundary.activate(manifest, module, { grantedPermissions });
    return manifest;
}

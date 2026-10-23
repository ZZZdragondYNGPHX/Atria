import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { O } from './schema.mjs';
import { bridgeSource } from './interfaces.mjs';
import { PLACES, ROUTES, BACKGROUNDS, ITEMS } from '../source/content/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// C4 is reused verbatim. Host schemas are obtained from the selected core,
// rather than copied or widened into a parallel application contract.
export async function frontendBindings(load, logic, contract) {
    const { fixedHostTarget } = await load('public/shared/native-frontend-host.js');
    const bindings = bridgeSource(logic, contract).bindings;
    const hosts = [
        ['session', 'host.session', 'status'],
        ['saves', 'host.session', 'saves'],
        ['save', 'host.session', 'save'],
        ['restore', 'host.session', 'restore'],
        ['reload', 'host.session', 'reload'],
        ['recover', 'host.session', 'recover'],
        ['exit', 'host.session', 'exit'],
        ['composerGet', 'host.composer', 'get'],
        ['composerSet', 'host.composer', 'set'],
        ['composerSubmit', 'host.composer', 'submit'],
        ['conversationStatus', 'host.conversation', 'status'],
        ['generation', 'host.conversation', 'generation'],
        ['messages', 'host.conversation', 'recent'],
        ['conversationCancel', 'host.conversation', 'cancel'],
        ['taskPresentation', 'host.tasks', 'presentation'],
    ];
    for (const [id, service, method] of hosts) {
        const target = { service, method }, definition = fixedHostTarget(target);
        bindings.push({ id, kind: definition.kind, target,
            inputSchema: definition.inputSchema, outputSchema: definition.outputSchema,
            ...(definition.collection ? { collection: { pageSize: 32, orderBy: 'saveId', filters: [], search: [] } } : {}),
        });
    }
    return { version: 1, bindings };
}

function mergeDeclarations(modules, name) {
    const output = {};
    for (const module of modules) for (const [key, value] of Object.entries(module[name] || {})) {
        if (Object.hasOwn(output, key)) throw new Error('Duplicate frontend ' + name + ' declaration: ' + key);
        output[key] = value;
    }
    return output;
}

export async function frontend({ core, load, files, manifest, contract, logic }) {
    const bridge = await frontendBindings(load, logic, contract);
    files.set('frontend/bridge.json', Buffer.from(JSON.stringify(bridge)));
    const uiRoot = path.join(root, 'frontend');
    const modules = await Promise.all(['scene-state.mjs', 'panels-state.mjs', 'controller-state.mjs']
        .map(name => import(pathToFileURL(path.join(uiRoot, name)).href)));
    const state = mergeDeclarations(modules, 'state');
    const dynamicStyles = mergeDeclarations(modules, 'dynamicStyles');
    const scene = await fs.readFile(path.join(uiRoot, 'Scene.aui'), 'utf8');
    const panels = await fs.readFile(path.join(uiRoot, 'Panels.aui'), 'utf8');
    if (scene.split('<!-- PANELS -->').length !== 2) throw new Error('Scene.aui must contain exactly one PANELS insertion point');
    const template = scene.replace('<!-- PANELS -->', panels);
    const { parseAui } = await load('src/native/frontend/aui-parser.js');
    const nodeRefs = new Set(modules.flatMap(module => module.nodeRefs || []));
    function visit(node, repeated = false) {
        repeated ||= Boolean(node.each);
        if (!repeated && (/^(button|input|select|textarea)$/.test(node.tag) || node.id.endsWith('-events'))) nodeRefs.add(node.id);
        for (const child of node.children || []) if (typeof child === 'object') visit(child, repeated);
    }
    visit(parseAui('<template>' + template + '</template>', 'Main.aui').ast.root);
    const presentation = {
        state: { component: { schema: O(Object.fromEntries(Object.entries(state).map(([key, entry]) => [key, entry.schema]))),
            initial: Object.fromEntries(Object.entries(state).map(([key, entry]) => [key, entry.value])) } },
        controller: { source: 'main.js', required: true }, nodeRefs: [...nodeRefs],
        uses: bridge.bindings.map(binding => binding.id),
        ...(Object.keys(dynamicStyles).length ? { dynamicStyles } : {}),
    };
    files.set('frontend/Main.aui', Buffer.from('<template>' + template + '</template><contract>' + JSON.stringify(presentation) + '</contract>'));
    for (const name of await fs.readdir(uiRoot)) if (name.endsWith('.js')) files.set('frontend/' + name, await fs.readFile(path.join(uiRoot, name)));
    // Only static, public authoring metadata enters the browser. Never include
    // CAST, individual motives, starting memories, policy or rule records.
    const catalog = { PLACES, ROUTES, BACKGROUNDS, ITEMS };
    files.set('frontend/catalog.js', Buffer.from(Object.entries(catalog)
        .map(([name, value]) => 'export const ' + name + ' = ' + JSON.stringify(value) + ';').join('\n')));
    const styles = [];
    for (const name of ['theme.css', 'panels.css']) {
        files.set('frontend/' + name, await fs.readFile(path.join(uiRoot, name)));
        styles.push({ id: name.slice(0, -4), source: name });
    }
    // The native graph limits each resource to 2 MiB. Encode a delivery copy
    // using the core's installed Apache-2.0 jsquash codecs, preserving pixels'
    // dimensions and leaving all original design-reference files untouched.
    const require = createRequire(path.join(core, 'package.json'));
    const codec = id => import(pathToFileURL(require.resolve(id)).href);
    const png = await codec('@jsquash/png/decode.js');
    const webpDecode = await codec('@jsquash/webp/decode.js');
    const webpEncode = await codec('@jsquash/webp/encode.js');
    const feature = await codec('wasm-feature-detect'), simd = feature.simd || feature.default.simd;
    await png.init(await fs.readFile(require.resolve('@jsquash/png/codec/pkg/squoosh_png_bg.wasm')));
    await webpDecode.init({ wasmBinary: await fs.readFile(require.resolve('@jsquash/webp/codec/dec/webp_dec.wasm')) });
    await webpEncode.init({ wasmBinary: await fs.readFile(require.resolve('@jsquash/webp/codec/enc/' + (await simd() ? 'webp_enc_simd.wasm' : 'webp_enc.wasm'))) });
    const assets = [], delivery = [], sources = new Map();
    for (const folder of ['frontend/assets']) {
        for (const name of (await fs.readdir(path.join(root, folder))).sort()) {
            if (!/\.(png|webp)$/.test(name)) continue;
            const id = name.replace(/\.(png|webp)$/, '');
            if ((id.startsWith('local-') || ['xiaoyan-opening','xiaozhan','xuner-opening'].includes(id)) && id!=='local-su') continue;
            const original = await fs.readFile(path.join(root, folder, name));
            const sha256 = createHash('sha256').update(original).digest('hex');
            if (sources.has(id)) {
                if (sources.get(id).sha256 !== sha256) throw new Error('Conflicting image identity: ' + id);
                continue;
            }
            sources.set(id, { name, path: folder + '/' + name, original, sha256 });
        }
    }
    for (const asset of manifest.assets.filter(a => a.logicalName.startsWith('media/pools/'))) {
        const original = await fs.readFile(path.join(root, asset.logicalName));
        sources.set(asset.assetId, {name: asset.logicalName, path: asset.logicalName, original, sha256: asset.contentHash});
    }
    for (const [id, asset] of [...sources].sort(([a], [b]) => a.localeCompare(b))) {
        const { name, original } = asset, source = 'assets/' + id + '.webp';
        const bitmap = await (name.endsWith('.png') ? png.default : webpDecode.default)(original);
        // Optional author-only cache lives outside the package. Its key includes
        // source bytes and encoding settings; corrupt entries are regenerated.
        const cache = process.env.ATRIA_MEDIA_CACHE;
        const cachePath = cache && path.join(cache, asset.sha256 + '-q90-m6.webp');
        let bytes;
        if (cachePath) {
            try { bytes = await fs.readFile(cachePath); await webpDecode.default(bytes); }
            catch (error) { if (error.code && error.code !== 'ENOENT') throw error; bytes = null; }
        }
        if (!bytes) {
            bytes = Buffer.from(await webpEncode.default(bitmap, { quality: 90, method: 6 }));
            if (cachePath) { await fs.mkdir(cache, {recursive:true}); await fs.writeFile(cachePath,bytes); }
        }
        if (bytes.length > 2 * 1024 * 1024) throw new Error('Delivery image exceeds native per-resource budget: ' + name);
        files.set('frontend/' + source, bytes);
        assets.push({ id, source, mediaType: 'image/webp' });
        delivery.push({ id, original: asset.path, originalSha256: asset.sha256, width: bitmap.width, height: bitmap.height, originalBytes: original.length, deliveryBytes: bytes.length, quality: 90 });
    }
    files.set('frontend/media-delivery.json', Buffer.from(JSON.stringify(delivery)));
    const index = { format: 'atria-frontend-source', version: 3, primaryView: 'main', bridge: 'bridge.json',
        views: [{ id: 'main', root: 'Main', surface: 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }], styles, assets };
    files.set('frontend/index.json', Buffer.from(JSON.stringify(index)));
    const { compileFrontend } = await load('src/native/frontend/compiler.js');
    const built = compileFrontend({ source: 'frontend/index.json', files, mode: 'full', experienceContract: contract, transactions: logic.transactions });
    for (const [name, content] of built.files) files.set(name, content);
    manifest.runtime.experience = { mode: 'full', frontend: { kind: 'native', version: 3, entry: built.entry },
        features: [{ id: 'frontend-script', version: 1, required: true }] };
    return built;
}

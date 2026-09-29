import { fixedHostTarget } from '../../../public/shared/native-frontend-host.js';

export function authoringFixture() {
    const source = { package: { runtime: { experience: { mode: 'full', frontend: { kind: 'native', version: 3, source: 'frontend/index.json' } } }, permissions: [], entryPoints: [] } };
    const target = { service: 'host.presentation', method: 'locale' }, contract = fixedHostTarget(target);
    const index = { format: 'atria-frontend-source', version: 3, primaryView: 'main', views: [{ id: 'main', root: 'Main', surface: 'app.root' }],
        components: [{ id: 'Main', source: 'Main.aui' }], bridge: 'bridge.json', localization: 'locales.json', styles: [{ id: 'theme', source: 'theme.css' }] };
    const aui = '<!-- author note -->\r\n<template>\r\n  <main node-id="root"><p node-id=\'greeting\' class = \'old\'>Hello</p><!-- keep --></main>\r\n</template>\r\n<contract>{ "uses": ["locale"] }</contract>\r\n<style>/* preserved */ p { color: red; }</style>\r\n';
    const files = new Map(Object.entries({ 'frontend/index.json': JSON.stringify(index, null, 2), 'frontend/Main.aui': aui,
        'frontend/theme.css': '/* theme */ main { padding: 8px; }',
        'frontend/bridge.json': JSON.stringify({ version: 1, bindings: [{ id: 'locale', kind: 'read', target, inputSchema: contract.inputSchema, outputSchema: contract.outputSchema }] }, null, 2),
        'frontend/locales.json': JSON.stringify({ version: 1, defaultLocale: 'en', catalogs: { en: { direction: 'ltr', messages: { greeting: 'Hello' } } } }, null, 2),
    }).map(([path, text]) => [path, Buffer.from(text)]));
    return { source, files };
}

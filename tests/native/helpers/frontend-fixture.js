import { compileFrontend } from '../../../src/native/frontend/compiler.js';

// Minimal formal Source -> Compiler fixture for adjacent non-frontend regressions.
export function minimalFrontend(mode = 'component') {
    if (mode === 'text') return { experience: { mode }, files: new Map() };
    const source = { format: 'atria-frontend-source', version: 3, primaryView: 'main', views: [{ id: 'main', root: 'Main', surface: mode === 'component' ? 'chat.footer' : 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }] };
    const files = new Map([['frontend.json', Buffer.from(JSON.stringify(source))], ['Main.aui', Buffer.from('<template><main node-id="root"><p node-id="message">Native Frontend</p></main></template>')]]);
    const compiled = compileFrontend({ source: 'frontend.json', files, mode });
    return { experience: { mode, frontend: { kind: 'native', version: 3, entry: compiled.entry }, features: [] }, files: new Map([...files, ...compiled.files]), compiled };
}

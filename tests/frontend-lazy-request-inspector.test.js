import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const INDEX_URL = new URL('../public/index.html', import.meta.url);
const ENTRY_URL = new URL('../public/scripts/request-inspector-entry.js', import.meta.url);
const PANEL_URL = new URL('../public/scripts/request-inspector.js', import.meta.url);

describe('lazy request inspector', () => {
    test('loads only the lightweight entry module from index.html', () => {
        const html = readFileSync(INDEX_URL, 'utf8');
        expect(html).toContain('scripts/request-inspector-entry.js');
        expect(html).not.toContain('scripts/request-inspector.js"></script>');
    });

    test('entry dynamically imports and memoizes the heavy inspector panel', () => {
        const source = readFileSync(ENTRY_URL, 'utf8');
        expect(source).toContain("import('./request-inspector.js')");
        expect(source).toContain('inspectorModulePromise ??=');
        expect(source).toContain('request_inspector_button');
        expect(source).toContain('await openInspectorPanel()');
    });

    test('panel exports its opener and no longer installs the button itself', () => {
        const source = readFileSync(PANEL_URL, 'utf8');
        expect(source).toContain('export async function openInspectorPanel()');
        expect(source).not.toContain("jQuery(() => {");
        expect(source).not.toContain('request_inspector_button');
    });
});

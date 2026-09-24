import { el, action, feedback } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { nativeStudioClient } from './studio-client.js';
import { sourceWriteOperation } from './studio-authoring.js';

export function sourceFileInfo(path, content) {
    const extension = path.split('.').pop().toLowerCase();
    const type = { json: 'JSON', jsonl: 'JSON Lines', yaml: 'YAML', yml: 'YAML', js: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', css: 'CSS', html: 'HTML', xml: 'XML', svg: 'SVG', md: 'Markdown', txt: 'Text' }[extension] || 'Text';
    const bytes = Uint8Array.from(atob(content), char => char.charCodeAt(0));
    if (bytes.length > 1024 * 1024) return { type, readOnly: true, reason: 'This file is too large for the Source editor. Replace it from Assets.', size: bytes.length };
    if (/^(png|jpe?g|gif|webp|avif|bmp|ico|mp[34]|ogg|wav|webm|flac|zip|atria|pdf|woff2?|ttf|otf|wasm|bin)$/.test(extension)) return { type: 'Binary', readOnly: true, reason: 'Binary file. Use Replace to change its contents.', size: bytes.length };
    try {
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error('binary');
        return { type, extension, text, readOnly: false, size: bytes.length };
    } catch { return { type: 'Binary', readOnly: true, reason: 'Binary or non-UTF-8 file. Source editing is disabled to preserve its bytes.', size: bytes.length }; }
}

export function sourceTextDiff(before, after) {
    if (before === after) return { text: '', truncated: false };
    const left = before.split('\n'), right = after.split('\n'); let start = 0, end = 0;
    while (start < Math.min(left.length, right.length) && left[start] === right[start]) start++;
    while (end < Math.min(left.length, right.length) - start && left[left.length - end - 1] === right[right.length - end - 1]) end++;
    const oldLines = left.slice(start, left.length - end), newLines = right.slice(start, right.length - end);
    const lines = [`@@ -${start + 1},${oldLines.length} +${start + 1},${newLines.length} @@`, ...oldLines.map(line => '- ' + line), ...newLines.map(line => '+ ' + line)];
    const text = lines.slice(0, 500).join('\n'); return { text: text.slice(0, 40000), truncated: lines.length > 500 || text.length > 40000 };
}

export async function validateSourceText(info, text, { parseYaml, parseXml, validateStructured } = {}) {
    const clean = text.replace(/^\uFEFF/, '');
    let parsed;
    if (info.extension === 'json') parsed = JSON.parse(clean);
    else if (info.extension === 'jsonl') for (const line of clean.split('\n')) { if (line.trim()) JSON.parse(line); }
    else if (['yaml', 'yml'].includes(info.extension)) {
        const parse = parseYaml || (await import('../../lib.js')).yaml.parse; parsed = parse(clean);
    } else if (['xml', 'svg'].includes(info.extension)) {
        const result = parseXml ? parseXml(clean) : new DOMParser().parseFromString(clean, 'application/xml');
        if (result.querySelector('parsererror')) throw new Error(tl('Enter valid XML.'));
    }
    if (validateStructured) await validateStructured(parsed, text);
}

export async function mountSourceEditor({ document: doc, root, projectId, stageOperations, client = nativeStudioClient, validateStructured = null }) {
    const shell = el(doc, 'section', 'atri-source-editor', undefined, root); shell.dataset.atriaSourceEditor = 'true';
    const status = el(doc, 'p', '', tl('Reading project sources…'), shell); status.setAttribute('role', 'status');
    try {
        const sources = await client.listSources(projectId);
        if (!sources.length) { status.textContent = tl('This project currently contains only structured manifest resources.'); return; }
        const label = el(doc, 'label', 'atri-library-field', tl('File'), shell); const chooser = el(doc, 'select', '', undefined, label); chooser.setAttribute('aria-label', tl('Source file'));
        for (const source of sources) { const option = el(doc, 'option', '', source.path, chooser); option.value = source.path; }
        const editor = el(doc, 'textarea', 'text_pole atria-studio-editor__textarea', undefined, shell); editor.setAttribute('aria-label', tl('Source editor')); editor.spellcheck = false;
        const diffBox = el(doc, 'section', 'atri-source-diff', undefined, shell); el(doc, 'h4', '', tl('Proposed text changes'), diffBox);
        const diff = el(doc, 'pre', '', undefined, diffBox); const note = el(doc, 'p', '', undefined, diffBox);
        let loaded = null, sequence = 0, busy = false; const drafts = new Map();
        const review = el(doc, 'button', 'atri-library-button atri-library-button--primary', tl('Review Source Change'), shell); review.type = 'button'; review.disabled = true;
        function showDiff() {
            const result = sourceTextDiff(loaded?.info.text || '', editor.value); diff.textContent = result.text || tl('No text changes.');
            note.textContent = result.truncated ? tl('Diff preview is truncated. The complete edited file will be reviewed.') : '';
        }
        function remember() { if (loaded && !loaded.info.readOnly) drafts.set(loaded.path, editor.value); }
        async function load(reload = false) {
            remember(); const token = ++sequence, path = chooser.value; busy = true; loaded = null; editor.disabled = true; review.disabled = true; status.textContent = tl('Reading project sources…');
            try {
                const file = await client.readSource(projectId, path); if (token !== sequence || !shell.isConnected) return;
                const info = sourceFileInfo(path, file.content); loaded = { path, info }; if (reload) drafts.delete(path);
                editor.value = info.readOnly ? '' : drafts.get(path) ?? info.text; editor.readOnly = info.readOnly; editor.disabled = info.readOnly;
                status.textContent = `${tl(info.type)} · ${info.size} ${tl('bytes')}` + (info.readOnly ? ' · ' + tl(info.reason) : ' · ' + tl(['json', 'jsonl', 'yaml', 'yml', 'xml', 'svg'].includes(info.extension) ? 'Format validation runs before review.' : 'Plain text editing. Project validation runs when changes are applied.'));
                shell.querySelector(':scope > .atri-library-feedback')?.remove(); diffBox.hidden = info.readOnly; showDiff(); review.disabled = info.readOnly;
            } catch (error) { if (token === sequence) { status.textContent = tl('Could not load sources'); feedback(doc, shell, error.message, true); } } finally { if (token === sequence) busy = false; }
        }
        editor.addEventListener('input', () => { editor.removeAttribute('aria-invalid'); shell.querySelector(':scope > .atri-library-feedback')?.remove(); remember(); showDiff(); });
        chooser.addEventListener('change', () => void load());
        review.addEventListener('click', async () => {
            if (busy || !loaded || loaded.info.readOnly) return;
            busy = true; review.disabled = true; chooser.disabled = true; editor.disabled = true;
            try {
                await validateSourceText(loaded.info, editor.value, { validateStructured: validateStructured ? (value, text) => validateStructured(loaded.path, value, text) : null });
                if (loaded.info.text === editor.value) { feedback(doc, shell, tl('No text changes.')); return; }
                showDiff(); await stageOperations([sourceWriteOperation(loaded.path, editor.value)], tl('Review Source Change'));
            } catch (error) { editor.setAttribute('aria-invalid', 'true'); feedback(doc, shell, tl('Check the file format. Your draft is still here.') + ' ' + error.message, true); } finally { busy = false; review.disabled = !loaded || loaded.info.readOnly; chooser.disabled = false; editor.disabled = !loaded || loaded.info.readOnly; }
        });
        action(doc, shell, 'Reload file', async () => { if (!busy) await load(true); });
        await load();
    } catch (error) { status.textContent = tl('Could not load sources'); feedback(doc, shell, error.message, true); action(doc, shell, 'Retry', () => { shell.remove(); return mountSourceEditor({ document: doc, root, projectId, stageOperations, client, validateStructured }); }); }
}

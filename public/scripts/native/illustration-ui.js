import { translateShellText } from '../atria-shell/localization.js';
export function illustrationNode(doc, parent, tag, text, className = '') {
    const node = doc.createElement(tag); if (text !== undefined) node.textContent = text;
    if (className) node.className = className; parent?.append(node); return node;
}
export function illustrationField(doc, parent, label, value, change, { multiline = false, type = 'text' } = {}) {
    const wrapper = illustrationNode(doc, parent, 'label', undefined, 'atri-illustration-field');
    illustrationNode(doc, wrapper, 'span', label);
    const input = illustrationNode(doc, wrapper, multiline ? 'textarea' : 'input');
    if (!multiline) input.type = type;
    input.setAttribute('aria-label', label); input.autocomplete = 'off';
    if (type === 'checkbox') input.checked = Boolean(value); else input.value = value ?? '';
    input.addEventListener('input', () => change(type === 'checkbox' ? input.checked : input.value));
    return input;
}
export function illustrationSelect(doc, parent, label, value, choices, change) {
    const wrapper = illustrationNode(doc, parent, 'label', undefined, 'atri-illustration-field');
    illustrationNode(doc, wrapper, 'span', label);
    const input = illustrationNode(doc, wrapper, 'select'); input.setAttribute('aria-label', label);
    const rows = new Map(choices);
    if (value && !rows.has(value)) rows.set(value, translateShellText('Unavailable ·') + value);
    for (const [id, name] of rows) { const option = illustrationNode(doc, input, 'option', name); option.value = id; }
    input.value = value;
    input.addEventListener('change', () => change(input.value)); return input;
}
export function illustrationButton(doc, parent, label, callback, { isDisabled = () => false } = {}) {
    const button = illustrationNode(doc, parent, 'button', label); button.type = 'button';
    button.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true; button.setAttribute('aria-busy', 'true');
        try { await callback(); } finally { button.disabled = isDisabled(); button.removeAttribute('aria-busy'); }
    }); return button;
}
export const ILLUSTRATION_CSS = `
.atri-illustration-ui { color:var(--text-1); font:400 var(--fs-md)/1.55 var(--font-ui); }
.atri-illustration-ui :is(button,input,select,pre) { overflow-wrap:anywhere; }
.atri-illustration-ui button { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:32px; padding:0 13px; cursor:pointer; color:var(--text-1); background:var(--surface-raised); border:1px solid var(--line-2); border-radius:var(--r-md); box-shadow:var(--shadow-1); font:500 var(--fs-md)/1.2 var(--font-ui); white-space:normal; transition:background-color var(--dur-1),border-color var(--dur-1),transform var(--dur-1); }
.atri-illustration-ui button:hover:not(:disabled) { background:var(--surface-hover); border-color:var(--line-3); }
.atri-illustration-ui button:active:not(:disabled) { transform:translateY(.5px); background:var(--surface-press); }
.atri-illustration-ui button:disabled { opacity:.45; cursor:not-allowed; }
/* Approve-and-submit is the one primary; consent boxes beside it are never pre-checked. */
.atri-illustration-ui button.atri-illustration-primary { border-color:transparent; background:var(--btn-primary-bg); color:var(--btn-primary-text); font-weight:600; box-shadow:0 1px 0 rgb(255 255 255 / .25) inset, 0 0 0 1px var(--btn-primary-ring); }
.atri-illustration-ui button.atri-illustration-primary:hover:not(:disabled) { background:var(--btn-primary-bg); filter:brightness(1.06); }
.atri-illustration-ui :focus-visible { outline:none; box-shadow:var(--focus-ring); }
.atri-illustration-ui :is(input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,select) { width:100%; max-width:100%; min-height:34px; box-sizing:border-box; padding:7px 11px; color:var(--text-1); background:color-mix(in srgb, var(--text-1) 3.5%, transparent); border:1px solid var(--line-2); border-radius:var(--r-md); box-shadow:none; font:400 var(--fs-md)/1.4 var(--font-ui); }
.atri-illustration-ui :is(input,textarea,select):focus { outline:none; border-color:color-mix(in srgb, var(--tone-lapis) 70%, transparent); box-shadow:0 0 0 3px var(--soft-lapis); }
.atri-illustration-ui textarea { min-height:96px; resize:vertical; line-height:1.65; }
.atri-illustration-ui textarea:disabled { opacity:.55; }
.atri-illustration-ui input[type=checkbox] { appearance:auto; accent-color:var(--tone-lumen); width:17px; height:17px; flex:none; filter:none; }
.atri-illustration-ui input[type=checkbox]::before { content:none; }
.atri-illustration-ui fieldset { min-width:0; margin:12px 0; padding:14px 16px; border:1px solid var(--line-2); border-radius:var(--r-lg); }
.atri-illustration-ui legend { padding:0 6px; font:600 10.5px/1 var(--font-ui); letter-spacing:.12em; text-transform:uppercase; color:var(--text-3); }
.atri-illustration-ui summary { min-height:36px; cursor:pointer; display:flex; align-items:center; color:var(--text-2); font:550 var(--fs-sm)/1.4 var(--font-ui); }
.atri-illustration-ui pre { white-space:pre-wrap; font:400 12px/1.7 var(--font-mono); color:var(--text-2); padding:12px; border-radius:var(--r-md); border:1px solid var(--line-1); background:var(--surface-panel); }
.atri-illustration-ui h2 { margin:0 0 6px; font:600 var(--fs-xl)/1.25 var(--font-ui); letter-spacing:-.01em; }
.atri-illustration-ui h3 { margin:22px 0 12px; font:600 var(--fs-lg)/1.3 var(--font-ui); }
.atri-illustration-ui h3:first-child { margin-top:0; }
.atri-illustration-ui > p { color:var(--text-2); font-size:var(--fs-sm); }
.atri-illustration-field { display:grid; gap:6px; margin:12px 0; color:var(--text-2); font:550 var(--fs-sm)/1.4 var(--font-ui); overflow-wrap:anywhere; }
.atri-illustration-field:has(input[type=checkbox]) { display:flex; align-items:center; gap:10px; min-height:36px; font-weight:400; font-size:var(--fs-md); color:var(--text-1); }
.atri-illustration-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.atri-illustration-card blockquote { margin:12px 0; padding:10px 14px; border-inline-start:2px solid var(--tone-lumen); white-space:pre-wrap; overflow-wrap:anywhere; max-height:160px; overflow:auto; font:400 var(--fs-lg)/1.7 var(--font-read); color:var(--text-1); }
/* Over the Stage: a raised toolbar and an on-demand panel. */
.atri-illustration-toolbar { position:fixed; z-index:2100; right:max(16px,env(safe-area-inset-right)); bottom:max(var(--atri-illustration-controls-inset,16px),env(safe-area-inset-bottom)); max-width:calc(100vw - 32px); padding:4px; border-radius:var(--r-capsule); border:1px solid var(--glass-line); background:var(--mat-glass-strong); box-shadow:var(--glass-rim), var(--glass-shadow); -webkit-backdrop-filter:blur(20px) saturate(1.5); backdrop-filter:blur(20px) saturate(1.5); }
.atri-illustration-toolbar button { border-color:transparent; background:transparent; box-shadow:none; border-radius:var(--r-capsule); }
.atri-illustration-panel { position:fixed; z-index:2101; right:max(16px,env(safe-area-inset-right)); bottom:calc(16px + max(var(--atri-illustration-controls-inset,16px),env(safe-area-inset-bottom)) + var(--atri-illustration-toolbar-height,60px)); width:min(460px,calc(100vw - 32px)); max-height:calc(100dvh - var(--atri-illustration-toolbar-height,60px) - max(var(--atri-illustration-controls-inset,16px),env(safe-area-inset-bottom)) - 48px); overflow:auto; overscroll-behavior:contain; box-sizing:border-box; padding:18px 20px; border-radius:var(--r-2xl); border:1px solid var(--line-2); background:var(--surface-panel); box-shadow:var(--shadow-3); }
.atri-illustration-panel[hidden],.atri-illustration-toolbar[hidden] { display:none; }
.atri-illustration-panel > .atri-illustration-actions { position:sticky; top:-18px; z-index:1; margin:-18px -20px 0; padding:12px 20px; background:var(--surface-panel); border-bottom:1px solid var(--line-1); }
.atri-illustration-panel > button:first-child { position:sticky; top:0; z-index:1; }
.atri-illustration-selectable { user-select:text; -webkit-user-select:text; }
::highlight(atri-illustration) { background:var(--soft-lumen); text-decoration:underline; text-decoration-color:var(--tone-lumen); }
.atri-illustration-history img { display:block; max-width:100%; height:auto; border-radius:var(--r-md); }
/* Gallery: 12 per page; hide is not delete. */
.atri-visual-gallery { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr)); gap:16px; margin-top:16px; }
.atri-visual-gallery article { min-width:0; padding:10px; border:1px solid var(--line-2); border-radius:var(--r-xl); background:var(--surface-panel); }
.atri-visual-gallery article > p { margin:10px 2px; font-size:var(--fs-xs); color:var(--text-3); }
.atri-visual-gallery img { display:block; max-width:100%; height:auto; border-radius:12px; border:1px solid var(--line-1); }
.atri-visual-gallery article > button { margin:0 6px 6px 0; }
.atri-mask-viewport { margin:12px 0; border:1px solid var(--line-2); border-radius:var(--r-md); }
.atri-media-studio { margin-top:24px; padding:20px; border:1px solid var(--line-2); border-radius:var(--r-xl); background:var(--surface-panel); }
.atri-illustration-panel .atri-media-studio { padding:20px 0 0; border:0; border-top:1px solid var(--line-1); border-radius:0; background:transparent; }
@media(pointer:coarse) { .atri-illustration-ui button,.atri-illustration-ui :is(input:not([type=checkbox]),select) { min-height:44px; } }
@media(max-width:719px) { .atri-illustration-ui :is(input:not([type=checkbox]),textarea,select) { font-size:16px; } .atri-illustration-panel { padding:16px; } .atri-illustration-panel > .atri-illustration-actions { top:-16px; margin:-16px -16px 0; padding:12px 16px; } .atri-media-studio { padding:16px; } }
@media(prefers-reduced-motion:reduce) { .atri-illustration-ui button { transition:none; } .atri-illustration-ui button:active { transform:none!important; } }
body.reduced-motion .atri-illustration-ui button,[data-atria-reduced-motion=true] .atri-illustration-ui button { transition:none; transform:none!important; }
`;

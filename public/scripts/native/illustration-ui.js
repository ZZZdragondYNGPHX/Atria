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
.atri-illustration-ui { color:var(--atri-text-primary); font-size:16px; line-height:1.5; }
.atri-illustration-ui button,.atri-illustration-ui input,.atri-illustration-ui select,.atri-illustration-ui pre { white-space:pre-wrap; overflow-wrap:anywhere; }
.atri-illustration-ui textarea { font:inherit; color:inherit; border:1px solid var(--atri-separator-strong); background:var(--atri-surface-2); border-radius:var(--atri-radius-sm,8px); box-sizing:border-box; max-width:100%; }
.atri-illustration-ui button { min-height:44px; padding:8px 12px; cursor:pointer; color:var(--atri-text-primary); background:var(--atri-surface-2); border:1px solid var(--atri-separator-strong); border-radius:var(--atri-radius-sm,8px); }
.atri-illustration-ui button:active:not(:disabled) { background:var(--atri-fill-pressed); }
.atri-illustration-ui button:disabled { opacity:.55; cursor:default; }
.atri-illustration-ui :focus-visible { outline:2px solid var(--atri-accent-text); outline-offset:2px; }
.atri-illustration-ui fieldset { min-width:0; border:1px solid var(--atri-separator); border-radius:var(--atri-radius-md,12px); padding:12px; margin:12px 0; }
.atri-illustration-ui summary { min-height:44px; cursor:pointer; display:flex; align-items:center; }
.atri-illustration-ui pre { white-space:pre-wrap; overflow-wrap:anywhere; }
.atri-illustration-ui textarea { width:100%; min-height:96px; resize:vertical; padding:8px; }
.atri-illustration-ui input:not([type=checkbox]),.atri-illustration-ui select { min-height:44px; width:100%; padding:8px; }
.atri-illustration-field { display:grid; gap:6px; margin:12px 0; overflow-wrap:anywhere; }
.atri-illustration-field:has(input[type=checkbox]) { display:flex; align-items:center; gap:10px; min-height:44px; }
.atri-illustration-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.atri-illustration-card blockquote { margin:12px 0; padding:12px; border-inline-start:3px solid var(--atri-accent-text); white-space:pre-wrap; overflow-wrap:anywhere; max-height:160px; overflow:auto; }
.atri-illustration-toolbar { position:fixed; z-index:2100; right:max(16px,env(safe-area-inset-right)); bottom:max(var(--atri-illustration-controls-inset,16px),env(safe-area-inset-bottom)); padding:8px; border:1px solid var(--atri-separator-strong); background:var(--atri-surface-1); border-radius:12px; box-shadow:var(--atri-shadow-2); max-width:calc(100vw - 32px); }
.atri-illustration-panel { position:fixed; z-index:2101; right:max(16px,env(safe-area-inset-right)); bottom:calc(16px + max(var(--atri-illustration-controls-inset,16px),env(safe-area-inset-bottom)) + var(--atri-illustration-toolbar-height,60px)); width:min(460px,calc(100vw - 32px)); max-height:calc(100dvh - var(--atri-illustration-toolbar-height,60px) - max(var(--atri-illustration-controls-inset,16px),env(safe-area-inset-bottom)) - 48px); overflow:auto; overscroll-behavior:contain; background:var(--atri-surface-1); border:1px solid var(--atri-separator-strong); padding:16px; box-sizing:border-box; border-radius:16px; box-shadow:var(--atri-shadow-2); }
.atri-illustration-panel[hidden],.atri-illustration-toolbar[hidden] { display:none; }
.atri-illustration-selectable { user-select:text; -webkit-user-select:text; }
::highlight(atri-illustration) { background:var(--atri-accent-soft); text-decoration:underline; text-decoration-color:var(--atri-accent-text); }
.atri-illustration-history img { display:block; max-width:100%; height:auto; border-radius:8px; }
.atri-illustration-panel > .atri-illustration-actions { position:sticky; top:-16px; background:var(--atri-surface-1); z-index:1; margin:-16px -16px 0; padding:12px 16px; border-bottom:1px solid var(--atri-separator); }
.atri-visual-gallery { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); gap:16px; }
.atri-visual-gallery article { min-width:0; padding:12px; border:1px solid var(--atri-separator); border-radius:12px; }
.atri-visual-gallery img { display:block; max-width:100%; height:auto; border-radius:8px; }
.atri-mask-viewport { border:1px solid var(--atri-separator-strong); border-radius:8px; margin:12px 0; }
.atri-illustration-panel > button:first-child { position:sticky; top:0; z-index:1; }
.atri-illustration-ui h3 { font:400 27px/1.3 var(--atri-font-serif); margin:24px 0 16px; letter-spacing:-.02em; }
.atri-illustration-ui h3:first-child { margin-top:0; }
.atri-illustration-ui button { border-color:transparent; border-radius:12px; background:var(--atri-fill); font:inherit; transition:background-color 140ms,transform 100ms var(--atri-ease-out); }
.atri-illustration-ui button.atri-illustration-primary { background:var(--atri-text-primary); color:var(--atri-surface-1); }
.atri-illustration-ui button.atri-illustration-primary:active:not(:disabled) { background:#111; }
.atri-illustration-ui button:active:not(:disabled):not(:focus-visible) { transform:scale(.98); transition-duration:140ms,160ms; }
.atri-illustration-ui :is(input:not([type=checkbox]),textarea,select) { border:1px solid transparent; border-radius:10px; background:var(--atri-fill); padding:11px 12px; color:inherit; font:inherit; }
.atri-illustration-ui input[type=checkbox] { appearance:auto; accent-color:var(--atri-text-primary); width:18px; height:18px; flex:none; }
.atri-illustration-ui label:has(input[type=checkbox]) { min-height:44px; }
.atri-illustration-ui fieldset { border-color:var(--atri-separator); border-radius:16px; padding:20px; }
.atri-illustration-panel { padding:24px; border-radius:24px; box-shadow:var(--atri-shadow-2); }
.atri-illustration-panel > .atri-illustration-actions { top:-24px; margin:-24px -24px 0; padding:16px 24px; }
.atri-visual-gallery { margin-top:20px; gap:20px; }
.atri-visual-gallery article { padding:18px; background:var(--atri-surface-1); border-radius:20px; box-shadow:var(--atri-shadow-1); }
.atri-visual-gallery article > p { font-size:12px; color:var(--atri-text-secondary); margin:14px 0; }
.atri-visual-gallery img { border-radius:14px; }
.atri-visual-gallery article > button { margin:0 6px 8px 0; }
.atri-media-studio { margin-top:28px; padding:26px; border:1px solid var(--atri-separator); border-radius:24px; background:var(--atri-surface-1); box-shadow:var(--atri-shadow-1); }
.atri-illustration-panel .atri-media-studio { padding:24px 0 0; border:0; border-top:1px solid var(--atri-separator); border-radius:0; box-shadow:none; }
@media(hover:hover) and (pointer:fine) { .atri-illustration-ui button:not(:disabled):not(:active):hover { background:var(--atri-fill-hover); } .atri-illustration-ui button.atri-illustration-primary:not(:disabled):not(:active):hover { background:#333; } }
@media(max-width:719px) { .atri-illustration-ui :is(input:not([type=checkbox]),textarea,select) { font-size:16px; } .atri-illustration-panel { padding:22px 18px; } .atri-illustration-panel > .atri-illustration-actions { top:-22px; margin:-22px -18px 0; padding:14px 18px; } .atri-media-studio { padding:22px 18px; } }
@media(prefers-reduced-motion:reduce) { .atri-illustration-ui button { transition:none; } .atri-illustration-ui button:active { transform:none!important; } }
body.reduced-motion .atri-illustration-ui button,[data-atria-reduced-motion=true] .atri-illustration-ui button { transition:none; transform:none!important; }
`;

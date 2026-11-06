// Visual layer for the official illustration experience. Uses Atria shell tokens only.
export const ILLUSTRATION_EXPERIENCE_CSS = `
.atri-ill { color:var(--text-1); font:400 var(--fs-md)/1.55 var(--font-ui); }
.atri-ill *, .atri-ill *::before, .atri-ill *::after { box-sizing:border-box; }
.atri-ill :focus-visible { outline:none; box-shadow:var(--focus-ring); }
.atri-ill [hidden] { display:none !important; }
.atri-ill :where(button) { font:inherit; color:inherit; }
.atri-ill-visually-hidden { position:absolute !important; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }

/* Launcher and selection chip float above the story. */
.atri-ill-launcher { position:fixed; z-index:2100; right:max(16px,env(safe-area-inset-right)); bottom:max(var(--atri-ill-inset,16px),env(safe-area-inset-bottom));
  display:inline-flex; align-items:center; gap:8px; min-height:40px; padding:0 14px 0 12px; border-radius:var(--r-capsule); border:1px solid var(--glass-line);
  background:var(--mat-glass-strong); box-shadow:var(--glass-rim), var(--glass-shadow); -webkit-backdrop-filter:blur(20px) saturate(1.5); backdrop-filter:blur(20px) saturate(1.5);
  cursor:pointer; font:550 var(--fs-sm)/1 var(--font-ui); transition:transform var(--dur-1) var(--ease-snap), background-color var(--dur-1); }
.atri-ill-launcher:hover { background:var(--surface-raised); }
.atri-ill-launcher:active { transform:scale(.97); }
.atri-ill-launcher[aria-expanded=true] { background:var(--surface-raised); border-color:var(--line-3); }
/* Step clear of an open side panel instead of covering it. */
.atria-app-shell:has(#atria-context-dock[data-atria-open="true"]) .atri-ill-launcher { right:calc(var(--atri-inspector-clear, 368px) + 16px); }
.atria-app-shell[data-atria-viewport="compact"]:has(#atria-context-dock[data-atria-open="true"]) .atri-ill-launcher { display:none; }
.atri-ill-launcher .atri-ill-dot { width:7px; height:7px; border-radius:50%; background:var(--tone-lumen); box-shadow:0 0 0 3px var(--soft-lumen); animation:atri-ill-pulse 1.6s var(--ease-settle) infinite; }
/* Scoped under .atri-ill so the shell rule ".atria-app-shell button { color:inherit }" does not win. */
.atri-ill .atri-ill-chip { position:fixed; z-index:2102; display:inline-flex; align-items:center; gap:6px; min-height:36px; padding:0 14px 0 11px; border-radius:var(--r-capsule);
  border:0; background:var(--btn-primary-bg); color:var(--btn-primary-text); box-shadow:0 0 0 1px var(--btn-primary-ring), var(--shadow-3); cursor:pointer;
  font:600 var(--fs-sm)/1 var(--font-ui); transform-origin:50% 100%; animation:atri-ill-pop var(--dur-2) var(--ease-spring); }
.atri-ill .atri-ill-chip kbd { margin-left:4px; padding:1px 5px; border:0; border-radius:5px; color:inherit; background:rgb(255 255 255 / .16); font:500 11px/1.4 var(--font-mono); }
@media (pointer:coarse) { .atri-ill .atri-ill-chip kbd { display:none; } .atri-ill .atri-ill-chip { min-height:44px; } }

/* Panel: right sheet on wide screens, bottom sheet on phones. */
.atri-ill-panel { position:fixed; z-index:2101; top:max(64px, env(safe-area-inset-top)); right:max(12px,env(safe-area-inset-right)); bottom:calc(max(var(--atri-ill-inset,16px),env(safe-area-inset-bottom)) + 52px); width:min(400px, calc(100vw - 24px));
  display:flex; flex-direction:column; border-radius:var(--r-2xl); border:1px solid var(--line-2); background:var(--surface-panel); box-shadow:var(--shadow-3);
  animation:atri-ill-in-right var(--dur-3) var(--ease-settle); overflow:hidden; }
.atri-ill-panel[data-wide=true] { width:min(760px, calc(100vw - 24px)); }
.atri-ill-head { display:flex; align-items:center; gap:8px; padding:12px 12px 0 18px; }
.atri-ill-head h2 { flex:1; margin:0; font:650 var(--fs-lg)/1.3 var(--font-ui); letter-spacing:-.01em; }
.atri-ill-icon-btn { display:inline-grid; place-items:center; width:34px; height:34px; border:0; border-radius:var(--r-md); background:transparent; color:var(--text-2); cursor:pointer; }
.atri-ill-icon-btn:hover { background:var(--surface-hover); color:var(--text-1); }
.atri-ill-tabs { display:flex; gap:2px; margin:12px 14px 0; padding:3px; border-radius:var(--r-lg); background:color-mix(in srgb, var(--text-1) 5%, transparent); }
.atri-ill-tab { flex:1; min-height:32px; border:0; border-radius:calc(var(--r-lg) - 3px); background:transparent; color:var(--text-2); cursor:pointer; font:550 var(--fs-sm)/1 var(--font-ui); }
.atri-ill-tab[aria-selected=true] { background:var(--surface-raised); color:var(--text-1); box-shadow:var(--shadow-1); }
.atri-ill-tab .atri-ill-count { margin-left:5px; color:var(--text-3); font-variant-numeric:tabular-nums; }
.atri-ill-body { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:16px 18px 24px; scrollbar-gutter:stable; }
.atri-ill-status { min-height:0; margin:0 18px; color:var(--text-2); font-size:var(--fs-sm); }
.atri-ill-status:not(:empty) { margin:10px 18px 0; padding:9px 12px; border-radius:var(--r-md); background:var(--soft-lapis); }
.atri-ill-status[data-kind=error]:not(:empty) { background:var(--soft-vermilion); color:var(--text-1); }
.atri-ill-status button { margin-left:6px; }
@media (max-width:719px) {
  .atri-ill-panel, .atri-ill-panel[data-wide=true] { top:auto; left:0; right:0; bottom:0; width:100%; max-height:min(88dvh, calc(100dvh - 48px)); border-radius:var(--r-2xl) var(--r-2xl) 0 0; padding-bottom:env(safe-area-inset-bottom); animation-name:atri-ill-in-up; }
  .atri-ill-panel::before { content:''; align-self:center; width:36px; height:4px; margin-top:8px; border-radius:2px; background:var(--line-3); }
  .atri-ill :is(input:not([type=checkbox]):not([type=radio]),textarea,select) { font-size:16px; }
}

/* Shared content atoms */
.atri-ill h3 { margin:0 0 4px; font:650 var(--fs-md)/1.35 var(--font-ui); }
.atri-ill p { margin:0; }
.atri-ill .atri-ill-muted { color:var(--text-2); font-size:var(--fs-sm); }
.atri-ill-stack { display:grid; gap:12px; }
.atri-ill-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.atri-ill-row--end { justify-content:flex-end; }
.atri-ill-spacer { flex:1; }
.atri-ill-card { padding:14px 16px; border:1px solid var(--line-2); border-radius:var(--r-xl); background:var(--surface-raised); }
.atri-ill-card + .atri-ill-card { margin-top:12px; }
.atri-ill-section { display:grid; gap:10px; padding:16px 0; border-top:1px solid var(--line-1); }
.atri-ill-section:first-child { border-top:0; padding-top:4px; }
.atri-ill-section > header { display:flex; align-items:baseline; gap:10px; }
.atri-ill-section > header h3 { flex:1; margin:0; }
.atri-ill-step { display:inline-grid; place-items:center; width:22px; height:22px; border-radius:50%; background:color-mix(in srgb, var(--text-1) 8%, transparent); color:var(--text-2); font:650 12px/1 var(--font-ui); flex:none; }
.atri-ill-step[data-done=true] { background:var(--tone-jade); color:#fff; }
.atri-ill-field { display:grid; gap:6px; color:var(--text-2); font:550 var(--fs-sm)/1.4 var(--font-ui); }
.atri-ill-field small { font-weight:400; color:var(--text-3); }
.atri-ill :is(input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,select) { width:100%; min-height:36px; padding:7px 11px; color:var(--text-1);
  background:color-mix(in srgb, var(--text-1) 3.5%, transparent); border:1px solid var(--line-2); border-radius:var(--r-md); font:400 var(--fs-md)/1.4 var(--font-ui); }
.atri-ill :is(input,textarea,select):focus { outline:none; border-color:color-mix(in srgb, var(--tone-lapis) 70%, transparent); box-shadow:0 0 0 3px var(--soft-lapis); }
.atri-ill textarea { min-height:84px; resize:vertical; line-height:1.6; }
.atri-ill-check { display:flex; align-items:flex-start; gap:10px; color:var(--text-1); font-size:var(--fs-sm); cursor:pointer; }
.atri-ill-check input { appearance:auto; -webkit-appearance:checkbox; margin-top:2px; width:16px; height:16px; accent-color:var(--tone-lumen); flex:none; filter:none; }
.atri-ill-check input::before { content:none; }
.atri-ill-seg { display:flex; gap:2px; padding:3px; border-radius:var(--r-md); background:color-mix(in srgb, var(--text-1) 5%, transparent); }
.atri-ill-seg button { flex:1; min-height:32px; padding:0 10px; border:0; border-radius:calc(var(--r-md) - 2px); background:transparent; color:var(--text-2); cursor:pointer; font:550 var(--fs-sm)/1.2 var(--font-ui); }
.atri-ill-seg button[aria-pressed=true] { background:var(--surface-raised); color:var(--text-1); box-shadow:var(--shadow-1); }
.atri-ill .atria-button { white-space:nowrap; }
@media (pointer:coarse) { .atri-ill .atria-button, .atri-ill-seg button, .atri-ill-tab { min-height:44px; } .atri-ill-icon-btn { width:44px; height:44px; } }

/* Quote and illustration list */
.atri-ill-quote { margin:0; padding:2px 0 2px 12px; border-left:2px solid var(--tone-lumen); color:var(--text-1); font:400 var(--fs-md)/1.7 var(--font-read);
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
.atri-ill-quote[data-full=true] { -webkit-line-clamp:unset; max-height:180px; overflow:auto; }
.atri-ill-list { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
.atri-ill-subhead { margin:8px 0 0; font:650 var(--fs-sm)/1.3 var(--font-ui); color:var(--text-2); }
.atri-ill-wrap { flex-wrap:wrap; }
.atri-ill-suggest { display:grid; gap:8px; margin:0 0 16px; }
.atri-ill-suggest h3 { margin:0; font:650 var(--fs-sm)/1.3 var(--font-ui); color:var(--text-2); }
.atri-ill-suggest-list { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
.atri-ill-suggest-item { display:grid; gap:10px; padding:12px 14px; border-radius:var(--r-lg); border:1px dashed var(--line-3); background:var(--surface-raised); }
.atri-ill-suggest-item .atri-ill-quote { margin:0; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
.atri-ill-item { display:grid; grid-template-columns:64px minmax(0,1fr); gap:12px; align-items:center; width:100%; padding:8px; border:1px solid var(--line-1); border-radius:var(--r-lg);
  background:var(--surface-raised); text-align:left; cursor:pointer; transition:border-color var(--dur-1), background-color var(--dur-1); }
.atri-ill-item:hover { border-color:var(--line-3); }
.atri-ill-item .atri-ill-quote { -webkit-line-clamp:2; border:0; padding:0; font-size:var(--fs-sm); }
.atri-ill-thumb { position:relative; width:64px; aspect-ratio:3/4; border-radius:var(--r-md); overflow:hidden; background:color-mix(in srgb, var(--text-1) 6%, transparent); display:grid; place-items:center; color:var(--text-3); }
.atri-ill-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
.atri-ill-thumb[data-busy=true]::after { content:''; position:absolute; inset:0; background:linear-gradient(100deg, transparent 30%, rgb(255 255 255 / .35) 50%, transparent 70%); background-size:200% 100%; animation:atri-ill-shimmer 1.4s linear infinite; }
.atri-ill-state { display:flex; align-items:center; gap:6px; margin-top:4px; color:var(--text-2); font-size:var(--fs-xs); }
.atri-ill-state[data-kind=busy] { color:var(--tone-lapis); }
.atri-ill-state[data-kind=error] { color:var(--tone-vermilion); }
.atri-ill-state[data-kind=done] { color:var(--tone-jade); }
.atri-ill-empty { display:grid; justify-items:center; gap:8px; padding:28px 12px; text-align:center; color:var(--text-2); }
.atri-ill-empty svg { color:var(--text-3); }
.atri-ill-hint { display:flex; gap:12px; align-items:flex-start; padding:12px 14px; border-radius:var(--r-lg); background:color-mix(in srgb, var(--tone-lumen) 9%, transparent); color:var(--text-1); font-size:var(--fs-sm); }
.atri-ill-hint svg { flex:none; margin-top:1px; color:var(--tone-lumen); }

/* Detail */
.atri-ill-back { display:inline-flex; align-items:center; gap:4px; margin:-4px 0 10px -6px; padding:4px 8px 4px 4px; border:0; border-radius:var(--r-md); background:transparent; color:var(--text-2); cursor:pointer; font-size:var(--fs-sm); }
.atri-ill-back:hover { background:var(--surface-hover); color:var(--text-1); }
.atri-ill-stage { position:relative; display:grid; place-items:center; min-height:220px; margin:12px 0; border-radius:var(--r-xl); overflow:hidden; background:color-mix(in srgb, var(--text-1) 5%, transparent); }
.atri-ill-stage img { display:block; width:100%; height:auto; max-height:min(44dvh, 460px); object-fit:contain; }
.atri-ill-stage[data-busy=true] { width:min(100%, 345px); margin-inline:auto; aspect-ratio:3/4; max-height:min(44dvh, 460px); }
.atri-ill-stage[data-busy=true]::after { content:''; position:absolute; inset:0; background:linear-gradient(100deg, transparent 30%, rgb(255 255 255 / .28) 50%, transparent 70%); background-size:200% 100%; animation:atri-ill-shimmer 1.6s linear infinite; }
.atri-ill-progress { position:relative; z-index:1; display:grid; gap:10px; justify-items:center; padding:20px; text-align:center; }
.atri-ill-steps { display:flex; gap:14px; justify-content:center; color:var(--text-3); font-size:var(--fs-xs); }
.atri-ill-steps span[data-state=active] { color:var(--tone-lapis); font-weight:650; }
.atri-ill-steps span[data-state=done] { color:var(--tone-jade); }
.atri-ill-versions { display:flex; gap:8px; overflow-x:auto; padding:2px 2px 6px; scroll-snap-type:x proximity; }
.atri-ill-version { position:relative; flex:none; width:58px; aspect-ratio:3/4; padding:0; border:2px solid transparent; border-radius:var(--r-md); overflow:hidden; background:var(--surface-raised); cursor:pointer; scroll-snap-align:start; }
.atri-ill-version img { width:100%; height:100%; object-fit:cover; display:block; }
.atri-ill-version[aria-pressed=true] { border-color:var(--tone-lumen); }
.atri-ill-version[aria-current=true]::after { content:''; position:absolute; right:4px; top:4px; width:8px; height:8px; border-radius:50%; background:var(--tone-jade); box-shadow:0 0 0 2px var(--surface-raised); }
.atri-ill-stage[data-confirm=true] { display:block; padding:0; background:transparent; min-height:0; }
.atri-ill-stage[data-confirm=true] .atri-ill-confirm { border-radius:var(--r-xl); }
.atri-ill-confirm { display:grid; gap:10px; padding:14px; border:1px solid color-mix(in srgb, var(--tone-amber) 45%, var(--line-2)); border-radius:var(--r-lg); background:var(--soft-amber); }
.atri-ill-details summary { cursor:pointer; color:var(--text-2); font-size:var(--fs-sm); min-height:32px; display:flex; align-items:center; }
.atri-ill-details pre { white-space:pre-wrap; overflow-wrap:anywhere; margin:6px 0 0; padding:10px 12px; border-radius:var(--r-md); background:color-mix(in srgb, var(--text-1) 4%, transparent); font:400 12px/1.65 var(--font-mono); color:var(--text-2); }
.atri-ill-facts { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; margin:8px 0 0; font-size:var(--fs-sm); }
.atri-ill-facts dt { color:var(--text-3); }
.atri-ill-facts dd { margin:0; overflow-wrap:anywhere; }

/* Tag chips */
.atri-ill-tags { display:flex; flex-wrap:wrap; gap:6px; padding:8px; min-height:44px; border:1px solid var(--line-2); border-radius:var(--r-md); background:color-mix(in srgb, var(--text-1) 3.5%, transparent); }
.atri-ill-tags:focus-within { border-color:color-mix(in srgb, var(--tone-lapis) 70%, transparent); box-shadow:0 0 0 3px var(--soft-lapis); }
.atri-ill-tag { display:inline-flex; align-items:center; gap:2px; max-width:100%; padding:2px 2px 2px 9px; border-radius:var(--r-capsule); background:var(--surface-raised); border:1px solid var(--line-2); font:450 var(--fs-sm)/1.5 var(--font-ui); }
.atri-ill-tag[data-duplicate=true] { border-color:var(--tone-amber); background:var(--soft-amber); }
.atri-ill-tag span { overflow-wrap:anywhere; }
.atri-ill-tag button { display:inline-grid; place-items:center; width:22px; height:22px; border:0; border-radius:50%; background:transparent; color:var(--text-3); cursor:pointer; }
.atri-ill-tag button:hover { background:var(--soft-vermilion); color:var(--tone-vermilion); }
.atri-ill-tags input.atri-ill-tag-input { flex:1; min-width:120px; min-height:28px !important; padding:2px 4px !important; border:0 !important; background:transparent !important; box-shadow:none !important; }
.atri-ill-presets { display:flex; flex-wrap:wrap; gap:6px; }
.atri-ill-preset-tag { min-height:28px; padding:0 10px; border:1px dashed var(--line-3); border-radius:var(--r-capsule); background:transparent; color:var(--text-2); cursor:pointer; font-size:var(--fs-xs); }
.atri-ill-preset-tag:hover { border-style:solid; color:var(--text-1); }

/* Style cards and gallery */
.atri-ill-styles { display:grid; grid-template-columns:repeat(auto-fill, minmax(118px, 1fr)); gap:8px; }
.atri-ill-style { display:grid; gap:2px; padding:10px 12px; border:1px solid var(--line-2); border-radius:var(--r-lg); background:var(--surface-raised); text-align:left; cursor:pointer; }
.atri-ill-style strong { font:600 var(--fs-sm)/1.3 var(--font-ui); }
.atri-ill-style span { color:var(--text-3); font-size:var(--fs-xs); line-height:1.4; }
.atri-ill-style[aria-pressed=true] { border-color:var(--tone-lumen); box-shadow:0 0 0 3px var(--soft-lumen); }
.atri-ill-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(112px, 1fr)); gap:8px; }
.atri-ill-tile { position:relative; padding:0; border:0; border-radius:var(--r-lg); overflow:hidden; aspect-ratio:3/4; background:color-mix(in srgb, var(--text-1) 6%, transparent); cursor:pointer; }
.atri-ill-tile img { width:100%; height:100%; object-fit:cover; display:block; transition:transform var(--dur-3) var(--ease-settle); }
.atri-ill-tile:hover img { transform:scale(1.03); }
.atri-ill-tile em { position:absolute; left:6px; bottom:6px; padding:1px 7px; border-radius:var(--r-capsule); background:rgb(0 0 0 / .55); color:#fff; font:500 11px/1.6 var(--font-ui); font-style:normal; }
.atri-ill-char { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:10px; align-items:center; }
.atri-ill-char-main { display:grid; justify-items:start; gap:2px; min-width:0; padding:4px 6px; border:0; border-radius:var(--r-md); background:transparent; text-align:left; cursor:pointer; }
.atri-ill-char-main:hover { background:var(--surface-hover); }
.atri-ill-char-main .atri-ill-muted { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }
.atri-ill-avatar { display:grid; place-items:center; width:34px; height:34px; border-radius:50%; background:var(--soft-lumen); color:var(--text-1); font:650 var(--fs-sm)/1 var(--font-ui); }
.atri-ill-switch { position:relative; width:38px; height:22px; flex:none; appearance:none; border-radius:11px; background:var(--line-3); cursor:pointer; transition:background-color var(--dur-1); }
.atri-ill-switch::after { content:''; position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:var(--shadow-1); transition:transform var(--dur-2) var(--ease-spring); }
.atri-ill-switch:checked { background:var(--tone-jade); }
.atri-ill-switch:checked::after { transform:translateX(16px); }

/* Retouch */
.atri-ill-mask { display:grid; gap:8px; }
.atri-ill-mask-tools input[type=range] { width:110px; accent-color:var(--tone-lumen); }
.atri-ill-mask .atri-mask-viewport { border:1px solid var(--line-2); border-radius:var(--r-lg); background:color-mix(in srgb, var(--text-1) 6%, transparent) !important; cursor:crosshair; }
.atri-ill-page { max-width:760px; }

/* Story prose: selectable while illustrations are on; illustrated passages get a quiet underline. */
.atri-illustration-selectable { user-select:text; -webkit-user-select:text; }
::highlight(atri-illustration) { text-decoration:underline dotted; text-decoration-color:var(--tone-lumen); text-underline-offset:4px; }

/* Story-side image figure gets a quiet affordance to open its panel. */
.atria-narrative-illustration img { cursor:zoom-in; }
.atri-illustrations-hidden .atria-narrative-illustration { display:none !important; }
.atri-ill-icon-btn[aria-pressed=true] { color:var(--tone-lumen); background:var(--soft-lumen); }
/* An image inside its paragraph sits right after the sentence it illustrates. */
.atria-narrative-illustration[data-atria-placement=inline] { margin:18px 0 20px; }
::highlight(atri-illustration-active) { background:color-mix(in srgb, var(--tone-lumen) 22%, transparent); text-decoration:underline solid; text-decoration-color:var(--tone-lumen); }

@keyframes atri-ill-pop { from { opacity:0; transform:translateY(4px) scale(.94); } to { opacity:1; transform:none; } }
@keyframes atri-ill-in-right { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:none; } }
@keyframes atri-ill-in-up { from { transform:translateY(24px); opacity:.6; } to { transform:none; opacity:1; } }
@keyframes atri-ill-shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
@keyframes atri-ill-pulse { 50% { box-shadow:0 0 0 6px transparent; } }
@media (prefers-reduced-motion:reduce) { .atri-ill *, .atri-ill-chip, .atri-ill-panel { animation:none !important; transition:none !important; } }
body.reduced-motion .atri-ill *, [data-atria-reduced-motion=true] .atri-ill * { animation:none !important; transition:none !important; }
`;

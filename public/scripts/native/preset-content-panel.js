import { runtimeRequest } from './runtime-client.js';
import { mountNativeFrontend } from './frontend/runtime.js';
import { getRegexScripts } from '../extensions/regex/engine.js';
import { processNativeDisplayRegex } from './regex-display-runtime.js';
import { validateSchemaValue } from './experience/world/schema.js';
import { createPresetPresentationBridge } from './preset-presentation-bridge.js';

export function createPresetContentPanel({ document: doc, runtime, composer }) {
    const panel = doc.createElement('section'); panel.className = 'atria-native-play-drawer'; panel.hidden = true;
    panel.setAttribute('aria-label', '附属内容'); panel.tabIndex = -1;
    let generation = 0, selected = null, returnFocus, disposed = false, unsubscribe;
    const mounts = new Set(), pending = new Set();
    const shell = () => globalThis.Atria?.shell?.getShell?.();
    const release = () => { generation++; for (const request of pending) request.abort(); pending.clear(); for (const mount of mounts) mount.dispose(); mounts.clear(); panel.replaceChildren(); };
    const button = (label, action, parent = panel) => {
        const node = doc.createElement('button'); node.type = 'button'; node.textContent = label; node.addEventListener('click', action); parent.append(node); return node;
    };
    const close = () => { release(); selected = null; panel.hidden = true; unsubscribe?.(); unsubscribe = null; shell()?.setDockOpen(false); returnFocus?.isConnected && returnFocus.focus(); };
    const textView = (parent, value) => { const pre = doc.createElement('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.style.overflowWrap = 'anywhere'; pre.textContent = value; parent.append(pre); };
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    async function open(entry, variant, trigger) {
        if (disposed) return;
        release(); const token = generation, sessionId = runtime()?.snapshot?.session.sessionId;
        selected = { sessionId, branchId: runtime()?.snapshot?.revision.branchId, messageId: entry.messageId, variantId: variant.variantId };
        returnFocus = trigger;
        panel.hidden = false;
        const title = doc.createElement('h3'); title.textContent = '附属内容 · 第 ' + (entry.sequence + 1) + ' 层'; panel.append(title);
        button('关闭', close);
        button('回到当前层', () => {
            const snapshot = runtime()?.snapshot, current = snapshot?.timeline.findLast(item => item.role === 'assistant');
            const active = snapshot?.variants.find(item => item.variantId === current?.activeVariantId);
            if (current && active) void open(current, active, trigger);
        });
        const metadata = variant.metadata?.runtime?.extra?.preset_content;
        const label = doc.createElement('p'); label.textContent = '显示此层当前选定的回复'; panel.append(label);
        const navigation = globalThis.Atria?.shell?.getNavigation?.();
        unsubscribe?.();
        if (shell()?.setContextContent) shell().setContextContent(panel, { title: '附属内容', open: true });
        else { doc.body.append(panel); navigation?.setContext({ title: '附属内容', open: true }, { reason: 'preset-content' }); }
        unsubscribe = navigation?.subscribe(() => { if (!navigation.getContext().open || navigation.getContext().title !== '附属内容') close(); });
        panel.focus();
        const manifest = metadata ? await runtimeRequest('/preset-presentation', { method: 'POST', body: { programRef: metadata.programRef } }).catch(() => null) : null;
        if (disposed || token !== generation || selected.sessionId !== runtime()?.snapshot?.session.sessionId) return;
        const blocks = variant.projection?.flow.filter(node => node.kind === 'block') ?? [];
        if (!blocks.length) { const empty = doc.createElement('p'); empty.textContent = '本层无附属内容'; panel.append(empty); }
        for (const block of blocks) {
            const details = doc.createElement('details'), summary = doc.createElement('summary'), body = doc.createElement('div');
            const type = manifest?.types.find(item => item.type === block.data.type);
            summary.textContent = type?.displayName ?? (block.type === 'preset.diagnostic' ? '格式问题 · 查看原文' : block.data.type ?? block.type);
            details.append(summary, body); panel.append(details);
            let active = [], version = 0, request;
            const skins = manifest?.presentations.filter(item => item.type === block.data.type) ?? [];
            const slots = new Map(); for (const skin of skins.filter(item => item.enabled)) slots.set(skin.slot, [...(slots.get(skin.slot) ?? []), skin]);
            details.addEventListener('toggle', async () => {
                const current = ++version; for (const mount of active) { mount.dispose(); mounts.delete(mount); } active = []; body.replaceChildren();
                request?.abort(); pending.delete(request);
                if (!details.open) return;
                const selectedSkins = [...slots.values()].flat();
                if (block.type === 'preset.diagnostic' || !type || !selectedSkins.length) {
                    textView(body, block.type === 'preset.diagnostic' ? metadata?.raw ?? JSON.stringify(block.data, null, 2) : JSON.stringify(block.data.value ?? block.data, null, 2)); return;
                }
                if ([...slots.values()].some(items => items.length > 1)) { textView(body, '同一皮肤槽启用了多个模板，请在预设中选择一个。\n' + JSON.stringify(block.data.value, null, 2)); return; }
                const status = doc.createElement('p'); status.textContent = '正在加载展示…'; status.setAttribute('role', 'status'); body.append(status);
                try {
                    request = new AbortController(); pending.add(request);
                    const display = await processNativeDisplayRegex(block.data.value, getRegexScripts({ allowedOnly: true }), { region: 'supplement', blockType: block.data.type,
                        depth: Math.max(0, (runtime()?.snapshot?.timeline.at(-1)?.sequence ?? entry.sequence) - entry.sequence) }, { signal: request.signal });
                    if (disposed || token !== generation || current !== version || !details.open) return;
                    const displayValue = validateSchemaValue(display.value, type.schema).ok ? display.value : block.data.value;
                    if (display.diagnostics.length) textView(body, '展示规则未完成，保留原始数据：' + display.diagnostics.map(item => item.ruleId + ' · ' + item.code).join('\n'));
                    const frames = selectedSkins.filter(skin => !skin.componentOnly);
                    if (!frames.length) { status.remove(); textView(body, JSON.stringify(displayValue, null, 2)); }
                    for (const skin of frames) {
                        const bundle = await runtimeRequest('/preset-presentation', { method: 'POST', body: { programRef: metadata.programRef, presentationId: skin.id } });
                        if (disposed || token !== generation || current !== version || !details.open) return;
                        const bridgeTransport = await createPresetPresentationBridge(bundle, () => !disposed && token === generation && current === version && details.open && selected?.sessionId === runtime()?.snapshot?.session.sessionId);
                        const mounted = await mountNativeFrontend({ document: doc, window: doc.defaultView, mode: 'text', entry: bundle.entry,
                            bridgeTransport, signal: request.signal, remoteAssetsEnabled: true, fontText: JSON.stringify(displayValue),
                            onDiagnostic: diagnostic => {
                                if (token === generation && current === version && details.open) {
                                    textView(body, diagnostic.message);
                                    if (diagnostic.reasonCode === 'frontend_view_failed') textView(body, JSON.stringify(block.data.value, null, 2));
                                }
                            },
                            rootProps: { data: displayValue, ...(bundle.optionKeys?.length ? { options: Object.fromEntries(bundle.optionKeys.map(key => [key, selectedSkins.some(item => key === 'skin_' + item.id.replaceAll('-', '_'))])) } : {}) },
                            loadBytes: async path => Uint8Array.from(atob(bundle.files[path]), c => c.charCodeAt(0)),
                            surfaceHost: { mount() { const root = doc.createElement('div'); root.style.minHeight = '240px'; body.append(root); return { container: root, unmount: () => root.remove() }; } },
                            hostServices: { invoke(target, input) {
                                if (selected.sessionId !== runtime()?.snapshot?.session.sessionId) throw new Error('Session changed');
                                if (target.service !== 'host.composer') throw new Error('Action unavailable');
                                if (target.method === 'set') composer().setDraft(input.text);
                                else if (target.method === 'focus') composer().focus(); else throw new Error('Action unavailable');
                                return {};
                            } } });
                        status.remove();
                        if (disposed || token !== generation || current !== version || !details.open) mounted.dispose(); else { active.push(mounted); mounts.add(mounted); }
                    }
                    pending.delete(request);
                } catch { pending.delete(request); if (disposed || token !== generation || current !== version || !details.open) return; status.textContent = '展示失败，以下是本块原始数据。'; textView(body, JSON.stringify(block.data.value, null, 2)); }
            });
        }
        if (metadata?.raw) {
            const raw = doc.createElement('details'), summary = doc.createElement('summary'); summary.textContent = '查看原始回复'; raw.append(summary);
            raw.addEventListener('toggle', () => { raw.querySelector('pre')?.remove(); if (raw.open) textView(raw, metadata.raw); }); panel.append(raw);
        }
    }
    return { open, update(snapshot) {
        const current = snapshot?.timeline.find(item => item.messageId === selected?.messageId);
        if (selected && (selected.sessionId !== snapshot?.session.sessionId || selected.branchId !== snapshot?.revision.branchId
            || current && current.activeVariantId !== selected.variantId)) close();
    }, dispose() { disposed = true; unsubscribe?.(); release(); panel.remove(); } };
}

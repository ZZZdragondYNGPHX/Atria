import { put, ok, read, page, action, focus } from './client.js';
import { renderScene } from './scene.js';
import { renderPanels, panelEvent } from './panels.js';
import { PLACES, ROUTES } from './catalog.js';

let screen = null, revision = '', branch = '', selected = '', overview = true;
let busy = false, refreshing = false, requestNumber = 0, epochToken = 0, pending = null;
let draftContext = null, generation = 'idle', destination = '', returnFocus = '';
let saves = [], savesCursor = null, savesError = '', initializationStep = 0;
const major = ['travel','train','wait','rest','marry','conceive','attack','technique','work'];
const settled = new Set(['advanced','advancing','arrived','completed','moved','moving','travelling','affection_received','agreed','allocated','appraised','awaiting_npc','browsed','cared','claimed','combat_round','consumed','created','enemy_died','engaged','fulfilled','gathered','gifted','investigated','learned','married','npc_replied','pregnancy','promised','recalled','refined','refining_failed','retreat_failed','retreated','separated','settling','stopped','surrendered','taught','traded','worked']);
const args = (kind, values = {}) => ({ kind, target: '', item: '', qty: 0, x: 0, y: 0, detail: '', text: '', steps: [], ...values });
const context = () => ({ selectedTarget: selected, selected, revision, busy: busy || !!pending, saves, savesCursor, savesError, generationState: generation, destination });
const key = c => 'doupo:' + Math.floor(c.clock()) + ':' + (++requestNumber) + ':' + Math.floor(c.random() * 1e8);
const person = id => screen?.people.find(p => p.key === id) || screen?.markers.find(p => p.key === id);
const label = id => person(id)?.name || PLACES.find(p => p.id === id)?.name || id;
function bindDraft(c, force = false) {
    if (!screen) return;
    if (!force && c.state.draft && draftContext) return;
    draftContext = { target: selected, place: screen.place, branch };
    put(c, 'draftTarget', selected ? label(selected) : label(screen.place));
    put(c, 'draftStale', false);
}
function staleDraft() {
    return !!draftContext && (draftContext.branch !== branch || draftContext.place !== screen?.place ||
        (!!draftContext.target && (!person(draftContext.target)?.contact || person(draftContext.target)?.status !== 'here')));
}
async function render(c) {
    if (!screen) return;
    // Stage changes locally, then emit bounded batches. AUI state is not mutated
    // synchronously by ctx.set; avoid relying on a just-written snapshot.
    const writes = new Map();
    const stage = { state: {...c.state,busy:busy||!!pending}, set: (path, value) => writes.set(path, value), props: c.props, env: c.env };
    renderScene(stage, screen, { selected, overview, draftTarget: draftContext?.target || '' });
    renderPanels(stage, screen, context());
    writes.set('component.showStatus',!!(c.state.notice||c.state.error||busy||pending));
    writes.set('component.canSubmit', !busy && !pending && !refreshing && screen.created && screen.alive && !screen.operation.kind && ['idle','failed'].includes(generation) && !staleDraft());
    writes.set('component.submitDisabled', !writes.get('component.canSubmit'));
    writes.set('component.draftStale', staleDraft());
    let count = 0;
    for (const [path, value] of writes) {
        if (JSON.stringify(c.state[path.slice(10)]) === JSON.stringify(value)) continue;
        c.set(path, value);
        if (++count % 20 === 0) await c.scheduler.yield();
    }
    if (c.state.panelMode) {
        await c.scheduler.frame();
        try {
            const box=await c.node('panel-drawer','measure'), composer=await c.node('composer','measure');
            const bottom=screen.created&&composer.height>0?composer.y-8:(c.env.height||720)-18;
            const height=Math.max(80,Math.min(4096,bottom-box.y));
            if(Math.abs(c.state.panelHeight-height)>1)put(c,'panelHeight',height);
        } catch { /* The next render measures again after route/epoch changes. */ }
    }
}
async function refresh(c, quiet = false) {
    if (refreshing) return false;
    refreshing = true;
    const token = epochToken;
    try {
        const before = await read(c, 'session');
        const rows = await read(c, 'screen');
        const after = await read(c, 'session');
        if (token !== epochToken) return false;
        if (before.revisionId !== after.revisionId) throw Error('changed_during_read');
        const next = JSON.parse(rows.find(r => r.id === 'main')?.value.screen || 'null');
        if (!next || !Array.isArray(next.people) || !next.result) throw Error('screen_unavailable');
        if (branch && branch !== after.branchId) {
            epochToken++; selected = ''; destination = ''; draftContext = null; pending = null;
            setBusy(c, false);
            saves = []; savesCursor = null; put(c, 'draft', ''); put(c, 'unresolved', false);
            put(c, 'narration', ''); put(c, 'acknowledged', '');
        }
        const changedPlace = screen && screen.place !== next.place;
        screen = next; revision = after.revisionId; branch = after.branchId;
        if (changedPlace) { selected = ''; overview = false; }
        if(selected && !next.people.some(p=>p.key===selected) && !next.markers.some(p=>p.key===selected)) selected='';
        if (!draftContext || !c.state.draft) bindDraft(c, true);
        if (screen.created) put(c, 'initialized', true);
        try {
            const messages = await read(c, 'messages', {});
            if (token === epochToken) put(c, 'narration', messages.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '');
        } catch { /* The rule result remains visible when prose cannot be read. */ }
        if (!quiet && !pending) put(c, 'error', '');
        return true;
    } catch (e) {
        if (token === epochToken) put(c, 'error', e.code === 'bridge_epoch_stale' ? '世界已切换，请重新载入画面。' : '暂时无法读取当前结果。输入已保留。');
        return false;
    } finally {
        refreshing = false; put(c, 'loading', false); put(c, 'busy', busy); await render(c);
    }
}
async function loadSaves(c, more = false) {
    try {
        const receipt = await page(c, 'saves', {}, more ? savesCursor : null);
        const data = ok(receipt);
        saves = more ? [...saves, ...data.filter(row => !saves.some(old => old.saveId === row.saveId))] : data;
        savesCursor = receipt.cursor || null; savesError = '';
    } catch { savesError = '存档列表读取失败'; }
    await render(c);
}
function setBusy(c, value) { busy = value; if(value)put(c,'showStatus',true); put(c, 'busy', value); put(c, 'canSubmit', false); put(c,'submitDisabled',true); }
async function submit(c, binding, input, options = {}) {
    if (busy || refreshing || !revision || (pending && !options.retry)) return false;
    if (generation !== 'idle' && generation !== 'failed' && !['conversationCancel'].includes(binding)) {
        put(c, 'error', '当前表达仍在生成。'); return false;
    }
    const request = options.retry ? pending : { binding, input, revision, key: key(c), branch, draft: options.draft || '', previousResult: JSON.stringify(screen?.result) };
    if (!request || request.branch !== branch) return false;
    pending = request; const token = epochToken;
    setBusy(c, true); put(c, 'unresolved', false); put(c, 'error', ''); put(c, 'notice', '正在处理…');
    try {
        const receipt = await action(c, request.binding, request.input, request.revision, request.key);
        if (token !== epochToken) return false;
        ok(receipt);
        pending = null; put(c, 'notice', '');
        if (request.binding === 'save') {
            put(c, 'notice', '已保存');
            await loadSaves(c);
            if (savesError) put(c, 'notice', '已保存；列表暂未刷新');
        } else if (request.binding === 'restore') {
            epochToken++; screen = null; selected = ''; draftContext = null; destination = ''; saves = [];
            put(c, 'draft', ''); put(c, 'narration', ''); put(c, 'acknowledged', '');
            put(c, 'notice', '正在恢复世界…');
            // Native runtime remounts on the restore epoch, clearing all caches.
            return true;
        } else {
            const loaded = await refresh(c, true);
            if (!loaded) put(c, 'notice', '已提交；读取结果失败，请刷新');
            if (loaded && request.draft && c.state.draft === request.draft && JSON.stringify(screen.result) !== request.previousResult && settled.has(screen.result.code)) {
                put(c, 'draft', ''); bindDraft(c, true);
            }
            if (loaded && request.binding === 'acknowledge' && screen.result.code === 'npc_replied') put(c, 'acknowledged', screen.result.text);
        }
        return true;
    } catch (e) {
        if (token !== epochToken) return false;
        const code = e.code || e.message;
        if (['bridge_revision_stale','bridge_epoch_stale','bridge_schema_invalid','bridge_binding_denied','bridge_scope_denied'].includes(code)) {
            pending = null; put(c, 'unresolved', false);
            put(c, 'error', code === 'bridge_epoch_stale' ? '世界已切换，请重载画面。' : '当前条件已变化，请核对后再操作。');
        } else {
            put(c, 'unresolved', true);
            put(c, 'error', '此次结果尚未确认。请核对原提交，不要重复操作。');
        }
        await refresh(c, true);
        return false;
    } finally {
        if (token === epochToken) { setBusy(c, false); await render(c); }
    }
}
async function act(c, kind, values = {}) {
    if (screen?.operation.kind && !['continue','cancel','browse','recall'].includes(kind)) {
        put(c, 'error', '先继续或停止当前活动。'); return;
    }
    return submit(c, major.includes(kind) ? 'choice' : 'act', args(kind, values));
}
async function selectPerson(c, id) {
    if (busy || pending || refreshing) return;
    const marker=screen.markers.find(p=>p.key===id);
    if(marker && !screen.people.some(p=>p.key===id)) {
        // Markers are independent of the list page. Locate the public detail
        // through the existing bounded list binding, never read private records.
        for(let page=0;page<Math.ceil(screen.nearbyTotal/12);page++) {
            if(!await submit(c,'browse',{qty:page}))return;
            if(screen.people.some(p=>p.key===id))break;
        }
    }
    const target=screen.people.find(p=>p.key===id);
    if(!target){put(c,'error','人物已离开感知范围。');return;}
    selected=id;overview=false;put(c,'panelTarget',id);bindDraft(c);
    await submit(c,'focus',{target:target.status==='here'?id:''});
    await render(c);
}
async function initialize(c) {
    if (screen?.created || busy) return;
    while (initializationStep < 3) {
        if (!await submit(c, 'bind' + initializationStep, {})) return;
        initializationStep++;
    }
    put(c, 'initialized', true); put(c, 'notice', '');
}
async function sendDraft(c) {
    if (busy || pending || refreshing || !screen?.created || !screen.alive || screen.operation.kind || !['idle','failed'].includes(generation)) return;
    const originalDraft = c.state.draft, text = originalDraft.trim();
    if (!text) { await focus(c, 'draft'); return; }
    if (text.length > 2048) { put(c,'error','每次行动最多 2048 字，请分段提交。'); return; }
    if (staleDraft()) { put(c, 'error', '原对象或地点已变化，请重新指定。'); return; }
    if (!draftContext) bindDraft(c, true);
    const target = draftContext.target;
    const message = text + '\n\n【本次操作上下文：地点 ' + draftContext.place +
        (target ? '；对象 ' + label(target) + '（人物 key: ' + target + '）' : '；未指定人物') + '。原话在上，请按可见规则判断。】';
    // Composer is the existing resolver route, not a client-side intent parser.
    setBusy(c, true);
    try {
        const existing = await read(c, 'composerGet');
        if (existing.text && existing.text !== message) {
            put(c, 'error', '宿主输入框还有未发送内容，请先在宿主处理。'); return;
        }
        ok(await action(c, 'composerSet', { text: message }, revision, key(c)));
    } catch { put(c, 'error', '文字尚未提交，原稿已保留。'); return; }
    finally { setBusy(c, false); }
    await submit(c, 'composerSubmit', {}, { draft: originalDraft });
}
async function openPanel(c, mode, trigger = '') {
    mode = ({map:'world',character:'body',family:'relations',settings:'host'})[mode] || mode;
    returnFocus = trigger || returnFocus;
    panelEvent(c,{type:'click',node:'panel-open-'+mode},screen,context());
    await c.scheduler.frame(); await render(c);
    if (mode === 'saves') await loadSaves(c);
    await focus(c, 'panel-close');
}
async function handlePanel(c, event) {
    const intent = panelEvent(c, event, screen, context());
    if (!intent) return;
    if (intent.ui) {
        if (intent.ui === 'refresh') { await refresh(c); return; }
        if (intent.ui === 'select-person') await selectPerson(c,intent.target);
        if (intent.ui === 'compose') {
            selected = intent.target || selected;
            if (!c.state.draft) put(c, 'draft', intent.text || '');
            bindDraft(c, true); await focus(c, 'draft');
        }
        await c.scheduler.frame(); await render(c);
        if (intent.mode === 'saves') await loadSaves(c);
        if (intent.mode === '') await focus(c, returnFocus || 'draft');
        else if (intent.focus) await focus(c,intent.focus);
        return;
    }
    if (intent.kind === 'host') {
        if (intent.binding === 'saves') { await loadSaves(c, !!intent.input?.cursor || !!intent.more || !!intent.next); return; }
        if (intent.binding === 'stop') { await stop(c); return; }
        if (['reload','recover','exit'].includes(intent.binding)) {
            try { ok(await action(c,intent.binding,intent.input||{},revision,key(c))); }
            catch { put(c,'error','宿主操作未完成，请使用 Atria 系统入口。'); }
            return;
        }
        await submit(c, intent.binding, intent.input || {}); return;
    }
    if (intent.binding) await submit(c, intent.binding, intent.input);
}
async function stop(c) {
    try { ok(await action(c, 'conversationCancel', {}, revision, key(c))); put(c, 'notice', '已请求停止，已发生的行动仍保留'); }
    catch { put(c, 'error', '停止结果未确认，请刷新。'); }
    await refresh(c, true);
}
async function poll(c) {
    for (;;) {
        await c.scheduler.timer(1800);
        try {
            const state = await read(c, 'generation');
            generation = state.state; put(c, 'generationState', generation); put(c, 'generationText', state.text || '');
            if (!busy && !refreshing) {
                const current = await read(c, 'session');
                if (current.revisionId !== revision) await refresh(c, true);
                else await render(c);
            }
        } catch { /* User refresh/recovery stays available; no write retry. */ }
    }
}
export default {
    async init(c) { await refresh(c); void poll(c); },
    async event(c, original) {
        let e = original;
        if (['composer','panel-drawer'].includes(e.node)) return;
        if (e.isComposing) return;
        if (e.type === 'keydown' && e.node === 'draft' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { await sendDraft(c); return; }
        if (e.type === 'change' && ['create-background','create-origin','create-sex'].includes(e.node)) { await c.scheduler.frame(); await render(c); return; }
        if (e.type === 'input' && e.node === 'draft') {
            if (e.value.length>2048) put(c,'error','每次行动最多 2048 字，请分段提交。');
            if (!draftContext || !c.state.draft) bindDraft(c, true); return;
        }
        if (e.type === 'keydown' && e.key === 'Escape') {
            if (c.state.panelMode) { await handlePanel(c,e); }
            else if (selected) { selected = ''; await submit(c,'focus',{target:''}); await render(c); await focus(c,'people-events'); }
            else if (!overview) { overview = true; await render(c); await focus(c,'facility-events'); }
            return;
        }
        if (e.type !== 'click') return;
        if (e.node.endsWith('-events') && e.targetNode) e = { ...e, node: e.targetNode, value: e.targetValue };
        if (e.node === 'refresh-screen') { await refresh(c); return; }
        if (e.node === 'stop-generation') { await stop(c); return; }
        if (e.node === 'resolve-pending') { await submit(c, '', {}, {retry:true}); return; }
        if (e.node.startsWith('nav-')) { await openPanel(c,e.node.slice(4),e.node); return; }
        if (e.node.startsWith('panel-')) { await handlePanel(c,e); return; }
        if (e.node === 'draft-retarget') { bindDraft(c,true); await render(c); await focus(c,'draft'); return; }
        if (e.node === 'back-scene') { if (selected) {selected=''; await submit(c,'focus',{target:''});} else overview=true; bindDraft(c); await render(c); return; }
        if(e.node==='toggle-movement'){put(c,'sceneTools',!c.state.sceneTools);return;}
        if (e.node === 'toggle-grid') { put(c,'sceneShowGrid',!c.state.sceneShowGrid); await c.scheduler.frame(); await render(c); return; }
        if (e.node === 'person-select' || e.node === 'marker-person') {
            await selectPerson(c,e.value);
            return;
        }
        if (e.node === 'facility-select' || e.node === 'facility-hotspot') {
            if (e.value === screen?.place) { overview=false; await render(c); }
            else { destination=e.value; await openPanel(c,'map','facility-events'); }
            return;
        }
        if (e.node === 'person-relations') { await openPanel(c,'family','person-relations'); return; }
        if (busy || refreshing || pending) return;
        if(e.node==='nearby-filter'||e.node==='known-filter'){await submit(c,e.node==='known-filter'?'known-people':'browse',{qty:0});return;}
        if (e.node === 'people-previous' || e.node === 'people-next') { await submit(c,screen.peopleFilter==='known'?'known-people':'browse',{qty:screen.peoplePage+(e.node==='people-next'?1:-1)}); return; }
        if (e.node === 'object-select') {
            if (e.value === 'resource') { await openPanel(c,screen.place.startsWith('mountain.')?'clues':'inventory','objects-events'); }
            else await act(c,'investigate');
            return;
        }
        if (e.node === 'initialize') { await initialize(c); return; }
        if (e.node === 'create-submit') {
            const name=c.state.createName.trim();
            if (!name || name.length>48) { put(c,'error','称呼需要 1—48 字'); await focus(c,'create-name'); return; }
            await initialize(c); if(initializationStep<3)return;
            await act(c,'create',{target:c.state.createBackground,item:c.state.createSex,detail:c.state.createOrigin,text:name});
            while(['initialize','appraise','refresh'].includes(screen?.operation.kind)){if(!await submit(c,'continue',{}))break;}
            return;
        }
        if (e.node === 'submit-draft') { await sendDraft(c); return; }
        if (e.node === 'operation-continue'||e.node === 'operation-cancel') { await submit(c,e.node.slice(10),{}); return; }
        if (e.node === 'person-approach') { await act(c,'approach',{target:selected}); return; }
        if (e.node === 'person-invite') { await act(c,'invite',{target:selected}); return; }
        if (e.node === 'person-talk') { bindDraft(c,true); await focus(c,'draft'); return; }
        if (e.node === 'person-reply') { await submit(c,'acknowledge',{target:selected}); return; }
        if (e.node === 'ground-cell') {
            const [x,y] = String(e.value).split(',').map(Number);
            if(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<=19&&y>=0&&y<=13)await act(c,'move',{x,y}); return;
        }
        if (e.node === 'move-to') {
            const x=Number(c.state.sceneMoveX),y=Number(c.state.sceneMoveY);
            if(!String(c.state.sceneMoveX).trim()||!String(c.state.sceneMoveY).trim()||!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>19||y<0||y>13){put(c,'error','坐标范围：横 0—19，纵 0—13，填写整数。');return;}
            await act(c,'move',{x,y});
        }
    },
};

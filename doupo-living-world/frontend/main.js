import { ok, read, page, action, focus } from './client.js';
import { can, deadlineNote, itemName, placeName, stamp, span, LONG, scrollTabs } from './view.js';
import { flat } from './pack.js';
import { PLACES, ROUTES, BINDINGS } from './catalog.js';

// ---- world/Bridge state (semantics unchanged from fe.2/C6) ----
let screen = null, revision = '', branch = '';
let busy = false, refreshing = false, requestNumber = 0, epochToken = 0, pending = null;
let draftContext = null, generation = 'idle';
let saves = [], savesCursor = null, savesError = '', initializationStep = 0;
let autoAdvance = false, stopAdvance = false, advanceEpoch = 0, advanceCount = 0;
// ---- presentation state (never world authority) ----
const fresh = () => ({ createBackground: 'apprentice', createOrigin: 'native', createSex: 'female', layer: 'scene', overview: false, selected: '', talkKey: '', talkFold: '', letterOpen: false, teachOpen: false, scrollId: 'self', tabs: {},
  art: '', quest: '', negotiate: false, atlasRegion: '', destination: '', planKind: 'train', battle: { x: -1, y: -1, target: '', kind: '', item: '' }, battleDismissed: '', showRemains: false,
  passage: { notes: [], startAt: 0, from: '', title: '' }, passageHidden: false, passageDone: false, transcripts: {}, confirm: null, fontLarge: false, scrollError: '', journalNew: false, seen: -1 });
let L = fresh(), lastOp = '', written = new Map(), shown = {};

const major = ['travel', 'train', 'wait', 'rest', 'marry', 'conceive', 'attack', 'technique', 'work'];
const settled = new Set([
  'advanced', 'advancing', 'arrived', 'completed', 'moved', 'moving', 'travelling', 'affection_received', 'agreed', 'allocated', 'appraised', 'awaiting_npc', 'browsed', 'cared', 'claimed', 'combat_round', 'consumed', 'created', 'enemy_died', 'engaged', 'fulfilled', 'gathered', 'gifted', 'investigated', 'learned', 'married', 'npc_replied', 'pregnancy', 'promised', 'recalled', 'refined', 'refining_failed', 'retreat_failed', 'retreated', 'separated', 'settling', 'stopped', 'surrendered', 'taught', 'traded', 'worked',
  'encounter_started', 'combat_locked', 'combat_action', 'combat_ready', 'command_delivered', 'study_completed', 'learning_started', 'switch_started', 'practice_selected', 'hotbar_changed', 'auxiliary_changed', 'wildlife_discovered', 'captured', 'looted',
  'guide_skipped', 'quest_page', 'letters_checked', 'quests_discovered', 'quest_tracked', 'terms_agreed', 'quest_accepted', 'work_resumed', 'quest_debt', 'quest_completed', 'debt_checked', 'quest_stopped', 'custody_returned', 'helper_recalled', 'cooperation_agreed', 'cooperation_changed', 'period_started', 'helper_agreed', 'public_discovered', 'public_contributed', 'quest_work_complete', 'quest_progress', 'activity_updated', 'activity_working',
]);
const typing = new Set(['draft', 'talk-draft', 'letter-text', 'create-name', 'save-name', 'trade-qty', 'plan-days', 'neg-amount', 'neg-days', 'act-amount', 'offer-gold', 'loot-qty', 'quest-filter', 'neg-alt', 'neg-helper', 'act-item', 'act-person', 'battle-skill', 'battle-ally', 'battle-order', 'teach-skill']);
const put = (c, key, value) => c.set('component.' + key, value);
const args = (kind, values = {}) => ({ kind, target: '', item: '', qty: 0, x: 0, y: 0, detail: '', text: '', steps: [], ...values });
const bindingOf = kind => major.includes(kind) ? 'choice' : 'act';
const key = c => 'doupo:' + Math.floor(c.clock()) + ':' + (++requestNumber) + ':' + Math.floor(c.random() * 1e8);
const person = id => screen?.people.find(p => p.key === id) || screen?.markers.find(p => p.key === id);
const label = id => person(id)?.name || PLACES.find(p => p.id === id)?.name || id;
const isBusy = () => busy || autoAdvance || !!pending || refreshing;
const intQty = (raw, min = 1, max = 100) => { const v = String(raw ?? '').trim(); return /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max ? Number(v) : null; };

// ---- draft binding (unchanged rule: never silently re-target a draft) ----
function draftTarget() { return L.layer === 'talk' && L.talkKey ? L.talkKey : L.selected; }
function bindDraft(c, force = false) {
  if (!screen) return;
  if (!force && c.state.draft && draftContext) return;
  draftContext = { target: draftTarget(), place: screen.place, branch };
}
function staleDraft() {
  return !!draftContext && (draftContext.branch !== branch || draftContext.place !== screen?.place ||
    (!!draftContext.target && (!person(draftContext.target)?.contact || person(draftContext.target)?.status !== 'here')) || (!!c_draft && draftContext.target !== draftTarget()));
}
let c_draft = '';

// ---- render: one write per changed group ----
async function render_(c) {
  const s = screen || { created: false };
  c_draft = c.state.draft || '';
  const { state: view, ui } = flat(s, { ...L, busy: isBusy(), autoAdvance, stopAdvance, generation, saves, savesCursor, savesError, unresolved: !!c.state.unresolved,
    createBackground: L.createBackground, createOrigin: L.createOrigin, createSex: L.createSex, days: c.state.days, questFilter: c.state.questFilter,
    narration: (c.state.narration || '').trim(), statusText: statusText(c), statusError: !!errorText,
    draftTargetLabel: draftContext?.target ? label(draftContext.target) : '此地', draftStale: screen ? staleDraft() : false });
  shown = ui;
  const canSubmit = !!screen && !busy && !pending && !refreshing && !autoAdvance && screen.created && screen.alive && !screen.operation.kind && ['idle', 'failed'].includes(generation) && !staleDraft();
  view.submitDisabled = !canSubmit;
  let count = 0;
  for (const [k, value] of Object.entries(view)) {
    const text = JSON.stringify(value);
    if (written.get(k) === text) continue;
    written.set(k, text); put(c, k, value);
    if (++count % 8 === 0) await c.scheduler.yield();
  }
}
let errorText = '', noticeText = '';
function statusText() {
  if (errorText) return errorText;
  if (pending && busy) return '此事正在落定……';
  return noticeText;
}
const say = (c, text) => { noticeText = text; };
const warn = (c, text) => { errorText = text; };

// ---- reading the world ----
async function refresh(c, quiet = false, options = {}) {
  if (refreshing) return false;
  refreshing = true;
  const token = epochToken;
  try {
    let rows, after;
    if (options.automatic && branch) {
      const receipt = await c.bridge.snapshot('screen', {});
      rows = ok(receipt);
      if (!receipt.revision) throw Error('screen_revision_unavailable');
      after = { revisionId: receipt.revision, branchId: branch };
    } else {
      const before = await read(c, 'session');
      rows = await read(c, 'screen');
      after = await read(c, 'session');
      if (before.revisionId !== after.revisionId) throw Error('changed_during_read');
    }
    if (token !== epochToken) return false;
    const next = JSON.parse(rows.find(r => r.id === 'main')?.value.screen || 'null');
    if (!next || !Array.isArray(next.people) || !next.result) throw Error('screen_unavailable');
    if (branch && branch !== after.branchId) resetBranch(c);
    const changedPlace = screen && screen.place !== next.place;
    const previous = screen;
    screen = next; revision = after.revisionId; branch = after.branchId;
    if (changedPlace) { L.selected = ''; L.overview = false; if (L.layer === 'talk' || L.layer === 'trade') L.layer = 'scene'; }
    if (L.selected && !next.people.some(p => p.key === L.selected) && !next.markers.some(p => p.key === L.selected)) L.selected = '';
    if (!draftContext || !c.state.draft) bindDraft(c, true);
    if (screen.created)
    trackPassage(previous, next);
    trackJournal(next);
    if (!options.automatic) try {
      const messages = await read(c, 'messages', {});
      if (token === epochToken) put(c, 'narration', messages.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '');
    } catch { /* The rule result remains visible when prose cannot be read. */ }
    if (!quiet && !pending) errorText = '';
    return true;
  } catch (e) {
    if (token === epochToken) warn(c, e.code === 'bridge_epoch_stale' ? '世界已换了一条时间线，请重新载入画面。' : '一时看不清眼下的情形。写下的字都还在。');
    return false;
  } finally {
    refreshing = false;
    if (!options.deferRender) await render_(c);
  }
}
function resetBranch(c) {
  autoAdvance = false; stopAdvance = false; epochToken++; draftContext = null; pending = null;
  const keepFont = L.fontLarge; L = fresh(); L.fontLarge = keepFont;
  setBusy(c, false); saves = []; savesCursor = null;
  for (const field of ['draft', 'letter', 'questAmount', 'questDays', 'questAlternative', 'questPerson', 'amount', 'offerGold']) put(c, field, '');
  put(c, 'unresolved', false); put(c, 'narration', '');
}
function trackPassage(prev, next) {
  const kind = next.operation?.kind || '';
  if (LONG.has(kind) && lastOp !== kind + next.operation.target) {
    L.passage = { notes: [], startAt: next.time, from: (PLACES.find(p => p.id === next.place)?.name || '').replace(/^[^·]+·/, ''), title: '' };
    L.passageHidden = false; L.passageDone = false;
  }
  if (!kind && LONG.has((lastOp.match(/^[a-z]+/) || [''])[0]) && !L.passageHidden) { L.passageDone = true; L.passage.title = '光阴流转'; }
  if ((LONG.has(kind) || L.passageDone) && prev && next.result?.text && JSON.stringify(prev.result) !== JSON.stringify(next.result) && !next.result.text.startsWith('{')) {
    L.passage.notes.push({ text: next.result.text, meta: stamp(next.result.at || next.time) + ' · ' + (PLACES.find(p => p.id === next.place)?.name || ''), src: '亲' });
    if (L.passage.notes.length > 24) L.passage.notes.shift();
  }
  lastOp = kind ? kind + next.operation.target : '';
}
function trackJournal(s) {
  const count = (s.clues?.length || 0) + (s.messages?.length || 0) + (s.quests?.known?.length || 0) + (s.events?.length || 0);
  if (L.seen >= 0 && count > L.seen && !(L.layer === 'scroll' && L.scrollId === 'journal')) L.journalNew = true;
  L.seen = count;
}
async function loadSaves(c, more = false) {
  try {
    const receipt = await page(c, 'saves', {}, more ? savesCursor : null);
    const data = ok(receipt);
    saves = more ? [...saves, ...data.filter(row => !saves.some(old => old.saveId === row.saveId))] : data;
    savesCursor = receipt.cursor || null; savesError = '';
  } catch { savesError = '命册一时读不出来，可以再刷新一次。'; }
  await render_(c);
}
function setBusy(c, value) { busy = value; }

// ---- writing: one serial request at a time, exact revision + key ----
async function submit(c, binding, input, options = {}) {
  if (binding === 'continue' && screen?.operation.kind === 'combat' && ['collecting', 'resolving', 'cleanup'].includes(screen?.combat.phase)) binding = 'battleStep';
  if (autoAdvance && !options.automatic && !['save', 'restore', 'cancel'].includes(binding)) return false;
  if (binding === 'restore' || binding === 'cancel') { autoAdvance = false; stopAdvance = false; }
  if (busy || refreshing || !revision || (pending && !options.retry)) return false;
  if (generation !== 'idle' && generation !== 'failed' && binding !== 'conversationCancel') { warn(c, '对方的话还没说完，稍候再行事。'); return false; }
  const request = options.retry ? pending : { binding, input, revision, key: key(c), branch, draft: options.draft || '', previousResult: JSON.stringify(screen?.result) };
  if (!request || request.branch !== branch) return false;
  pending = request; const token = epochToken;
  const before = screen?.created ? snapshotOf(screen) : null;
  setBusy(c, true); put(c, 'unresolved', false); (errorText = '');
  if (!options.automatic) { (noticeText = ''); await render_(c); }
  try {
    const receipt = await action(c, request.binding, request.input, request.revision, request.key);
    if (token !== epochToken) return false;
    ok(receipt);
    pending = null;
    if (request.binding === 'save') {
      say(c, '此刻已记入命册。');
      await loadSaves(c);
      if (savesError) say(c, '已存档；命册列表暂未刷新。');
    } else if (request.binding === 'restore') {
      epochToken++; screen = null; draftContext = null; saves = [];
      const keepFont = L.fontLarge; L = fresh(); L.fontLarge = keepFont; written = new Map();
      put(c, 'draft', ''); put(c, 'narration', '');
      say(c, '世界正在回到那一刻……');
      return true; // Native remounts on the restore epoch.
    } else {
      const loaded = await refresh(c, true, { automatic: options.automatic, deferRender: true });
      if (!loaded) { autoAdvance = false; say(c, '已经落印，但一时看不清结果。'); return false; }
      if (request.draft && c.state.draft === request.draft && JSON.stringify(screen.result) !== request.previousResult && settled.has(screen.result.code)) {
        put(c, 'draft', ''); c_draft = ''; bindDraft(c, true);
      }
      if (request.binding === 'acknowledge' && screen.result.code === 'npc_replied') {
        transcript(L.talkKey, 'npc', label(L.talkKey), screen.result.text);
      } else if (L.layer === 'talk' && L.talkKey && !['focus', 'browse', 'known-people', 'clues', 'recall', 'event'].includes(request.binding) && JSON.stringify(screen.result) !== request.previousResult && screen.result.text && !screen.result.text.startsWith('{') && !options.automatic) {
        transcript(L.talkKey, 'nar', '', screen.result.text);
      }
    }
    if (!options.automatic && LONG.has(request.input?.kind) && before) beginPassage(request.input, before);
    if (!options.automatic && ['act', 'choice', 'plan', 'continue', 'battleStep'].includes(binding) && screen?.operation.kind && !stopAdvance) { autoAdvance = true; advanceEpoch = epochToken; advanceCount = 0; }
    if (!screen?.operation.kind) autoAdvance = false;
    return true;
  } catch (e) {
    autoAdvance = false;
    if (token !== epochToken) return false;
    const code = e.code || e.message;
    if (['bridge_revision_stale', 'bridge_epoch_stale', 'bridge_schema_invalid', 'bridge_binding_denied', 'bridge_scope_denied'].includes(code)) {
      pending = null; put(c, 'unresolved', false);
      warn(c, code === 'bridge_epoch_stale' ? '世界已换了一条时间线，请重新载入画面。' : '情势已变，请看清眼下再做决定。');
    } else {
      put(c, 'unresolved', true);
      warn(c, '此事尚无定论。先看看结果，不要重复落印。');
    }
    await refresh(c, true);
    // A committed write always advances the revision. If the world is exactly
    // where the request started and nothing is still generating, the request
    // never landed: release it so play can go on, and keep the draft.
    if (pending === request && revision === request.revision && ['idle', 'failed'].includes(generation)) {
      try {
        const state = await read(c, 'generation');
        if (['idle', 'failed'].includes(state.state)) { pending = null; put(c, 'unresolved', false); warn(c, request.binding === 'composerSubmit' ? '这句话没有送出——表达服务没有回应。原稿还在，可以再试。' : '此事没有落成，世界保持原样。可以再试。'); }
      } catch { /* Keep the uncertain request until the host answers. */ }
    }
    return false;
  } finally {
    if (token === epochToken) { setBusy(c, false); await render_(c); }
  }
}
// Long actions always get their moment: the interlude opens with what the
// time cost and what it brought, even when the rules settle it in one step.
const passageTitles = { travel: '赶路', train: '闭关修炼', wait: '等候', rest: '休养', work: '做工', learn: '研习', switch: '换修' };
const snapshotOf = s => ({ time: s.time, xp: s.xp, hp: s.hp, qi: s.qi, gold: s.gold, food: (s.inventory || []).find(i => i.item === 'food')?.qty || 0, place: s.place });
function beginPassage(input, before) {
  const after = snapshotOf(screen), place = id => (PLACES.find(p => p.id === id)?.name || '').replace(/^[^·]+·/, '');
  if (L.passageHidden && screen.operation.kind) return;
  L.passage = { notes: L.passage?.startAt === before.time ? L.passage.notes : [], startAt: before.time, from: place(before.place), to: input.kind === 'travel' ? place(input.target) : '', title: passageTitles[input.kind] + (input.kind === 'travel' ? '往' + place(input.target) : input.qty ? ' ' + input.qty + ' 日' : '') };
  if (!screen.operation.kind) {
    const delta = (label, d) => d ? label + (d > 0 ? ' +' : ' ') + d : '';
    const gains = [delta('积累', after.xp - before.xp), delta('气血', after.hp - before.hp), delta('斗气', after.qi - before.qi), delta('金', after.gold - before.gold), delta('干粮', after.food - before.food)].filter(Boolean).join('　');
    L.passage.notes = [{ text: (screen.result?.text || '') + (gains ? '\n' + gains : ''), meta: stamp(before.time) + ' → ' + stamp(after.time) + ' · 历时 ' + span(after.time - before.time), src: '亲' }];
    L.passageDone = true;
  }
  L.passageHidden = false;
}
function transcript(key, cls, who, text) {
  if (!key || !text) return;
  const list = L.transcripts[key] ||= [];
  if (list.length && list.at(-1).text === text) return;
  list.push({ cls, who, text }); if (list.length > 30) list.shift();
}
async function act(c, kind, values = {}) {
  if (screen?.operation.kind && !['continue', 'cancel', 'browse', 'recall'].includes(kind)) { warn(c, '眼下正在' + (screen.operation.kind === 'combat' ? '交锋' : '做别的事') + '，先等它结束或停手。'); await render_(c); return false; }
  return submit(c, bindingOf(kind), args(kind, values));
}
function ask(c, title, text, seal, intent, host = false) {
  L.confirm = { title, text, seal, intent, revision, host };
}
async function runIntent(c, intent) {
  if (!intent) return;
  if (intent.host) {
    if (intent.binding === 'restore') return submit(c, 'restore', intent.input);
    try { ok(await action(c, intent.binding, intent.input || {}, revision, key(c))); } catch { warn(c, '宿主没有回应，请使用 Atria 系统入口。'); }
    return;
  }
  return submit(c, intent.binding, intent.input);
}

// ---- people ----
async function selectPerson(c, id, openTalk = true) {
  if (isBusy() || !screen) return;
  const marker = screen.markers.find(p => p.key === id);
  if (marker && !screen.people.some(p => p.key === id)) {
    if (screen.peopleFilter !== 'nearby' && !await submit(c, 'browse', { qty: 0 })) return;
    for (let p = 0; p < screen.peoplePages; p++) {
      if (!await submit(c, 'browse', { qty: p })) return;
      if (screen.people.some(n => n.key === id)) break;
    }
  }
  const target = screen.people.find(p => p.key === id);
  if (!target) { warn(c, '那人已不在视线里。'); await render_(c); return; }
  L.selected = id;
  if (openTalk) { L.layer = 'talk'; L.talkKey = id; L.talkFold = ''; L.letterOpen = false; L.teachOpen = false; }
  bindDraft(c, !c.state.draft);
  if (target.status === 'here') await submit(c, 'focus', { target: id });
  await render_(c);
  if (openTalk) await focus(c, 'talk-draft');
}

// ---- free text ----
async function sendDraft(c) {
  if (isBusy() || !screen?.created || !screen.alive || screen.operation.kind || !['idle', 'failed'].includes(generation)) return;
  const original = c.state.draft, text = original.trim();
  if (!text) { await focus(c, L.layer === 'talk' ? 'talk-draft' : 'draft'); return; }
  if (text.length > 2048) { warn(c, '一次最多写 2048 字，请分段。'); await render_(c); return; }
  if (staleDraft()) { warn(c, '草稿原本写给' + (draftContext.target ? label(draftContext.target) : '此地') + '，情形已变。请先改为当前对象。'); await render_(c); return; }
  if (!draftContext) bindDraft(c, true);
  const target = draftContext.target;
  const message = text + '\n\n【本次操作上下文：地点 ' + draftContext.place + (target ? '；对象 ' + label(target) + '（人物 key: ' + target + '）' : '；未指定人物') + '。原话在上，请按可见规则判断。】';
  setBusy(c, true);
  try {
    const existing = await read(c, 'composerGet');
    if (existing.text && existing.text !== message) { warn(c, '宿主输入框里还有未发出的话，请先在宿主处理。'); return; }
    ok(await action(c, 'composerSet', { text: message }, revision, key(c)));
  } catch { warn(c, '这句话还没送出，原稿留着。'); return; }
  finally { setBusy(c, false); await render_(c); }
  if (target) transcript(target, 'me', '你', text);
  await submit(c, 'composerSubmit', {}, { draft: original });
}

// ---- layers ----
async function openScroll(c, id, tab) {
  if (!screen?.created) return;
  if (L.layer === 'scroll' && L.scrollId === id && !tab) { L.layer = 'scene'; await render_(c); return; }
  L.layer = 'scroll'; L.scrollId = id; L.scrollError = '';
  if (tab) L.tabs[id] = tab;
  if (id === 'journal') L.journalNew = false;
  await render_(c); await focus(c, 'scroll-close');
}
async function back(c) {
  const previousLayer = L.layer, previousScroll = L.scrollId;
  if (L.confirm) { L.confirm = null; }
  else if (L.layer === 'menu') L.layer = 'scene';
  else if (L.layer === 'trade') L.layer = L.talkKey && screen?.people.some(p => p.key === L.talkKey) ? 'talk' : 'scene';
  else if (L.layer === 'talk') { L.layer = 'scene'; }
  else if (L.layer === 'scroll') L.layer = 'scene';
  else if (L.showRemains) L.showRemains = false;
  else if (L.selected) { L.selected = ''; if (!isBusy()) await submit(c, 'focus', { target: '' }); }
  else if (!L.overview && screen?.created) L.overview = true;
  await render_(c);
  await focus(c, L.confirm ? 'confirm-back' : L.layer === 'talk' ? 'talk-draft' :
    previousLayer === 'scroll' ? 'rail-' + previousScroll : 'menu-open');
}

// ---- token dispatcher for every repeated button ----
async function onToken(c, value) {
  const [kind, a = '', b = '', d = '', e4 = ''] = String(value || '').split('|');
  const s = screen;
  switch (kind) {
    case 'bg': L.createBackground = a; return render_(c);
    case 'person':
      if (shown.battle) { L.battle.target = a === L.battle.target || a === 'player' ? '' : a; return render_(c); }
      if (a === 'player') return;
      return selectPerson(c, a, true);
    case 'face': L.layer = 'scene'; return selectPerson(c, a, true);
    case 'ledger': L.quest = a; L.negotiate = false; for (const f of ['questAmount', 'questDays', 'questAlternative']) put(c, f, ''); return render_(c);
    case 'scroll': return openScroll(c, a);
    case 'tab': L.layer = 'scroll'; L.scrollId = a; L.tabs[a] = b; if (a === 'journal') L.journalNew = false; return render_(c);
    case 'fold': L.talkFold = L.talkFold === a ? '' : a; return render_(c);
    case 'subfold': if (a === 'letter') L.letterOpen = !L.letterOpen; else L.teachOpen = !L.teachOpen; return render_(c);
    case 'open-trade': L.layer = 'trade'; return render_(c);
    case 'open-quest': L.quest = a; L.negotiate = false; return openScroll(c, 'journal', 'quests');
    case 'book': L.art = a; if (!(L.layer === 'scroll' && L.tabs['self'] === 'arts')) { L.layer = 'scroll'; L.scrollId = 'self'; L.tabs['self'] = 'arts'; } return render_(c);
    case 'plan': L.planKind = a; return render_(c);
    case 'days': put(c, 'days', a); await c.scheduler.frame(); return render_(c);
    case 'wound': return;
    case 'negotiate': L.negotiate = !L.negotiate; return render_(c);
    case 'atlas-region': L.atlasRegion = a; L.destination = ''; return render_(c);
    case 'dest': L.destination = a; return render_(c);
    case 'facility':
      if (a === s.place) { L.overview = false; return render_(c); }
      L.destination = a; L.atlasRegion = PLACES.find(p => p.id === a)?.region || ''; return openScroll(c, 'atlas', 'region');
    case 'object':
      if (a === 'remains') { L.showRemains = true; return render_(c); }
      if (a === 'notice') { await openScroll(c, 'journal', 'quests'); if (can(s, 'quest')) await act(c, 'quest', { detail: 'discover', item: 'notice' }); return; }
      if (a === 'resource') { if (s.quotes.length) { L.layer = 'trade'; return render_(c); } return openScroll(c, 'journal', 'news'); }
      return act(c, 'investigate');
    case 'people-filter': return submit(c, a === 'known' ? 'known-people' : 'browse', { qty: 0 });
  }
  if (isBusy()) return;
  if (!s?.created) return;
  if (!s.alive && kind !== 'restore') { warn(c, '此身已逝，可以从命册读档。'); return render_(c); }
  const q = () => intQty(c.state.qty);
  switch (kind) {
    case 'approach': return act(c, 'approach', { target: a });
    case 'quest-discover': return act(c, 'quest', { target: b || '', detail: 'discover', item: a });
    case 'quest-public': return act(c, 'quest', { detail: 'public_discover' });
    case 'social': {
      const p = s.people.find(x => x.key === b); if (!p) { warn(c, '那人已不在眼前。'); return render_(c); }
      const input = args(a, { target: b });
      if (a === 'promise') Object.assign(input, { item: p.needItem, qty: p.needQty, detail: '7' });
      const heavy = { engage: '向' + p.name + '提起婚约。对方会依自己的心意与处境回答。', marry: '与' + p.name + '建立共同的家，结算生活物资。双方都愿意才会成。', conceive: '与' + p.name + '商议养育孩子。接纳后会持续耗费时间与家用。', separate: '与' + p.name + '结束共同生活。子女与过往仍在。' }[a];
      if (heavy) { ask(c, ({ engage: '商议婚约', marry: '建立家庭', conceive: '商议养育', separate: '结束共同生活' })[a], heavy, ({ engage: '提亲', marry: '成家', conceive: '商议', separate: '分开' })[a], { binding: bindingOf(a), input }); return render_(c); }
      return submit(c, bindingOf(a), input);
    }
    case 'fight': {
      const p = s.people.find(x => x.key === b); if (!p) return;
      if (a === 'attack') { ask(c, '对' + p.name + '出手', '这是真正的敌对。伤势、死亡与责任都会留在世界里，旁人也会记得。', '出手', { binding: 'choice', input: args('attack', { target: b }) }); return render_(c); }
      if (a === 'spar') { ask(c, '请' + p.name + '切磋', '提出三轮徒手切磋。对方会看自己的伤势、安排与交情决定是否应下。', '相请', { binding: 'act', input: args('spar', { target: b }) }); return render_(c); }
      return act(c, a, { target: b });
    }
    case 'gift': return act(c, 'gift', { target: b, item: a, qty: 1 });
    case 'buy': case 'sell': {
      const qty = q(); if (!qty) { warn(c, '数量须是 1 到 100 的整数。'); return render_(c); }
      const quote = s.quotes.find(x => x.item === a);
      if (!quote || String(quote.quote) !== b) { warn(c, '价钱变了，请看清新的报价。'); return render_(c); }
      return act(c, kind, { item: a, qty, detail: b });
    }
    case 'do':
      if (a === 'breakthrough') { ask(c, '冲击下一境', '成败由修为、伤势与斗气决定，失败也会留下后果。', '冲关', { binding: 'act', input: args('breakthrough') }); return render_(c); }
      return act(c, a);
    case 'consume': return act(c, 'consume', { item: a });
    case 'learn': return act(c, 'learn', { item: a });
    case 'practice': {
      const art = s.arts.find(x => x.id === a);
      if (art?.type === 'cultivation') { ask(c, '换修' + art.name, '换修要一日、干粮一份与十五斗气；完成前仍用旧法运转，斗气不会回满。', '换修', { binding: 'act', input: args('practice', { item: a }) }); return render_(c); }
      return act(c, 'practice', { item: a });
    }
    case 'drill': return submit(c, 'choice', args('train', { item: a, qty: 1 }));
    case 'hotbar': return act(c, 'practice', { item: a, detail: 'hotbar' });
    case 'treat': return act(c, 'treat', { target: 'player', detail: a });
    case 'equip': return act(c, 'equip', { target: a, detail: b });
    case 'repair': return act(c, 'repair', { target: a });
    case 'allocate': {
      const qty = q(); if (!qty) { warn(c, '数量须是 1 到 100 的整数（在交易处的“每次”里设）。'); return render_(c); }
      return act(c, 'allocate', { target: a, item: b, qty, detail: d });
    }
    case 'quest-option': return questOption(c, a, b, d);
    case 'activity-option': return activityOption(c, a, b, d);
    case 'recall': return submit(c, 'recall', { target: a });
    case 'event': return submit(c, 'event', { target: a, page: Math.max(0, Number(b) || 0) });
    case 'gather': case 'claim': return act(c, kind, { item: a });
    case 'wildlife': return act(c, 'investigate', { detail: 'wildlife' });
    case 'travel': {
      const route = ROUTES.find(r => r.from === s.place && r.to === a);
      if (!route) { warn(c, '从这里没有直达的路。'); return render_(c); }
      const warnText = deadlineNote(s, route.ticks);
      if (route.ticks >= 240 || warnText) { ask(c, (route.ticks >= 1440 ? '启程往' : '前往') + placeName(a), placeName(s.place) + ' → ' + placeName(a) + '\n路上约 ' + span(route.ticks) + '，干粮 ' + Math.floor(route.ticks / 1440) + ' 份。途中可能遇事打断。' + (warnText ? '\n\n' + warnText : ''), route.ticks >= 1440 ? '启程' : '前往', { binding: 'choice', input: args('travel', { target: a }) }); return render_(c); }
      L.layer = 'scene'; return submit(c, 'choice', args('travel', { target: a }));
    }
    case 'b-tech': L.battle.kind = 'technique'; L.battle.item = a; return render_(c);
    case 'b-act': L.battle.kind = a; if (a === 'prepare') L.battle.item = L.battle.item || c.state.battleSkill; return render_(c);
    case 'search': case 'inherit': case 'remains-approach': case 'loot': return remainsAction(c, kind, a, b);
    case 'restore': {
      const save = saves.find(p => p.saveId === a); if (!save) { warn(c, '请先刷新命册。'); return render_(c); }
      ask(c, '读取「' + (save.displayName || '未题名的存档') + '」', '人物、物资、关系与世界历史都会回到那一刻。没写完的草稿与当前对象会清掉。', '读档', { host: true, binding: 'restore', input: { saveId: a } }, true); return render_(c);
    }
  }
}

async function questOption(c, id, index, identity) {
  const e = screen.quests?.known?.find(x => x.id === id), option = e?.options?.[Number(index)];
  const same = option && encodeURIComponent(JSON.stringify([option.detail, option.item || '', option.qty || 0, option.text || ''])) === identity;
  if (!option || option.disabled || !same) { warn(c, '这一步已经不可行了，请看清眼下的条件。'); return render_(c); }
  const a = args('quest', { target: id, detail: option.detail, item: option.item || '', qty: option.qty || 0, text: option.text || '' });
  if (['assist', 'subcontract', 'dispatch'].includes(a.detail)) { a.item = c.state.questPerson || a.item; if (!a.item) { L.negotiate = true; warn(c, '先在「议价 / 协作」里选一位在场的人。'); return render_(c); } }
  if (a.detail === 'negotiate') {
    if (c.state.questAmount) { a.qty = Number(c.state.questAmount); if (!/^\d+$/.test(c.state.questAmount) || a.qty > 100) { warn(c, '报酬须是 0 到 100 的整数。'); return render_(c); } }
    if (c.state.questDays) { if (!intQty(c.state.questDays, 1, 14)) { warn(c, '期限须是 1 到 14 天。'); return render_(c); } a.text = c.state.questDays; }
    if (c.state.questAlternative) a.item = c.state.questAlternative;
  }
  const light = ['track', 'untrack', 'page'].includes(a.detail);
  if (light) return submit(c, 'act', a);
  ask(c, option.label, (e.terms || '') + '\n' + (option.text || '按眼下的真实条件办理，对方可能不答应。'), '落印', { binding: 'act', input: a });
  return render_(c);
}
async function activityOption(c, owner, index, identity) {
  const list = owner === 'opening' ? screen.activities?.openings : screen.activities?.instances?.find(a => a.id === owner)?.options;
  const option = list?.[Number(index)];
  const same = option && encodeURIComponent(JSON.stringify([option.detail, option.item || '', option.qty || 0, option.text || ''])) === identity;
  if (!option || option.disabled || !same) { warn(c, '活动已到了下一步，请重新选择。'); return render_(c); }
  const a = args('activity', { target: owner === 'opening' ? '' : owner, detail: option.detail, item: option.item || '', qty: option.qty || 0, text: option.text || '' });
  if (['auction_bid', 'auction_authorize', 'auction_consign'].includes(a.detail) && c.state.amount) {
    const max = a.detail === 'auction_consign' ? 100 : 1000000000, amount = intQty(c.state.amount, 1, max);
    if (!amount) { warn(c, '金额或数量须是 1 到 ' + max + ' 的整数。'); return render_(c); }
    if (a.detail === 'auction_consign') a.qty = amount; else { a.text = String(amount); a.qty = 0; }
  }
  if (a.detail === 'auction_consign') a.item = c.state.activityItem || a.item;
  if (a.detail === 'auction_authorize') { a.item = c.state.questPerson; if (!a.item) { warn(c, '请选择提出需求的在场委托人。'); return render_(c); } }
  ask(c, option.label, '依你此刻的资格、钱财、材料与所处阶段办理。' + (a.detail === 'auction_bid' ? '\n出价 ' + (a.text || a.qty) + ' 金。' : a.detail === 'auction_consign' ? '\n托管 ' + itemName(a.item) + ' ×' + a.qty + '。' : a.detail === 'auction_authorize' ? '\n请求授权预算 ' + (a.text || a.qty) + ' 金，须委托人同意。' : '') + '\n已花的时间与材料不会退回。', '落印', { binding: 'act', input: a });
  return render_(c);
}
async function remainsAction(c, kind, id, item) {
  const p = screen.remains?.rows.find(r => r.id === id); if (!p) { warn(c, '现场已经变了，请再看一眼。'); return render_(c); }
  if (kind === 'remains-approach') return act(c, 'move', { x: p.x, y: p.y });
  const qty = kind === 'loot' ? intQty(c.state.qty) : 1;
  if (!qty) { warn(c, '取用数量须是 1 到 100 的整数。'); return render_(c); }
  return act(c, kind === 'inherit' ? 'loot' : kind, { target: id, item: item || '', qty, detail: kind === 'inherit' ? 'inherit' : '' });
}

// ---- battle ----
async function battleSeal(c) {
  const s = screen, B = L.battle, e = s.combat;
  if (!e?.id || e.phase !== 'choice') { warn(c, '这一轮已经锁定，等它结算。'); return render_(c); }
  const kind = B.kind || (B.x >= 0 ? 'move' : '');
  if (!kind) { warn(c, '先选一种行动，或点金色格移动。'); return render_(c); }
  if (kind === 'technique' && !e.techniques.some(t => t.id === B.item)) { warn(c, '从书架或快捷里选一招已学的斗技。'); return render_(c); }
  const target = B.target || e.enemy || '';
  const a = args(kind === 'move' ? 'battle' : kind, { target: kind === 'consume' && !B.target ? 'player' : target, item: kind === 'consume' ? 'medicine' : B.item, qty: e.round });
  if (kind === 'surrender' && String(c.state.offerGold).trim()) {
    const gold = intQty(c.state.offerGold, 0, s.gold); if (gold === null) { warn(c, '随附金币须是不超过身上所有的非负整数。'); return render_(c); }
    a.item = 'gold:' + gold;
  }
  if (B.x >= 0) { a.x = B.x; a.y = B.y; }
  if (kind === 'move') a.detail = 'move'; else { a.kind = 'battle'; a.detail = kind + (B.x >= 0 ? ':move' : ''); }
  const done = await submit(c, 'act', a);
  if (done) { L.battle = { x: -1, y: -1, target: B.target, kind: '', item: '' }; await render_(c); }
}
async function battleCommand(c) {
  const B = L.battle, ally = c.state.battleAlly, order = c.state.battleOrder || 'focus';
  if (!ally) { warn(c, '先选一位在场的同伴。'); return render_(c); }
  const a = args('battle', { target: ally, qty: screen.combat.round, text: B.target || screen.combat.enemy || '' });
  a.kind = 'command'; a.detail = order === 'action' ? 'action' : 'goal'; a.item = order === 'action' ? (B.item || c.state.battleSkill) : order;
  return submit(c, 'act', a);
}
async function stopNow(c) {
  stopAdvance = true; advanceEpoch = epochToken;
  if (!busy && !refreshing && !pending) {
    autoAdvance = false; stopAdvance = false;
    if (['collecting', 'resolving', 'world', 'cleanup'].includes(screen?.combat.phase)) say(c, '后续结算已暂停。已锁定的决定不变，可以继续。');
    else await submit(c, 'cancel', {}, { automatic: true });
  }
  await render_(c);
}
async function stopGeneration(c) {
  try { ok(await action(c, 'conversationCancel', {}, revision, key(c))); say(c, '已请对方停下，已发生的事仍在。'); }
  catch { warn(c, '停止的结果还没确认，请看看结果。'); }
  await refresh(c, true);
}

async function initialize(c) {
  if (screen?.created || busy) return;
  while (initializationStep < BINDINGS.length) {
    if (!await submit(c, BINDINGS[initializationStep], {})) return;
    initializationStep++;
  }
  (noticeText = '');
}

async function poll(c) {
  for (;;) {
    if (autoAdvance || stopAdvance) await c.scheduler.frame();
    else await c.scheduler.timer(1800);
    try {
      if (autoAdvance || stopAdvance) {
        if (advanceEpoch !== epochToken) { autoAdvance = false; stopAdvance = false; continue; }
        if (busy || refreshing || pending) continue;
        if (stopAdvance) {
          autoAdvance = false; stopAdvance = false;
          if (['collecting', 'resolving', 'world', 'cleanup'].includes(screen?.combat.phase)) { say(c, '后续结算已暂停。已锁定的决定不变，可以继续。'); await render_(c); continue; }
          await submit(c, 'cancel', {}, { automatic: true }); continue;
        }
        if (!screen?.operation.kind || ++advanceCount > 10000) { autoAdvance = false; if (screen?.operation.kind) say(c, '先停在这里，可以继续剩下的事。'); await render_(c); continue; }
        if (!await submit(c, 'continue', {}, { automatic: true })) { autoAdvance = false; await render_(c); }
        continue;
      }
      if (!busy && !refreshing && !pending && screen?.created && screen.alive && ['initialize', 'appraise', 'refresh'].includes(screen.operation.kind)) { await submit(c, 'continue', {}, { automatic: true }); continue; }
      const state = await read(c, 'generation');
      if (generation !== state.state) { generation = state.state; await render_(c); }
      if (!busy && !refreshing) {
        const current = await read(c, 'session');
        if (current.revisionId !== revision) await refresh(c, true);
      }
    } catch { autoAdvance = false; stopAdvance = false; /* No write retry after an uncertain result. */ }
  }
}

// ---- events ----
export default {
  async init(c) { await refresh(c); void poll(c); },
  async event(c, original) {
    let e = original;
    if (e.node === 'doupo-root') {
      if (e.type !== 'keydown' || e.isComposing) return;
      const from = e.targetNode || '';
      if ((from === 'draft' || from === 'talk-draft') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { await sendDraft(c); return; }
      if (e.key === 'Escape') { await back(c); return; }
      if (typing.has(from) || e.ctrlKey || e.metaKey || e.altKey || !screen?.created) return;
      const scroll = { c: 'self', r: 'people', j: 'journal', m: 'atlas' }[String(e.key).toLowerCase()];
      if (scroll) await openScroll(c, scroll);
      return;
    }
    if (e.isComposing) return;
    if (e.type === 'input' || e.type === 'change') {
      if (e.node === 'draft' || e.node === 'talk-draft') { if (!draftContext || !e.value) bindDraft(c, true); c_draft = e.value; if (e.value.length > 2048) warn(c, '一次最多写 2048 字，请分段。'); await render_(c); return; }
      if (e.node === 'battle-skill' && e.value) { L.battle.kind = 'technique'; L.battle.item = e.value; }
      if (['plan-days', 'quest-filter', 'battle-skill', 'create-name'].includes(e.node)) { await c.scheduler.frame(); await render_(c); }
      return;
    }
    if (e.type !== 'click') return;
    if (e.node.endsWith('-events')) {
      if (!e.targetNode || e.targetNode === e.node) return;
      e = { ...e, node: e.targetNode, value: e.targetValue };
    }
    if (errorText && !['refresh-screen', 'resolve-pending'].includes(e.node)) errorText = '';
    if (noticeText && !isBusy()) noticeText = '';
    switch (e.node) {
      case 'refresh-screen': case 'host-refresh': await refresh(c); return;
      case 'stop-generation': case 'host-stop': await stopGeneration(c); return;
      case 'resolve-pending': await submit(c, '', {}, { retry: true }); return;
      case 'menu-open': case 'death-saves': L.layer = 'menu'; await render_(c); await loadSaves(c); await focus(c, 'menu-close'); return;
      case 'menu-close': case 'talk-close': case 'trade-close': case 'scroll-close': await back(c); return;
      case 'saves-refresh': await loadSaves(c); return;
      case 'saves-more': await loadSaves(c, true); return;
      case 'save-now':
        if (isBusy()) { warn(c, '眼下还有事在进行，等这一步落定或暂停后再存档。'); await render_(c); return; }
        await submit(c, 'save', { displayName: (c.state.saveName || '').trim() }); return;
      case 'font-normal': case 'font-large': L.fontLarge = e.node === 'font-large'; await render_(c); return;
      case 'host-reload': case 'host-recover': ask(c, e.node === 'host-reload' ? '重新载入画面' : '恢复宿主', '会清掉本地草稿与当前对象，已发生的事不会撤销。', '确定', { host: true, binding: e.node.slice(5), input: {} }, true); await render_(c); return;
      case 'host-exit': ask(c, '退出作品', '没写完的草稿可能丢失。可以先存档；已发生的事不会撤销。', '退出', { host: true, binding: 'exit', input: {} }, true); await render_(c); return;
      case 'confirm-back': L.confirm = null; await render_(c); return;
      case 'confirm-accept': {
        const pendingConfirm = L.confirm; if (!pendingConfirm) return;
        if (!pendingConfirm.host && pendingConfirm.revision !== revision) { L.confirm = null; warn(c, '世事已变，请重新斟酌这件事。'); await render_(c); return; }
        L.confirm = null; if (['travel'].includes(pendingConfirm.intent.input?.kind)) L.layer = 'scene';
        await render_(c); await runIntent(c, pendingConfirm.intent); return;
      }
      case 'self-badge': await openScroll(c, 'self'); return;
      case 'rail-self': case 'rail-people': case 'rail-journal': case 'rail-atlas': await openScroll(c, e.node.slice(5)); return;
      case 'origin-native': case 'origin-transmigrator': L.createOrigin = e.node.slice(7); await render_(c); return;
      case 'sex-female': case 'sex-male': L.createSex = e.node.slice(4); await render_(c); return;
      case 'plaque-back': L.overview = !L.overview; if (L.overview) { L.layer = L.layer === 'scroll' ? 'scroll' : 'scene'; } await render_(c); return;
      case 'present-switch': if (!isBusy()) await submit(c, screen.peopleFilter === 'known' ? 'browse' : 'known-people', { qty: 0 }); return;
      case 'present-prev': case 'present-next': if (!isBusy()) await submit(c, screen.peopleFilter === 'known' ? 'known-people' : 'browse', { qty: screen.peoplePage + (e.node === 'present-next' ? 1 : -1) }); return;
      case 'cell': {
        const [x, y] = String(e.value).split(',').map(Number);
        if (!Number.isInteger(x) || !Number.isInteger(y)) return;
        if (shown.battle) { if (L.battle.x === x && L.battle.y === y) { L.battle.x = -1; L.battle.y = -1; } else { L.battle.x = x; L.battle.y = y; } await render_(c); return; }
        if (!isBusy()) await act(c, 'move', { x, y }); return;
      }
      case 'draft-retarget': bindDraft(c, true); await render_(c); await focus(c, L.layer === 'talk' ? 'talk-draft' : 'draft'); return;
      case 'submit-draft': case 'talk-submit': await sendDraft(c); return;
      case 'talk-hear': if (!isBusy()) await submit(c, 'acknowledge', { target: L.talkKey }); return;
      case 'teach-submit': if (!isBusy()) await act(c, 'teach', { target: L.talkKey, item: c.state.teachSkill || 'basic' }); return;
      case 'letter-submit': {
        const text = (c.state.letter || '').trim(); if (!text) { warn(c, '信纸还是空的。'); await render_(c); return; }
        if (!isBusy() && await act(c, 'message', { target: L.talkKey, text })) put(c, 'letter', '');
        return;
      }
      case 'guide-skip': if (!isBusy()) await act(c, 'quest', { detail: 'guide_skip' }); return;
      case 'scroll-prev': case 'scroll-next': {
        if (isBusy()) return;
        const step = e.node === 'scroll-next' ? 1 : -1, tab = L.tabs[L.scrollId] || scrollTabs[L.scrollId][0];
        if (L.scrollId === 'self') await act(c, 'browse', { detail: 'arts', qty: screen.artsPage + step });
        else if (L.scrollId === 'people') await submit(c, screen.peopleFilter === 'known' ? 'known-people' : 'browse', { qty: screen.peoplePage + step });
        else if (tab === 'quests') await act(c, 'quest', { detail: 'page', qty: Math.max(0, (screen.quests?.page || 0) + step) });
        else if (tab === 'news') await submit(c, 'clues', { qty: screen.cluesPage + step });
        return;
      }
      case 'plan-submit': {
        const days = intQty(c.state.days); if (!days) { warn(c, '天数须是 1 到 100 的整数。'); await render_(c); return; }
        const kind = L.planKind || 'train', name = ({ train: '闭关修炼', rest: '休养', work: '做工', wait: '等候' })[kind];
        const warnText = deadlineNote(screen, days * 1440);
        ask(c, name + ' ' + days + ' 日', '在' + placeName(screen.place) + name + ' ' + days + ' 日。途中有事会打断，已过的时日不退。' + (warnText ? '\n\n' + warnText : ''), ({ train: '闭关', rest: '休养', work: '做工', wait: '等候' })[kind], { binding: 'choice', input: args(kind, { qty: days }) });
        await render_(c); return;
      }
      case 'battle-seal': if (!isBusy()) await battleSeal(c); return;
      case 'battle-command': if (!isBusy()) await battleCommand(c); return;
      case 'battle-pause': await stopNow(c); return;
      case 'battle-resume': case 'passage-continue': if (!isBusy()) await submit(c, 'continue', {}); return;
      case 'battle-leave': L.battleDismissed = screen.combat.id; L.showRemains = false; await render_(c); return;
      case 'remains-prev': case 'remains-next': if (!isBusy()) await act(c, 'browse', { detail: 'corpses', qty: screen.remains.page + (e.node === 'remains-next' ? 1 : -1) }); return;
      case 'passage-stop': await stopNow(c); return;
      case 'passage-hide': L.passageHidden = true; L.passageDone = false; await render_(c); return;
      case 'create-submit': {
        const name = (c.state.createName || '').trim();
        if (!name || name.length > 48) { warn(c, '名字需要 1 到 48 个字。'); await render_(c); await focus(c, 'create-name'); return; }
        say(c, '世界正在苏醒……'); await render_(c);
        await initialize(c); if (initializationStep < BINDINGS.length) return;
        await act(c, 'create', { target: L.createBackground, item: L.createSex, detail: L.createOrigin, text: name });
        noticeText = ''; L.passageDone = false; await render_(c);
        return;
      }
    }
    if (e.value) await onToken(c, e.value);
  },
};

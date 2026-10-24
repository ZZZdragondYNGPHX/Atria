// Public screen projection + local presentation state -> view groups.
// Pure: no writes, no Bridge, no private reads. Every string is clipped to the
// declared schema so a long rule text can never fail state validation.
import { PLACES, ROUTES, BACKGROUNDS, ITEMS, REGIONS, WORLD_ATLAS, ATLAS_SECTORS } from './catalog.js';

const exact = id => ({ kind: 'exact', id: String(id || 'local-su').slice(0, 64) });
const clip = (v, n) => String(v ?? '').slice(0, n);
export const btn = (id, label, value = '', note = '', cls = '', disabled = false) =>
  ({ id: clip(id, 64), label: clip(label, 128), note: clip(note, 256), value: clip(value, 512), cls: clip(cls, 96), disabled: !!disabled });
export const note = (id, title, text = '', meta = '', src = '', cls = 'note', actions = []) =>
  ({ id: clip(id, 96), title: clip(title, 256), text: clip(text, 4096), meta: clip(meta, 256), src: clip(src, 8), cls: clip(cls, 96), actions: actions.slice(0, 4) });
const face = (id, name, meta, cls, image) => ({ id: clip(id, 64), name: clip(name, 48), meta: clip(meta, 256), cls: clip(cls, 96), hasImage: !!image, image: exact(image) });
export const token = (...parts) => parts.join('|');

// ---- vocabulary ----
const SHICHEN = '子丑寅卯辰巳午未申酉戌亥';
export function clock(minutes = 0) {
  const day = Math.floor(minutes / 1440) + 1, h = Math.floor(minutes % 1440 / 60), m = minutes % 60;
  const index = Math.floor(((h + 1) % 24) / 2);
  return { day: '第' + day + '日', shichen: SHICHEN[index] + '时' + (h % 2 ? '初' : '正'), angle: h * 15 + m / 4,
    sky: h < 5 ? '夜深' : h < 7 ? '破晓' : h < 11 ? '上午' : h < 13 ? '日中' : h < 17 ? '午后' : h < 19 ? '日暮' : '入夜' };
}
export const stamp = minutes => { const c = clock(minutes); return c.day + ' ' + c.shichen; };
// Rule texts sometimes carry raw world minutes; show them as in-world dates.
export const human = text => String(text ?? '').replace(/第(\d+)分钟/g, (_, n) => stamp(Number(n)));
export function span(minutes) {
  if (minutes <= 0) return '不耗时';
  if (minutes < 120) return Math.max(1, Math.round(minutes / 15)) + ' 刻';
  if (minutes < 1440) return '约 ' + Math.round(minutes / 120) + ' 个时辰';
  const d = Math.round(minutes / 720) / 2; return d + ' 日';
}
export const placeOf = id => PLACES.find(p => p.id === id);
export const placeName = id => placeOf(id)?.name || id || '未知之处';
const shortPlace = id => (placeOf(id)?.name || id || '').replace(/^[^·]+·/, '');
const regionName = id => REGIONS.find(r => r.id === id)?.name || '';
export const itemName = id => ITEMS.find(p => p.id === id)?.name || ({ gold: '金币', engagement: '婚约', truce: '停战安排' })[id] || id;
const itemArt = ['food', 'herb', 'redleaf', 'medicine', 'manual', 'technique', 'formula', 'relic'];
const roles = { herbalist: '药铺帮手', merchant: '商贩', innkeeper: '客栈伙计', cultivator: '修炼者', guide: '向导', rival: '修炼者', healer: '医者', mercenary: '佣兵', elder: '长者', artisan: '工匠', child: '孩童', leader: '主事者', guard: '守卫', porter: '搬运者', gatherer: '采药者', beast: '魔兽' };
const roleName = r => roles[r] || r || '';
const activity = p => p?.activity && !p.activity.startsWith('原创：') ? p.activity : '';
const statusNames = { here: '在场', last_known: '旧时所见', deceased: '已知离世' };
const opNames = { move: '行走', approach: '走近', travel: '赶路', train: '闭关修炼', wait: '等候', rest: '休养', work: '做工', plan: '连续行动', appraise: '整理所历', initialize: '世界苏醒', refresh: '世界苏醒', catchup: '世事流转', inherit: '料理身后事', combat: '交锋', learn: '研习', switch: '换修', breakthrough: '冲关' };
export const LONG = new Set(['travel', 'train', 'wait', 'rest', 'work', 'learn', 'switch', 'catchup']);
const sourceSeal = s => /亲|witness|亲见|在场/.test(s) ? '亲' : /信|letter/.test(s) ? '信' : /告|notice|公告/.test(s) ? '告' : /谈|talk|交谈/.test(s) ? '谈' : /原著|novel/.test(s) ? '忆' : /传|闻|rumor/.test(s) ? '闻' : '录';
const clueSeal = { rumor: '闻', novel_memory: '忆', opportunity: '缘', conversation: '谈', relationship: '情', companion: '伴', population: '闻', birth: '闻', death: '闻' };
const clueName = k => ({ rumor: '传闻', novel_memory: '原著记忆', opportunity: '机缘线索', conversation: '交谈所得', relationship: '相处', companion: '同行', population: '人间消息', birth: '出生消息', death: '死讯' })[k] || '见闻';
export const portraitOf = p => p?.appearance?.ready ? p.appearance.portraitAsset : '';
const chibiOf = p => p?.appearance?.ready ? p.appearance.chibiAsset : '';
const personName = (s, id) => id === 'player' ? (s.name || '你') : s.people.find(p => p.key === id)?.name || s.markers?.find(p => p.key === id)?.name || s.combat?.participants?.find(p => p.id === id)?.name || '相识之人';
export const can = (s, kind) => !!s?.created && s.alive && (s.actions || []).includes(kind);
const has = (s, item) => (s.inventory || []).find(i => i.item === item)?.qty || 0;
const sideOf = (s, id) => s.combat.participants.find(p => p.id === id)?.side;

// ---- static content ----
const scrolls = {
  'self': { title: '己身', key: 'C', tabs: [['cult', '修为'], ['arts', '法门'], ['body', '身体'], ['bag', '行囊']] },
  people: { title: '人间', key: 'R', tabs: [['near', '人物'], ['home', '家'], ['vows', '约定'], ['ties', '关系']] },
  journal: { title: '江湖录', key: 'J', tabs: [['quests', '委托'], ['events', '此地活动'], ['news', '见闻'], ['mail', '书信'], ['past', '往事']] },
  atlas: { title: '山河', key: 'M', tabs: [['region', '地区'], ['world', '大陆']] },
};
export const scrollTabs = Object.fromEntries(Object.entries(scrolls).map(([k, v]) => [k, v.tabs.map(t => t[0])]));
const planKinds = [['train', '闭关修炼', '积累修为，耗干粮'], ['rest', '休养', '回复气血与伤势'], ['work', '做工', '换取金币'], ['wait', '等候', '让时间过去']];
const facilityHotspots = { 'wutan.herbal': [28, 64], 'wutan.market': [57, 51], 'wutan.inn': [28, 28], 'wutan.clan': [73, 22], 'wutan.gate': [81, 64], 'wutan.auction': [44, 38], 'wutan.workshop': [16, 46], 'wutan.teahouse': [62, 76] };
const partPos = { head: 'p-head', torso: 'p-torso', left_arm: 'p-larm', right_arm: 'p-rarm', left_leg: 'p-lleg', right_leg: 'p-rleg', whole: 'p-whole' };
const partName = id => ({ head: '头部', torso: '躯干', whole: '全身', left_arm: '左臂', right_arm: '右臂', left_leg: '左腿', right_leg: '右腿' })[id] || id;
const diagnosis = d => ({ unknown: '尚未确诊', fracture: '骨折', bruise: '挫伤', cut: '创伤', trauma: '外伤', loss: '缺失创口' })[d] || d;
const capability = k => ({ move: '行走', communicate: '交谈', grip: '持握', care: '照护', travel: '赶路', train: '修炼', work: '做工', attack: '出手', technique: '施展斗技' })[k] || k;
const questStates = { offered: '可商议', available: '可承接', accepted: '承接中', active: '承接中', ready: '待验收', completed: '已完成', settled: '已结清', abandoned: '已退出', cancelled: '已撤回', expired: '已过期', dispatched: '在途', debt: '待收款', transferred: '已转包', working: '正在办', paused_work: '工时暂停', return_pending: '待归还', withdrawn: '对方撤回', failed: '未通过', unsold: '流拍', open: '进行中' };
const questActive = new Set(['accepted', 'active', 'working', 'paused_work', 'ready', 'dispatched', 'debt', 'return_pending']);
const questSources = { notice: '告', talk: '谈', witness: '亲', letter: '信' };

// ---- the renderer ----
export function render(s, L) {
  const v = {};
  const created = !!s?.created;
  const busy = !!L.busy;
  const combat = s?.combat || {};
  const battleActive = created && !!combat.id && !['closed', 'idle', ''].includes(combat.phase);
  const battleEnded = created && ((!!combat.id && combat.phase === 'closed' && L.battleDismissed !== combat.id) || (!!L.showRemains && !!s.remains?.total));
  const opKind = s?.operation?.kind || '';
  const passage = created && s.alive && (LONG.has(opKind) || !!L.passageDone) && !L.passageHidden && !battleActive;
  const layer = L.layer || 'scene';
  const showBattle = created && s.alive && (battleActive || battleEnded) && layer !== 'menu' && !L.confirm;
  const talkPerson = created && L.talkKey ? s.people.find(p => p.key === L.talkKey) : null;
  const ui = v.ui = {
    creating: !created, playing: created, overview: created && !!L.overview && !showBattle, facility: created && !L.overview || showBattle,
    talk: layer === 'talk' && !!talkPerson && !showBattle && !passage, trade: layer === 'trade' && !showBattle && !passage, scroll: layer === 'scroll' && !passage,
    battle: showBattle && layer !== 'scroll', passage: passage && layer !== 'menu', menu: layer === 'menu', confirm: !!L.confirm, dead: created && !s.alive && layer !== 'menu',
    stageClass: '', status: !!(L.statusText), statusText: clip(L.statusText, 1024), statusError: !!L.statusError, fontLarge: !!L.fontLarge,
  };
  ui.stageClass = ['game', created ? 'is-playing' : 'is-creating', ui.overview && 'is-overview', ui.talk && 'is-talk', ui.trade && 'is-trade', ui.scroll && 'is-scroll',
    ui.battle && 'is-battle', ui.passage && 'is-passage', ui.menu && 'is-menu', ui.dead && 'is-dead', ui.confirm && 'is-confirm', ui.status && 'has-status', ui.facility && 'is-facility', L.fontLarge && 'is-large', L.statusError && 'has-error'].filter(Boolean).join(' ');

  v.create = renderCreate(L);
  if (!created) return v;

  const c = clock(s.time), place = placeOf(s.place), region = place?.region || 'wutan';
  const food = has(s, 'food');
  const injured = s.condition?.wounds?.length;
  v.hud = {
    place: shortPlace(s.place) || s.placeName || '', region: regionName(region), back: L.overview ? '入内' : '城中', canBack: !showBattle,
    day: c.day, shichen: c.shichen, sky: c.sky, dialAngle: c.angle,
    doing: clip(opKind ? (opNames[opKind] || opKind) + (s.operation.end > s.time ? ' · 至' + stamp(s.operation.end) : '') : '', 256),
    name: s.name || '', realm: s.realm || '', hpText: s.hp + '/100', hpPct: Math.max(0, Math.min(100, s.hp)),
    qiText: s.qi + '/' + s.qiCapacity, qiPct: s.qiCapacity ? Math.max(0, Math.min(100, Math.round(s.qi / s.qiCapacity * 100))) : 0,
    gold: '金 ' + s.gold, food: '粮 ' + food, alert: s.control?.holder ? '受制' : injured ? '有伤' : '',
    hasFace: !!portraitOf(s), face: exact(portraitOf(s)), journalNew: !!L.journalNew,
    tabs: Object.entries(scrolls).map(([id, sc]) => btn(id, sc.title, token('scroll', id), sc.key, 'tab' + (layer === 'scroll' && L.scrollId === id ? ' on' : '') + (id === 'journal' && L.journalNew ? ' new' : ''), layer === 'scroll' && L.scrollId === id)),
  };

  v.scene = renderScene(s, L, showBattle, busy);
  v.present = renderPresent(s, L, busy);
  v.recent = {
    meta: clip(s.result?.code ? (stamp(s.result.at || s.time) + (s.result.spent ? ' · 耗时' + span(s.result.spent) : '')) : c.day + ' · ' + c.sky, 128),
    text: clip(!s.result?.text || s.result.text.startsWith('{') || /^这段活动已经完成|^活动完成/.test(s.result.text) && !s.result.spent ? '你在' + (placeOf(s.place)?.name || '此地') + '。' + (placeOf(s.place)?.description || '') : human(s.result.text), 4096), src: '亲', hasNarration: !!L.narration,
    target: clip(L.draftTargetLabel || '此地', 256), stale: !!L.draftStale,
  };
  v.talk = renderTalk(s, L, talkPerson, busy);
  v.trade = renderTrade(s, L, busy);
  Object.assign(v, renderScroll(s, L, busy));
  v.battle = renderBattle(s, L, battleActive, busy);
  v.passage = renderPassage(s, L);
  v.menu = renderMenu(L);
  v.confirm = L.confirm ? { title: clip(L.confirm.title, 256), text: clip(L.confirm.text, 4096), seal: clip(L.confirm.seal || '落印', 32), disabled: busy && !L.confirm.host } : { title: '', text: '', seal: '落印', disabled: false };
  return v;
}

function renderCreate(L) {
  const bg = BACKGROUNDS.find(b => b.id === L.createBackground) || BACKGROUNDS[0];
  return {
    backgrounds: BACKGROUNDS.map(b => btn(b.id, b.name, token('bg', b.id), b.description + '　起于' + shortPlace(b.place) + ' · 金 ' + b.gold, 'bg-card' + (b.id === bg.id ? ' on' : ''), b.id === bg.id)),
    origins: [['native', '本土人'], ['transmigrator', '穿越者']].map(([id, label]) => btn(id, label, token('origin', id), '', 'seg-btn' + (L.createOrigin === id ? ' on' : ''), L.createOrigin === id)),
    sexes: [['female', '女'], ['male', '男']].map(([id, label]) => btn(id, label, token('sex', id), '', 'seg-btn' + (L.createSex === id ? ' on' : ''), L.createSex === id)),
    summary: clip((L.createOrigin === 'transmigrator' ? '你带着对原著的记忆醒来——但这一世未必照原著发生。' : '你生于此世，所知皆来自亲历与耳闻。') + '\n出身' + bg.name + '，起于' + placeName(bg.place) + '，身有 ' + bg.gold + ' 金。', 512),
  };
}

function renderScene(s, L, showBattle, busy) {
  const place = placeOf(s.place), region = place?.region || 'wutan', overview = !!L.overview && !showBattle;
  const image = overview ? REGIONS.find(r => r.id === region)?.overview || '' : place?.scene || '';
  const ratio = ['scene-wutan-inn', 'scene-wutan-auction', 'scene-wutan-clan', 'scene-wutan-gate', 'scene-qingshan-inn', 'scene-mountain-camp', 'scene-mountain-valley', 'scene-mountain-cave'].includes(image) ? ' r32' : image === 'map-first-regions' ? ' r21' : '';
  const out = { image: exact(image || 'wutan-overview'), hasImage: !!image, missing: !image, note: image ? '' : clip((place?.description || '') + '（此地暂缺画卷）', 512), artClass: 'scene-art' + ratio, hotspots: [], markers: [], objects: [], cells: [], markerNote: '' };
  if (overview) {
    const reachable = new Set(ROUTES.filter(r => r.from === s.place).map(r => r.to));
    out.hotspots = PLACES.filter(p => p.region === region && s.known.includes(p.id) && facilityHotspots[p.id]).map(p => {
      const [x, y] = facilityHotspots[p.id];
      return btn(p.id, shortPlace(p.id), token('facility', p.id), p.id === s.place ? '你在此' : reachable.has(p.id) ? '相邻' : '', 'hotspot x' + x + ' y' + y + (p.id === s.place ? ' here' : ''), busy);
    });
    return out;
  }
  const blocks = place?.blocks || [];
  const blocked = (x, y) => blocks.some(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  const B = L.battle || {};
  const choosing = showBattle && s.combat.phase === 'choice';
  const reach = choosing ? reachable2(s, blocked) : new Set();
  const radius = showBattle ? (s.combat.techniques.find(t => t.id === B.item)?.radius || 0) : 0;
  const aim = B.x >= 0 ? [B.x, B.y] : null;
  for (let y = 0; y < 14; y++) for (let x = 0; x < 20; x++) {
    const id = x + ',' + y, isBlocked = blocked(x, y);
    let cls = 'cell' + (isBlocked ? ' blocked' : '');
    if (reach.has(id)) cls += ' reach';
    if (aim && aim[0] === x && aim[1] === y) cls += ' pick';
    if (radius && aim && Math.abs(aim[0] - x) + Math.abs(aim[1] - y) <= radius) cls += ' aoe';
    out.cells.push({ id, cls, label: (isBlocked ? '不可行 ' : choosing ? '落点 ' : '走到 ') + x + '，' + y, disabled: isBlocked || busy || !!s.operation.kind || (choosing && !reach.has(id)) });
  }
  const pos = (x, y) => ' gx' + Math.max(0, Math.min(19, x | 0)) + ' gy' + Math.max(0, Math.min(13, y | 0));
  if (showBattle) {
    const lookup = id => s.people.find(p => p.key === id) || s.markers.find(p => p.key === id);
    const statusText = { active: '', left: '已脱离', incapacitated: '失能', surrendered: '已降' };
    out.markers = s.combat.participants.map(p => {
      const img = p.id === 'player' ? chibiOf(s) : chibiOf(lookup(p.id));
      const tag = (p.id === 'player' ? '你' : p.name) + (statusText[p.status] ? ' · ' + statusText[p.status] : '');
      return face(p.id, tag, (p.signs || '') + (p.controlled ? ' · 受制' : '') + (p.shielded ? ' · 有护体' : ''), 'chibi fighter side-' + p.side + (p.id === B.target ? ' target' : '') + (p.id === 'player' ? ' me' : '') + (img ? '' : ' token') + pos(p.x, p.y), img);
    });
  } else {
    out.markers = (s.markers || []).map(p => face(p.key, p.name, roleName(s.people.find(n => n.key === p.key)?.role), 'chibi' + (p.key === L.selected ? ' sel' : '') + (chibiOf(p) ? '' : ' token') + pos(p.x, p.y), chibiOf(p)));
    out.markers.push(face('player', '你', s.name, 'chibi me' + (chibiOf(s) ? '' : ' token') + pos(s.x, s.y), chibiOf(s)));
    out.markerNote = s.markersTruncated ? '此处还有 ' + (s.markerTotal - s.markers.length) + ' 人未画出，见“在场”' : '';
  }
  if (!showBattle) {
    out.objects = (place?.objects || []).map(o => btn(o.id, o.id === 'resource' ? (s.quotes.length ? o.name + ' · 交易' : o.name) : o.name, token('object', o.id), '', 'object' + pos(o.x, o.y), busy));
    if (s.remains?.total) out.objects.push(btn('remains', '现场遗留 · ' + s.remains.total, token('object', 'remains'), '', 'object danger' + pos(s.remains.rows[0]?.x ?? 10, s.remains.rows[0]?.y ?? 10), busy));
  }
  return out;
}

function reachable2(s, blocked) {
  const me = s.combat.participants.find(p => p.id === 'player') || { x: s.x, y: s.y };
  const occupied = new Set(s.combat.participants.filter(p => p.id !== 'player' && p.status === 'active').map(p => p.x + ',' + p.y));
  const seen = new Set([me.x + ',' + me.y]); let frontier = [[me.x, me.y]];
  for (let step = 0; step < 2; step++) {
    const next = [];
    for (const [x, y] of frontier) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, id = nx + ',' + ny;
      if (nx < 0 || ny < 0 || nx > 19 || ny > 13 || seen.has(id) || blocked(nx, ny) || occupied.has(id)) continue;
      seen.add(id); next.push([nx, ny]);
    }
    frontier = next;
  }
  return seen;
}

function renderPresent(s, L, busy) {
  const known = s.peopleFilter === 'known';
  const rows = s.people.map(p => face(p.key, p.name, roleName(p.role) + (activity(p) ? ' · ' + activity(p) : '') + (known ? ' · ' + (statusNames[p.status] || p.status) : ''), 'face' + (p.key === L.selected ? ' sel' : '') + (p.status === 'deceased' ? ' gone' : p.status !== 'here' ? ' stale' : ''), portraitOf(p)));
  const reachable = new Set(ROUTES.filter(r => r.from === s.place).map(r => r.to));
  const region = placeOf(s.place)?.region;
  const places = L.overview ? PLACES.filter(p => p.region === region && s.known.includes(p.id)).map(p => {
    const route = ROUTES.find(r => r.from === s.place && r.to === p.id);
    return btn(p.id, shortPlace(p.id), token('facility', p.id), p.id === s.place ? '你在此' : route ? span(route.ticks) : '需绕行', 'place' + (p.id === s.place ? ' here' : ''), busy);
  }) : [];
  return {
    title: L.overview ? '城中去处' : known ? '旧识' : '在场', rows: L.overview ? [] : rows, places, showPlaces: !!L.overview,
    empty: !L.overview && !rows.length, emptyText: known ? '还没有旧识的记录。' : '此处暂时没有旁人。',
    page: !L.overview && s.peoplePages > 1 ? (s.peoplePage + 1) + '/' + s.peoplePages : '', prev: !L.overview && s.peoplePage > 0, next: !L.overview && s.peoplePage + 1 < s.peoplePages,
    knownLabel: L.overview ? '' : known ? '在场 ›' : '旧识 ›',
  };
}

function renderTalk(s, L, p, busy) {
  const empty = { name: '', role: '', doing: '', signs: '', hasImage: false, image: exact(''), fallback: '', place: '', distance: '', present: false, log: [], canHear: false, common: [], bond: [], fight: [], bondOpen: false, fightOpen: false, giftOpen: false, gifts: [], letterOpen: false, teachOpen: false, reason: '' };
  if (!p) return empty;
  const here = p.status === 'here' && p.place === s.place && p.alive;
  const dist = here ? Math.abs(p.x - s.x) + Math.abs(p.y - s.y) : -1, near = here && dist <= 2;
  const lock = busy || !!s.operation.kind || !s.alive;
  const fold = L.talkFold || '';
  const log = (L.transcripts?.[p.key] || []).slice(-23).map((line, i) => ({ id: 'l' + i, cls: 'line ' + line.cls, who: clip(line.who, 48), text: clip(line.text, 4096) }));
  if (!log.length) log.push({ id: 'l0', cls: 'line nar', who: '', text: clip(here ? (activity(p) ? p.name + '正在' + activity(p).replace(/^正在/, '') + '。' : p.name + '就在近旁。') : '上次见到' + p.name + '是在' + placeName(p.place) + '，' + stamp(p.observedAt || 0) + '。', 4096) });
  if (p.reply) log.push({ id: 'reply', cls: 'line npc', who: p.name, text: clip(p.reply, 4096) });
  const opt = (id, label, value, noteText, kind, extra = '') => btn(id, label, value, noteText, 'opt' + extra, lock || (kind && !can(s, kind)));
  const common = [];
  if (here && !near) common.push(opt('approach', '走近', token('approach', p.key), '相距 ' + dist + ' 步', 'approach', ' primary'));
  if (here) common.push(opt('ask', '询问近况', token('quest-discover', 'talk', p.key), '也许有事相托', 'quest'));
  if (here && s.quotes.length) common.push(btn('trade', '看看货', token('open-trade'), s.quotes.length + ' 种货', 'opt', false));
  for (const q of (s.quests?.known || []).filter(q => q.issuer === p.key && !['completed', 'settled', 'abandoned', 'cancelled', 'expired', 'withdrawn'].includes(q.status)).slice(0, 2))
    common.push(btn('q-' + q.id, (questActive.has(q.status) ? '交代「' : '商议「') + q.title + '」', token('open-quest', q.id), questStates[q.status] || q.status, 'opt primary', false));
  if (here) common.push(btn('gift', '赠礼' + (fold === 'gift' ? ' ▴' : ' ▾'), token('fold', 'gift'), '', 'opt fold' + (fold === 'gift' ? ' on' : ''), lock));
  common.push(btn('bond', '情谊' + (fold === 'bond' ? ' ▴' : ' ▾'), token('fold', 'bond'), '', 'opt fold' + (fold === 'bond' ? ' on' : ''), false));
  if (here) common.push(btn('fight', '动手' + (fold === 'fight' ? ' ▴' : ' ▾'), token('fold', 'fight'), '', 'opt fold danger' + (fold === 'fight' ? ' on' : ''), false));
  const openPromise = s.promises.find(v => v.giver === 'player' && v.receiver === p.key && v.status === 'open' && v.item !== 'engagement');
  const bond = [];
  if (here) {
    bond.push(opt('invite', '邀请同行', token('social', 'invite', p.key), '对方可以拒绝', 'invite'));
    if (p.needItem && p.needQty) bond.push(opt('promise', '应下所需', token('social', 'promise', p.key), itemName(p.needItem) + ' ×' + p.needQty + ' · 七日', 'promise'));
    if (openPromise) bond.push(opt('deliver', '履约', token('social', 'deliver', p.key), itemName(openPromise.item) + ' ×' + openPromise.qty, 'deliver'));
    bond.push(opt('care', '照护', token('social', 'care', p.key), '', 'care'));
    bond.push(opt('confess', '表达心意', token('social', 'confess', p.key), '', 'confess'));
    bond.push(opt('engage', '商议婚约', token('social', 'engage', p.key), '', 'engage'));
    bond.push(opt('marry', '建立家庭', token('social', 'marry', p.key), '', 'marry'));
    bond.push(opt('conceive', '商议养育', token('social', 'conceive', p.key), '', 'conceive'));
    if (s.family.some(f => f.status !== 'separated' && (f.a === p.key || f.b === p.key))) bond.push(opt('separate', '结束共同生活', token('social', 'separate', p.key), '', 'separate', ' danger'));
    bond.push(btn('teach', '传授' + (L.teachOpen ? ' ▴' : ' ▾'), token('subfold', 'teach'), '投入一日', 'opt', lock));
  }
  bond.push(btn('letter', '寄信' + (L.letterOpen ? ' ▴' : ' ▾'), token('subfold', 'letter'), '邮资一金', 'opt', lock));
  const fight = here ? [
    opt('spar', '请求切磋', token('fight', 'spar', p.key), '三轮徒手，对方可拒绝', 'spar'),
    opt('attack', '发起交锋', token('fight', 'attack', p.key), '伤亡与责任都会留下', 'attack', ' danger'),
    opt('capture', '建立看守', token('fight', 'capture', p.key), '须对方失能或已降', 'capture'),
    opt('release', '释放', token('fight', 'release', p.key), '只限你看守的人', 'release'),
  ] : [];
  const gifts = (s.inventory || []).filter(i => i.qty > 0).map(i => btn('g-' + i.item, itemName(i.item), token('gift', i.item, p.key), '持有 ' + i.qty, 'opt', lock || !can(s, 'gift')));
  const hidden = bond.filter(b => b.disabled && !lock).length;
  return {
    name: p.name, role: clip(roleName(p.role) + (p.carrying ? ' · 携' + p.carrying : ''), 128), doing: clip(activity(p), 256), signs: clip((p.signs || []).join('、'), 512),
    hasImage: !!portraitOf(p), image: exact(portraitOf(p)), fallback: portraitOf(p) ? '' : p.name, place: clip((here ? '相处 · ' : '旧识 · ') + placeName(here ? s.place : p.place), 128),
    distance: here ? (near ? '近在身旁' : '相距 ' + dist + ' 步') : p.status === 'deceased' ? '已知离世' : '不在此处', present: here,
    log, canHear: here && (!!p.reply || ['awaiting_npc', 'reply_pending'].includes(s.result?.code)),
    common, bond, fight, bondOpen: fold === 'bond', fightOpen: fold === 'fight' && here, giftOpen: fold === 'gift' && here, gifts: gifts.length ? gifts : [btn('g-none', '行囊里没有可赠之物', '', '', 'opt', true)],
    letterOpen: fold === 'bond' && !!L.letterOpen, teachOpen: fold === 'bond' && !!L.teachOpen && here,
    reason: clip(fold === 'bond' && hidden ? '有些事眼下还做不到——关系、身份与条件都会影响对方的回答。' : lock && s.operation.kind ? '眼下正在' + (opNames[s.operation.kind] || '行动') + '，先等它结束或停手。' : '', 256),
  };
}

function renderTrade(s, L, busy) {
  const lock = busy || !!s.operation.kind;
  const shelf = s.quotes.map(q => note('q-' + q.item, itemName(q.item), '', '单价 ' + q.price + ' 金 · 店中 ' + q.qty, '', 'good' + (itemArt.includes(q.item) ? ' art-' + q.item : ''),
    [btn('buy', '买入', token('buy', q.item, q.quote), '', 'seal-line', lock || !can(s, 'buy') || q.qty < 1)]));
  const bag = (s.inventory || []).filter(i => i.qty > 0).map(i => {
    const q = s.quotes.find(x => x.item === i.item);
    return note('b-' + i.item, itemName(i.item), '', '持有 ' + i.qty, '', 'good' + (itemArt.includes(i.item) ? ' art-' + i.item : ''), q ? [btn('sell', '卖出', token('sell', i.item, q.quote), '', 'line', lock || !can(s, 'sell'))] : []);
  });
  return { title: '与' + (shortPlace(s.place) || '此地') + '交易', gold: '身有 ' + s.gold + ' 金', shelf, bag, empty: !shelf.length,
    hint: shelf.length ? '价随行市而变；成交以落印时的报价为准。' : '此处眼下没有货。' };
}

function renderScroll(s, L, busy) {
  const id = L.layer === 'scroll' ? L.scrollId : '', sc = scrolls[id];
  const tab = sc ? (L.tabs?.[id] || sc.tabs[0][0]) : '';
  const out = {
    scroll: { title: sc?.title || '', tabs: sc ? sc.tabs.map(([t, label]) => btn(t, label, token('tab', id, t), '', 'subtab' + (t === tab ? ' on' : ''), t === tab)) : [], tab, pageText: '', prev: false, next: false, hasPager: false, error: clip(L.scrollError, 512),
      show: { cult: false, arts: false, body: false, filter: false, ledger: false, regions: false, map: false } },
    selfView: emptySelf(), people: { cards: [], filter: [], rows: [], empty: false, emptyText: '' },
    journal: emptyJournal(), atlas: { region: '', image: exact('wutan-overview'), regions: [], pins: [], routes: [], empty: false, emptyText: '', sectors: [], locked: [], world: false },
  };
  if (!sc) return out;
  const lock = busy || !!s.operation.kind;
  const pager = (page, pages, prev, next) => Object.assign(out.scroll, { hasPager: pages > 1, pageText: (page + 1) + ' / ' + pages, prev: page > 0, next: page + 1 < pages });
  if (id === 'self') {
    if (['cult', 'arts', 'body'].includes(tab)) out.scroll.show[tab] = true;
    out.selfView = renderSelf(s, L, tab, lock);
    if (tab === 'arts') pager(s.artsPage, s.artsPages);
  } else if (id === 'people') {
    out.people = renderPeople(s, L, tab, lock);
    out.scroll.show.filter = tab === 'near';
    if (tab === 'near') pager(s.peoplePage, s.peoplePages);
  } else if (id === 'journal') {
    out.journal = renderJournal(s, L, tab, lock);
    out.scroll.show.ledger = tab === 'quests';
    if (tab === 'quests' && s.quests) pager(s.quests.page || 0, s.quests.pages || 1);
    if (tab === 'news') pager(s.cluesPage, s.cluesPages);
  } else if (id === 'atlas') {
    out.atlas = renderAtlas(s, L, tab, lock);
    out.scroll.show.regions = tab === 'region'; out.scroll.show.map = true;
  }
  return out;
}

const emptyNote = () => note('', '');
function emptySelf() { return { realm: '', realmNote: '', xpPct: 0, xpText: '', stats: [], hotbar: [], plan: [], dayChips: [], planWarn: '', planSeal: '', planNote: '', growth: [], books: [], book: emptyNote(), hasBook: false, wounds: [], dots: [], limits: '', bodyNote: '', gear: [], items: [] }; }
function emptyJournal() { return { guide: '', hasGuide: false, discover: [], ledger: [], detail: emptyNote(), hasDetail: false, stamp: '', steps: [], negotiate: false, alternatives: [], helpers: [], notes: [], empty: false, emptyText: '', summary: '', activityForm: false }; }

export function deadlineNote(s, minutes) {
  const due = s.quests?.deadlines ? s.quests.deadlines.filter(q => q.due > 0 && q.due <= s.time + minutes).map(q => '「' + q.title + '」期限 ' + stamp(q.due)) : [];
  return minutes > 0 && due.length ? '此行会越过：' + due.join('、') + '。可先去改约或托人代交。' : '';
}

function renderSelf(s, L, tab, lock) {
  const o = emptySelf();
  if (tab === 'cult') {
    o.realm = s.realm; o.realmNote = (s.primary ? '主修 ' + (s.arts.find(a => a.id === s.primary)?.name || '已学功法') : '尚无主修') + (s.auxiliary?.length ? ' · 辅以 ' + s.auxiliary.length + ' 门' : '') + (s.switching?.kind ? ' · ' + (s.switching.kind === 'learn' ? '研习' : '换修') + '中，' + stamp(s.switching.due) + ' 可成' : '');
    o.xpPct = s.growthNeed ? Math.min(100, Math.round(s.xp / s.growthNeed * 100)) : 0;
    o.xpText = '积累 ' + s.xp + ' / ' + s.growthNeed + (s.xp >= s.growthNeed ? ' · 可以尝试冲关' : '');
    o.stats = [{ id: 'cap', value: String(s.qiCapacity), label: '斗气容量' }, { id: 'qual', value: String(s.qiQuality), label: '斗气质量 · 驱动斗技的力道' }, { id: 'now', value: s.qi + '', label: '此刻斗气' }, { id: 'age', value: s.age + ' 岁', label: s.sex === 'female' ? '女' : '男' }];
    const why = s.injury > 20 ? '伤势未愈' : s.qi < 40 ? '斗气不足四十' : s.xp < s.growthNeed ? '积累未满' : '';
    o.growth = [btn('break', '冲击下一境', token('do', 'breakthrough'), why || '成败由规则决定', 'opt' + (why ? '' : ' primary'), lock || !can(s, 'breakthrough') || !!why),
      btn('refine', '炼制疗伤散', token('do', 'refine'), '药草 2', 'opt', lock || !can(s, 'refine')),
      btn('consume', '服一份疗伤散', token('consume', 'medicine'), has(s, 'medicine') ? '持有 ' + has(s, 'medicine') : '没有', 'opt', lock || !has(s, 'medicine'))];
    const hot = new Set(s.hotbar || []);
    o.hotbar = s.arts.filter(a => hot.has(a.id)).map(a => btn(a.id, a.name, token('book', a.id), '', 'hot', false));
    if (!o.hotbar.length) o.hotbar.push(btn('none', '尚未加入快捷——在法门中挑选斗技', token('tab', 'self', 'arts'), '', 'hot empty', false));
    const kind = L.planKind || 'train';
    o.plan = planKinds.map(([k, label, hint]) => btn(k, label, token('plan', k), hint, 'chip' + (k === kind ? ' on' : ''), k === kind));
    const days = Number(L.days) || 0;
    o.dayChips = [1, 3, 7].map(d => btn('d' + d, d + ' 日', token('days', d), '', 'chip' + (d === days ? ' on' : ''), d === days));
    o.planWarn = deadlineNote(s, days * 1440);
    o.planSeal = ({ train: '闭关', rest: '休养', work: '做工', wait: '等候' })[kind];
    o.planNote = (days > 0 ? days + ' 日' : '填天数') + (kind === 'train' ? ' · 干粮 ' + days : '');
  } else if (tab === 'arts') {
    const typeName = t => ({ basic: '纳气', cultivation: '主修', auxiliary: '辅助', combat: '斗技', formula: '丹方' })[t] || t;
    o.books = s.arts.map(a => ({ id: clip(a.id, 64), name: clip(a.name, 64), tier: clip((a.tier || '').slice(0, 1), 16), sub: clip(typeName(a.type) + (a.known ? ' · ' + a.level + '%' : ' · 未研习'), 128),
      cls: clip('book type-' + a.type + (a.active ? ' active' : '') + (!a.known ? ' sealed' : '') + (a.id === L.art ? ' on' : ''), 64) }));
    const a = s.arts.find(x => x.id === L.art) || null;
    if (a) {
      o.hasBook = true;
      const acts = [];
      if (!a.known) acts.push(btn('learn', '研习', token('learn', a.item), '耗时，资格以规则为准', 'opt primary', lock || !a.eligible));
      else if (a.type === 'cultivation' && !a.active) acts.push(btn('practice', '换修为主修', token('practice', a.id), '一日 · 干粮一份 · 十五斗气', 'opt', lock || !a.eligible));
      else if (a.type === 'auxiliary') acts.push(btn('practice', a.active ? '停用' : '运行', token('practice', a.id), '约一个时辰', 'opt', lock || !a.eligible));
      if (a.known && a.type === 'combat') {
        acts.push(btn('drill', '演练一日', token('drill', a.id), '只长这门的掌握', 'opt', lock || !a.eligible));
        acts.push(btn('hot', a.hotbar ? '移出快捷' : '加入快捷', token('hotbar', a.id), '', 'opt', busy(L)));
      }
      o.book = note(a.id, a.name, [a.source && !/^[a-z]+:/.test(a.source) && '来源：' + a.source, a.type === 'combat' ? '耗气 ' + a.qiCost + ' · 威力 ' + a.power + (a.arms ? ' · 需 ' + a.arms + ' 只手' : '') : a.xpRate ? '修炼 ' + a.xpRate + '% · 回气 ' + a.qiRate + '%' : '', a.reason].filter(Boolean).join('\n'),
        typeName(a.type) + ' · ' + (a.tier || '') + (a.attribute && a.attribute !== 'neutral' ? ' · ' + (({ fire: '火属', wood: '木属', water: '水属', earth: '土属', metal: '金属', wind: '风属', thunder: '雷属', stone: '石属', ice: '冰属' })[a.attribute] || a.attribute) : '') + (a.active ? ' · 运行中' : '') + (a.known ? ' · 掌握 ' + a.level + '%' : ' · 秘籍未拆'), '', 'detail', acts);
    }
  } else if (tab === 'body') {
    const w = s.condition?.wounds || [];
    o.bodyNote = s.name + ' · ' + s.age + ' 岁 · 气血 ' + s.hp + ' · 伤势 ' + s.injury + (s.control?.holder ? ' · 受' + personName(s, s.control.holder) + '看守，自' + stamp(s.control.since) : '');
    o.dots = w.map(x => btn(x.id, partName(x.part) + ' · ' + x.symptom, token('wound', x.id), '', 'dot ' + (partPos[x.part] || 'p-whole') + ' d-' + x.diagnosis + (x.treatedAt >= 0 ? ' treated' : ''), false))
      .concat((s.condition?.missing || []).map(part => btn('m-' + part, partName(part) + '缺失', '', '', 'dot missing ' + (partPos[part] || 'p-whole'), false)));
    o.wounds = w.map(x => note('w-' + x.id, partName(x.part) + ' · ' + diagnosis(x.diagnosis), x.symptom, '程度 ' + x.severity + ' · ' + (x.treatedAt < 0 ? '未处置' : '已处置') + ' · 始于' + stamp(x.started), '', 'note wound',
      x.treatedAt < 0 ? [btn('treat', '求医', token('treat', x.id), '须医者在旁 · 药草 2 · 12 金', 'line', lock || !can(s, 'treat'))] : []))
      .concat((s.condition?.missing || []).map(part => note('m-' + part, partName(part) + '缺失', '普通药物不能让它长回来。', '', '', 'note wound')));
    const limited = (s.condition?.capabilities || []).filter(p => !p.available);
    o.limits = limited.length ? '因此：' + limited.map(p => capability(p.kind) + '——' + p.reason).join('；') : w.length ? '眼下的伤还不妨碍行动。' : '身上没有伤。';
    o.gear = (s.gear || []).map(g => note('g-' + g.id, ({ blade: '兵刃', robe: '衣甲', tool: '工具', talisman: '护符' })[g.type] || g.type, '耐久 ' + g.durability + ' · 余量 ' + g.charges, g.equipped ? '已佩用' : '未佩用', '', 'note gear',
      [btn('equip', g.equipped ? '卸下' : '佩用', token('equip', g.id, g.equipped ? 'remove' : ''), '', 'line', lock), btn('repair', '维修', token('repair', g.id), '', 'line', lock || !can(s, 'repair'))]));
  } else if (tab === 'bag') {
    o.items = (s.inventory || []).filter(i => i.qty > 0).map(i => {
      const art = s.arts.find(a => a.item === i.item && !a.known);
      const acts = [];
      if (i.item === 'medicine') acts.push(btn('use', '服用', token('consume', 'medicine'), '', 'line', lock || !can(s, 'consume')));
      if (art) acts.push(btn('learn', '研习', token('learn', i.item), '', 'line', lock || !can(s, 'learn')));
      return note('i-' + i.item, itemName(i.item), '', '持有 ' + i.qty, '', 'note good' + (itemArt.includes(i.item) ? ' art-' + i.item : ''), acts);
    });
    o.gear = (s.gear || []).map(g => note('g-' + g.id, ({ blade: '兵刃', robe: '衣甲', tool: '工具', talisman: '护符' })[g.type] || g.type, '耐久 ' + g.durability + ' · 余量 ' + g.charges, g.equipped ? '已佩用' : '未佩用', '', 'note gear',
      [btn('equip', g.equipped ? '卸下' : '佩用', token('equip', g.id, g.equipped ? 'remove' : ''), '', 'line', lock)]));
    if (!o.items.length) o.items.push(note('none', '行囊空空', '', '', '', 'note empty'));
  }
  return o;
}
const busy = L => !!L.busy;

function renderPeople(s, L, tab, lock) {
  const o = { cards: [], filter: [], rows: [], empty: false, emptyText: '' };
  if (tab === 'near') {
    const known = s.peopleFilter === 'known';
    o.filter = [btn('nearby', '眼前的人 ' + (s.nearbyTotal ?? ''), token('people-filter', 'nearby'), '', 'seg-btn' + (known ? '' : ' on'), !known), btn('known', '旧识 ' + (s.knownPeopleTotal ?? ''), token('people-filter', 'known'), '', 'seg-btn' + (known ? ' on' : ''), known)];
    o.cards = s.people.map(p => face(p.key, p.name, (statusNames[p.status] || p.status) + ' · ' + (p.status === 'here' ? roleName(p.role) : placeName(p.place) + ' · ' + stamp(p.observedAt || 0)), 'card' + (p.status === 'deceased' ? ' gone' : p.status !== 'here' ? ' stale' : '') + (p.key === L.selected ? ' sel' : ''), portraitOf(p)));
    o.empty = !o.cards.length; o.emptyText = known ? '还没有旧识。' : '眼前没有旁人。';
  } else if (tab === 'home') {
    o.rows = s.family.map(f => note('f-' + f.id, personName(s, f.a) + ' 与 ' + personName(s, f.b), f.children.length ? '子女：' + f.children.map(id => personName(s, id)).join('、') : '尚无子女', ({ active: '共同生活', separated: '已分开' })[f.status] || f.status, '家', 'note',
      f.status === 'separated' ? [] : [btn('dep-g', '存入金', token('allocate', f.id, 'gold', 'deposit'), '', 'line', lock), btn('wd-g', '取用金', token('allocate', f.id, 'gold', 'withdraw'), '', 'line', lock), btn('dep-f', '存入粮', token('allocate', f.id, 'food', 'deposit'), '', 'line', lock), btn('wd-f', '取用粮', token('allocate', f.id, 'food', 'withdraw'), '', 'line', lock)]));
    s.family.forEach((f, i) => { o.rows[i].text += '\n住处 ' + placeName(f.home) + ' · 家用 ' + f.gold + ' 金 / 干粮 ' + f.food; });
    o.empty = !o.rows.length; o.emptyText = '你还没有成家。家是两个人都愿意才会有的。';
  } else if (tab === 'vows') {
    o.rows = s.promises.map(p => note('v-' + p.id, personName(s, p.giver) + ' 应 ' + personName(s, p.receiver), itemName(p.item) + ' ×' + p.qty, ({ open: '待履行', fulfilled: '已履', broken: '失约', expired: '已过期' })[p.status] + ' · 期限 ' + stamp(p.due), p.status === 'fulfilled' ? '履' : p.status === 'broken' ? '失' : '约', 'note vow ' + p.status,
      p.giver === 'player' && p.status === 'open' && p.item !== 'engagement' ? [btn('deliver', '履约', token('social', 'deliver', p.receiver), '', 'line', lock)] : []));
    o.empty = !o.rows.length; o.emptyText = '没有未了的约定。';
  } else if (tab === 'ties') {
    o.rows = (s.social || []).map((p, i) => note('t-' + i, personName(s, p.b), ({ family: '亲属', friend: '朋友', healer: '医者', competitor: '竞争者' })[p.kind] || '相识', ({ known: '本人所知', reported: '听闻', doubted: '存疑', refuted: '已否定' })[p.confidence] + ' · ' + stamp(p.observedAt || p.at || 0), ({ known: '亲', reported: '闻', doubted: '疑', refuted: '否' })[p.confidence] || '录', 'note'));
    o.empty = !o.rows.length; o.emptyText = '还说不上认识谁的亲友。';
  }
  return o;
}

function renderJournal(s, L, tab, lock) {
  const o = emptyJournal();
  if (tab === 'quests') {
    const q = s.quests;
    if (!q) { o.empty = true; o.emptyText = '委托记录尚未读取。'; return o; }
    o.hasGuide = !!q.guide && !q.guide.skipped && !!q.guide.text; o.guide = clip(q.guide?.text, 256);
    o.summary = clip('承接中 ' + (q.counts?.active || 0) + ' · 已了结 ' + (q.counts?.completed || 0) + (q.warnings?.length ? '\n' + q.warnings.join('\n') : ''), 1024);
    o.discover = [btn('notice', '读当地告示', token('quest-discover', 'notice'), '公告与悬赏', 'opt', lock || !can(s, 'quest')), btn('public', '看公开悬赏', token('quest-public'), '', 'opt', lock || !can(s, 'quest')),
      btn('letter', '整理来信', token('quest-discover', 'letter'), '', 'opt', lock || !can(s, 'quest')), btn('witness', '四下留意', token('quest-discover', 'witness'), '亲眼所见', 'opt', lock || !can(s, 'quest'))];
    const filter = L.questFilter || 'all';
    const entries = (q.known || []).filter(e => filter === 'tracked' ? e.tracked : filter === 'active' ? questActive.has(e.status) : filter === 'nearby' ? e.place === s.place : true);
    o.ledger = entries.map(e => note(e.id, (e.tracked ? '★ ' : '') + e.title, '', (questStates[e.status] || e.status) + ' · ' + shortPlace(e.place) + (e.due ? ' · 限' + stamp(e.due) : ''), questSources[e.source] || sourceSeal(e.source || ''), 'lrow' + (e.id === L.quest ? ' on' : '') + (questActive.has(e.status) ? ' active' : ['completed', 'settled'].includes(e.status) ? ' done' : '')));
    const e = entries.find(x => x.id === L.quest) || entries.find(x => questActive.has(x.status)) || entries[0];
    if (e) {
      o.hasDetail = true;
      const acts = (e.options || []).slice(0, 3).map((op, i) => btn('o' + i, op.label, token('quest-option', e.id, i, encodeURIComponent(JSON.stringify([op.detail, op.item || '', op.qty || 0, op.text || '']))), op.text || '', 'line' + (i === 0 ? ' primary' : ''), lock || !!op.disabled));
      acts.push(btn('neg', L.negotiate ? '收起议价' : '议价 / 协作', token('negotiate'), '', 'line', false));
      o.detail = note(e.id, e.title, human(e.terms) + (e.progress ? '\n\n已确认：' + human(e.progress) : ''), (e.issuer ? '委托人 ' + personName(s, e.issuer) + ' · ' : '') + (({ notice: '告示所得', talk: '交谈得知', witness: '亲眼所见', letter: '来信' })[e.source] || e.source || '') + ' · ' + stamp(e.observedAt) + '，最后核实于' + shortPlace(e.place), questSources[e.source] || sourceSeal(e.source || ''), 'contract', acts);
      o.stamp = questStates[e.status] || e.status;
      const order = ['可商议', '承接中', '待验收', '已完成'];
      const at = questActive.has(e.status) ? (e.status === 'ready' ? 2 : 1) : ['completed', 'settled'].includes(e.status) ? 3 : 0;
      o.steps = ['知悉', '承接', '交付', '了结'].map((label, i) => btn('s' + i, label, '', '', 'step' + (i < at ? ' done' : i === at ? ' now' : ''), false));
      void order;
      if ((e.options || []).length > 3) o.notes = e.options.slice(3).map((op, i) => note('more' + i, op.label, op.text || '', '', '', 'note small', [btn('do', op.label, token('quest-option', e.id, i + 3, encodeURIComponent(JSON.stringify([op.detail, op.item || '', op.qty || 0, op.text || '']))), '', 'line', lock || !!op.disabled)]));
      o.negotiate = !!L.negotiate;
      o.alternatives = (e.alternatives?.length ? e.alternatives : (e.options || []).filter(op => op.detail === 'perform').map(op => ({ id: op.item, label: op.label }))).map(a => btn(a.id, a.label, a.id));
    }
    o.helpers = s.people.filter(p => p.alive && p.status === 'here').map(p => btn(p.key, p.name, p.key));
    o.empty = !o.ledger.length; o.emptyText = '还不知道这一带有什么事可做。读读告示、四下看看，或在相处时询问近况。';
  } else if (tab === 'events') {
    const view = s.activities;
    o.activityForm = true;
    o.helpers = s.people.filter(p => p.alive && p.status === 'here').map(p => btn(p.key, p.name, p.key));
    if (!view) { o.empty = true; o.emptyText = '活动记录尚未读取。'; return o; }
    const opt = (owner, i, op) => btn('o' + i, op.label, token('activity-option', owner, i, encodeURIComponent(JSON.stringify([op.detail, op.item || '', op.qty || 0, op.text || '']))), op.text || '', 'line', lock || !!op.disabled);
    for (const [i, op] of (view.openings || []).entries()) o.notes.push(note('open' + i, op.label, op.text || '', '此地 · ' + shortPlace(s.place), '告', 'note event', [opt('opening', i, op)]));
    for (const a of view.instances || []) {
      const phase = a.type === 'exam' ? ['材料处理', '控火提炼', '融合成丹', '验收'][a.stage] || '结果' : a.type === 'auction' ? '竞价第 ' + a.round + ' 轮' : '第 ' + (a.stage + 1) + ' 阶段';
      const body = a.type === 'auction' ? itemName(a.item) + ' ×' + a.quantity + '\n当前价 ' + a.price + ' 金 · ' + ({ buyer: '你在竞买', seller: '你在寄售', agent: '你受托代拍', proxy: '你受托代拍' })[a.role] + (a.budget ? ' · 授权预算 ' + a.budget + ' 金' : '') : '材料 ' + a.material + ' · 已耗 ' + a.spent + ' · 评分 ' + a.score + (a.combatDependency ? '\n' + a.combatDependency : '');
      o.notes.push(note('ins-' + a.id, a.title, (a.summary ? a.summary + '\n' : '') + body, shortPlace(a.place) + ' · ' + phase + ' · ' + (questStates[a.status] || a.status), '亲', 'note event live', (a.options || []).slice(0, 4).map((op, i) => opt(a.id, i, op))));
    }
    for (const [i, c] of (view.certificates || []).entries()) o.notes.push(note('cert' + i, '已获资格', c.title || ({ 'basic-alchemist': '基础药师认证' })[c.kind] || c.kind || '资格', '', '印', 'note'));
    for (const [i, h] of (view.history || []).entries()) o.notes.push(note('hist' + i, '已结束 · ' + (questStates[h.status] || h.status), h.text, '', '录', 'note done'));
    o.summary = '报名、出价与操作都会推进时间；只看不算报名。';
    o.empty = !o.notes.length; o.emptyText = '此地眼下没有可参与的活动。拍卖在米特尔拍卖分号，考核在炼药师公会，试炼与交流在家族、佣兵场所和茶棚。';
  } else if (tab === 'news') {
    if (s.result?.code === 'recalled') o.notes.push(note('recalled', '全文', s.result.text, '', '录', 'note full'));
    o.notes.push(...s.clues.map(p => note('c-' + p.id, clueName(p.kind), p.text, p.source + ' · ' + stamp(p.at), clueSeal[p.kind] || sourceSeal(p.source), 'note clue' + (p.kind === 'novel_memory' ? ' memory' : ''), [btn('recall', '翻看全文', token('recall', p.id), '', 'line', lock)])));
    o.notes.push(...s.opportunities.map(p => note('op-' + p.id, '机缘 · ' + itemName(p.id), p.text, ({ reported: '线索所述', obtained: '已取得', claimed: '已被取得' })[p.state] || p.state, '缘', 'note opp' + (p.state === 'obtained' ? ' done' : ''),
      p.state === 'obtained' ? [] : [btn('try', p.id === 'redleaf' ? '尝试采集' : '尝试取得', token(p.id === 'redleaf' ? 'gather' : 'claim', p.id), '', 'line', lock)])));
    o.discover = [btn('inv', '调查此地', token('do', 'investigate'), '', 'opt', lock || !can(s, 'investigate')), btn('gather', '采集药草', token('gather', 'herb'), '', 'opt', lock || !can(s, 'gather')), btn('wild', '寻魔兽踪迹', token('wildlife'), '发现不等于出手', 'opt', lock || !can(s, 'investigate'))];
    o.empty = !o.notes.length; o.emptyText = '还没有听到什么。';
  } else if (tab === 'mail') {
    o.notes = s.messages.map(m => note('m-' + m.id, '来自 ' + personName(s, m.sender), m.summary, stamp(m.at) + (m.status ? ' · ' + m.status : ''), '信', 'note letter', m.event ? [btn('ev', '相关往事', token('event', m.event, 0), '', 'line', lock)] : []));
    o.empty = !o.notes.length; o.emptyText = '还没有书信。寄信可在相处时的「情谊」里写。';
  } else if (tab === 'past') {
    if (s.result?.code === 'event_read') { try { const e = JSON.parse(s.result.text); o.notes.push(note('detail', '往事详情', e.details.join('\n'), (e.page + 1) + ' / ' + e.pages, '录', 'note full', [e.page > 0 && btn('p', '前一页', token('event', e.id, e.page - 1), '', 'line', lock), e.page + 1 < e.pages && btn('n', '后一页', token('event', e.id, e.page + 1), '', 'line', lock)].filter(Boolean))); } catch { /* not event JSON */ } }
    o.notes.push(...s.events.map(e => note('e-' + e.id, stamp(e.at), e.summary, '', '录', 'note', [btn('read', '细看', token('event', e.id, 0), '', 'line', lock)])));
    if (s.result?.steps?.length) o.notes.push(...s.result.steps.map((p, i) => note('st' + i, '行程 · ' + (opNames[p.kind] || p.kind), p.text, (p.accepted ? '已成' : '未成') + ' · ' + span(p.spent), '亲', 'note small')));
    o.notes.push(...(s.workshops || []).map(w => note('w-' + w.id, '当地生产 · ' + shortPlace(w.place), '累计产出 ' + w.output, w.status === 'active' ? '运转中' : w.status, '闻', 'note small')));
    o.empty = !o.notes.length; o.emptyText = '还没有记下的往事。';
  }
  return o;
}

function renderAtlas(s, L, tab, lock) {
  const o = { region: '', image: exact('wutan-overview'), regions: [], pins: [], routes: [], empty: false, emptyText: '', sectors: [], locked: [], world: false };
  if (tab === 'world') {
    o.world = true; o.region = 'world'; o.image = exact('map-douqi-world');
    o.sectors = ATLAS_SECTORS.map(g => btn(g.id, g.name, '', WORLD_ATLAS.some(n => n.parent === g.id && n.unlocked) ? '已踏足部分' : '尚未踏足', clip('sector ' + g.className, 96), false));
    o.locked = ATLAS_SECTORS.map(g => ({ g, names: WORLD_ATLAS.filter(n => n.parent === g.id && !n.unlocked).map(n => n.name) })).filter(x => x.names.length).map(x => note(x.g.id, x.g.name, x.names.join('、'), '尚未踏足', '', 'note locked'));
    return o;
  }
  const here = placeOf(s.place)?.region;
  const unlocked = WORLD_ATLAS.filter(n => n.unlocked);
  const region = L.atlasRegion && unlocked.some(n => n.region === L.atlasRegion) ? L.atlasRegion : here;
  o.region = region; o.image = exact(REGIONS.find(r => r.id === region)?.overview || 'map-first-regions');
  o.regions = unlocked.map(n => btn(n.region, n.name, token('atlas-region', n.region), (n.region === here ? '你在此 · ' : '') + s.known.filter(id => placeOf(id)?.region === n.region).length + ' 处', 'seg-btn' + (n.region === region ? ' on' : ''), n.region === region));
  const known = s.known.filter(id => placeOf(id)?.region === region);
  if (region === 'wutan') o.pins = known.filter(id => facilityHotspots[id]).map(id => { const [x, y] = facilityHotspots[id]; return btn(id, shortPlace(id), token('dest', id), '', 'pin x' + x + ' y' + y + (id === s.place ? ' here' : id === L.destination ? ' on' : ''), false); });
  const sorted = known.slice().sort((a, b) => Number(b === L.destination) - Number(a === L.destination));
  o.routes = sorted.map(id => {
    const route = ROUTES.find(r => r.from === s.place && r.to === id), current = id === s.place;
    const via = !current && !route ? firstHop(s.place, id, s.known) : '';
    const meta = current ? '你在此' : route ? span(route.ticks) + ' · 干粮 ' + Math.floor(route.ticks / 1440) : via ? '需先经' + shortPlace(via) : '尚无已知道路';
    const warn = route ? deadlineNote(s, route.ticks) : '';
    const acts = current ? [] : route ? [btn('go', route.ticks >= 1440 ? '启程' : '前往', token('travel', id), span(route.ticks), 'seal-line', lock || !can(s, 'travel'))] : via ? [btn('via', '先去' + shortPlace(via), token('travel', via), '', 'line', lock || !can(s, 'travel'))] : [];
    return note('r-' + id, placeName(id), (placeOf(id)?.description || '') + (warn ? '\n' + warn : ''), meta, '', 'note route' + (id === L.destination ? ' on' : '') + (current ? ' here' : '') + (warn ? ' warn' : ''), acts);
  });
  o.empty = !o.routes.length; o.emptyText = '这片地方你还没找到路。沿已知道路走一走，地名会出现在这里。';
  return o;
}
function firstHop(from, to, known) {
  const queue = [{ place: from, first: '' }], seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) for (const r of ROUTES.filter(r => r.from === queue[i].place && known.includes(r.to))) {
    if (seen.has(r.to)) continue; const first = queue[i].first || r.to;
    if (r.to === to) return first; seen.add(r.to); queue.push({ place: r.to, first });
  }
  return '';
}

function renderBattle(s, L, active, busy) {
  const e = s.combat, B = L.battle || {};
  const o = { title: '', objective: '', phase: '', choosing: false, locked: false, ended: false, fighters: [], hotbar: [], library: [], minor: [], allies: [], orders: [], moveText: '', targetText: '', actionText: '', reason: '', log: [], sealDisabled: true, offerOpen: false, result: '', remains: [], remainsPage: '', remainsPrev: false, remainsNext: false, page: '' };
  if (!e?.id) { o.title = '现场遗留'; o.ended = true; appendRemains(o, s, busy); return o; }
  const phaseNames = { choice: '选择行动', collecting: '各方正在决定', resolving: '依次结算', world: '世事随之推进', cleanup: '整理战后', closed: '交锋已结束' };
  o.title = '第 ' + e.round + ' 轮'; o.phase = phaseNames[e.phase] || e.phase;
  const mine = sideOf(s, 'player');
  const allies = e.participants.filter(p => p.side === mine && p.id !== 'player' && p.status === 'active').length + 1;
  const foes = e.participants.filter(p => p.side !== mine && p.side !== 'neutral' && p.status === 'active').length;
  o.objective = (e.objective ? '目标：' + (({ disengage: '脱身或制住对手', protect: '护人到出口', proof: '完成约定演武', spar: '切磋' })[e.objective] || e.objective) + ' · ' : '') + '我方 ' + allies + ' · 对方 ' + foes;
  o.page = e.pages > 1 ? '参战者 ' + (e.page + 1) + '/' + e.pages : '';
  o.log = e.log.slice(-6).reverse().map((p, i) => ({ id: 'g' + i, text: clip('第' + p.round + '轮 · ' + p.text, 512), cls: 'bl ' + (p.code || '') }));
  o.choosing = active && e.phase === 'choice' && s.alive;
  o.locked = active && e.phase !== 'choice';
  o.ended = !active;
  const lock = busy;
  const tech = id => e.techniques.find(t => t.id === id);
  const hot = new Set(s.hotbar || []);
  const quick = e.techniques.filter(t => hot.has(t.id));
  (quick.length ? quick : e.techniques.slice(0, 4)).forEach(t => o.hotbar.push(btn(t.id, t.name, token('b-tech', t.id), t.qiCost + ' 气' + (t.radius ? ' · 范围' + t.radius : t.range ? ' · 距' + t.range : '') + (t.reason ? ' · ' + t.reason : ''), 'skill' + (B.kind === 'technique' && B.item === t.id ? ' on' : '') + (t.reason ? ' dim' : ''), lock)));
  o.hotbar.unshift(btn('attack', '出手', token('b-act', 'attack'), '普通攻击', 'skill' + (B.kind === 'attack' ? ' on' : ''), lock));
  o.library = e.techniques.map(t => btn(t.id, t.name + ' · ' + t.qiCost + '气' + (t.reason ? ' · ' + t.reason : ''), t.id));
  o.minor = [['guard', '防守'], ['breathe', '调息'], ['consume', '服药'], ['rescue', '救援'], ['retreat', '撤离'], ['surrender', '投降…'], ['accept', '受降'], ['negotiate', '停战…'], ['prepare', '蓄势']].map(([k, label]) => btn(k, label, token('b-act', k), '', 'minor' + (B.kind === k ? ' on' : '') + (['retreat', 'surrender'].includes(k) ? ' warn' : ''), lock));
  o.allies = e.participants.filter(p => p.id !== 'player' && p.side === mine && p.status === 'active').map(p => btn(p.id, p.name, p.id));
  const target = e.participants.find(p => p.id === B.target);
  o.moveText = B.x >= 0 ? '走到 ' + B.x + '，' + B.y : '原地（点金色格可移动两步）';
  o.targetText = target ? target.name : '点选一名参战者';
  const t = B.kind === 'technique' ? tech(B.item) : null;
  o.actionText = B.kind ? (t ? t.name : ({ attack: '出手', guard: '防守', breathe: '调息', consume: '服药', rescue: '救援', retreat: '撤离', surrender: '投降', accept: '受降', negotiate: '请求停战', prepare: '蓄势' + (tech(B.item)?.name ? '·' + tech(B.item).name : '') })[B.kind]) : '选一种行动';
  const affected = t?.radius && B.x >= 0 ? e.participants.filter(p => Math.abs(p.x - B.x) + Math.abs(p.y - B.y) <= t.radius).map(p => p.name) : [];
  o.reason = clip((t?.reason || '') + (affected.length ? (t?.reason ? '；' : '') + '范围内：' + affected.join('、') + '——群体斗技不分敌我。' : ''), 512);
  o.offerOpen = B.kind === 'surrender';
  o.sealDisabled = lock || !o.choosing || !(B.kind || B.x >= 0);
  if (o.ended) {
    o.result = clip(({ protected: '护送的人已抵出口。', protection_failed: '没能把人护送出去。', proof_completed: '约定的演武已结束。', proof_stopped: '演武中途停了。', contact_ended: '这一场接触结束了。' })[e.result] || (e.winner ? (e.winner === mine ? '你这一方占了上风。' : '你这一方落了下风。') : '交锋已结束。'), 512) + (s.alive ? '' : '');
    appendRemains(o, s, lock);
  }
  return o;
}

function appendRemains(o, s, lock) {
    const r = s.remains;
    if (r) {
      for (const p of r.rows) {
        o.remains.push(note('r-' + p.id, p.name + '的遗留', p.opened ? (p.items.length ? '财物仍在原处。' : '没有可携带的东西。') : '须走近查验。', p.x + '，' + p.y + (p.heir ? ' · 你有继承资格' : ''), '', 'note remain',
          [btn('a', p.near ? '查验 · 一刻' : '走过去', token(p.near ? 'search' : 'remains-approach', p.id), '', 'line', lock || !!s.operation.kind || !can(s, 'search')), p.heir && p.opened ? btn('h', '领取遗产', token('inherit', p.id), '', 'line', lock) : null].filter(Boolean)));
        for (const item of p.items) o.remains.push(note('r-' + p.id + '-' + item.id, item.name, '', '现场 ' + item.qty, '', 'note small', [btn('l', '取用', token('loot', p.id, item.id), '', 'line', lock || !can(s, 'loot'))]));
      }
      o.remainsPage = r.total ? '可见遗留 ' + r.total + ' · ' + (r.page + 1) + '/' + r.pages : '现场没有遗留。';
      o.remainsPrev = r.page > 0; o.remainsNext = r.page + 1 < r.pages;
    }
}

function renderPassage(s, L) {
  const op = s.operation || {}, P = L.passage || {};
  const title = op.kind === 'travel' ? '往' + shortPlace(op.target) : (opNames[op.kind] || P.title || '光阴流转');
  const from = P.from || '', to = op.kind === 'travel' ? shortPlace(op.target) : op.end ? stamp(op.end) : '';
  const startAt = P.startAt ?? s.time, total = Math.max(1, (op.end || s.time) - startAt);
  const pct = op.kind ? Math.max(2, Math.min(100, Math.round((s.time - startAt) / total * 100))) : 100;
  return {
    title: clip(P.title || (op.kind ? title : '一段光阴'), 128), from: clip(P.to || op.kind === 'travel' ? from : stamp(startAt), 64), to: clip(op.kind ? to : P.to || stamp(s.time), 64), pct,
    eta: clip(op.kind ? '此刻 ' + stamp(s.time) + (op.end > s.time ? ' · 预计 ' + stamp(op.end) : '') : '停在 ' + stamp(s.time) + ' · ' + shortPlace(s.place), 128),
    notes: (P.notes || []).slice(-12).reverse().map((n, i) => note('n' + i, '', n.text, n.meta, n.src || '亲', 'drop')),
    running: !!L.autoAdvance, stopQueued: !!L.stopAdvance,
    status: clip(L.stopAdvance ? '正在停手，等这一步落定。' : L.autoAdvance ? '光阴流转中……随时可以停手。' : op.kind ? '暂停中。可以继续，也可以就此打住。' : '这段光阴过去了。', 256),
    canContinue: !!op.kind && !L.autoAdvance,
  };
}

function renderMenu(L) {
  const saves = (L.saves || []).map(p => note('s-' + p.saveId, p.displayName || '未题名的存档', '', '存于 ' + saveDate(p.createdAt), '', 'note save', [btn('load', '读此档', token('restore', p.saveId), '', 'line', !!L.busy)]));
  return { saves, note: clip(L.savesError || (saves.length ? '读档会让整个世界回到那一刻。' : '命册里还没有存档。'), 512), more: !!L.savesCursor,
    generation: ({ idle: '眼下没有在生成的表达', preparing: '正在准备表达', streaming: '正在表达', finalizing: '正在收尾', cancelling: '正在停止', failed: '上一段表达没有完成' })[L.generation] || '表达状态待核对' };
}
function saveDate(value) { return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : String(value || ''); }

// Flat packing for the 256-node Native state budget. The rich region objects
// from view.js are mapped onto a handful of shared lists; the active layer
// owns rowsA–D, and everything else is shown or hidden by stage class tokens.
import { render } from './view.js';

const exact = id => ({ kind: 'exact', id: String(id || 'local-su').slice(0, 64) });
const clip = (v, n) => String(v ?? '').slice(0, n);
const noPic = exact('local-su');
const R = (k, t = '', s = '', x = '', p = '', v = '', b = '', c = '', d = false, img = '') =>
  ({ k: clip(k, 96), t: clip(t, 256), s: clip(s, 4096), x: clip(x, 256), p: clip(p, 8), v: clip(v, 512), b: clip(b, 64), c: clip(c + (img ? '' : ' noimg'), 128), d: !!d, m: img ? exact(img) : noPic });
const fromBtn = (x, prefix = '') => R(prefix + x.id, x.label, x.note, '', '', x.value, '', x.cls, x.disabled);
const fromFace = (x, value) => R(x.id, x.name, x.meta, '', '', value, '', x.cls, false, x.hasImage ? x.image.id : '');
function fromNotes(list) {
  const out = [];
  for (const n of list) {
    const [first, ...rest] = n.actions || [];
    const art = /art-([a-z]+)/.exec(n.cls)?.[1];
    out.push(R(n.id, n.title, n.text, n.meta, n.src, first?.value || '', first?.label || '', n.cls, first?.disabled, art ? 'item-' + art : ''));
    rest.forEach((a, i) => out.push(R(n.id + '~' + i, '', '', '', '', a.value, a.label, 'act-only', a.disabled)));
  }
  return out;
}
const opt = x => ({ k: clip(x.id, 64), t: clip(x.label, 128), v: clip(x.value, 128) });
const brk = (k, label, c = '') => R(k, label, '', '', '', '', '', 'brk ' + c);

export function flat(s, L) {
  const v = render(s || { created: false }, L), ui = v.ui;
  const out = {
    stage: '', status: ui.statusText, busy: !!L.busy, sealDisabled: true, stopQueued: !!L.stopAdvance, confirmDisabled: !!v.confirm?.disabled,
    rowsA: [], rowsB: [], rowsC: [], rowsD: [], optsA: [], optsB: [], tabs: [], log: [],
    bigTitle: '', bigNote: '', barPct: 0, barText: '', dTitle: '', dMeta: '', dText: '', dStamp: '', emptyText: '', pageText: '',
  };
  const cls = [ui.stageClass];
  if (!s?.created) {
    out.rowsB = v.create.backgrounds.map(b => fromBtn(b));
    out.bigNote = v.create.summary;
    cls.push('o-' + (L.createOrigin || 'native'), 'x-' + (L.createSex || 'female'));
    if (L.busy) cls.push('busy');
    out.stage = cls.join(' ');
    return { state: out, ui };
  }
  const h = v.hud;
  Object.assign(out, { place: h.place, region: h.region, back: h.back, clock: h.shichen, day: h.day + ' · ' + h.sky, doing: h.doing, dial: h.dialAngle,
    name: h.name + '　' + h.realm, hpText: h.hpText, hpPct: h.hpPct, qiText: h.qiText, qiPct: h.qiPct, purse: [h.gold, h.food, h.alert].filter(Boolean).join('\n'), face: h.hasFace ? h.face : noPic });
  if (h.canBack) cls.push('can-back');
  if (h.hasFace) cls.push('has-face');
  if (L.layer === 'scroll') cls.push('on-' + L.scrollId);
  if (h.journalNew) cls.push('journal-new');
  const sc = v.scene;
  Object.assign(out, { sceneImage: sc.image, artClass: sc.artClass, sceneNote: sc.note });
  if (sc.missing) cls.push('scene-missing');
  out.cells = sc.cells.map(c => ({ k: c.id, c: c.cls, l: c.label, d: c.disabled }));
  out.pieces = [...sc.hotspots.map(x => fromBtn(x)), ...sc.objects.map(x => fromBtn(x, 'o-')),
    ...sc.markers.map(x => R('m-' + x.id, x.name, x.meta, '', '', 'person|' + x.id, '', x.cls, false, x.hasImage ? x.image.id : ''))];
  const pr = v.present;
  Object.assign(out, { presentTitle: pr.title, presentSwitch: pr.knownLabel, presentEmpty: pr.empty ? pr.emptyText : '', presentPage: pr.page,
    recentMeta: v.recent.meta, recentText: v.recent.text, target: v.recent.target });
  out.dock = pr.showPlaces ? pr.places.map(x => R(x.id, x.label, '', x.note, '', x.value, '', x.cls, x.disabled)) : pr.rows.map(x => fromFace(x, 'face|' + x.id));
  if (pr.prev) cls.push('dock-prev'); if (pr.next) cls.push('dock-next'); if (pr.showPlaces) cls.push('dock-places');
  if (v.recent.stale) cls.push('s-retarget');
  if (v.recent.hasNarration) cls.push('has-narration');
  if (ui.talk) {
    const t = v.talk;
    Object.assign(out, { talkName: t.name, talkInfo: [t.role, t.doing, t.signs].filter(Boolean).join('\n'), talkWhere: t.place + (t.distance ? ' · ' + t.distance : ''), portrait: t.hasImage ? t.image : noPic, talkReason: t.reason });
    out.log = t.log.map(l => ({ k: l.id, c: l.cls, t: l.who, s: l.text }));
    out.rowsA = [...t.common.map(x => fromBtn(x)), ...(t.giftOpen ? [brk('brk-g', '赠礼'), ...t.gifts.map(x => fromBtn(x))] : []),
      ...(t.bondOpen ? [brk('brk-b', '情谊'), ...t.bond.map(x => fromBtn(x))] : []),
      ...(t.fightOpen ? [brk('brk-f', '动手', 'danger'), ...t.fight.map(x => fromBtn(x))] : [])];
    if (t.hasImage) cls.push('has-portrait'); if (t.canHear) cls.push('can-hear'); if (t.letterOpen) cls.push('letter-open'); if (t.teachOpen) cls.push('teach-open');
  } else if (ui.trade) {
    out.tradeTitle = v.trade.title; out.tradeNote = v.trade.gold + '　' + v.trade.hint;
    out.rowsA = fromNotes(v.trade.shelf); out.rowsB = fromNotes(v.trade.bag);
  } else if (ui.scroll) {
    const so = v.scroll;
    cls.push('sc-' + L.scrollId, 'tab-' + so.tab);
    Object.assign(out, { scrollTitle: so.title, scrollError: so.error, pageText: so.hasPager ? so.pageText : '' });
    out.tabs = so.tabs.map(x => fromBtn(x));
    if (so.hasPager) cls.push('has-pager'); if (so.prev) cls.push('pg-prev-on'); if (so.next) cls.push('pg-next-on');
    packScroll(out, cls, v, L, so.tab);
  } else if (ui.battle) {
    const b = v.battle;
    out.battleHead = [b.title, b.phase, b.objective, b.page].filter(Boolean).join('　·　');
    out.battleLine = b.choosing ? '移动：' + b.moveText + '　目标：' + b.targetText + '　行动：' + b.actionText : b.phase;
    out.battleReason = b.reason; out.sealDisabled = b.sealDisabled; out.dTitle = b.result;
    out.rowsA = [...b.hotbar, ...b.minor].map(x => R(x.id, x.label, x.note, x.note, '', x.value, '', x.cls, x.disabled));
    out.optsA = b.library.map(opt); out.optsB = b.allies.map(opt);
    out.log = b.log.map(l => ({ k: l.id, c: l.cls, t: '', s: l.text }));
    out.rowsB = fromNotes(b.remains); out.pageText = b.remainsPage;
    cls.push(b.choosing ? 'b-choose' : b.locked ? 'b-locked' : 'b-ended');
    if (b.offerOpen) cls.push('b-offer'); if (b.remains.length) cls.push('b-remains'); if (b.remainsPrev) cls.push('r-prev-on'); if (b.remainsNext) cls.push('r-next-on'); if (b.allies.length) cls.push('b-allies');
  } else if (ui.passage) {
    const p = v.passage;
    Object.assign(out, { bigTitle: p.title, passFrom: p.from, passTo: p.to, barPct: p.pct, bigNote: p.eta, barText: p.status });
    out.rowsA = p.notes.map(n => R(n.id, '', n.text, n.meta, n.src, '', '', 'drop'));
    if (p.canContinue) cls.push('s-pcont'); if (s.operation?.kind) cls.push('s-running');
  } else if (ui.menu) {
    out.menuNote = v.menu.note + '\n' + v.menu.generation;
    out.rowsA = fromNotes(v.menu.saves);
    if (v.menu.more) cls.push('menu-more-on');
  }
  if (ui.confirm) Object.assign(out, { cTitle: v.confirm.title, cText: v.confirm.text, cSeal: v.confirm.seal });
  if (L.unresolved) cls.push('unresolved'); if (L.busy) cls.push('busy');
  out.stage = cls.join(' ');
  return { state: out, ui };
}

function packScroll(out, cls, v, L, tab) {
  const id = L.scrollId;
  if (id === 'self') {
    const o = v.selfView;
    if (tab === 'cult') {
      Object.assign(out, { bigTitle: o.realm, bigNote: o.realmNote, barPct: o.xpPct, barText: o.xpText, planWarn: o.planWarn, planSeal: o.planSeal, planNote: o.planNote });
      out.rowsD = o.stats.map(x => R(x.id, x.value, x.label, '', '', '', '', 'stat'));
      out.rowsC = o.growth.map(x => fromBtn(x));
      out.rowsB = o.hotbar.map(x => R(x.id, x.label, '', '', '', x.value, '', x.cls, x.disabled));
      out.rowsA = [...o.plan.map(x => fromBtn(x)), brk('brk', ''), ...o.dayChips.map(x => fromBtn(x))];
    } else if (tab === 'arts') {
      out.rowsB = o.books.map(x => R(x.id, x.name, x.sub, '', x.tier, 'book|' + x.id, '', x.cls));
      if (o.hasBook) { cls.push('has-detail'); Object.assign(out, { dTitle: o.book.title, dMeta: o.book.meta, dText: o.book.text }); out.rowsD = o.book.actions.map(x => fromBtn(x)); }
      out.emptyText = o.books.length ? (o.hasBook ? '' : '从书架上取一本来看。') : '还没有学会或持有任何法门。';
    } else if (tab === 'body') {
      cls.push('has-detail');
      Object.assign(out, { dTitle: '身体', dMeta: o.bodyNote, dText: o.limits });
      out.rowsB = o.dots.map(x => fromBtn(x));
      out.rowsA = fromNotes([...o.wounds, ...o.gear]);
    } else if (tab === 'bag') {
      out.rowsA = fromNotes([...o.gear, ...o.items]);
    }
  } else if (id === 'people') {
    const o = v.people;
    out.rowsC = o.filter.map(x => fromBtn(x));
    out.rowsB = o.cards.map(x => fromFace(x, 'face|' + x.id));
    out.rowsA = fromNotes(o.rows);
    out.emptyText = o.empty ? o.emptyText : '';
  } else if (id === 'journal') {
    const o = v.journal;
    if (o.hasGuide) { cls.push('guide-on'); out.barText = o.guide; }
    out.rowsC = o.discover.map(x => fromBtn(x));
    out.rowsB = o.ledger.map(n => R(n.id, n.title, n.meta, '', n.src, 'ledger|' + n.id, '', n.cls));
    if (o.hasDetail) {
      cls.push('has-detail'); Object.assign(out, { dTitle: o.detail.title, dMeta: o.detail.meta, dText: o.detail.text, dStamp: o.stamp });
      out.rowsD = o.detail.actions.map(x => fromBtn(x));
    }
    if (o.negotiate) cls.push('neg-open'); if (o.activityForm) cls.push('s-actform');
    out.optsA = o.alternatives.map(opt); out.optsB = o.helpers.map(opt);
    out.rowsA = fromNotes(o.notes);
    out.bigNote = o.summary;
    out.emptyText = o.empty ? o.emptyText : '';
  } else if (id === 'atlas') {
    const o = v.atlas;
    out.mapImage = o.image;
    out.rowsC = o.regions.map(x => fromBtn(x));
    out.rowsB = o.world ? o.sectors.map(x => R(x.id, x.label, x.note, '', '', '', '', x.cls, true)) : o.pins.map(x => fromBtn(x));
    out.rowsA = fromNotes(o.world ? o.locked : o.routes);
    out.emptyText = o.empty ? o.emptyText : '';
  }
}

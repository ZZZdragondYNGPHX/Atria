import { PLACES, ITEMS, ROUTES } from './catalog.js';

const modes = ['world', 'growth', 'body', 'inventory', 'relations', 'clues', 'combat', 'activity', 'saves', 'host'];
const titles = { world: '山河', growth: '功法与修行', body:'身体与器物', inventory: '行囊与商铺', relations: '人间', clues: '见闻', combat: '交锋', activity: '行程', saves: '世界存档', host: '菜单' };
const verbs = { train: '闭关修炼', rest: '休息疗养', wait: '等候', work: '做工', breakthrough: '尝试突破', refine: '炼制疗伤散', consume: '服用疗伤散', learn: '研习', travel: '出发', buy: '购入', sell: '售出', gift: '赠礼', invite: '邀请同行', promise: '作出约定', deliver: '履约', care: '照护', confess: '表达心意', engage: '商议婚约', marry: '建立家庭', conceive: '商议养育', separate: '结束共同生活', teach: '传授', attack: '攻击', technique: '施展当前斗技', practice:'换修功法',equip:'调整装备',repair:'维修器物',treat:'求医处置', guard: '防守', retreat: '撤退', surrender: '投降', investigate: '调查', gather: '采集', claim: '取得遗留物', allocate: '分配物资' };
const skillNames = { basic: '基础功法', palm: '碎石掌', formula: '基础丹方', refining: '炼药控火' };
const activityNames = { ...verbs, move: '移动', plan: '顺序计划', appraise: '整理交往经历', catchup: '结清已到期事件' };
const statusNames = { here: '在场', last_known: '旧观察', deceased: '已知死亡', open: '待履行', fulfilled: '已履行', broken: '已失约', expired: '已过期', active: '共同生活', separated: '已分离', reported: '线索所述', obtained: '已取得' };
const put = (c, key, value) => c.set('component.' + key, value);
const placeName = id => PLACES.find(p => p.id === id)?.name || id || '未知地点';
const itemName = id => ITEMS.find(p => p.id === id)?.name || ({ gold: '金币', engagement: '婚约' })[id] || id;
const personName = (s, id) => id === 'player' ? s.name || '你' : s.people.find(p => p.key === id)?.name || '已知人物（' + id + '）';
const stamp = minutes => '第 ' + (Math.floor(minutes / 1440) + 1) + ' 日 ' + String(Math.floor(minutes / 60) % 24).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
const duration = minutes => minutes >= 1440 ? (minutes / 1440) + ' 日' : minutes >= 60 ? (minutes / 60) + ' 小时' : minutes + ' 分钟';
const row = (id, title, text = '', meta = '', primary = '', primaryValue = '', secondary = '', secondaryValue = '', disabled = false) => ({ id, title, text, meta, primary, primaryValue, secondary, secondaryValue, disabled, className: 'panel-row', hasImage: false, image: { kind: 'exact', id: 'item-food' } });
const itemImage = (entry, item) => ['food', 'herb', 'redleaf', 'medicine', 'manual', 'technique', 'formula', 'relic'].includes(item)
  ? { ...entry, className: 'panel-row panel-item-row', hasImage: true, image: { kind: 'exact', id: 'item-' + item } } : entry;
const token = (...parts) => parts.join('|');
const action = (kind, fields = {}) => ({ kind, target: '', item: '', qty: 0, x: 0, y: 0, detail: '', text: '', steps: [], ...fields });
const binding = kind => ['travel', 'train', 'wait', 'rest', 'marry', 'conceive', 'attack', 'technique', 'work'].includes(kind) ? 'choice' : 'act';
const ready = (s, kind, context) => !context.busy && s.created && s.actions.includes(kind);
function firstHop(from, to, known) {
  const queue = [{ place: from, first: '' }], seen = new Set([from]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const route of ROUTES.filter(r => r.from === current.place && known.includes(r.to))) {
      if (seen.has(route.to)) continue;
      const first = current.first || route.to;
      if (route.to === to) return first;
      seen.add(route.to); queue.push({ place: route.to, first });
    }
  }
  return '';
}
let confirmation = null;
const safeHostIntent = intent => intent?.kind === 'host' && ['reload', 'recover', 'exit'].includes(intent.binding);

/** Public projection -> presentation only. No writes, invented balances or NPC private reads. */
export function renderPanels(c, screen, context = {}) {
  const s = screen, mode = context.mode === undefined ? c.state.panelMode : context.mode;
  let rows = [], summary = '', empty = '暂无记录', pageLabel = '', prev = true, next = true;
  const selected = c.state.panelTarget || context.selectedTarget || '';
  const target = s.people.find(p => p.key === selected);
  const locked = !!context.busy || !!c.state.busy;
  const can = kind => ready(s, kind, { busy: locked });
  if (mode === 'world') {
    summary = placeName(s.place);
    rows = s.known.slice().sort((a, b) => Number(b === context.destination) - Number(a === context.destination)).map(id => {
      const route = ROUTES.find(r => r.from === s.place && r.to === id);
      const current = id === s.place;
      // These are authored public routes. Hidden places never enter the list.
      const via = !current && !route ? firstHop(s.place, id, s.known) : '';
      const meta = current ? '当前位置' : route ? duration(route.ticks) + ' · 干粮 ' + Math.floor(route.ticks / 1440) + ' 份' : via ? '先经 ' + placeName(via) : '暂无已知路线';
      return row('place-' + id, (id === context.destination ? '已选 · ' : '') + placeName(id), '', meta, current ? '' : '前往', token('travel', id), '', '', current || !route || !can('travel'));
    });
    empty = '尚无已知地点';
  } else if (mode === 'growth') {
    summary = s.name + ' · ' + rankName(s.rank) + ' · ' + s.age + ' 岁\n气血 ' + s.hp + '　斗气 ' + s.qi + '　伤势 ' + s.injury;
    rows = s.arts.map(p => row('art-'+p.id,p.name,({cultivation:'功法',combat:'斗技',formula:'丹方'})[p.type]+' · '+p.tier+' · '+p.attribute,
      (p.known?'掌握 '+p.level:'持有秘籍，尚未研习')+(p.active?' · 当前修习':'')+(p.type==='cultivation'?' · 修为 '+p.xpRate+'% / 斗气 '+p.qiRate+'%':p.type==='combat'?' · 耗气 '+p.qiCost+' / 威力 '+p.power:'')+(p.eligible?'':' · 当前条件不符'),
      p.known?(p.active?'':'换修'):'研习',token(p.known?'practice':'learn',p.known?p.id:p.item),'','',locked||!p.eligible||!!s.operation.kind));
    empty = '尚未掌握技艺';
  } else if (mode === 'body') {
    summary=s.name+' · '+s.age+' 岁\n修为阶段 '+s.rank+'　金币 '+s.gold+'\n气血 '+s.hp+'　斗气 '+s.qi+'\n伤势 '+s.injury+(s.control.holder?'\n受到看守限制，自 '+stamp(s.control.since):'');
    rows=s.condition.wounds.map(w=>row('wound-'+w.id,w.symptom, '诊断：'+({unknown:'尚未确诊',fracture:'骨折',bruise:'挫伤',cut:'创伤',trauma:'外伤',loss:'缺失创口'})[w.diagnosis], '程度 '+w.severity+' · '+(w.treatedAt<0?'未处置':'已处置'),w.treatedAt<0?'求医':'',token('treat',w.id),'','',locked));
    rows.push(...s.condition.missing.map(part=>row('missing-'+part,bodyPart(part)+'缺失','普通药物不能恢复缺失部位')));
    const capabilityName=p=>verbs[p.kind]||({move:'移动',communicate:'交谈',grip:'持握',care:'照护'})[p.kind]||p.kind;
    rows.push(row('abilities','身体能力',s.condition.capabilities.filter(p=>p.available).map(capabilityName).join('、')));
    rows.push(...s.condition.capabilities.filter(p=>!p.available).map(p=>row('ability-'+p.kind,capabilityName(p),p.reason)));
    rows.push(...s.gear.map(g=>row('gear-'+g.id,({blade:'兵刃',robe:'衣甲',tool:'工具',talisman:'护符'})[g.type]||g.type,'耐久 '+g.durability+' · 余量 '+g.charges,g.equipped?'已装备':'未装备',g.equipped?'卸下':'装备',token('equip',g.id,g.equipped?'remove':''),'维修',token('repair',g.id),locked)));
  } else if (mode === 'inventory') {
    summary = '金币 ' + s.gold;
    rows = s.inventory.map(p => itemImage(row('bag-' + p.item, itemName(p.item), '', '持有 ' + p.qty,
      s.arts.some(a=>a.item===p.item) ? '研习' : p.item === 'medicine' ? '服用' : '', token(p.item === 'medicine' ? 'consume' : 'learn', p.item), '赠与', token('gift-item', p.item), locked), p.item));
    rows.push(...s.quotes.map(q => itemImage(row('quote-' + q.item, itemName(q.item), '', '商铺 ' + q.qty + ' · 单价 ' + q.price + ' 金',
      '购买', token('buy', q.item, q.quote), '出售', token('sell', q.item, q.quote), locked), q.item)));
    for (const f of s.family.filter(f => f.status !== 'separated')) for (const item of ['gold', 'food']) {
      rows.push(row('allocate-' + f.id + '-' + item, '家用 · ' + itemName(item), '', '共同持有 ' + f[item], '存入', token('allocate', f.id, item, 'deposit'), '取用', token('allocate', f.id, item, 'withdraw'), locked));
    }
    empty = '暂无物资或此地报价';
  } else if (mode === 'relations') {
    pageLabel = (s.peopleFilter==='known'?'旧档案 ':'附近人物 ') + s.peopleTotal + ' · ' + (s.peoplePage + 1) + '/' + s.peoplePages + ' 页';
    prev = locked || s.peoplePage <= 0; next = locked || s.peoplePage + 1 >= s.peoplePages;
    rows = s.people.map(p => row('person-' + p.key, p.name, p.activity.startsWith('原创：') ? '' : p.activity, (statusNames[p.status] || p.status) + ' · ' + placeName(p.place) + (p.needQty ? ' · 所需 ' + itemName(p.needItem) + ' ×' + p.needQty : ''), selected === p.key ? '已选中' : '选择', token('select', p.key), p.contact ? '接近' : '', token('approach', p.key), locked));
    rows.push(...s.family.map(f => row('family-' + f.id, personName(s, f.a) + ' / ' + personName(s, f.b), f.children.length ? '子女：' + f.children.map(id => personName(s, id)).join('、') : '', (statusNames[f.status] || f.status) + ' · ' + placeName(f.home) + ' · 家用 ' + f.gold + ' 金 / 干粮 ' + f.food)));
    rows.push(...s.promises.map(p => row('promise-' + p.id, personName(s, p.giver) + ' → ' + personName(s, p.receiver), itemName(p.item) + ' ×' + p.qty, (statusNames[p.status] || p.status) + ' · 期限 ' + stamp(p.due), p.giver === 'player' && p.status === 'open' && p.item !== 'engagement' ? '履约' : '', token('deliver', p.receiver), '', '', locked)));
    rows.push(...s.social.map(p=>row('social-'+p.a+'-'+p.b+'-'+p.kind,'关系认识 · '+personName(s,p.b),({family:'亲属',friend:'朋友',healer:'医者',competitor:'竞争者'})[p.kind]||'已知联系',({known:'本人所知',reported:'听闻',doubted:'存疑',refuted:'已否定'})[p.confidence]+' · '+stamp(p.observedAt||p.at||0))));
    empty = '尚未获知人物与家庭记录';
  } else if (mode === 'clues') {
    pageLabel = (s.cluesPage + 1) + '/' + s.cluesPages + ' 页';
    prev = locked || s.cluesPage <= 0; next = locked || s.cluesPage + 1 >= s.cluesPages;
    rows = s.clues.map(p => row('clue-' + p.id, clueName(p.kind), p.text, p.source + ' · ' + stamp(p.at), '全文', token('recall', p.id), '', '', locked));
    if (s.result.code === 'recalled') rows.unshift(row('recalled-full', '已知记录 · 全文', s.result.text));
    rows.push(...s.opportunities.map(p => row('opportunity-' + p.id, itemName(p.id), p.text, statusNames[p.state] || p.state, p.state === 'obtained' ? '' : p.id === 'redleaf' ? '尝试采集' : '尝试取得', token(p.id === 'redleaf' ? 'gather' : 'claim', p.id), '', '', locked)));
    rows.push(...s.messages.map(m=>row('letter-'+m.id,'书信 · '+personName(s,m.sender),m.summary,stamp(m.at),m.event?'关联经历':'',token('event',m.event))));
    rows.push(...s.events.map(e=>row('event-'+e.id,'经历 · '+stamp(e.at),e.summary,'','查看',token('event',e.id))));
    if(s.result.code==='event_read'){const e=JSON.parse(s.result.text);rows.unshift(row('event-details','经历详情',e.details.join('\n'),(e.page+1)+' / '+e.pages+' 页',e.page>0?'前页':'',token('event',e.id,e.page-1),e.page+1<e.pages?'后页':'',token('event',e.id,e.page+1),locked));}
    empty = '尚无已知见闻';
  } else if (mode === 'combat') {
    summary = s.alive ? '气血 ' + s.hp + '　斗气 ' + s.qi + '　伤势 ' + s.injury + (s.combat.enemy ? '\n第 ' + s.combat.round + ' 段 · ' + (s.combat.guard ? '防守中' : '交锋中') : '\n当前未在交锋') : '主角已死亡 · 可在存档中恢复世界';
    rows = s.people.filter(p => p.status === 'here' && p.alive).map(p => row('combat-' + p.key, p.name, '', placeName(p.place), selected === p.key ? '已选中' : '选为目标', token('select', p.key), '接近', token('approach', p.key), locked));
    empty = '此页无在场人物';
  } else if (mode === 'activity') {
    summary = stamp(s.time);
    rows = s.result.steps.map((p, i) => row('step-' + i, activityNames[p.kind] || p.kind, p.text, (p.accepted ? '已结算' : '未接受') + ' · 耗时 ' + duration(p.spent)));
    if (s.result.text) rows.unshift(row('last-result', s.result.partial ? '部分已结算' : '最近结果', s.result.text, stamp(s.result.at) + ' · 耗时 ' + duration(s.result.spent)));
    rows.push(...s.workshops.map(o=>row('workshop-'+o.id,'当地生产','累计产出 '+o.output,o.status==='active'?'运转中':'当前状态：'+o.status)));
    empty = '没有待继续的活动';
  } else if (mode === 'saves') {
    rows = (context.saves || []).map(p => row('save-' + p.saveId, p.displayName || '世界存档', '', '保存时间 ' + saveDate(p.createdAt), '恢复', token('restore', p.saveId), '', '', locked));
    summary = context.savesError || context.error || '';
    empty = summary ? '列表尚未读取成功' : '暂无存档';
  }
  put(c,'panelCharacterTabs',['growth','body','relations'].includes(mode));
  put(c,'panelPortrait',{kind:'exact',id:s.appearance?.portraitAsset||'local-su'});
  put(c,'panelTechniqueName','施展'+(s.arts.find(a=>a.type==='combat'&&a.active)?.name||'当前斗技'));
  put(c, 'panelOpen', modes.includes(mode));
  put(c, 'panelTitle', titles[mode] || '');
  put(c, 'panelRows', rows);
  put(c, 'panelSummary', summary);
  put(c, 'panelEmpty', !rows.length && mode !== 'host');
  put(c, 'panelEmptyText', empty);
  put(c, 'panelPageLabel', pageLabel);
  put(c, 'panelPrevDisabled', prev); put(c, 'panelNextDisabled', next);
  put(c, 'panelSaveMore', !!(context.savesCursor || context.cursor));
  put(c, 'panelConfirmDisabled', (locked || !!c.state.loading) && !safeHostIntent(confirmation?.intent));
  put(c, 'panelTargetLabel', s.combat.enemy && mode === 'combat' ? '交锋对象 · ' + personName(s, s.combat.enemy) : target ? target.name + ' · ' + (statusNames[target.status] || target.status) : selected ? '目标已不在当前记录页 · 请重新选择' : '尚未选择人物');
  put(c, 'panelHasOperation', !!s.operation.kind);
  put(c, 'panelOperation', s.operation.kind ? (activityNames[s.operation.kind] || s.operation.kind) + (s.operation.target ? ' · ' + (s.operation.kind === 'travel' ? placeName(s.operation.target) : personName(s, s.operation.target)) : '') + ' · 当前 ' + stamp(s.time) + (s.operation.end > s.time ? ' / 预计 ' + stamp(s.operation.end) : '') : '');
  put(c, 'panelGeneration', ({ idle: '暂无生成任务', preparing: '准备表达', streaming: '正在生成', finalizing: '正在接纳结果', cancelling: '正在停止', failed: '表达未完成' })[context.generationState] || '生成状态待核对');
  for (const name of modes) put(c, 'panel' + name[0].toUpperCase() + name.slice(1), mode === name);
}

function bodyPart(id){return ({head:'头部',torso:'躯干',whole:'全身',left_arm:'左臂',right_arm:'右臂',left_leg:'左腿',right_leg:'右腿'})[id]||id;}
function rankName(rank) { return '修为阶段 ' + rank; }
function clueName(kind) { return ({ rumor: '传闻', novel_memory: '原著记忆', opportunity: '机缘线索', conversation: '交谈', relationship: '相处', companion: '同行', population: '人间消息', birth: '出生消息', death: '死亡消息' })[kind] || '见闻'; }
function saveDate(value) { return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : String(value); }
function fail(c, text) { put(c, 'panelError', text); return { ui: 'changed' }; }
function numberInput(c, field) { const raw = String(c.state[field]).trim(), value = Number(raw); return /^\d+$/.test(raw) && value >= 1 && value <= 100 && Number.isInteger(value) ? value : null; }
function selectedPerson(c, s, context) { const key = c.state.panelTarget || context.selectedTarget || ''; return s.people.find(p => p.key === key); }
function preview(c, intent, title, text, context) {
  confirmation = { intent, revision: context.revision || '', title };
  put(c, 'panelConfirmTitle', title); put(c, 'panelConfirmText', text); put(c, 'panelConfirm', true); put(c, 'panelConfirmDisabled', false); put(c, 'panelError', '');
  return { ui: 'confirm', focus: 'panel-confirm-accept' };
}
function previewAction(c, a, context, text = '') {
  return preview(c, { binding: binding(a.kind), input: a }, verbs[a.kind] || activityNames[a.kind] || a.kind, text || '按当前条件提交。结果可能被拒绝；已发生的后果会保留。', context);
}

/** Return typed intent; the main Controller owns CAS, epoch, serial submission and host I/O. */
export function panelEvent(c, event, s, context = {}) {
  let e = event;
  if (e.node === 'panel-drawer' || e.node === 'composer') return null; // Measurement-only refs also observe bubbling input.
  if (e.node === 'panel-row-events' && e.targetNode) e = { ...e, node: e.targetNode, value: e.targetValue };
  if (e.type === 'keydown' && e.key === 'Escape' && c.state.panelOpen) {
    confirmation = null;
    if (c.state.panelConfirm) { put(c, 'panelConfirm', false); return { ui: 'changed', focus: 'panel-close' }; }
    put(c, 'panelMode', ''); return { ui: 'panel', mode: '' };
  }
  if (['input', 'change'].includes(e.type)) {
    const field = ({ 'panel-letter':'panelLetter', 'panel-qty': 'panelQty', 'panel-days': 'panelDays', 'panel-item': 'panelItem', 'panel-skill': 'panelSkill', 'panel-save-name': 'panelSaveName' })[e.node];
    if (field) { put(c, field, String(e.value).slice(0, field === 'panelLetter' ? 2048 : field === 'panelSaveName' ? 256 : field === 'panelQty' || field === 'panelDays' ? 8 : 64)); return { ui: 'changed' }; }
    return null;
  }
  if (e.type !== 'click' || !e.node?.startsWith('panel-')) return null;
  if (e.node.startsWith('panel-open-') || e.node === 'panel-host-saves') {
    const mode = e.node === 'panel-host-saves' ? 'saves' : e.node.slice(11);
    if (!modes.includes(mode)) return null;
    confirmation = null; put(c, 'panelMode', mode); put(c, 'panelConfirm', false); put(c, 'panelError', '');
    return { ui: 'panel', mode, readSaves: mode === 'saves', focus: 'panel-close' };
  }
  if (e.node === 'panel-close') { confirmation = null; put(c, 'panelMode', ''); put(c, 'panelConfirm', false); return { ui: 'panel', mode: '' }; }
  if (e.node === 'panel-confirm-back') { confirmation = null; put(c, 'panelConfirm', false); return { ui: 'changed', focus: 'panel-close' }; }
  if (e.node === 'panel-refresh') return { ui: 'refresh' };
  if (e.node === 'panel-stop') return { kind: 'host', binding: 'stop', input: {} };
  if (e.node === 'panel-font-normal' || e.node === 'panel-font-large') { put(c, 'panelScaleClass', e.node === 'panel-font-large' ? 'doupo-panel panel-large' : 'doupo-panel'); return { ui: 'changed' }; }
  if (e.node === 'panel-saves-refresh' || e.node === 'panel-saves-more') return { kind: 'host', binding: 'saves', input: {}, next: e.node === 'panel-saves-more' };
  if (e.node === 'panel-exit') return preview(c, { kind: 'host', binding: 'exit', input: {} }, '退出作品', '未提交草稿可能丢失。可先返回存档；已发生的行动不会撤销。', context);
  if (e.node === 'panel-reload' || e.node === 'panel-recover') return preview(c, { kind: 'host', binding: e.node === 'panel-reload' ? 'reload' : 'recover', input: {} }, e.node === 'panel-reload' ? '重新载入画面' : '恢复宿主', '将清除本地草稿与当前目标。已经发生的世界事实不会撤销。', context);
  if (e.node === 'panel-confirm-accept') {
    if (!confirmation) return fail(c, '这项安排已失效，请重新选择。');
    if ((context.busy || c.state.busy || c.state.loading) && !safeHostIntent(confirmation.intent)) return fail(c, '正在核对结果，请稍候。');
    if (confirmation.revision && context.revision && confirmation.revision !== context.revision) { confirmation = null; put(c, 'panelConfirm', false); return fail(c, '世界记录已更新，请重新核对这项安排。'); }
    const result = confirmation.intent; confirmation = null; put(c, 'panelConfirm', false); return result;
  }
  if (context.busy || c.state.busy || c.state.loading) return fail(c, '正在核对结果，请稍候。');
  if (e.node === 'panel-save') return { kind: 'host', binding: 'save', input: { displayName: c.state.panelSaveName.trim() } };
  if (e.node === 'panel-continue' || e.node === 'panel-cancel') {
    if (!s.operation.kind) return fail(c, '当前没有待继续的活动。');
    return { binding: e.node === 'panel-continue' ? 'continue' : 'cancel', input: {} };
  }
  if (e.node === 'panel-prev' || e.node === 'panel-next') {
    const qty = s.cluesPage + (e.node === 'panel-prev' ? -1 : 1);
    return qty >= 0 && qty < s.cluesPages ? { binding: 'clues', input: { qty } } : null;
  }
  if(e.node==='panel-nearby'||e.node==='panel-known') return {binding:e.node==='panel-known'?'known-people':'browse',input:{qty:0}};
  if (e.node === 'panel-people-prev' || e.node === 'panel-people-next') {
    const qty = s.peoplePage + (e.node === 'panel-people-prev' ? -1 : 1);
    return qty >= 0 && qty < s.peoplePages ? { binding: s.peopleFilter==='known'?'known-people':'browse', input: { qty } } : null;
  }
  if (e.node === 'panel-row-primary' || e.node === 'panel-row-secondary') {
    const [kind, id, detail, direction] = String(e.value || '').split('|');
    if (kind === 'select') { if (!s.people.some(p => p.key === id)) return fail(c, '人物记录已变化，请刷新。'); put(c, 'panelTarget', id); return { ui: 'select-person', target: id }; }
    if (kind === 'recall') { if (!s.clues.some(p => p.id === id)) return fail(c, '这条记录已不在本页。'); return { binding: 'recall', input: { target: id } }; }
    if(kind==='event')return {binding:'event',input:{target:id,page:Math.max(0,Number(detail)||0)}};
    if(kind==='practice')return {binding:'act',input:action('practice',{item:id})};
    if(kind==='treat')return previewAction(c,action('treat',{target:'player',detail:id}),context,'需在医者身边，药草 2 份、金币 12。普通药物不能接骨。');
    if(kind==='equip'||kind==='repair')return previewAction(c,action(kind,{target:id,detail:detail||''}),context,kind==='repair'?'需在工匠身边，药草 1 份、金币 6；维修期间器物不生效。':'调整当前器物的使用状态。');
    if (kind === 'restore') {
      const save = (context.saves || []).find(p => p.saveId === id);
      if (!save) return fail(c, '请刷新存档列表后重新选择。');
      return preview(c, { kind: 'host', binding: 'restore', input: { saveId: id } }, '恢复 ' + (save.displayName || '世界存档'), '人物、资源、关系与世界历史一起恢复。未提交草稿与当前目标将清除。', context);
    }
    if (!s.created || !s.alive) return fail(c, s.created ? '主角已死亡，可读取世界存档。' : '请先创建角色。');
    if (kind === 'travel') {
      if (!s.known.includes(id)) return fail(c, '这不是当前已知地点。');
      const route = ROUTES.find(r => r.from === s.place && r.to === id);
      if (!route) return fail(c, '当前位置无直达路线，请先前往相邻地点。');
      return previewAction(c, action('travel', { target: id }), context, placeName(s.place) + ' → ' + placeName(id) + '\n耗时 ' + duration(route.ticks) + ' · 干粮 ' + Math.floor(route.ticks / 1440) + ' 份。途中事件可能中断。');
    }
    if (kind === 'buy' || kind === 'sell') {
      const quote = s.quotes.find(q => q.item === id), qty = numberInput(c, 'panelQty');
      if (!qty) return fail(c, '数量须为 1—100 的整数。');
      if (!quote || String(quote.quote) !== detail) return fail(c, '报价已变化，请核对新报价。');
      return previewAction(c, action(kind, { item: id, qty, detail }), context, itemName(id) + ' ×' + qty + (kind === 'buy' ? '\n支付 ' + quote.price * qty + ' 金。' : '\n出售回收价由规则结算。'));
    }
    if (kind === 'allocate') { const qty = numberInput(c, 'panelQty'); if (!qty) return fail(c, '数量须为 1—100 的整数。'); if (!s.family.some(f => f.id === id)) return fail(c, '家庭记录已变化。'); return previewAction(c, action('allocate', { target: id, item: detail, qty, detail: direction }), context, (direction === 'withdraw' ? '从家用取出 ' : '存入家用 ') + itemName(detail) + ' ×' + qty + '。'); }
    if (kind === 'gift-item') { const p = selectedPerson(c, s, context), qty = numberInput(c, 'panelQty'); if (!p) return fail(c, '先在人间面板选择收礼人物。'); if (!qty) return fail(c, '数量须为 1—100 的整数。'); return previewAction(c, action('gift', { target: p.key, item: id, qty }), context, p.name + ' · ' + itemName(id) + ' ×' + qty + '。礼物不替代对方意愿。'); }
    if (kind === 'approach' || kind === 'deliver') { if (!s.people.some(p => p.key === id)) return fail(c, '请先翻到这位人物所在页再选择。'); return previewAction(c, action(kind, { target: id }), context, personName(s, id) + ' · 距离与当前条件由规则核对。'); }
    if (['learn', 'consume', 'gather', 'claim'].includes(kind)) return previewAction(c, action(kind, { item: id }), context, itemName(id) + ' · 材料、地点与机会归属以结算为准。');
    return null;
  }
  if (!s.created || !s.alive) return fail(c, s.created ? '主角已死亡，可读取世界存档。' : '请先创建角色。');
  if(e.node==='panel-send-letter'||e.node==='panel-release'){
    const p=selectedPerson(c,s,context);if(!p)return fail(c,'先选择已知人物。');
    if(e.node==='panel-release')return previewAction(c,action('release',{target:p.key}),context,'只能释放自己实际看守、且在身边的人。');
    const text=c.state.panelLetter.trim();if(!text)return fail(c,'请先写下书信内容。');
    return previewAction(c,action('message',{target:p.key,text}),context,'寄给 '+p.name+'，支付邮资一金。送达取决于实际地址与传递。');
  }
  if (e.node.startsWith('panel-social-')) {
    const kind = e.node.slice(13), p = selectedPerson(c, s, context);
    if (!p) return fail(c, '请先选择当前记录页中的人物。');
    if (kind === 'talk') return { ui: 'compose', target: p.key, text: '' };
    if (kind === 'promise' && (!p.needItem || !p.needQty)) return fail(c, '当前没有公开的所需物品；可以先交谈。');
    const a = action(kind, { target: p.key });
    if (kind === 'gift') { a.item = c.state.panelItem; a.qty = 1; }
    if (kind === 'promise') { a.item = p.needItem; a.qty = p.needQty; a.detail = '7'; }
    if (kind === 'teach') a.item = c.state.panelSkill;
    const note = kind === 'promise' ? itemName(a.item) + ' ×' + a.qty + ' · 期限七日。' : kind === 'separate' ? '结束共同生活，已有子女与过去经历仍保留。' : kind === 'marry' ? '若双方条件成立，建立共同家庭并结算生活物资。' : kind === 'conceive' ? '向对方提出养育安排；接纳后有持续时间与家庭消耗。' : '按距离、实际物资与对方意愿结算。';
    return previewAction(c, a, context, p.name + '\n' + note);
  }
  const kind = e.node.slice(6);
  if (['train', 'rest', 'wait', 'work'].includes(kind)) { const qty = numberInput(c, 'panelDays'); if (!qty) return fail(c, '天数须为 1—100 的整数。'); return previewAction(c, action(kind, { qty }), context, qty + ' 日。世界事件可能中断，已推进时间会保留。'); }
  if (['attack', 'technique', 'guard', 'retreat', 'surrender'].includes(kind)) {
    const target = s.combat.enemy || selectedPerson(c, s, context)?.key;
    if (!target) return fail(c, '请先选择交锋目标。');
    return previewAction(c, action(kind, { target }), context, personName(s, target) + ' · ' + (kind === 'surrender' ? '放弃交锋并交付财物。' : kind === 'retreat' ? '撤退可能受阻并受伤。' : '这一阶段可能造成伤亡。'));
  }
  if (['breakthrough', 'refine', 'investigate', 'consume', 'gather'].includes(kind)) return previewAction(c, action(kind, { item: kind === 'consume' ? 'medicine' : kind === 'gather' ? 'herb' : '' }), context);
  return null;
}

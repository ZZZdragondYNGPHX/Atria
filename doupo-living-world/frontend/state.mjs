// The Native compiler caps the whole component state schema at 256 nodes.
// So: visibility lives in one stage class string, layers that never show
// together share generic lists (A-D), and every list uses one row shape.
const S = (maxLength = 256) => ({ type: 'string', maxLength });
const B = { type: 'boolean' };
const N = { type: 'number', minimum: -100000, maximum: 100000 };
const O = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const A = (items, maxItems) => ({ type: 'array', items, maxItems });
const media = () => O({ kind: { type: 'string', enum: ['exact'], maxLength: 8 }, id: S(64) });
const entry = (schema, value) => ({ schema, value });
const pic = (id = 'local-su') => ({ kind: 'exact', id });

// k key · t title · s body · x meta · p source seal · v action token · b action label · c class · d disabled · m image
const row = () => O({ k: S(96), t: S(256), s: S(4096), x: S(256), p: S(8), v: S(512), b: S(64), c: S(128), d: B, m: media() });
const option = () => O({ k: S(64), t: S(128), v: S(128) });
const list = (max, shape = row()) => entry(A(shape, max), []);
const text = (max = 256, value = '') => entry(S(max), value);

export const state = {
  // bound inputs (the runtime writes these back)
  createName: text(48), draft: text(8192), letter: text(2048), saveName: text(256),
  qty: text(8, '1'), days: text(8, '3'), offerGold: text(10), amount: text(10),
  questAmount: text(8), questDays: text(8), questAlternative: text(64), questFilter: text(24, 'all'), questPerson: text(64),
  activityItem: text(64, 'herb'), battleAlly: text(64), battleOrder: text(16, 'focus'), battleSkill: text(64), teachSkill: text(64, 'basic'),
  // controller flags used by bindings
  busy: entry(B, true), submitDisabled: entry(B, true), sealDisabled: entry(B, true), stopQueued: entry(B, false), confirmDisabled: entry(B, false),
  narration: text(65536), unresolved: entry(B, false),
  // stage: every visibility switch is a class token here
  stage: text(1024, 'game is-creating'), status: text(1024),
  // hud
  place: text(128), region: text(64), back: text(32, '城中'), clock: text(32), day: text(32), doing: text(256), dial: entry(N, 0),
  name: text(128), hpText: text(32), hpPct: entry(N, 0), qiText: text(32), qiPct: entry(N, 0), purse: text(128), face: entry(media(), pic()),
  // scene + dock
  sceneImage: entry(media(), pic('wutan-overview')), artClass: text(64, 'scene-art'), sceneNote: text(512),
  presentTitle: text(32, '在场'), presentSwitch: text(32), presentEmpty: text(256), presentPage: text(64),
  recentMeta: text(128), recentText: text(4096), target: text(256, '此地'),
  // talk / trade
  talkName: text(48), talkInfo: text(1024), talkWhere: text(256), portrait: entry(media(), pic()), talkReason: text(256),
  tradeTitle: text(128), tradeNote: text(256),
  // scroll and shared detail block
  scrollTitle: text(32), pageText: text(128), scrollError: text(512),
  bigTitle: text(128), bigNote: text(512), barPct: entry(N, 0), barText: text(256),
  dTitle: text(256), dMeta: text(512), dText: text(4096), dStamp: text(16),
  planWarn: text(1024), planSeal: text(32), planNote: text(64), emptyText: text(256),
  mapImage: entry(media(), pic('wutan-overview')),
  // battle / passage / menu / confirm
  battleHead: text(512), battleLine: text(512), battleReason: text(512),
  passFrom: text(64), passTo: text(64), menuNote: text(512),
  cTitle: text(256), cText: text(4096), cSeal: text(32, '落印'),
  // lists
  cells: list(280, O({ k: S(8), c: S(48), l: S(48), d: B })),
  pieces: list(40), dock: list(24), log: list(24, O({ k: S(16), c: S(32), t: S(48), s: S(4096) })),
  tabs: list(6), rowsA: list(80), rowsB: list(104), rowsC: list(24), rowsD: list(8),
  optsA: list(64, option()), optsB: list(24, option()),
};

export const nodeRefs = ['doupo-root'];

export const dynamicStyles = {
  hpWidth: { property: 'width', type: 'percentage' },
  qiWidth: { property: 'width', type: 'percentage' },
  barWidth: { property: 'width', type: 'percentage' },
  dialTurn: { property: 'transform', type: 'rotate' },
};

const string = (maxLength = 4096) => ({ type: 'string', maxLength });
const bool = { type: 'boolean' };
const field = (schema, value) => ({ schema, value });
const itemMedia = { type: 'object', additionalProperties: false, properties: {
  kind: { type: 'string', enum: ['exact'], maxLength: 8 },
  id: { type: 'string', enum: ['item-food', 'item-herb', 'item-redleaf', 'item-medicine', 'item-manual', 'item-technique', 'item-formula', 'item-relic'], maxLength: 64 },
}, required: ['kind', 'id'] };
const row = {
  type: 'object', additionalProperties: false,
  properties: { id: string(128), title: string(256), text: string(), meta: string(512), primary: string(64), primaryValue: string(512), secondary: string(64), secondaryValue: string(512), disabled: bool, className: string(64), hasImage: bool, image: itemMedia },
  required: ['id', 'title', 'text', 'meta', 'primary', 'primaryValue', 'secondary', 'secondaryValue', 'disabled', 'className', 'hasImage', 'image'],
};
export const state = {
  panelCharacterTabs:field(bool,false),panelPortrait:field({type:'object',properties:{kind:{type:'string',enum:['exact'],maxLength:8},id:string(64)},required:['kind','id'],additionalProperties:false},{kind:'exact',id:'local-su'}),
  panelMode: field(string(32), ''), panelOpen: field(bool, false),
  panelTitle: field(string(128), ''), panelIntro: field(string(), ''),
  panelRows: field({ type: 'array', items: row, maxItems: 100 }, []),
  panelEmpty: field(bool, false), panelEmptyText: field(string(), ''),
  panelBody: field(bool,false),panelTechniqueName:field(string(128),'施展当前斗技'),panelWorld: field(bool, false), panelGrowth: field(bool, false), panelInventory: field(bool, false),
  panelRelations: field(bool, false), panelClues: field(bool, false), panelCombat: field(bool, false),
  panelActivity: field(bool, false), panelSaves: field(bool, false), panelHost: field(bool, false),
  panelQty: field(string(8), '1'), panelDays: field(string(8), '1'),
  panelTarget: field(string(64), ''), panelTargetLabel: field(string(256), '尚未选择人物'),
  panelLetter:field(string(2048),''),panelItem: field(string(64), 'food'), panelSkill: field(string(64), 'basic'),
  panelSaveName: field(string(256), ''), panelSaveMore: field(bool, false),
  panelPageLabel: field(string(128), ''), panelPrevDisabled: field(bool, true), panelNextDisabled: field(bool, true),
  panelConfirm: field(bool, false), panelConfirmTitle: field(string(256), ''), panelConfirmText: field(string(), ''),
  panelConfirmDisabled: field(bool, false),
  panelError: field(string(), ''), panelSummary: field(string(), ''),
  panelOperation: field(string(), ''), panelHasOperation: field(bool, false),
  panelGeneration: field(string(256), ''), panelScaleClass: field(string(64), 'doupo-panel'),
  panelHeight: field({ type: 'number', minimum: 0, maximum: 4096 }, 480),
};

export const dynamicStyles = { panelHeight: { property: 'height', type: 'length' } };

export const panelNodeRefs = [
  'panel-close', 'panel-row-events', 'panel-qty', 'panel-days',
  'panel-item', 'panel-skill', 'panel-save-name', 'panel-prev', 'panel-next',
  'panel-confirm-accept', 'panel-confirm-back',
  'panel-people-prev', 'panel-people-next',
  'panel-continue', 'panel-cancel', 'panel-train', 'panel-rest', 'panel-wait', 'panel-work',
  'panel-breakthrough', 'panel-refine', 'panel-social-talk', 'panel-social-invite',
  'panel-social-promise', 'panel-social-deliver', 'panel-social-care', 'panel-social-confess',
  'panel-social-engage', 'panel-social-marry', 'panel-social-conceive', 'panel-social-separate',
  'panel-social-gift', 'panel-social-teach', 'panel-investigate', 'panel-gather', 'panel-attack',
  'panel-technique', 'panel-guard', 'panel-retreat', 'panel-surrender', 'panel-consume',
  'panel-save', 'panel-saves-refresh', 'panel-saves-more', 'panel-stop', 'panel-refresh',
  'panel-font-normal', 'panel-font-large', 'panel-host-saves', 'panel-exit', 'panel-reload', 'panel-recover',
  'composer', 'panel-drawer',
];

export const nodeRefs = panelNodeRefs;

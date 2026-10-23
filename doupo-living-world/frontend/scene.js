import {PLACES,ROUTES,BACKGROUNDS} from './catalog.js';
const exact=id=>({kind:'exact',id});
const put=(c,key,value)=>c.set('component.'+key,value);
const scenes={
 'wutan.inn':'scene-wutan-inn','wutan.market':'scene-wutan-market','wutan.herbal':'scene-wutan-herbal',
 'wutan.auction':'scene-wutan-auction','wutan.clan':'scene-wutan-clan','wutan.gate':'scene-wutan-gate',
 'qingshan.inn':'scene-qingshan-inn','qingshan.herbal':'scene-qingshan-herbal','qingshan.guild':'scene-qingshan-guild',
 'mountain.camp':'scene-mountain-camp','mountain.valley':'scene-mountain-valley','mountain.cave':'scene-mountain-cave'
};
// Media identity only. Presence, knowledge and all character facts come from screen.
const threeTwoScenes=['scene-wutan-inn','scene-wutan-auction','scene-wutan-clan','scene-wutan-gate','scene-qingshan-inn','scene-mountain-camp','scene-mountain-valley','scene-mountain-cave'];
const hotspotClasses={'wutan.herbal':'hotspot herbal','wutan.market':'hotspot market','wutan.inn':'hotspot inn','wutan.clan':'hotspot clan','wutan.gate':'hotspot gate'};
const roles={herbalist:'药铺帮手',merchant:'商贩',innkeeper:'客栈伙计',cultivator:'修炼者',guide:'向导',rival:'修炼者',healer:'医者',mercenary:'佣兵',elder:'长者',artisan:'工匠',child:'孩童',leader:'族长',guard:'守卫',porter:'搬运者',gatherer:'采药者'};
const regions={wutan:'乌坦城',qingshan:'青山镇',mountain:'魔兽山脉'};
const kinds={move:'移动',approach:'接近人物',travel:'旅行',train:'修炼',wait:'等待',rest:'休息',plan:'连续行动',appraise:'整理相处经历',initialize:'安置新居民',catchup:'结算世界活动'};
const activity=p=>p?.activity&&!p.activity.startsWith('原创：')?p.activity:'';
export const placeInfo=id=>PLACES.find(p=>p.id===id);
export const placeImage=id=>scenes[id]||'';
export const personImage=p=>p?.appearance?.ready?p.appearance.portraitAsset:'';
export function worldTime(minutes){const day=Math.floor(minutes/1440),hour=Math.floor(minutes%1440/60),minute=minutes%60;return '开局后 '+(day?day+' 日 ':'')+hour+' 时 '+minute+' 分';}
const gridClass=(prefix,x,y)=>prefix+' gx'+Math.max(0,Math.min(19,Number(x)||0))+' gy'+Math.max(0,Math.min(13,Number(y)||0));
const row=(id,label,meta='',className='',disabled=false,image='')=>({id,label,meta,className,disabled,hasImage:!!image,image:exact(image||'local-su')});
export function renderScene(c,screen,{selected='',overview=true,draftTarget=''}={}){
 const s=screen||{},created=!!s.created,place=placeInfo(s.place),region=place?.region||'wutan',inOverview=created&&overview;
 const people=Array.isArray(s.people)?s.people:[],nearby=people.filter(p=>p.status==='here'&&p.place===s.place&&p.alive),person=people.find(p=>p.key===selected)||((s.markers||[]).find(p=>p.key===selected)?{...s.markers.find(p=>p.key===selected),status:'here',place:s.place,alive:true,role:'',contact:true}:null),personOpen=created&&!overview&&!!person;
 const busy=!!c.state.busy,operating=!!s.operation?.kind,disabled=busy||operating||!s.alive;
 const image=inOverview&&region==='wutan'?'wutan-overview':inOverview?'map-first-regions':placeImage(s.place);
 put(c,'sceneCreated',created);put(c,'sceneCreation',!created);put(c,'sceneOverview',inOverview);put(c,'sceneFacility',created&&!overview);put(c,'scenePerson',personOpen);
 put(c,'sceneClass','doupo-stage'+(c.state.sceneShowGrid?' grid-visible':'')+(personOpen?' has-person':''));
 put(c,'sceneImage',exact(image||'wutan-overview'));put(c,'sceneArtClass','scene-art'+(image==='map-first-regions'?' ratio-two-one':threeTwoScenes.includes(image)?' ratio-three-two':''));put(c,'sceneHasImage',!!image||!created);put(c,'sceneImageMissing',created&&!image);
 put(c,'sceneImageNote',created&&!image?'此地暂缺专用场景图':'');
 put(c,'sceneTitle',created?(inOverview?regions[region]+' · 总览':place?.name||s.place):'斗破苍穹 · 众生行');put(c,'sceneRegion',regions[region]);
 put(c,'sceneTime',created?worldTime(s.time):'乌坦城');
 put(c,'sceneStats',created?s.name+'　'+s.age+' 岁　境界 '+s.rank+'　气血 '+s.hp+'　斗气 '+s.qi+'　金币 '+s.gold:'自创角色 · 选择出身与来处');
 put(c,'scenePosition',created?(inOverview?place?.name?.replace(/^[^·]+·/,'')||s.place:s.x+'，'+s.y):'');put(c,'sceneBackLabel',personOpen?'收起人物':'返回总览');
 const reachable=new Set(ROUTES.filter(r=>r.from===s.place).map(r=>r.to));
 const facilities=PLACES.filter(p=>p.region===region&&(s.known||[]).includes(p.id)).map(p=>row(p.id,p.id==='wutan.clan'?'族宅':p.id==='wutan.auction'?'拍卖分号':p.name.replace(/^[^·]+·/,''),p.id===s.place?'所在':reachable.has(p.id)?'相邻':'途经',hotspotClasses[p.id]||'',busy));
 put(c,'sceneFacilities',facilities);put(c,'sceneHotspots',region==='wutan'?facilities.filter(p=>hotspotClasses[p.id]):[]);
 put(c,'scenePeople',people.map(p=>row(p.key,p.name,(roles[p.role]||p.role)+(activity(p)?' · '+activity(p):''),'nearby-person'+(p.key===selected?' selected':''),false,personImage(p))));put(c,'scenePeopleEmpty',!people.length);
 put(c,'scenePeoplePage',(s.peopleFilter==='known'?'旧档案':'附近人物')+' '+((s.peoplePage||0)+1)+' / '+(s.peoplePages||1)+' 页 · '+(s.peopleTotal||0)+' 人');put(c,'scenePeoplePrevious',(s.peoplePage||0)>0);put(c,'scenePeopleNext',(s.peoplePage||0)+1<(s.peoplePages||1));
 const blocks=place?.blocks||[];const cells=[];for(let y=0;y<14;y++)for(let x=0;x<20;x++){const blocked=blocks.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h);cells.push({id:x+','+y,label:(blocked?'障碍 ':'移动至 ')+x+'，'+y,className:'ground-cell'+(blocked?' blocked':''),disabled:blocked||disabled});}
 put(c,'sceneCells',cells);put(c,'scenePlayerClass',gridClass('player-marker',s.x,s.y));
 put(c,'sceneMarkers',(s.markers||[]).map((p,index)=>{
  const pile=s.markers.slice(0,index).filter(n=>n.x===p.x&&n.y===p.y).length+(p.x===s.x&&p.y===s.y?1:0);
  const classes='person-marker'+(p.key===selected?' selected':'')+' pile'+pile+(p.x<5?' pile-right':'')+(p.y<5?' pile-down':'');
  return row(p.key,p.name,'位置 '+p.x+'，'+p.y,gridClass(classes,p.x,p.y),busy,p.appearance?.ready?p.appearance.chibiAsset:'');
 }));
 put(c,'scenePlayerImage',exact(s.appearance?.chibiAsset||'local-su'));put(c,'scenePlayerHasImage',!!s.appearance?.ready);
 put(c,'sceneMarkerNote',s.markersTruncated?'地图显示 '+s.markers.length+' / '+s.markerTotal+' 位重点人物，其余可在附近列表查看':'');
 put(c,'sceneObjects',(place?.objects||[]).map(o=>({id:o.id,label:o.name,meta:'位置 '+o.x+'，'+o.y,className:gridClass('object-marker',o.x,o.y)})));
 put(c,'sceneGridLabel',c.state.sceneShowGrid?'收起规则网格':'显示规则网格');
 put(c,'scenePersonName',person?.name||'');put(c,'scenePersonMeta',person?(roles[person.role]||person.role)+' · '+(person.status==='here'?'在场':person.status==='deceased'?'已知离世':'上次获知的位置')+(activity(person)?'\n'+activity(person):'')+(person.signs?.length?'\n'+person.signs.join('、'):''):'');
 put(c,'scenePersonReply',person?.reply||'');put(c,'sceneCanReadReply',!!person&&(!!person.reply||s.result?.code==='awaiting_npc'||s.result?.code==='reply_pending'));put(c,'scenePersonHasImage',!!personImage(person));put(c,'scenePersonImage',exact(personImage(person)||'local-su'));put(c,'scenePersonFallback',person&&!personImage(person)?person.name+' · 暂无画像':'');
 const present=!!person&&person.status==='here'&&person.place===s.place&&person.alive,dist=present?Math.abs(person.x-s.x)+Math.abs(person.y-s.y):-1;
 put(c,'scenePersonDistance',!person?'':!present?'当前无法与其交互':operating&&s.operation.target===person.key?'正在接近':dist<=2?'已在交互范围':'相距 '+dist+' 格');
 put(c,'scenePersonUnavailable',!present||disabled);put(c,'sceneOperation',operating);put(c,'sceneOperationText',operating?(kinds[s.operation.kind]||s.operation.kind)+(s.operation.target?' · '+(people.find(p=>p.key===s.operation.target)?.name||placeInfo(s.operation.target)?.name||s.operation.target):''):'');
 put(c,'sceneResult',s.result?.text||'');put(c,'sceneResultMeta',s.result?.code?'最近行动 · '+(s.result.spent||0)+' 分钟':'');put(c,'sceneHasNarration',!!c.state.narration?.trim());
 const target=people.find(p=>p.key===draftTarget);put(c,'sceneTargetLabel',draftTarget?'草稿对象：'+(target?.name||draftTarget)+(draftTarget!==selected?' · 与当前选择不同':''):'草稿对象：周围行动');
 const bg=BACKGROUNDS.find(b=>b.id===c.state.createBackground);put(c,'sceneCreationSummary',bg?(placeInfo(bg.place)?.name||bg.place)+'　金币 '+bg.gold+'　境界 '+bg.rank:'');put(c,'sceneDead',created&&!s.alive);
}

const S=(maxLength=2048)=>({type:'string',maxLength});
const B={type:'boolean'}, I=(minimum=0,maximum=1000000)=>({type:'integer',minimum,maximum});
const O=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const A=(items,maxItems)=>({type:'array',items,maxItems});
const media=O({kind:{type:'string',enum:['exact'],maxLength:8},id:S(64)});
const entry=(schema,value)=>({schema,value});
const row=O({id:S(64),label:S(128),meta:S(256),className:S(128),disabled:B,hasImage:B,image:media});
export const state={
 createName:entry(S(48),''),createBackground:entry(S(32),'apprentice'),createOrigin:entry(S(32),'native'),createSex:entry(S(16),'female'),
 sceneTools:entry(B,false),sceneCreated:entry(B,false),sceneCreation:entry(B,true),sceneOverview:entry(B,false),sceneFacility:entry(B,false),scenePerson:entry(B,false),
 sceneClass:entry(S(128),'doupo-stage'),sceneArtClass:entry(S(64),'scene-art'),sceneImage:entry(media,{kind:'exact',id:'wutan-overview'}),sceneHasImage:entry(B,true),sceneImageMissing:entry(B,false),sceneImageNote:entry(S(512),''),
 sceneTitle:entry(S(128),'斗破苍穹 · 众生行'),sceneRegion:entry(S(64),'乌坦城'),sceneTime:entry(S(128),''),sceneStats:entry(S(256),''),scenePosition:entry(S(128),''),sceneBackLabel:entry(S(64),'返回总览'),
 sceneFacilities:entry(A(row,24),[]),sceneHotspots:entry(A(row,6),[]),scenePeople:entry(A(row,12),[]),scenePeopleEmpty:entry(B,true),scenePeoplePage:entry(S(128),''),scenePeoplePrevious:entry(B,false),scenePeopleNext:entry(B,false),
 sceneCells:entry(A(O({id:S(16),label:S(96),className:S(96),disabled:B}),280),[]),sceneMarkers:entry(A(row,12),[]),scenePlayerClass:entry(S(96),'player-marker gx2 gy7'),
 scenePlayerImage:entry(media,{kind:'exact',id:'local-su'}),scenePlayerHasImage:entry(B,false),sceneMarkerNote:entry(S(256),''),
 sceneObjects:entry(A(O({id:S(64),label:S(128),meta:S(256),className:S(96)}),8),[]),sceneShowGrid:entry(B,false),sceneGridLabel:entry(S(64),'显示规则网格'),sceneMoveX:entry(S(4),'2'),sceneMoveY:entry(S(4),'7'),
 scenePersonName:entry(S(48),''),scenePersonMeta:entry(S(512),''),scenePersonReply:entry(S(2048),''),sceneCanReadReply:entry(B,false),scenePersonImage:entry(media,{kind:'exact',id:'local-su'}),scenePersonHasImage:entry(B,false),scenePersonFallback:entry(S(128),''),scenePersonDistance:entry(S(256),''),scenePersonUnavailable:entry(B,true),
 sceneOperation:entry(B,false),sceneOperationText:entry(S(512),''),sceneResult:entry(S(4096),''),sceneResultMeta:entry(S(256),''),sceneHasNarration:entry(B,false),sceneTargetLabel:entry(S(256),'当前场所'),sceneCreationSummary:entry(S(512),''),sceneDead:entry(B,false)
};
export const nodeRefs=['create-name','create-background','create-origin','create-sex','create-submit','back-scene','facility-events','hotspot-events','people-events','markers-events','ground-events','objects-events','move-to','move-x','move-y','toggle-grid','person-approach','person-talk','person-relations','person-reply','operation-continue','operation-cancel','draft','submit-draft','draft-retarget','refresh-screen','resolve-pending','stop-generation','people-previous','people-next','nav-map','nav-character','nav-inventory','nav-clues','nav-combat','nav-activity','nav-settings'];

export const ok=r=>{if(!r.ok)throw Error(r.error?.code||'request_failed');return r.data;};
export const row=(id,label,text='',disabled=false,meta='')=>({id,label,text,disabled,meta});
export const put=(c,k,v)=>c.set('component.'+k,v);
export async function read(c,id){return ok(await c.bridge.snapshot(id,{}));}
export async function readGame(c){const g=await read(c,'game'),v=await read(c,'view');return {game:g[0].value.state,view:v[0].value.view};}
export async function operation(c,id,input){let result=await c.bridge.start(id,input);ok(result);while(!['completed','failed','cancelled'].includes(result.status)){await c.scheduler.timer(300);result=await c.bridge.operation(id,result.operationId);ok(result);}if(result.status!=='completed')throw Error('operation_'+result.status);return result.data;}
export async function focus(c,id){try{await c.scheduler.frame();await c.node(id,'focus');}catch{}}
export const audioLabel=s=>({locked:'声音尚未解锁，可在菜单启用',ready:'环境与效果音已启用',muted:'声音已静音',hidden:'页面隐藏，声音已暂停',blocked:'播放被浏览器限制，可再次启用',failed:'声音未能播放；文字信息完整'})[s.state]||'声音暂不可用';
export async function syncAudio(c,g){
 const indoors=g.final_plan?g.final_plan==='stay':['inn','store','radio'].includes(g.location),ambience=[{ref:{kind:'exact',id:'aud-'+(g.final_plan&&g.final_plan!=='stay'?'sea-wind':g.spent_ap>=16?'storm':indoors?'rain-indoor':'sea-wind')},gain:indoors?.45:.65}];
 const day=Math.min(2,Math.floor(g.spent_ap/8));if(g.location==='inn'&&g.rations[day]==='warm')ambience.push({ref:{kind:'exact',id:'aud-fire'},gain:.35});
 if(g.location==='radio'&&g.facilities.radio)ambience.push({ref:{kind:'exact',id:'aud-radio-hum'},gain:.2});
 if(g.location==='lighthouse'&&g.facilities.light===2)ambience.push({ref:{kind:'exact',id:'aud-generator'},gain:.22});
 const last=g.last;let effect=last.before===0&&g.sequence===1?'bell':(g.last.title==='灯亮之前'||g.last.title==='另一处岸')?'horn':last.title.includes('检修')||last.title.includes('灯组')||last.title.includes('固定')?'tools':last.title.includes('登记')||last.title.includes('誊')||last.title.includes('归还')?'paper':last.title.includes('配给')||last.title.includes('餐')||last.title.includes('围坐')?'bowl':last.title.includes('收听')||last.title.includes('退役机')||last.title.includes('回响')?'old-call':last.title.includes('前往')?'steps':'confirm';
 return ok(await c.bridge.invoke('audioScene',{ambience,events:g.sequence?[{id:'event-'+g.sequence,ref:{kind:'exact',id:'aud-'+effect},gain:.45}]:[],transitionMs:500}));
}

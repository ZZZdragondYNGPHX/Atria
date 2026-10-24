export function recordCombatQuestResult(c,e){
 for(const q of c.w.quests.instances.filter(q=>q.evidence.some(k=>k.kind==='combat_start'&&k.target===e.id)&&!q.evidence.some(k=>k.kind==='combat_result'&&k.target===e.id))){
  const contributed=e.participants.some(m=>m.id==='player'&&m.actions>0)||e.requests.some(r=>r.reply==='accepted');
  const text=JSON.stringify({result:e.result,winner:e.winner,alive:e.participants.every(m=>c.rows.find(r=>r.id===m.id)?.value.alive),protectedAlive:!!c.rows.find(r=>r.id===e.protected)?.value.alive,contributed});
  q.evidence.push({kind:'combat_result',target:e.id,place:e.place,at:c.w.time,text});if(q.evidence.length>8)q.evidence.shift();
 }
}

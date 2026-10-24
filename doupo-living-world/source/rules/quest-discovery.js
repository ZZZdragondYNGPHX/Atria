import {quests} from '../pools/quests.js';
import {eligibleQuest} from './quest-operations.js';
import {sendMessage} from './life.js';
import {DAY} from '../content/catalog.js';
import {capabilities} from './condition.js';
// Invitation envelopes are issued only by rules, never parsed from model prose.
// They use the existing bounded message ledger and transport, not a second inbox.
export function sendQuestInvitation(c,r){
 const n=r?.value,w=c.w;
 if(!r||r.id==='player'||!n?.alive||n.destination||capabilities(n).communicate||n.gold<1||!['','rest','work'].includes(n.activity.kind))return false;
 const contact=n.social.find(e=>e.a===r.id&&e.b==='player'&&e.confidence!=='refuted');
 if(!contact||!contact.place||w.messages.some(m=>m.sender===r.id&&m.kind==='quest_invite'&&w.time-m.created<7*DAY))return false;
 const completed=w.quests.totals.filter(x=>x.completed>0).map(x=>x.seed);
 const entry=quests.entries.find(e=>e.status==='ready'&&e.value.issuer===r.id&&e.value.repeatable&&e.value.place===n.place&&completed.includes(e.id)&&eligibleQuest(c,e.value)&&!w.quests.instances.some(q=>q.seed===e.id&&['offered','active','working','paused_work','ready','debt','return_pending'].includes(q.status)));
 if(!entry)return false;
 const t=entry.value,due=t.deadlineHours?w.time+t.deadlineHours*60:0;
 const envelope={seed:entry.id,version:quests.version,title:t.title,reward:t.reward,place:n.place,due,created:w.time};
 if(!sendMessage(c,r.id,'player','quest_invite','player',JSON.stringify(envelope),'quest-invite:'+entry.id+':'+w.time,contact.place))return false;
 c.touch(r.id);n.next=Math.max(n.next,w.time+60);return true;
}
export function deliveredQuestInvitations(c){
 const result=[];
 for(const m of c.w.messages){
  if(m.kind!=='quest_invite'||m.receiver!=='player'||m.status!=='delivered'||!m.receipt||m.created>c.w.time||!m.source.startsWith('quest-invite:'))continue;
  let envelope;try{envelope=JSON.parse(m.text);}catch{continue;}
  const entry=quests.entries.find(e=>e.id===envelope?.seed&&e.status==='ready');
  if(!entry||entry.value.issuer!==m.sender||envelope.version!==quests.version||envelope.created!==m.created||envelope.place!==m.origin||envelope.title!==entry.value.title||envelope.reward!==entry.value.reward||!Number.isSafeInteger(envelope.due)||envelope.due<0||m.source!=='quest-invite:'+entry.id+':'+m.created)continue;
  // Do not ask whether the distant issuer is still alive, present or in need.
  // This is the proposal as mailed; accepting it later rechecks live conditions.
  result.push({id:m.id,receipt:m.receipt,template:{...entry.value,place:envelope.place,reward:envelope.reward},source:'已送达来信（发件人 '+m.sender+'；寄于第'+m.created+'分钟；收据 '+m.receipt+'）',created:m.created,receivedAt:c.w.time,due:envelope.due,place:envelope.place,text:envelope.title+'：这是寄信时的提议，当前条件须到场重新核实。'});
 }
 return result;
}

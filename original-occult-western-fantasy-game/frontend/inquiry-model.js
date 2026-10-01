// Presentation only: inputs are the same closed safe domains used by Information.
export const titles={main:'Second Death',mortuary:'Recent death certificate',insurance:'Insurance continuity',register:'Old civil entry',police:'Police custody extract',property:'Dual Address Property',burial:'Impossible Burial',railway:'The Train That Never Arrived',company:'Self-Signing Company',accident:'Claims Before the Accident',headline:"Tomorrow’s Headline"};
export const readable=s=>String(s??'').replace(/^(origin|prior_life|faith|claim\.seed|claim\.archetype|matter\.pattern)\./,'').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const text=v=>typeof v==='string'?v:'';
export const row=(id,label,kind,content,source='',custody='')=>({id,label,kind,text:String(content??''),source:String(source??''),custody:String(custody??'')});
const describe=o=>Object.entries(o??{}).filter(([,v])=>v!==''&&v!==false&&v!=='none').map(([k,v])=>readable(k)+': '+(v===true?'Yes':typeof v==='object'?describe(v):String(v))).join('\n');
export function projectRegister(summary,nodes,matters,links,query=''){
 const life=summary.player_status_projection??{},progress=summary.player_progression_projection??{},epi=summary.player_epistemic_projection??{},claim=summary.player_claim_projection??{},ob=summary.player_obligations_projection??{},conv=summary.convergence??{};
 const evidence=[],cases=[],rows=[],status=[],terms=[],parents={};
 for(const n of nodes){const v=n.value;if(!v||v.text==='Not acquired')continue;
  if(v.detail?.procedure?.mandate){cases.push(row(n.id,titles[v.subject]??readable(v.subject),'Known mandate',v.text,describe(v.detail.settlement),[v.detail.deadline,v.detail.procedure.expired?v.detail.late:'',v.detail.injured?'Injury persists. '+(v.detail.treated?'Care recorded.':'Care not yet recorded.'):'',describe(v.detail.procedure)].filter(Boolean).join('\n')));}
  else if(n.id!=='main'&&(v.provenance||v.custody)){const id=n.id;evidence.push(row(id,titles[id]??titles[v.subject]??readable(v.subject||id),'Evidence',v.text,v.provenance,v.custody+(v.verified?' · Provenance verified; cause not established':'')));parents[id]=n.id;}
  for(const e of Object.values(v.detail?.evidence??{})){if(!e.known)continue;const id=e.id;parents[id]=n.id;evidence.push(row(id,readable(id),'Evidence',e.text,e.issuer,readable(e.kind)+(e.verified?' · Authenticated source':'')));}
 }
 const cv=conv.evidence??{};
 for(const key of ['company','accident','headline']){
  const c=conv.cases?.[key];if(c?.mandate)cases.push(row(key,titles[key],'Known mandate',c.prepared?'Preparations recorded.':'Preparations not recorded.',describe(conv.settlements?.[key]),describe(c)));
  for(const [slot,e] of Object.entries(cv[key]??{}))if(e.known){const id=key+'_'+slot;parents[id]='main';evidence.push(row(id,titles[key]+' / '+readable(slot),'Evidence',e.text,'Attribution and carrier identity are retained in the acquired text.','Player-held source. Not a universal explanation.'));}
 }
 if(cv.residual?.known){parents.residual='main';evidence.push(row('residual','Residual comparison','Finding',cv.residual.text,'Supervised carrier comparison','Deep cause unresolved.'));}
 for(const slot of ['p0','p1'])for(const role of ['request','reply'])if(cv[slot+'_'+role])evidence.push(row('pattern_'+slot+'_'+role,'Professional Pattern '+slot+' '+role,'Institutional record',cv[slot+'_'+role],'Independent carrier','Scoped to this Pattern instance.'));
 const opening=matters.find(m=>m.id==='main')?.value;
 if(life.step===6)cases.unshift(row('main','Second Death','Family mandate',opening?.text??'Current family verification mandate.',describe(summary.player_settlement_projection),'Independent current and old sources; no deep cause established.'));
 if(epi.testimony&&!epi.testimony.startsWith('No '))rows.push(row('testimony','Ada Rook’s account','Testimony',epi.testimony,'Attributed family account','Unverified testimony'));
 if(epi.text&&!epi.text.startsWith('No '))rows.push(row('hypothesis','Working explanation','Hypothesis',epi.text,'Player inference',epi.status??'suspected'));
 for(const key of ['property','burial','railway']){
  if(summary.network_testimony?.[key])rows.push(row('testimony_'+key,titles[key],'Testimony',summary.network_testimony[key],'Attributed account','Not World Truth'));
  if(summary.network_findings?.[key])rows.push(row('finding_'+key,titles[key],'Finding',summary.network_findings[key],'Known independent sources','Interpretation; deep cause unresolved'));
 }
 if(progress.verified)rows.unshift(row('finding','Independent records conflict','Finding','Independent authentic chains support incompatible deaths. Neither establishes the underlying cause.','Compared acquired records','Provenance is distinct from Truth.'));
 const lead=matters.find(m=>m.id==='lead')?.value;if(lead?.text)rows.push(row('lead','Current inquiry direction','Lead',lead.text,'Player-authored direction','Revisable'));
 if(!evidence.length)evidence.push(row('empty','No acquired evidence yet','Empty register','Obtain an authorized copy or testimony through a declared method. Unacquired records are not shown.'));
 if(!rows.length)rows.push(row('epistemic_empty','Keep the categories distinct','No recorded inference','Testimony, Findings and player Hypotheses will appear here when recorded.'));
 const dimensions={history:'Historical Truth',stability:'Current Stability',justice:'Justice',power:'Political Power',religion:'Religious Authority',accountability:'Institutional Accountability'};
 for(const [id,label] of Object.entries(dimensions))terms.push(row(id,label,'Hearing term',conv.settlements?.hearing?.filed?readable(conv.settlements.hearing[id]):'No compact filed'));
 status.push(row('life',life.name||'Ordinary identity','Identity',describe(life),'Ordinary biography only','No external office, ancestry or power granted.'));
 status.push(row('seed',progress.seed?readable(progress.seed):'No Seed selected','Seed / possibility',[progress.candidate_one,progress.candidate_two,progress.postponed?'Investiture postponed.':''].filter(Boolean).join('\n')||'No currently projected Seed candidate.','Candidates are not formal Claims.',progress.breached&&!progress.invested?'Breached and unsettled; no formal power.':''));
 status.push(row('claim',claim.active?'Formal Claim':'No active formal Claim','Claim',describe(claim),'Formal Anchor and jurisdiction',claim.active?'Price: '+claim.price:''));
 status.push(row('catalog',conv.catalog?.active?'Additional formal Claim':'Supervised carrier catalog','Bounded Claim contract',describe(conv.catalog),'16 Seeds / 32 archetypes is catalog scope, not an ownership or completion count.',conv.catalog?.price_due?'Claim Price is due. Maintain it before invocation.':''));
 status.push(row('obligations','Time and continuing duties','Commitments',describe(ob),'Known player obligations',ob.anchor_missed?'A missed Anchor appointment remains part of history.':''));
 status.push(row('hearing_duties','Hearing obligations','Institutional record',describe(conv.settlements?.hearing),'Six independent filed terms','A compact binds participating desks; it does not adjudicate the deep cause.'));
 for(const slot of ['p0','p1'])if(conv.cases?.[slot]?.opened)status.push(row('pattern_'+slot,'Professional Pattern '+slot,'Continuing duty',describe(conv.cases[slot]),'Independent bounded instance',conv.cases[slot].expired?'Expiry remains recorded.':''));
 const knownNodes=new Set(nodes.map(n=>n.id));
 const edges=links.filter(l=>l.value?.from&&l.value?.to&&knownNodes.has(l.value.from)&&knownNodes.has(l.value.to)).slice(0,64).map(l=>row(l.id,(titles[l.value.from]??readable(l.value.from))+' → '+(titles[l.value.to]??readable(l.value.to)),'Known relation',l.value.text,l.value.from,l.value.to));
 const q=query.toLowerCase();const filtered=evidence.filter(r=>!q||[r.label,r.source,r.text].join(' ').toLowerCase().includes(q));
 if(!filtered.length)filtered.push(row('search_empty','No matching acquired record','Search result','Try another source, title or phrase. This search does not inspect hidden records.'));
 return {life,progress,parents,evidence:filtered,allEvidence:evidence,cases,rows,status,terms,edges,matter:opening?.text??'Complete your ordinary adult identity before accepting the family mandate.',time:'Day '+(ob.day??0)+' / Practice base',identity:life.name?life.name+' / Independent Civil Verifier':'Independent Civil Verifier',heading:life.step<6?'Before the first case.':'Second Death'};
}

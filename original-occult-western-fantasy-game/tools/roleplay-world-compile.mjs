import { F,S,I,O } from './roleplay-compile.mjs';
export function compileRoleplayWorld(c) {
 const {contract,data,world,player,logic,slotIds,Proposal,read,set,tx,W,P}=c;

 // 8 static writes share one job, otherwise repeated job scans alone exceed the
 // Core's 16-read expanded budget. A model still never chooses a write target.
 const validTemplate=data.dynamicTemplates.map(t=>'(reads.w.proposal.templateId == "'+t.id+'" && reads.w.proposal.kind == "'+t.kind+'")').join(' || ');
 const valid='reads.w.proposal.decision == "introduce" && reads.w.proposal.batchId == reads.w.schedule.batchId && ('+validTemplate+') && reads.w.proposal.parentId == reads.p.location && reads.w.proposal.name != ""';
 const promotion=[];
 for(let n=0;n<slotIds.length;n++){
  const k=slotIds[n];
  const values={['dynamic.'+k]:{id:k,kind:F('reads.w.proposal.kind'),name:F('reads.w.proposal.name'),description:F('reads.w.proposal.description'),parentId:F('reads.w.proposal.parentId'),sourceBatchId:F('reads.w.schedule.batchId'),introducedTurn:F('reads.w.progress.effectiveTurns'),revision:1,status:'active',known:true,sourceRevision:F('reads.w.schedule.cursor'),role:'ordinary',fulfilled:false},
   'schedule.slot':n+2,'schedule.slotId':slotIds[n+1]??'full','schedule.batchId':n+1<8?'world_batch_'+String(n+2).padStart(2,'0'):'full'};
  promotion.push(set(world.id,values,'reads.w.proposal.pending && '+valid+' && reads.w.schedule.slot == '+(n+1)+' && !reads.w.dynamic.'+k+'.known'));
 }
 // Template authority is assigned in the same static slot command. The payload
 // cannot set role, wage, eligibility or a rule.
 for(const e of promotion){const value=Object.values(e.args).find(v=>v&&typeof v==='object'&&Object.hasOwn(v,'introducedTurn'));value.role=F('reads.w.proposal.templateId');}
 const due='reads.w.economy.nextDay <= args.tick';
 const de=[
  ...promotion,
  set(world.id,{'proposal.pending':false,'schedule.lastUpdatedTurn':F('reads.w.progress.effectiveTurns'),'schedule.nextEligibleTurn':F('reads.w.progress.effectiveTurns + 4'),'schedule.batchTurn':F('reads.w.progress.effectiveTurns'),'schedule.lastStatus':'consumed','schedule.cursor':F('reads.w.schedule.cursor + 1')},'reads.w.proposal.pending && reads.w.schedule.relevance == "hot"'),
  set(world.id,{'proposal.pending':false,'schedule.lastUpdatedTurn':F('reads.w.progress.effectiveTurns'),'schedule.nextEligibleTurn':F('reads.w.progress.effectiveTurns + 8'),'schedule.batchTurn':F('reads.w.progress.effectiveTurns'),'schedule.lastStatus':'consumed','schedule.cursor':F('reads.w.schedule.cursor + 1')},'reads.w.proposal.pending && reads.w.schedule.relevance != "hot"'),
  set(world.id,{'economy.coins':F('max(0, reads.w.economy.coins - (floor(args.tick / 1440) - reads.w.economy.processedDay) * 10)'),
   'economy.arrears':F('reads.w.economy.arrears + max(0, (floor(args.tick / 1440) - reads.w.economy.processedDay) * 10 - reads.w.economy.coins)'),
   'economy.processedDay':F('floor(args.tick / 1440)'),'economy.nextDay':F('(floor(args.tick / 1440) + 1) * 1440')},due),
  set(world.id,{'relation.overdue':true},'reads.w.relation.created && !reads.w.relation.kept && !reads.w.relation.overdue && reads.w.relation.due <= args.tick'),
  set(world.id,{'claim.active':false,'claim.valid':false,'claim.breached':true,'conditions.notice':'The recorded Price fell due without maintenance. The anchor is unstable and this Claim no longer operates; return to qualified maintenance.'},'reads.w.claim.active && reads.w.claim.due <= args.tick'),
  set(world.id,{'pursuit.stage':2,'pursuit.due':F('args.tick + 60')},'reads.w.pursuit.stage == 1 && reads.w.pursuit.due <= args.tick && !reads.w.pursuit.assisted'),
  set(world.id,{'pursuit.stage':3,'pursuit.due':F('args.tick + 120')},'reads.w.pursuit.stage == 2 && reads.w.pursuit.due <= args.tick && !reads.w.pursuit.assisted'),
  set(world.id,{'pursuit.stage':4,'conditions.notice':'The signed report, verification and repeated practice after summons support a limited detention order. Seek formal assistance; no hidden motive or lethal sentence is inferred.'},'reads.w.pursuit.stage == 3 && reads.w.pursuit.repeated && reads.w.pursuit.due <= args.tick && !reads.w.pursuit.assisted')
 ];
 const step=tx('world.reconcile',{tick:I(0,Number.MAX_SAFE_INTEGER)},null,de,'Deterministic deadlines and one bounded proposal are reconciled. No effective player turn is created.',0,{origin:'simulation',expose:false,reads:[W,P],outcome:'reconciled'});
 const inbox={...Proposal.properties};delete inbox.pending;
 world.commands.push({id:'receive_proposal',argsSchema:O(inbox),event:'roleplay_world.proposal',assign:{'proposal.pending':true,...Object.fromEntries(Object.keys(inbox).map(k=>['proposal.'+k,F('args.'+k)]))}});
 const agenda=manifestResource(c.manifest,'agenda.deliberation');
 agenda.module.body='Return one bounded local proposal or defer, using only the queued input. Echo batchId. Allowed: kind person/place/affair, public name and appearance, one known parentId, template neighbour/workbench/short_job. Do not supply rules, authority patches, qualifications, consent, powers, private motive or historical Truth. Description is incidental wording, not mechanical authority.';
 const task={id:'world.create',bindingSlotId:'structured',executionClass:'background',inputSchema:O({batchId:S(64),batchRevision:I(),slotId:S(32),turn:I(),parentId:S(96),objects:{type:'array',items:S(256),maxItems:3},templates:{type:'array',items:S(32),maxItems:3}}),context:['input'],resultPolicy:{resultClass:'declared_app_command',sink:'app_command'},queuePolicy:'fifo',variants:[{id:'default',prompt:{resourceId:agenda.program.promptProgramId,revision:agenda.program.revision},generation:{resourceId:agenda.generation.generationProfileId,revision:agenda.generation.revision},outputSchema:O(inbox),requiredCapabilities:[],resultBinding:{kind:'app.command',domainId:world.id,commandId:'receive_proposal',recordId:'main'}}]};
 contract.taskRuntime.tasks=[contract.taskRuntime.tasks.find(t=>t.id==='narrator'),task];
 contract.taskRuntime.turn={policy:'authority-first',stages:[],narratorTaskId:'narrator'};
 const R=read('w',world.id,['progress','economy','relation','claim','pursuit','schedule','proposal']);
 const needed='reads.w.proposal.pending || reads.w.economy.nextDay <= clock.targetTick || (reads.w.claim.active && reads.w.claim.due <= clock.targetTick) || (reads.w.relation.created && !reads.w.relation.kept && !reads.w.relation.overdue && reads.w.relation.due <= clock.targetTick) || ((!reads.w.pursuit.assisted) && ((reads.w.pursuit.stage == 1 || reads.w.pursuit.stage == 2 || (reads.w.pursuit.stage == 3 && reads.w.pursuit.repeated)) && reads.w.pursuit.due <= clock.targetTick))';
 contract.simulationRuntime={schemaVersion:1,clockId:'world',policy:{maxSteps:2,maxDeliberations:1,maxAdvanceTicks:1440},jobs:[
  {id:'world.reconcile',scopeId:'world',reads:[R],enabled:needed,due:F('clock.targetTick'),priority:0,relevance:'hot',action:{kind:'transaction',transactionId:step.id,input:{tick:F('clock.targetTick')}}},
  {id:'world.create',scopeId:'world',reads:[read('w',world.id,['progress','relation','conditions','pursuit','schedule']),read('p',player.id,['location'])],enabled:'reads.w.progress.episode == "open" && reads.w.schedule.slot <= 8 && reads.w.progress.effectiveTurns >= reads.w.schedule.nextEligibleTurn',due:F('clock.tick'),priority:1,relevance:F('reads.w.schedule.relevance'),action:{kind:'task',taskId:task.id,variantId:'default',input:{batchId:F('reads.w.schedule.batchId'),batchRevision:F('reads.w.schedule.cursor'),slotId:F('reads.w.schedule.slotId'),turn:F('reads.w.progress.effectiveTurns'),parentId:F('reads.p.location'),objects:[F('reads.w.schedule.focusId'),F('reads.w.relation.name'),F('reads.w.pursuit.knownFact')],templates:data.dynamicTemplates.map(t=>t.id)}}}
 ]};
 contract.lifecycleRuntime={...contract.lifecycleRuntime,domains:c.domains,automations:c.automations,workflows:[],interactions:[],clocks:[{id:'world',unit:'minute',initialTick:0}],advances:[{id:'advance',clockId:'world',maxTicks:1440}],retention:{maxTaskResults:32,maxReceipts:256}};
 contract.authorityRuntime.intentObservation.viewIds=['player.overview'];
 for(const name of ['story-start','generation-budget','run-policy'])contract.capabilities.push({id:name,version:1,required:true});
 contract.storyStart={schemaVersion:1,transactionId:'story.begin',narrativeField:'opening'};
 contract.generationBudget={schemaVersion:1,resolverAttempts:2,narratorAttempts:2,turnAttempts:4,backgroundAttempts:2,backgroundWindowTurns:4,backgroundPeriodTurns:20,backgroundPeriodAttempts:10,turnCounter:{domainId:'play_progress',recordId:'main',field:'effectiveTurns'}};
 contract.runPolicy={schemaVersion:1,deathTransactions:['risk.resolve'],deathOutcome:'death'};
 // Scalar mirror is a derived, protected output for Core quota accounting.
 const progress={id:'play_progress',scopeId:'world',schemaVersion:1,recordSchema:O({effectiveTurns:I()}),initial:{effectiveTurns:0},commands:[{id:'publish',argsSchema:O({effectiveTurns:I()}),event:'play_progress.published',assign:{effectiveTurns:F('args.effectiveTurns')}}],retention:{maxItems:1,maxLogicalBytes:1024,keepPinned:true,keepReferenced:true}};
 c.domains.push(progress);
 logic.derivedPublications[0].effects.push({kind:'app.command',domainId:progress.id,commandId:'publish',recordId:'main',args:{effectiveTurns:F('reads.w.progress.effectiveTurns')}});
 const module=manifestResource(c.manifest,'narrator');
 module.module.body='Resolve only the first adjudicated action and stop at feedback. Narrate the Host-approved outcome and public views; an impossible outcome spends no time despite the proposed duration. Description and personal expression do not create outside biography, consent, resources, offices, powers, private motives or hidden historical causes. Bounded generated labels are incidental presentation. Explain actual Anchor/Price, injury, instability, witnessed report and supported restrictions. Suggestions are drafts. Episode closure is not death; failed generation is uncommitted.';
 // Keep build resources lean: only the actual narrator and world-creation tasks.
 const keep=new Set([...Object.values(module),...Object.values(agenda)]);
 c.manifest.resources=c.manifest.resources.filter(r=>keep.has(r.resource));
 for(const d of c.domains)if(d.commands.length>64)throw new Error('Roleplay command budget: '+d.id+' '+d.commands.length);
 c.bridge={version:1,bindings:logic.transactions.filter(t=>t.intent.expose).map(t=>({id:t.verb,kind:'action',target:{transactionId:t.id},inputSchema:t.inputSchema,outputSchema:{type:"object",properties:{},additionalProperties:false}}))};
 return c;
}
function manifestResource(manifest,name){
 const find=type=>manifest.resources.find(r=>r.resourceType===type&&r.resource.displayName===name)?.resource;
 return {module:find('core.prompt-module'),program:find('core.prompt-program'),generation:find('core.generation-profile')};
}

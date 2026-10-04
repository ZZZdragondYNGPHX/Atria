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
  set(world.id,{'claim.active':false,'claim.valid':false,'claim.breached':true,'conditions.notice':'约定的维护期限已过，你尚未履行义务。锚点已经失稳，能力暂时无法使用；完成相应维护后才能恢复。'},'reads.w.claim.active && reads.w.claim.due <= args.tick'),
  set(world.id,{'pursuit.stage':2,'pursuit.due':F('args.tick + 60')},'reads.w.pursuit.stage == 1 && reads.w.pursuit.due <= args.tick && !reads.w.pursuit.assisted'),
  set(world.id,{'pursuit.stage':3,'pursuit.due':F('args.tick + 120')},'reads.w.pursuit.stage == 2 && reads.w.pursuit.due <= args.tick && !reads.w.pursuit.assisted'),
  set(world.id,{'pursuit.stage':4,'conditions.notice':'具名报告经核实后，你又在收到传唤后继续实践，因此遭到有限期拘留。可以正式申请协助；现有证据并不表明有人暗中针对你，也不涉及死刑。'},'reads.w.pursuit.stage == 3 && reads.w.pursuit.repeated && reads.w.pursuit.due <= args.tick && !reads.w.pursuit.assisted')
 ];
 const step=tx('world.reconcile',{tick:I(0,Number.MAX_SAFE_INTEGER)},null,de,'处理已到期的义务和至多一项当地变化，不计作玩家行动。',0,{origin:'simulation',expose:false,reads:[W,P],outcome:'reconciled'});
 const inbox={...Proposal.properties};delete inbox.pending;
 world.commands.push({id:'receive_proposal',argsSchema:O(inbox),event:'roleplay_world.proposal',assign:{'proposal.pending':true,...Object.fromEntries(Object.keys(inbox).map(k=>['proposal.'+k,F('args.'+k)]))}});
 const agenda=manifestResource(c.manifest,'agenda.deliberation');
 agenda.module.body='仅依据排队输入，提出一项范围有限的当地变化，或选择 defer。原样返回 batchId。kind 仅可为 person/place/affair，templateId 仅可为 neighbour/workbench/short_job，parentId 必须是已知地点。name 与 description 使用自然简体中文，描述日常人物、公共工作台或短工；避免系统术语、机械复述与固定句式。不得添加规则、状态补丁、资格、同意、力量、私密动机或历史真相。描述只影响叙事措辞，不改变规则。';
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
 module.module.body='用自然、流畅的简体中文叙述，只写宿主已裁定的第一个行动，写到反馈便停下，把下一步留给玩家。以已确认结果和公开资料为依据；impossible 表示行动未成立，不论计划耗时多久都不推进时间。个人描述不能创造额外身世、他人同意、资源、官职、力量、私密动机或隐秘历史原因。新增名称只是叙事表达。准确交代锚点、代价、伤势、失稳、目击报告和有依据的限制，把它们融入具体情境；避免“规则已确认”“公开投影”“事务提交”等系统口吻，少用套话、重复总结和生硬免责声明。术语统一使用“超凡能力”“裂隙”“种子”“锚点”“代价”；不要向玩家显示字段名、标识符或英文枚举。建议仍是草稿，一段经历结束不等于死亡，生成失败也不代表行动已经生效。';
 // Keep build resources lean: only the actual narrator and world-creation tasks.
 const keep=new Set([...Object.values(module),...Object.values(agenda)]);
 c.manifest.resources=c.manifest.resources.filter(r=>keep.has(r.resource));
 for(const r of c.manifest.resources)r.resource.displayName=({'narrator':'故事叙述','agenda.deliberation':'城中际遇'})[r.resource.displayName]||r.resource.displayName;
 for(const d of c.domains)if(d.commands.length>64)throw new Error('Roleplay command budget: '+d.id+' '+d.commands.length);
 c.bridge={version:1,bindings:logic.transactions.filter(t=>t.intent.expose).map(t=>({id:t.verb,kind:'action',target:{transactionId:t.id},inputSchema:t.inputSchema,outputSchema:{type:"object",properties:{},additionalProperties:false}}))};
 return c;
}
function manifestResource(manifest,name){
 const find=type=>manifest.resources.find(r=>r.resourceType===type&&r.resource.displayName===name)?.resource;
 return {module:find('core.prompt-module'),program:find('core.prompt-program'),generation:find('core.generation-profile')};
}

import {intentProjection} from './projection.js';
export default {
 precondition(){return true;},
 compute({args,reads}){
  const screen=JSON.parse(reads.screen.screen),row=reads.cause.records[0]?.value;
  const known=row?.playerKnown,page=Math.min(args.page,Math.max(0,Math.ceil((row?.publicDetails.length||0)/6)-1));
  const text=known?JSON.stringify({id:row.key,at:row.at,updated:row.updated,page,pages:Math.max(1,Math.ceil(row.publicDetails.length/6)),details:row.publicDetails.slice(page*6,page*6+6)}):'没有这条本人可知的事件记录。';
  screen.result={code:known?'event_read':'unknown_event',text,spent:0,at:screen.time,partial:false,steps:screen.result.steps};
  return {screen:JSON.stringify(screen),intent:intentProjection(screen)};
 },
 invariant(){return true;}
};

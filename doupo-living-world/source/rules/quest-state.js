export const initialQuests=()=>({serial:0,page:0,skipped:false,instances:[],totals:[],history:[],publicOffers:[]});
export const initialQuestActivities=()=>({serial:0,instances:[],history:[],certificates:[]});
export const settledQuest=q=>['completed','abandoned','withdrawn'].includes(q.status)&&q.earned===q.paid&&!q.custody.qty&&!q.custody.gold&&!q.helper&&!['active','paused'].includes(q.agreement);

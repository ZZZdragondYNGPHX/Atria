export const emptyEncounter=()=>({id:'',enemy:'',round:0,guard:false,phase:'idle',place:'',reason:'',objective:'',protected:'',started:0,
 seed:'',cursor:0,clock:0,participants:[],queue:[],requests:[],log:[],result:'',winner:'',offers:[],loot:[]});
export const activeEncounter=e=>!!e?.id&&!['closed','idle'].includes(e.phase);
export const member=(e,id)=>e.participants.find(p=>p.id===id);
// The native command overlays these fields on the same canonical body record.
// Immutable identity/background fields do not travel on every area hit.
export const BATTLE_BODY_FIELDS=['x','y','xp','hp','qi','injury','study','condition','gear','control','activity','suspended','speechReady',
 'plan','next','gold','inventory','deathAt','ward','partner','destination','arriveAt','displayed','displayedAt','updated','lastMedicine','needitem','needqty','lastSocial'];
// Area victims keep their learning library, inventory and ongoing activity in
// the canonical record. Only preparation and actual impact fields can change.
export const IMPACT_BODY_FIELDS=['x','y','hp','qi','gold','injury','condition','gear','control','speechReady','plan','next','destination','arriveAt','lastMedicine'];

// Record layout groups rule state beneath one explicit read grant. Identity and
// availability remain native first-class fields; nothing is stored twice.
export const MIND_FIELDS=['traits','goals','motives','social'];
export function packPerson(p){const {actor,alive,health,...rest}=p;return {actor,alive,state:{body:Object.fromEntries(Object.entries(rest).filter(([key])=>!MIND_FIELDS.includes(key))),mind:Object.fromEntries(MIND_FIELDS.map(key=>[key,rest[key]])),health}};}
export function unpackPerson(p){return {...p.state.body,...p.state.mind,health:p.state.health||'',actor:p.actor,alive:p.alive};}
export function packWorld(w){const {serial,...state}=w;return {serial,state};}
export function unpackWorld(w){return {...w.state,serial:w.serial};}

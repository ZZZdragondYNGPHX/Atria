// Record layout groups rule state beneath one explicit read grant. Identity and
// availability remain native first-class fields; nothing is stored twice.
export function packPerson(p){const {actor,alive,...state}=p;return {actor,alive,state};}
export function unpackPerson(p){return {...p.state,actor:p.actor,alive:p.alive};}
export function packWorld(w){const {serial,...state}=w;return {serial,state};}
export function unpackWorld(w){return {...w.state,serial:w.serial};}

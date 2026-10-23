import {people} from './people.js';
import {surnames,maleNames,femaleNames} from './names.js';
import {appearances} from './appearances.js';
import {arts} from './arts.js';
import {items} from './items.js';
// The only registry. Adding a pool never requires another sampling mechanism.
export const POOLS=[people,surnames,maleNames,femaleNames,appearances,arts,items].map(p=>({...p,kind:p.id.split('.')[0],source:'authored-game-content'}));
export const pool=id=>{const p=POOLS.find(p=>p.id===id);if(!p)throw Error('unknown content pool: '+id);return p;};

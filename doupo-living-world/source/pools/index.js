import {quests} from './quests.js';
import {people} from './people.js';
import {cast} from './cast.js';
import {atlas} from './atlas.js';
import {regions,locations,routes} from './geography.js';
import {surnames,maleNames,femaleNames} from './names.js';
import {appearances} from './appearances.js';
import {arts} from './arts.js';
import {items} from './items.js';
import {creatures} from './creatures.js';
// The only registry. Adding a pool never requires another sampling mechanism.
export const POOLS=[people,cast,surnames,maleNames,femaleNames,appearances,arts,items,creatures,regions,locations,routes,atlas,quests].map(p=>({...p,kind:p.id.split('.')[0],source:'authored-game-content'}));
export const pool=id=>{const p=POOLS.find(p=>p.id===id);if(!p)throw Error('unknown content pool: '+id);return p;};

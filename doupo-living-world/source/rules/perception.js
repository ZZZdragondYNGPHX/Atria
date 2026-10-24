import {placeOf} from '../content/catalog.js';
import {awarenessRestriction} from './condition.js';
import {creatures} from '../pools/creatures.js';
import {lineClear} from './spatial.js';

// Current place scenes use a bounded grid ray; route scenes use the same
// traversed segment. Neither location membership nor a private graph is sight.
export function canPerceive(a,b){
 if(a.place!==b.place||awarenessRestriction(a))return false;
 if(a.place.startsWith('route:'))return true;
 const vision=a.species?creatures.entries.find(e=>e.id===a.species)?.value.vision||8:8;
 if(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))>vision)return false;
 const place=placeOf(a.place);if(!place)return false;
 return lineClear(a.place,a,b);
}

import {PLACES} from '../content/catalog.js';
import {awarenessRestriction} from './condition.js';

// Current place scenes use a bounded grid ray; route scenes use the same
// traversed segment. Neither location membership nor a private graph is sight.
export function canPerceive(a,b){
 if(awarenessRestriction(a)||a.place!==b.place)return false;
 if(a.place.startsWith('route:'))return true;
 if(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))>8)return false;
 const place=PLACES.find(p=>p.id===a.place);if(!place)return false;
 const steps=Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
 for(let n=1;n<steps;n++){const x=Math.round(a.x+(b.x-a.x)*n/steps),y=Math.round(a.y+(b.y-a.y)*n/steps);if(place.blocks.some(v=>x>=v.x&&x<v.x+v.w&&y>=v.y&&y<v.y+v.h))return false;}
 return true;
}

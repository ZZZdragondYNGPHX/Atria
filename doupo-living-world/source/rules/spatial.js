import {placeOf} from '../content/catalog.js';
export function lineClear(place,a,b){
 const p=placeOf(place);if(!p)return false;
 let x=a.x,y=a.y;const dx=Math.abs(b.x-x),dy=-Math.abs(b.y-y),sx=x<b.x?1:-1,sy=y<b.y?1:-1;let err=dx+dy;
 while(x!==b.x||y!==b.y){const v=err*2;if(v>=dy){err+=dy;x+=sx;}if(v<=dx){err+=dx;y+=sy;}
  if(p.blocks.some(q=>x>=q.x&&x<q.x+q.w&&y>=q.y&&y<q.y+q.h))return false;
 }return true;
}
// Grid BFS has a stable neighbor order. Preview and settlement use this same rule.
export const occupiedAt=(rows,place,except=[])=>new Set(rows.filter(r=>r.value.alive&&r.value.place===place&&!except.includes(r.id)).map(r=>r.value.x+','+r.value.y));
export function placeBody(p,rows){
 const s=placeOf(p.place);if(!s)return;
 const occupied=new Set(rows.filter(r=>r.value!==p&&r.value.alive&&r.value.place===p.place).map(r=>r.value.x+','+r.value.y)),points=[];
 for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)if(!occupied.has(x+','+y)&&!s.blocks.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h))points.push({x,y});
 points.sort((a,b)=>Math.abs(a.x-p.x)+Math.abs(a.y-p.y)-Math.abs(b.x-p.x)-Math.abs(b.y-p.y)||a.y-b.y||a.x-b.x);
 if(!points.length)throw Error('physical location capacity');p.x=points[0].x;p.y=points[0].y;
}
function reachable(place,from,max,occupied){
 const s=placeOf(place);if(!s)return null;
 const valid=(x,y)=>x>=0&&y>=0&&x<s.width&&y<s.height&&(!occupied.has(x+','+y)||x===from.x&&y===from.y)&&!s.blocks.some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h);
 if(!valid(from.x,from.y))return null;
 const first={x:from.x,y:from.y,cost:0,parent:''},queue=[first],seen=new Map([[from.x+','+from.y,first]]);
 for(let at=0;at<queue.length;at++){const c=queue[at];if(c.cost>=max)continue;
  for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){const x=c.x+dx,y=c.y+dy,key=x+','+y;if(valid(x,y)&&!seen.has(key)){const n={x,y,cost:c.cost+1,parent:c.x+','+c.y};seen.set(key,n);queue.push(n);}}
 }return seen;
}
export function reachablePositions(place,from,max=2,occupied=new Set()){return [...(reachable(place,from,max,occupied)?.values()||[])].map(({x,y,cost})=>({x,y,path:cost}));}
export function pathTo(place,from,to,occupied=new Set()){
 const seen=reachable(place,from,280,occupied),last=seen?.get(to.x+','+to.y);if(!last)return null;
 const path=[];let at=last;while(at.parent){path.push({x:at.x,y:at.y});at=seen.get(at.parent);}return path.reverse();
}

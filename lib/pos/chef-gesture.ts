/** Ignore vertical scrolling and small taps; return the destination for a deliberate swipe. */
export function swipeDestination(start:{x:number;y:number},end:{x:number;y:number},current:0|1|2=0):0|1|2|null {
 const dx=end.x-start.x,dy=end.y-start.y;
 return Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.7?(dx<0?Math.min(2,current+1) as 0|1|2:Math.max(0,current-1) as 0|1|2):null;
}

type SwipeTouch={identifier:number;clientX:number;clientY:number};
/** A vertical scroll locks the gesture until release; only one finger navigates. */
export function createSwipeTracker(){
 let start:{x:number;y:number;id:number}|null=null;
 return {
  begin(touches:SwipeTouch[],enabled=true){const t=touches[0];start=enabled&&touches.length===1?{x:t.clientX,y:t.clientY,id:t.identifier}:null;},
  move(touches:SwipeTouch[]){if(!start)return false;if(touches.length!==1||touches[0].identifier!==start.id){start=null;return false}const t=touches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;if(Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)){start=null;return false}return Math.abs(dx)>20&&Math.abs(dx)>Math.abs(dy)*1.7;},
  end(touches:SwipeTouch[],current:0|1|2){const saved=start;start=null;if(!saved)return null;const t=touches.find(t=>t.identifier===saved.id);return t?swipeDestination(saved,{x:t.clientX,y:t.clientY},current):null;},
  cancel(){start=null;}
 };
}

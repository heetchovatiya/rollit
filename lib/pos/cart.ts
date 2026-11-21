/** Most recently added items appear first; quantity reductions preserve the order. */
export function changeCart(cart:Record<string,number>,id:string,delta:number){
 const next={...cart},qty=Math.max(0,Math.min(9999999,(next[id]||0)+delta));
 if(qty===0){delete next[id];return next;}
 if(delta>0){delete next[id];return {[id]:qty,...next};}
 next[id]=qty;return next;
}
export function removeCartItem(cart:Record<string,number>,id:string){const next={...cart};delete next[id];return next;}

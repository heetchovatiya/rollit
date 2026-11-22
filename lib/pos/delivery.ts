import {businessDay} from './business-day';
import type {KitchenOrder} from './types';
export function deliveredQuantity(order:KitchenOrder,productId:string){
 const item=order.items.find(i=>i.id===productId);
 if(!item)return 0;
 return Math.max(0,Math.min(item.qty,order.delivered?.[productId]??(order.givenAt?item.qty:0)));
}
export function deliveryProgress(order:KitchenOrder){return {given:order.items.reduce((n,i)=>n+deliveredQuantity(order,i.id),0),total:order.items.reduce((n,i)=>n+i.qty,0)}}
export function orderSummary(order:KitchenOrder){
 const names=order.items.slice(0,3).map(i=>`${i.qty}× ${i.name.replace(/Kathi Roll/gi,'Roll').replace(/Water Bottle/gi,'Water')}`);
 return names.join(' · ')+(order.items.length>3?` · +${order.items.length-3} more`:'');
}

export function inActiveQueue(order:KitchenOrder){return !order.hiddenAt&&!order.cancelledAt&&!order.completedAt&&!(order.paidAt&&order.givenAt);}

export function inCurrentQueue(order:KitchenOrder,now=Date.now()){
 if(order.hiddenAt||order.cancelledAt||order.deletedAt||order.discardedAt)return false;
 if(inActiveQueue(order))return true;
 if(!order.paidAt||!order.givenAt)return false;
 const completed=Date.parse(order.completedAt||[order.paidAt,order.givenAt].sort().at(-1)!);
 return now<completed+30000;
}

export function orderStatus(order:KitchenOrder):'Active'|'Served'|'Paid'|'Completed'|'Discarded'|'Deleted'{
 if(order.hiddenAt||order.deletedAt||order.events?.some(e=>e.action==='Deleted'))return 'Deleted';
 if(order.discardedAt||order.cancelledAt)return 'Discarded';
 if(order.completedAt)return 'Completed';if(order.paidAt)return 'Paid';if(order.givenAt)return 'Served';return 'Active';
}
export function nextOrderNumber(orders:KitchenOrder[],at:string,resetTime='00:00'){
 const currentDay=businessDay(at,resetTime);let last=0;for(const o of orders){if((o.businessDay||businessDay(o.date,resetTime))===currentDay&&/^\d+$/.test(o.number))last=Math.max(last,Number(o.number))}return String(last+1).padStart(3,'0');
}

export function paidQuantity(order:KitchenOrder,productId:string){
 return order.paidQuantities?.[productId]??(order.paidAt?order.items.find(i=>i.id===productId)?.qty||0:0);
}
export function paymentDue(order:KitchenOrder){return Math.max(0,order.total-(order.paidTotal??(order.paidAt?order.total:0))-(order.discountTotal||0))}

export function queueDayGroups(orders:KitchenOrder[],now=Date.now()){
 const today=businessDay(now);
 return {
  current:orders.filter(order=>inCurrentQueue(order,now)).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)),
  history:orders.filter(order=>!inCurrentQueue(order,now)&&businessDay(order.date)===today)
   .sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)),
 };
}

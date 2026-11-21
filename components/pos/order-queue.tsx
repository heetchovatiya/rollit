"use client";
import {useEffect,useState,useRef} from 'react';
import {ChevronDown,ChevronUp,Check,Minus,Clock,CreditCard,Banknote,X,RefreshCw,Pencil,Trash2,Ban} from 'lucide-react';
import type {KitchenOrder} from '@/lib/pos/types';
import type {StoreAction} from '@/lib/pos/validation';
import {money} from '@/lib/pos/format';
import {DeliveryControls} from './delivery-controls';
import {deliveryProgress,orderSummary,inActiveQueue,orderStatus,paymentDue,queueDayGroups,inCurrentQueue} from '@/lib/pos/delivery';
import {OrderEditor,type QueueProduct} from './order-editor';
import {Dialog} from './dialog';

export function OrderQueue({orders,products=[],busy,onAction,onRefresh,mode="admin"}:{
 mode?:"admin"|"queue"|"manage";
 products?:QueueProduct[];
 orders:KitchenOrder[];
 busy:boolean;
 onAction:(action:StoreAction)=>Promise<boolean>;
 onRefresh:()=>Promise<unknown>;
}){
 const [expanded,setExpanded]=useState<string|null>(null);
 const [completePayment,setCompletePayment]=useState(false);
 const [pay,setPay]=useState<KitchenOrder|null>(null);
 const [cancel,setCancel]=useState<KitchenOrder|null>(null);
 const [undoServed,setUndoServed]=useState<KitchenOrder|null>(null);
 const [discard,setDiscard]=useState(false);
 const [historyFilter,setHistoryFilter]=useState('All');
 const [showHistory,setShowHistory]=useState(false);
 const [error,setError]=useState('');
 const [working,setWorking]=useState(false);
 const [tick,setTick]=useState(Date.now());
 const [edit,setEdit]=useState<KitchenOrder|null>(null);
 const refreshRef=useRef(onRefresh);
 refreshRef.current=onRefresh;
 useEffect(()=>{
  const timer=setInterval(()=>{setTick(Date.now());if(!document.hidden)void refreshRef.current()},8000);
  const clock=setInterval(()=>setTick(Date.now()),1000);
  return ()=>{clearInterval(timer);clearInterval(clock)};
 },[]);
 const active=orders.filter(inActiveQueue).sort((a,b)=>a.date.localeCompare(b.date));
 const allHistory=[...orders].sort((a,b)=>b.date.localeCompare(a.date));
 const history=allHistory.filter(order=>!inActiveQueue(order));
 const today=queueDayGroups(orders,tick);
 const rows=mode==='queue'?today.current:mode==='manage'
  ?allHistory.filter(order=>historyFilter==='All'||orderStatus(order)===historyFilter)
  :showHistory?history:active;
 const count=mode==='queue'?today.current.length+today.history.length:rows.length;
 const locked=busy||working;

 async function act(action:StoreAction){
  if(working||busy)return false;
  setWorking(true);
  setError('');
  try{
   const ok=await onAction(action);
   if(!ok)setError('Could not confirm the change. Refresh the queue and retry.');
   return ok;
  }catch(error){setError((error as Error).message);return false}
  finally{setWorking(false)}
 }
 function confirmDiscard(order:KitchenOrder){setError('');setDiscard(true);setCancel(order)}
 function toggleServed(order:KitchenOrder){
  setError('');
  if(order.givenAt)setUndoServed(order);
  else void act({type:'orderGiven',id:order.id});
 }
 function renderOrder(order:KitchenOrder){
  const status=orderStatus(order),progress=deliveryProgress(order),open=expanded===order.id;
  const minutes=Math.max(0,Math.floor((tick-Date.parse(order.date))/60000));
  const removed=!!order.cancelledAt||!!order.hiddenAt||!!order.deletedAt;
  const readonly=mode==='queue'&&!inCurrentQueue(order,tick);
  const hasPayment=!!order.paidAt||!!order.paidTotal;
  return <article className={'queue-card order-status-'+status.toLowerCase()+' '+(open?'expanded':'')} key={order.id}>
   <div className="queue-card-heading">
    <button className="queue-card-toggle" aria-expanded={open} aria-label={`Order ${order.number} details`} onClick={()=>setExpanded(open?null:order.id)}>
     <span className="order-token">#{order.number}</span>
     <span className="order-summary">
      <strong className="queue-item-summary" title={order.items.map(item=>`${item.qty}× ${item.name}`).join(', ')}>{orderSummary(order)}</strong>
      <small>{order.customer} · {order.orderType==='Dine-in'?`Dine-in${order.orderReference?' · Table '+order.orderReference:''}`:order.orderType==='Takeaway'?'Parcel':order.orderType} · {progress.given}/{progress.total} served</small>
      {order.notes&&<span className="queue-collapsed-note">{order.notes}</span>}
     </span>
     <span className="queue-badges">
      <span className={order.givenAt?'status-done':'status-wait'}>{['Deleted','Discarded','Completed'].includes(status)?status:order.givenAt?'Served':progress.given>0?'Partly served':'Preparing'}</span>
      <span className={order.paidAt?'status-done':'status-unpaid'}>{order.paidAt?(order.payment==='UPI'?'Online paid':'Cash paid'):order.paidTotal?`Due ${money(paymentDue(order))}`:'Unpaid'}</span>
      {order.paidAt&&order.givenAt&&!readonly&&mode==='queue'&&<small className="queue-history-countdown">History in {Math.max(0,Math.ceil((Date.parse(order.completedAt||[order.paidAt,order.givenAt].sort().at(-1)!)+30000-tick)/1000))}s</small>}
     </span>
     <span className="order-amount"><strong>{money(order.total)}</strong><small><Clock size={12}/>{(mode!=='admin'||showHistory)?new Date(order.date).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}):`${minutes} min`}</small></span>
     {open?<ChevronUp size={19}/>:<ChevronDown size={19}/>}
    </button>
    {!removed&&!readonly&&<div className="queue-row-actions">
     <button type="button" role="checkbox" aria-checked={order.givenAt?true:progress.given>0?'mixed':false} aria-label={`${order.givenAt?'Undo served for':'Mark all items served in'} order ${order.number}`} title={order.givenAt?'Undo served status':'Mark every remaining item as served'} className={'queue-given-control '+(order.givenAt?'is-given':progress.given>0?'is-partial':'')} disabled={locked} onClick={()=>toggleServed(order)}>
      <span className="queue-given-box">{order.givenAt?<Check size={18}/>:progress.given>0?<Minus size={18}/>:null}</span><span>{order.givenAt?'Served':'Served all'}</span>
     </button>
     <button type="button" aria-label={`Record payment for order ${order.number}`} className={'queue-paid-control '+(order.paidAt?'is-paid':'')} disabled={locked} onClick={()=>{setError('');setCompletePayment(false);setPay(order)}}><CreditCard size={23}/><span>{order.paidAt?'Paid ✓':'Paid'}</span></button>
     {mode==='queue'&&!readonly&&<button type="button" className="queue-discard-control" aria-label={`Discard order ${order.number}`} disabled={locked} onClick={()=>confirmDiscard(order)}><Ban size={18}/>Discard</button>}
     {mode==='queue'&&!readonly&&!(order.paidAt&&order.givenAt)&&<button type="button" className="queue-complete-control" disabled={locked} onClick={()=>{setError('');setCompletePayment(true);setPay(order)}}><Check size={18}/><span>Served and paid</span></button>}
    </div>}
   </div>
   {!removed&&!readonly&&(!order.completedAt||mode==='manage')&&<div className="queue-management">
    <button type="button" disabled={locked} aria-label={`Edit order ${order.number}`} onClick={()=>{setError('');setEdit(order)}}><Pencil size={15}/>Add / edit items</button>
    {mode!=='queue'&&!hasPayment&&<>
     <button type="button" disabled={locked} aria-label={`Remove order ${order.number}`} onClick={()=>{setError('');setDiscard(false);setCancel(order)}}><Trash2 size={15}/>Delete</button>
     <button type="button" disabled={locked} aria-label={`Discard order ${order.number}`} onClick={()=>confirmDiscard(order)}><Ban size={15}/>Discard</button>
    </>}
   </div>}
   {mode!=='queue'&&(hasPayment||!!order.cancelledAt)&&!order.hiddenAt&&<div className="queue-management"><button disabled={locked} aria-label={`Delete order ${order.number}`} onClick={()=>{setError('');setDiscard(false);setCancel(order)}}><Trash2 size={15}/>Delete order</button></div>}
   {open&&<div className="queue-card-body">
    <div className="queue-items">
     {order.items.map(item=><div className="delivery-line" key={item.id}><div className="delivery-line-name"><b>{item.qty}×</b><span>{item.name}</span><strong>{money(item.qty*item.price)}</strong></div><DeliveryControls order={order} productId={item.id} locked={locked} readOnly={readonly} onAction={act}/></div>)}
     {order.notes&&<p className="order-note"><b>Kitchen note</b>{order.notes}</p>}
     <small>Added by {order.createdBy||'Admin'} · {new Date(order.date).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</small>
     {order.cancelReason&&<p>Cancelled: {order.cancelReason}</p>}
    </div>
    {!removed&&!readonly&&<div className="order-actions">
     <button className={order.givenAt?'done-action':'given-action'} disabled={locked} onClick={()=>toggleServed(order)}><Check size={19}/>{order.givenAt?'Served ✓':progress.given>0?'Serve remaining':'Served all'}</button>
     <button className={order.paidAt?'done-action':'paid-action'} disabled={locked} onClick={()=>{setError('');setCompletePayment(false);setPay(order)}}><CreditCard size={19}/>{order.paidAt?'Paid ✓':'Paid'}</button>
    </div>}
   </div>}
  </article>;
 }
 return <section className="order-queue">
  <div className="queue-toolbar"><div><span className="brand-eyebrow">THE PASS</span><h2>{mode==='manage'?'Full order history':mode==='queue'?'Order queue':showHistory?'Order history':'Order queue'} <span className="queue-count">{count}</span></h2><p>{mode==='manage'?'All days, including discarded and deleted orders.':mode==='queue'?"Completed orders stay here for 30 seconds. Today's history is newest first.":showHistory?'Discarded, deleted and completed orders.':'Oldest first. Paid orders stay here until every item is served.'}</p></div><div className="queue-tools">
   {mode==='admin'&&<button onClick={()=>setShowHistory(!showHistory)}>{showHistory?'Back to queue':'History'}</button>}
   <button aria-label="Refresh queue" disabled={locked} onClick={()=>void onRefresh()}><RefreshCw size={18}/></button>
  </div></div>
  {mode==='manage'&&<div className="order-history-filters" role="group" aria-label="Order status filter">{['All','Active','Served','Paid','Completed','Discarded','Deleted'].map(status=><button type="button" key={status} aria-pressed={historyFilter===status} className={historyFilter===status?'selected':''} onClick={()=>setHistoryFilter(status)}>{status} <small>{status==='All'?orders.length:orders.filter(order=>orderStatus(order)===status).length}</small></button>)}</div>}
  {error&&<p role="alert" className="kitchen-error">{error}</p>}
  {mode==='queue'?<>
   <details className="queue-order-section" open>
    <summary>Current orders <span>{today.current.length} orders</span></summary>
    <div className="queue-list">{today.current.map(renderOrder)}</div>
    {!today.current.length&&<div className="queue-empty"><Check size={34}/><h3>All caught up.</h3><p>Orders awaiting payment or serving appear here.</p></div>}
   </details>
   <details className="queue-order-section">
    <summary>History <span>{today.history.length} orders today</span></summary>
    <div className="queue-list">{today.history.map(renderOrder)}</div>
    {!today.history.length&&<div className="queue-empty"><h3>No history today.</h3></div>}
   </details>
  </>:<>
   <div className="queue-list">{rows.map(renderOrder)}</div>
   {!rows.length&&<div className="queue-empty"><Check size={34}/><h3>{showHistory?'No past orders yet.':'All caught up.'}</h3><p>New orders will appear here as they come in.</p></div>}
  </>}
  {edit&&<OrderEditor order={edit} products={products} busy={locked} error={error} onClose={()=>setEdit(null)} onSave={act}/>}
  {undoServed&&<Dialog label="Confirm undo served" onClose={()=>{if(!locked)setUndoServed(null)}}><div className="payment-dialog"><h2>Untick served for order #{undoServed.number}?</h2><p>All items will be marked unserved. A completed order will return to the active queue.</p><button className="brand-primary" disabled={locked} onClick={async()=>{if(await act({type:'orderUnserved',id:undoServed.id,originalRevision:undoServed.revision||0}))setUndoServed(null)}}>Yes, untick served</button><button type="button" disabled={locked} onClick={()=>setUndoServed(null)}>Keep served</button>{error&&<p role="alert" className="kitchen-error">{error}</p>}</div></Dialog>}
  {pay&&<Dialog label={completePayment?'Confirm served and paid':pay.paidAt?'Change recorded payment':'Record payment'} onClose={()=>{if(!locked)setPay(null)}}><div className="payment-dialog">
   <button className="dialog-x" disabled={locked} onClick={()=>setPay(null)} aria-label="Close payment"><X/></button>
   <span className="brand-eyebrow">ORDER #{pay.number}</span>
   <h2>{completePayment?'Mark served and paid?':pay.paidAt?'Change recorded payment?':'How was it paid?'}</h2>
   <p className="payment-total">{money(pay.paidAt?pay.total:paymentDue(pay))}</p>
   <p>{completePayment?'Confirm the payment mode to mark every item served and the order paid.':pay.paidAt?'Confirm a different payment mode, or mark the order unpaid.':pay.paidTotal?`Already paid ${money(pay.paidTotal)}. Collect the remaining balance.`:'Choose the payment received.'}</p>
   <div className="payment-choices">{(['UPI','Cash'] as const).map(payment=><button key={payment} disabled={locked||(!completePayment&&!!pay.paidAt&&pay.payment===payment)} onClick={async()=>{
    const action:StoreAction=completePayment?{type:'orderComplete',id:pay.id,payment,originalRevision:pay.revision||0}:pay.paidAt?{type:'orderPayment',id:pay.id,payment,originalRevision:pay.revision||0}:{type:'orderPaid',id:pay.id,payment,originalRevision:pay.revision||0};
    if(await act(action))setPay(null);
   }}>{payment==='UPI'?<CreditCard/>:<Banknote/>}<strong>{payment==='UPI'?'Online':'Cash'}</strong><small>{completePayment?'Confirm served and paid':pay.paidAt?pay.payment===payment?'Current mode':'Change to this mode':payment==='UPI'?'UPI / online transfer':'Cash received'}</small></button>)}</div>
   {!completePayment&&(pay.paidAt||!!pay.paidTotal)&&<button type="button" className="payment-unpay" disabled={locked} onClick={async()=>{if(await act({type:'orderPayment',id:pay.id,payment:'Unpaid',originalRevision:pay.revision||0}))setPay(null)}}>Confirm mark unpaid</button>}
   {!completePayment&&(pay.paidAt||!!pay.paidTotal)&&<p>Unpay removes the recorded payment from sales totals and keeps a correction record.</p>}
   <small>This records payment received; it does not collect payment.</small>
   {error&&<p role="alert" className="kitchen-error">{error}</p>}
  </div></Dialog>}
  {cancel&&<Dialog label={discard?'Discard order':'Remove order'} onClose={()=>{if(!locked)setCancel(null)}}><form className="payment-dialog" onSubmit={async event=>{event.preventDefault();if(await act(discard?{type:'discardOrder',id:cancel.id,originalRevision:cancel.revision||0}:(cancel.paidAt||cancel.paidTotal||cancel.cancelledAt)?{type:'archiveOrder',id:cancel.id,originalRevision:cancel.revision||0,reason:'Order deleted'}:{type:'cancelOrder',id:cancel.id,reason:'Order deleted'}))setCancel(null)}}><h2>{discard?'Discard':'Delete'} order #{cancel.number}?</h2><p>{discard&&(cancel.paidAt||cancel.paidTotal)?'This discards the order and releases unserved stock reservations. The recorded payment remains in sales. Use Unpay first to reverse payment.':(cancel.paidAt||cancel.paidTotal||cancel.cancelledAt)?'This removes the order from order history. Its sale and deletion log are retained.':discard?'This removes the order from the queue and records it as discarded in history. Raw materials reserved for unserved items will be released.':'Raw materials reserved for unserved items will be released. This deletion is recorded in the activity log.'}</p><button className="brand-primary" disabled={locked}>{discard?'Discard order':'Delete order'}</button><button type="button" disabled={locked} onClick={()=>setCancel(null)}>Keep order</button>{error&&<p role="alert">{error}</p>}</form></Dialog>}
 </section>;
}

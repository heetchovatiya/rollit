"use client";
import {useEffect,useRef,useState} from 'react';
import {LockKeyhole,ArrowRight} from 'lucide-react';
import {OrderQueue} from './order-queue';
import type {QueueProduct} from './order-editor';
import type {KitchenOrder} from '@/lib/pos/types';
import type {StoreAction} from '@/lib/pos/validation';
export function ManageOrders({orders,products,busy,onAction,onRefresh}:{orders:KitchenOrder[];products:QueueProduct[];busy:boolean;onAction:(a:StoreAction,token?:string)=>Promise<boolean>;onRefresh:()=>Promise<unknown>}){
 const [pin,P]=useState(''),[token,T]=useState(''),[error,E]=useState(''),[checking,C]=useState(false),tokenRef=useRef('');
 function lock(){const current=tokenRef.current;tokenRef.current='';T('');if(current)void fetch('/api/auth/manage/lock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:current}),keepalive:true});}
 useEffect(()=>()=>{const current=tokenRef.current;if(current)void fetch('/api/auth/manage/lock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:current}),keepalive:true})},[]);
 useEffect(()=>{if(!token)return;const timer=setTimeout(lock,9*60*1000);return()=>clearTimeout(timer)},[token]);
 async function unlock(e:React.FormEvent){e.preventDefault();C(true);E('');try{const r=await fetch('/api/auth/manage/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});const b=await r.json() as {token:string;error?:string};P('');if(!r.ok)throw Error(b.error||'Could not unlock.');tokenRef.current=b.token;T(b.token);}catch(e){E((e as Error).message)}finally{C(false)}}
 if(!token)return <section className="manage-pin-gate"><div className="manage-lock-icon"><LockKeyhole size={29}/></div><span className="brand-eyebrow">MANAGE ORDERS</span><h1>Enter your 4-digit PIN</h1><p>A PIN is required each time you open this section.</p><form onSubmit={unlock}><label>Manager PIN<input autoFocus type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" minLength={4} maxLength={4} required value={pin} onChange={e=>P(e.target.value.replace(/\D/g,''))}/></label>{error&&<p role="alert" className="kitchen-error">{error}</p>}<button className="brand-primary" disabled={checking}>{checking?'Checking…':'Unlock orders'}<ArrowRight size={18}/></button></form></section>;
 return <><div className="manage-unlocked"><span><LockKeyhole size={15}/> Manage orders unlocked</span><button onClick={lock}>Lock section</button></div><OrderQueue mode="manage" orders={orders} products={products} busy={busy} onAction={a=>onAction(a,token)} onRefresh={onRefresh}/></>;
}

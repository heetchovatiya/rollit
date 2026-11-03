"use client";
import {ArrowUp,ArrowDown} from 'lucide-react';
import type {Product} from '@/lib/pos/types';
import {orderedMenu} from '@/lib/pos/menu-layout';
export function MenuSequenceEditor({products,order,onChange,busy}:{products:Product[];order:string[];onChange:(ids:string[])=>void;busy:boolean}){
 const active=orderedMenu(products.filter(p=>!p.archived),order);
 function move(index:number,delta:number){const ids=active.map(p=>p.id),to=index+delta;if(to<0||to>=ids.length)return;[ids[index],ids[to]]=[ids[to],ids[index]];onChange(ids)}
 return <section className="menu-sequence-editor"><h3>Menu sequence</h3><p>Reorder all items in the chef’s image grid. Each tablet row contains five items.</p><div className="menu-global-sequence">{active.map((item,i)=><div className="sequence-row" key={item.id}><span className="sequence-number">{i+1}</span><strong>{item.name}<small>{item.category}</small></strong><button type="button" disabled={busy||i===0} aria-label={`Move ${item.name} up`} onClick={()=>move(i,-1)}><ArrowUp size={16}/></button><button type="button" disabled={busy||i===active.length-1} aria-label={`Move ${item.name} down`} onClick={()=>move(i,1)}><ArrowDown size={16}/></button></div>)}</div></section>;
}

"use client";
import {useState} from 'react';
import {ChevronDown,ChevronUp} from 'lucide-react';
import {money} from '@/lib/pos/format';
import {QuickChoices} from './quick-choices';

export function ItemCustomization({name,options,value,onChange,extraPrice=0,onExtraPriceChange,disabled=false}:{
 name:string;
 options:string[];
 value:string;
 onChange:(value:string)=>void;
 extraPrice?:number;
 onExtraPriceChange?:(price:number)=>void;
 disabled?:boolean;
}){
 const [open,setOpen]=useState(false);
 return <div className="item-customization" data-no-swipe>
  <button type="button" className={'item-custom-button '+(value||extraPrice?'quick-picked':'')} aria-label={`Customize ${name}`} aria-expanded={open} disabled={disabled} onClick={()=>setOpen(!open)}>
   Custom{value||extraPrice?' · added':''}{open?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
  </button>
  {!open&&(value||extraPrice>0)&&<small className="item-custom-summary">{[value,extraPrice>0?`Extra ${money(extraPrice)} per item`:''].filter(Boolean).join(' · ')}</small>}
  {open&&<div className="item-custom-dropdown">
   {onExtraPriceChange&&<div className="item-extra-options" role="group" aria-label={`${name} extra charge`}><span>Extra charge per item</span><div>{[0,1000,2000].map(price=><button key={price} type="button" disabled={disabled} aria-pressed={extraPrice===price} className={extraPrice===price?'quick-picked':''} onClick={()=>onExtraPriceChange(price)}>{price===0?'No extra':`+${money(price)}`}</button>)}</div></div>}
   <QuickChoices label={`${name} quick options`} options={options} value={value} onChange={onChange} multiple disabled={disabled}/>
   <label>Item instructions<textarea rows={2} value={value} maxLength={240} disabled={disabled} onChange={event=>onChange(event.target.value)} placeholder="Choose an option or type an instruction…"/></label>
   <button type="button" disabled={disabled} onClick={()=>setOpen(false)}>Done</button>
  </div>}
 </div>;
}

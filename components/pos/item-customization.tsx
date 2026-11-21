"use client";
import {useState} from 'react';
import {ChevronDown,ChevronUp} from 'lucide-react';
import {QuickChoices} from './quick-choices';

export function ItemCustomization({name,options,value,onChange,disabled=false}:{
 name:string;
 options:string[];
 value:string;
 onChange:(value:string)=>void;
 disabled?:boolean;
}){
 const [open,setOpen]=useState(false);
 return <div className="item-customization" data-no-swipe>
  <button type="button" className={'item-custom-button '+(value?'quick-picked':'')} aria-label={`Customize ${name}`} aria-expanded={open} disabled={disabled} onClick={()=>setOpen(!open)}>
   Custom{value?' · added':''}{open?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
  </button>
  {!open&&value&&<small className="item-custom-summary">{value}</small>}
  {open&&<div className="item-custom-dropdown">
   <QuickChoices label={`${name} quick options`} options={options} value={value} onChange={onChange} multiple disabled={disabled}/>
   <label>Item instructions<textarea rows={2} value={value} maxLength={240} disabled={disabled} onChange={event=>onChange(event.target.value)} placeholder="Choose an option or type an instruction…"/></label>
   <button type="button" disabled={disabled} onClick={()=>setOpen(false)}>Done</button>
  </div>}
 </div>;
}

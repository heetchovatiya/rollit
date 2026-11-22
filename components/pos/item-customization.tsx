"use client";
import {useState} from 'react';
import {ChevronDown,ChevronUp} from 'lucide-react';
import {money} from '@/lib/pos/format';
import {customizationForUnit} from '@/lib/pos/item-customization';
import type {UnitCustomization} from '@/lib/pos/types';
import {QuickChoices} from './quick-choices';

export function ItemCustomization({name,options,value,onChange,extraPrice=0,onExtraPriceChange,quantity=1,unitCustomizations=[],onUnitChange,disabled=false}:{
 name:string;
 options:string[];
 value:string;
 onChange:(value:string)=>void;
 extraPrice?:number;
 onExtraPriceChange?:(price:number)=>void;
 quantity?:number;
 unitCustomizations?:UnitCustomization[];
 onUnitChange?:(custom:UnitCustomization)=>void;
 disabled?:boolean;
}){
 const [open,setOpen]=useState(false),[scope,setScope]=useState(''),[manualUnit,setManualUnit]=useState(1);
 const unit=scope==='manual'?manualUnit:Number(scope);
 const individual=quantity>1&&scope!==''&&scope!=='all';
 const ready=quantity===1||scope==='all'||(individual&&Number.isInteger(unit)&&unit>=1&&unit<=quantity);
 const first=customizationForUnit({notes:value,extraPrice,unitCustomizations},1);
 const sameNotes=unitCustomizations.every(custom=>custom.notes===first.notes)&&(unitCustomizations.length===quantity||value===first.notes);
 const sameExtra=unitCustomizations.every(custom=>custom.extraPrice===first.extraPrice)&&(unitCustomizations.length===quantity||extraPrice===first.extraPrice);
 const custom=individual?customizationForUnit({notes:value,extraPrice,unitCustomizations},unit):quantity===1?first:{unit:1,notes:sameNotes?first.notes:'',extraPrice:sameExtra?first.extraPrice:-1};
 const hasCustom=!!value||extraPrice>0||unitCustomizations.length>0;
 function changeNotes(notes:string){if(individual)onUnitChange?.({...custom,unit,notes});else onChange(notes)}
 function changeExtra(price:number){if(individual)onUnitChange?.({...custom,unit,extraPrice:price});else onExtraPriceChange?.(price)}
 return <div className="item-customization" data-no-swipe>
  <button type="button" className={'item-custom-button '+(hasCustom?'quick-picked':'')} aria-label={`Customize ${name}`} aria-expanded={open} disabled={disabled} onClick={()=>{if(!open)setScope(quantity>1?'':'all');setOpen(!open)}}>
   Custom{hasCustom?' · added':''}{open?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
  </button>
  {!open&&hasCustom&&<small className="item-custom-summary">{[value,extraPrice>0?`Extra ${money(extraPrice)} per item`:'',...unitCustomizations.map(item=>`Item ${item.unit}: ${item.notes||'Regular'}${item.extraPrice?' · +'+money(item.extraPrice):''}`)].filter(Boolean).join(' · ')}</small>}
  {open&&<div className="item-custom-dropdown">
   {quantity>1&&<label>Customize which items?<select aria-label={`${name} customization target`} disabled={disabled} value={scope} onChange={event=>setScope(event.target.value)}><option value="">Choose items…</option><option value="all">All {quantity} items</option>{Array.from({length:Math.min(quantity,100)},(_,index)=><option key={index} value={index+1}>{name} {index+1}</option>)}{quantity>100&&<option value="manual">Another item number</option>}</select></label>}
   {scope==='manual'&&quantity>1&&<label>Item number<input type="number" min={1} max={quantity} step={1} disabled={disabled} value={manualUnit} onChange={event=>setManualUnit(Number(event.target.value))}/></label>}
   {scope==='all'&&(!sameNotes||!sameExtra)&&<small>These items have different customizations. Choosing an option applies it to all {quantity} items.</small>}
   {ready&&<>
    {onExtraPriceChange&&<div className="item-extra-options" role="group" aria-label={`${name} extra charge`}><span>{individual?`Extra charge for item ${unit}`:'Extra charge per item'}</span><div>{[0,1000,2000].map(price=><button key={price} type="button" disabled={disabled} aria-pressed={custom.extraPrice===price} className={custom.extraPrice===price?'quick-picked':''} onClick={()=>changeExtra(price)}>{price===0?'No extra':`+${money(price)}`}</button>)}</div></div>}
    <QuickChoices label={`${name} quick options`} options={options} value={custom.notes} onChange={changeNotes} multiple disabled={disabled}/>
    <label>Item instructions<textarea rows={2} value={custom.notes} maxLength={240} disabled={disabled} onChange={event=>changeNotes(event.target.value)} placeholder="Choose an option or type an instruction…"/></label>
   </>}
   <button type="button" disabled={disabled} onClick={()=>setOpen(false)}>Done</button>
  </div>}
 </div>;
}

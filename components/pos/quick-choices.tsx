"use client";
import {toggleKitchenNote} from '@/lib/pos/quick-add';
export function QuickChoices({label,options,value,onChange,multiple=false,disabled=false}:{label:string;options:string[];value:string;onChange:(s:string)=>void;multiple?:boolean;disabled?:boolean}){
 if(!options.length)return null;
 const selected=multiple?value.split(',').map(s=>s.trim().toLowerCase()):[value.trim().toLowerCase()];
 return <div className="quick-choices" role="group" aria-label={label}><span>{label}</span><div>{options.map(option=>{const next=multiple?toggleKitchenNote(value,option):option;return <button type="button" key={option} aria-pressed={selected.includes(option.toLowerCase())} className={selected.includes(option.toLowerCase())?'quick-picked':''} disabled={disabled||next.length>(multiple?240:120)} onClick={()=>onChange(next)}>{option}</button>})}</div></div>;
}

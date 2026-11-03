"use client";
import {useEffect,useState} from 'react';
export function CustomerChoices({options,value,onChange,disabled=false}:{options:string[];value:string;onChange:(value:string)=>void;disabled?:boolean}){
 const saved=options.filter(s=>!['new','other'].includes(s.trim().toLowerCase()));
 const [custom,C]=useState(()=>!!value&&value!=='New'&&!saved.includes(value));
 useEffect(()=>{if(value==='New')C(false)},[value]);
 return <div className="customer-picker"><div className="quick-choices" role="group" aria-label="Customer quick add"><span>Customer type</span><div>{['New',...saved,'Other'].map(name=><button key={name} type="button" disabled={disabled} className={(name==='Other'?custom:!custom&&value===name)?'quick-picked':''} aria-pressed={name==='Other'?custom:!custom&&value===name} onClick={()=>{C(name==='Other');onChange(name==='Other'?'':name)}}>{name}</button>)}</div></div>{custom&&<label>Customer name<input autoFocus disabled={disabled} value={value} onChange={e=>onChange(e.target.value)} maxLength={120} placeholder="Enter customer name"/></label>}</div>;
}

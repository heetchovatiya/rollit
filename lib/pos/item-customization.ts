import type {SaleItem,UnitCustomization} from './types';

export function customizationForUnit(item:Pick<SaleItem,'notes'|'extraPrice'|'unitCustomizations'>,unit:number):UnitCustomization{
 return item.unitCustomizations?.find(custom=>custom.unit===unit)||{unit,notes:item.notes||'',extraPrice:item.extraPrice||0};
}
export function itemTotal(item:Pick<SaleItem,'price'|'qty'|'extraPrice'|'unitCustomizations'|'lineTotal'>){
 if(item.lineTotal!==undefined)return item.lineTotal;
 return item.price*item.qty+(item.unitCustomizations||[]).filter(custom=>custom.unit<=item.qty).reduce((total,custom)=>total+custom.extraPrice-(item.extraPrice||0),0);
}
export function sliceItem(item:SaleItem,start:number,qty:number):SaleItem{
 return {...item,qty,unitCustomizations:item.unitCustomizations?.filter(custom=>custom.unit>start&&custom.unit<=start+qty).map(custom=>({...custom,unit:custom.unit-start}))};
}

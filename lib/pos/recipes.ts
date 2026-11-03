import type {Product,StoreState,SaleItem} from './types';
export const stockRound=(n:number)=>Math.round((n+Number.EPSILON)*1e6)/1e6;
export function availableUnits(state:StoreState,p:Product){
 if(!p.recipeEnabled)return p.stock;
 if(!p.recipe?.length)return 0;
 return Math.max(0,Math.min(9999999,...p.recipe.map(line=>{const i=state.ingredients?.find(i=>i.id===line.ingredientId&&!i.archived);return i?Math.floor((i.stock+1e-8)/line.qty):0})));
}
export function recipeUsage(state:StoreState,p:Product):SaleItem['ingredientUsage']{
 if(!p.recipeEnabled)return undefined;
 return (p.recipe||[]).map(line=>({ingredientId:line.ingredientId,qty:line.qty,unitCost:state.ingredients.find(i=>i.id===line.ingredientId)?.unitCost||0}));
}
export function itemCost(state:StoreState,p:Product){const usage=recipeUsage(state,p);return usage?Math.round(usage.reduce((n,i)=>n+i.qty*i.unitCost,0)):p.cost;}
export function projectState(state:StoreState):StoreState{return {...state,products:state.products.map(p=>p.recipeEnabled?{...p,stock:availableUnits(state,p),cost:itemCost(state,p)}:p)}}
export function inferPack(description:string){const m=description.match(/(\d+(?:\.\d+)?)\s*(kg|gm|g|ml|litres?|liters?|ltr|l)\b/i);if(!m)return {unit:'pcs' as const,size:1};const unit=m[2].toLowerCase();return {unit:/^(kg|gm|g)$/.test(unit)?'g' as const:'ml' as const,size:Number(m[1])*(unit==='kg'||/^(l|ltr|liter|litre)/.test(unit)?1000:1)};}

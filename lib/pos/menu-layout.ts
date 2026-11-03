import type {Product} from './types';
type MenuItem=Pick<Product,'name'|'category'>;
export function groupMenu<T extends MenuItem>(products:T[]){
 const groups:{rolls:T[];fries:T[];water:T[];other:T[]}={rolls:[],fries:[],water:[],other:[]};
 for(const p of products){const text=`${p.category} ${p.name}`.toLowerCase();if(/water/.test(text))groups.water.push(p);else if(/fries|french fry/.test(text))groups.fries.push(p);else if(/roll|wrap/.test(text))groups.rolls.push(p);else groups.other.push(p);}
 return groups;
}

export function orderedMenu<T extends {id:string}>(products:T[],order:string[]=[]):T[]{const ranks=new Map(order.map((id,i)=>[id,i]));return [...products].sort((a,b)=>(ranks.get(a.id)??Number.MAX_SAFE_INTEGER)-(ranks.get(b.id)??Number.MAX_SAFE_INTEGER));}

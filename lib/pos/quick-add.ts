/** Toggle a comma-separated kitchen instruction while preserving typed notes. */
export function toggleKitchenNote(value:string,option:string){
 const parts=value.split(',').map(s=>s.trim()).filter(Boolean),key=option.toLowerCase();
 if(parts.some(s=>s.toLowerCase()===key))return parts.filter(s=>s.toLowerCase()!==key).join(', ');
 const spice=new Set(['spicy','less spicy']);
 return [...parts.filter(s=>!(spice.has(key)&&spice.has(s.toLowerCase()))),option].join(', ');
}

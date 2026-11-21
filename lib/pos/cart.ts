/** Most recently added or increased item appears at the top. */
export function changeCart(cart: Record<string, number>, id: string, delta: number) {
 const qty = Math.max(0, Math.min(9999999, (cart[id] || 0) + delta));
 const next = {...cart};
 if (qty === 0) delete next[id];
 else if (delta > 0) {
  delete next[id];
  return {[id]: qty, ...next};
 } else next[id] = qty;
 return next;
}
export function removeCartItem(cart: Record<string, number>, id: string) {
 const next = {...cart};
 delete next[id];
 return next;
}

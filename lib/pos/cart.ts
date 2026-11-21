/** New items appear first; quantity changes preserve each existing position. */
export function changeCart(cart: Record<string, number>, id: string, delta: number) {
 const qty = Math.max(0, Math.min(9999999, (cart[id] || 0) + delta));
 const next = {...cart};
 if (qty === 0) delete next[id];
 else if (!cart[id]) {
  return {[id]: qty, ...next};
 } else next[id] = qty;
 return next;
}
export function removeCartItem(cart: Record<string, number>, id: string) {
 const next = {...cart};
 delete next[id];
 return next;
}

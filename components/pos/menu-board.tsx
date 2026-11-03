"use client";
import type {ReactNode} from 'react';
import type {Product} from '@/lib/pos/types';
import {orderedMenu} from '@/lib/pos/menu-layout';
type MenuItem=Pick<Product,'id'|'name'|'sku'|'category'|'price'|'stock'>;
export function MenuBoard({products,renderItem,order=[]}:{order?:string[];products:MenuItem[];renderItem:(p:MenuItem)=>ReactNode}){
 return <div className="menu-tile-grid" aria-label="Menu items">{orderedMenu(products,order).map(renderItem)}</div>;
}

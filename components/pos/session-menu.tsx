"use client";
import {useState} from 'react';
export function SessionMenu({admin=false}:{admin?:boolean}){
 const [busy,B]=useState(false),[error,E]=useState('');
 async function logout(){B(true);E('');try{const r=await fetch('/api/auth/logout',{method:'POST'});if(!r.ok)throw Error('Could not sign out. Try again.');sessionStorage.removeItem('rollit-chef-pending');window.location.assign('/login');}catch(e){E((e as Error).message);B(false);}}
 return <div className={admin?'admin-session':'chef-session'}>{admin&&<nav className="admin-workspace-links" aria-label="Order workspace navigation"><a href="/chef?view=new">New order / cart</a><a href="/chef?view=queue">Chef queue</a><a href="/chef?view=manage">Manage orders (PIN)</a></nav>}<button onClick={logout} disabled={busy}>{busy?'Signing out…':'Sign out'}</button>{error&&<span role="alert">{error}</span>}</div>;
}

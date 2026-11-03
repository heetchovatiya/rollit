import {hash,passwordHash,equal} from './auth.mjs';
const json=(b,status=200)=>Response.json(b,{status,headers:{'Cache-Control':'private, no-store'}});
const sessionHash=async request=>hash(request.headers.get('Cookie')?.match(/(?:^|;\s*)rollit_session=([a-f0-9]{64})(?:;|$)/)?.[1]||'');
export async function ensureManage(db){await db.batch([db.prepare('CREATE TABLE IF NOT EXISTS pos_manage_grants (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,session_hash TEXT NOT NULL,expires INTEGER NOT NULL)'),db.prepare('CREATE TABLE IF NOT EXISTS pos_manage_pin (id TEXT PRIMARY KEY,salt TEXT NOT NULL,pin_hash TEXT NOT NULL)')]);}
export async function validManage(request,env,user){
 const token=request.headers.get('X-Order-Manage-Token')||'';if(!/^[a-f0-9]{64}$/.test(token))return false;
 return !!await env.DB.prepare('SELECT token_hash FROM pos_manage_grants WHERE token_hash=? AND user_id=? AND session_hash=? AND expires>?').bind(await hash(token),user.id,await sessionHash(request),Math.floor(Date.now()/1000)).first();
}
export async function handleManage(request,env,user){
 if(!user)return json({error:'Sign in to continue.'},401);
 if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Invalid request origin or method.'},403);
 const text=await request.text();if(text.length>1024)return json({error:'Request too large.'},413);
 let body;try{body=JSON.parse(text)}catch{return json({error:'Invalid request.'},400)}
 if(new URL(request.url).pathname.endsWith('/lock')){await env.DB.prepare('DELETE FROM pos_manage_grants WHERE token_hash=? AND user_id=? AND session_hash=?').bind(await hash(String(body?.token||'')),user.id,await sessionHash(request)).run();return json({ok:true});}
 const now=Math.floor(Date.now()/1000),key=await hash('manage-pin:'+user.id),limit=await env.DB.prepare('SELECT count,reset_at FROM pos_login_limits WHERE id=?').bind(key).first();
 if(limit&&limit.reset_at>now&&limit.count>=8)return json({error:'Too many PIN attempts. Try again in 15 minutes.'},429);
 await env.DB.prepare('INSERT INTO pos_login_limits(id,count,reset_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END').bind(key,now+900,now,now,now+900).run();
 const pin=String(body?.pin||''),config=await env.DB.prepare('SELECT salt,pin_hash FROM pos_manage_pin WHERE id=?').bind('main').first();
 if(!config)return json({error:'Manage orders PIN is not configured.'},503);
 const checked=await passwordHash(pin,config.salt);
 if(!/^\d{4}$/.test(pin)||!await equal(checked.hash,config.pin_hash))return json({error:'Incorrect PIN.'},401);
 await env.DB.prepare('DELETE FROM pos_login_limits WHERE id=?').bind(key).run();
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),expires=now+600;
 await env.DB.prepare('INSERT INTO pos_manage_grants(token_hash,user_id,session_hash,expires) VALUES(?,?,?,?)').bind(await hash(token),user.id,await sessionHash(request),expires).run();
 await env.DB.prepare('DELETE FROM pos_manage_grants WHERE expires<=?').bind(now).run();
 return json({token,expiresAt:expires*1000});
}

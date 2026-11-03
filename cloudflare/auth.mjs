const encoder=new TextEncoder();
export const sessionSeconds=role=>role==='admin'?15*86400:2*86400;
export const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export async function passwordHash(password,salt=random()){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
 return {salt,hash:Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('')};
}
export async function equal(a,b){const x=await hash(a),y=await hash(b);let d=0;for(let i=0;i<x.length;i++)d|=x.charCodeAt(i)^y.charCodeAt(i);return d===0;}
export async function ensureAuth(db){
 await db.batch([
 db.prepare('CREATE TABLE IF NOT EXISTS store (id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0)'),
 db.prepare('CREATE TABLE IF NOT EXISTS pos_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)'),
 db.prepare('CREATE TABLE IF NOT EXISTS pos_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL)'),
 db.prepare('CREATE TABLE IF NOT EXISTS pos_login_limits (id TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL)'),
 ]);
}
export const publicUser=u=>({id:u.id,username:u.username,name:u.name,role:u.role,disabled:!!u.disabled,createdAt:u.created_at});
export function cookie(token,role,secure=true){return `rollit_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token?sessionSeconds(role):0}${secure?'; Secure':''}`;}
export async function session(request,env){
 const token=request.headers.get('Cookie')?.match(/(?:^|;\s*)rollit_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;
 const row=await env.DB.prepare('SELECT user_id,expires FROM pos_sessions WHERE token_hash=? AND expires>?').bind(await hash(token),Math.floor(Date.now()/1000)).first();
 if(!row)return null;
 if(row.user_id==='owner')return {id:'owner',username:env.POS_ADMIN_USER,name:'Owner',role:'admin',disabled:false};
 const user=await env.DB.prepare('SELECT * FROM pos_users WHERE id=? AND disabled=0').bind(row.user_id).first();return user?publicUser(user):null;
}
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',...headers}});
const validOrigin=request=>request.headers.get('Origin')===new URL(request.url).origin;
export async function handleAuth(request,env,user){
 const path=new URL(request.url).pathname;
 if(path==='/api/auth/me'&&request.method==='GET')return user?json(user):json({error:'Sign in to continue.'},401);
 if(request.method!=='GET'&&!validOrigin(request))return json({error:'Invalid origin.'},403);
 if(path==='/api/auth/logout'&&request.method==='POST'){
  const token=request.headers.get('Cookie')?.match(/(?:^|;\s*)rollit_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(token)await env.DB.prepare('DELETE FROM pos_sessions WHERE token_hash=?').bind(await hash(token)).run();
  return json({ok:true},200,{'Set-Cookie':cookie('','chef',new URL(request.url).protocol==='https:')});
 }
 if(path==='/api/auth/login'&&request.method==='POST'){
  const text=await request.text();if(text.length>4096)return json({error:'Request too large.'},413);
  let body;try{body=JSON.parse(text)}catch{return json({error:'Invalid request.'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request.'},400);
  const username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
  if(!username||username.length>80||password.length>256)return json({error:'Check your username and password.'},400);
  const now=Math.floor(Date.now()/1000);
  // Both account and network limits prevent rotating one field to evade throttling.
  const keys=await Promise.all(['user:'+username,'ip:'+(request.headers.get('CF-Connecting-IP')||'local')].map(hash));
  for(const key of keys){
   await env.DB.prepare('INSERT INTO pos_login_limits(id,count,reset_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END').bind(key,now+900,now,now,now+900).run();
   const limit=await env.DB.prepare('SELECT count FROM pos_login_limits WHERE id=?').bind(key).first();
   if(limit.count>10)return json({error:'Too many sign-in attempts. Try again in 15 minutes.'},429,{'Retry-After':'900'});
  }
  let found=null;
  if(username===env.POS_ADMIN_USER?.toLowerCase()&&await equal(password,env.POS_ADMIN_PASSWORD||''))found={id:'owner',username:env.POS_ADMIN_USER,name:'Owner',role:'admin'};
  else{
   const row=await env.DB.prepare('SELECT * FROM pos_users WHERE username=?').bind(username).first();
   const checked=await passwordHash(password,row?.salt||'roll-it-unavailable-account-timing-salt');
   if(row&&!row.disabled&&await equal(checked.hash,row.password_hash))found=publicUser(row);
  }
  if(!found)return json({error:'Incorrect username or password.'},401);
  const token=random();
  await env.DB.batch([env.DB.prepare('INSERT INTO pos_sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await hash(token),found.id,now+sessionSeconds(found.role)),env.DB.prepare('DELETE FROM pos_sessions WHERE expires<=?').bind(now),env.DB.prepare('DELETE FROM pos_login_limits WHERE reset_at<=?').bind(now)]);
  return json({user:found,redirect:found.role==='admin'?'/':'/chef'},200,{'Set-Cookie':cookie(token,found.role,new URL(request.url).protocol==='https:')});
 }
 if(path==='/api/users'){
  if(!user)return json({error:'Sign in to continue.'},401);
  if(user.role!=='admin')return json({error:'Admin access required.'},403);
  if(request.method==='GET'){
   const rows=await env.DB.prepare('SELECT id,username,name,role,disabled,created_at FROM pos_users ORDER BY created_at DESC').all();
   return json({users:rows.results.map(publicUser)});
  }
  const text=await request.text();if(text.length>4096)return json({error:'Request too large.'},413);
  let b;try{b=JSON.parse(text)}catch{return json({error:'Invalid request.'},400)}
  if(!b||typeof b!=='object'||Array.isArray(b))return json({error:'Invalid request.'},400);
  if(request.method==='POST'){
   const username=String(b.username||'').trim().toLowerCase(),name=String(b.name||'').trim(),password=String(b.password||'');
   if(!/^[a-z0-9._-]{3,40}$/.test(username)||!name||name.length>80||password.length<10||password.length>128||!['chef','admin'].includes(b.role))return json({error:'Use a name, a 3–40 character username and a password of at least 10 characters.'},400);
   if(username===env.POS_ADMIN_USER?.toLowerCase())return json({error:'This username is reserved for the owner.'},409);
   const count=await env.DB.prepare('SELECT count(*) AS total FROM pos_users').first();if(count.total>=100)return json({error:'User limit reached.'},409);
   const hashed=await passwordHash(password);
   try{await env.DB.prepare('INSERT INTO pos_users(id,username,name,role,salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),username,name,b.role,hashed.salt,hashed.hash,new Date().toISOString()).run();}
   catch(e){if(String(e).includes('UNIQUE'))return json({error:'This username already exists.'},409);throw e;}
   return json({ok:true},201);
  }
  if(request.method==='PATCH'){
   if(typeof b.disabled!=='boolean'||b.id===user.id)return json({error:'You cannot disable your own account.'},400);
   const result=await env.DB.prepare('UPDATE pos_users SET disabled=? WHERE id=?').bind(b.disabled?1:0,String(b.id)).run();
   if(!result.meta.changes)return json({error:'User not found.'},404);
   await env.DB.prepare('DELETE FROM pos_sessions WHERE user_id=?').bind(b.id).run();return json({ok:true});
  }
 }
 return json({error:'Not found.'},404);
}
export function chefState(s){return {products:s.products.filter(p=>!p.archived).map(({id,name,sku,category,price,stock})=>({id,name,sku,category,price,stock})),orders:(s.orders||[]).map(o=>({...o,items:o.items.map(({cost,ingredientUsage,...item})=>item)})),settings:{menuOrder:s.settings.menuOrder||[],businessName:s.settings.businessName,defaultOrderType:s.settings.defaultOrderType||"Dine-in",quickCustomers:s.settings.quickCustomers||["Walk-in customer"],quickKitchenNotes:s.settings.quickKitchenNotes||["Less spicy","Spicy","No onion","No capsicum"]}};}
export function mayChefAccess(path,method,action){
 if(path==='/chef'||path.startsWith('/_next/static/')||path==='/rollit-logo.jpg'||path==='/favicon.svg'||path.startsWith('/menu-art/'))return method==='GET';
 if(path==='/api/pos')return method==='GET'||method==='POST'&&['createOrder','orderGiven','orderPaid','cancelOrder','discardOrder','orderDelivery','editOrder'].includes(action);
 return false;
}

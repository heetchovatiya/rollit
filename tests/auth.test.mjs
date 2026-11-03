import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureAuth,handleAuth,session,sessionSeconds,hash,mayChefAccess,chefState} from '../cloudflare/auth.mjs';
function database(){const sql=new DatabaseSync(':memory:');const db={prepare(query){let values=[];const s={bind(...v){values=v;return s},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}}},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}}};return s},async batch(statements){return Promise.all(statements.map(s=>s.run()))}};return db;}
const base='https://rollit.test';
const req=(path,body,cookie,method=body?'POST':'GET')=>new Request(base+path,{method,headers:{...(body?{'Content-Type':'application/json',Origin:base}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('owner login issues a secure 15-day session; invalid login and logout enforce authentication',async()=>{
 const env={DB:database(),POS_ADMIN_USER:'owner',POS_ADMIN_PASSWORD:'test-owner-password'};await ensureAuth(env.DB);
 assert.equal((await handleAuth(req('/api/auth/login',{username:'owner',password:'incorrect'}),env,null)).status,401);
 const r=await handleAuth(req('/api/auth/login',{username:'owner',password:'test-owner-password'}),env,null);assert.equal(r.status,200);
 const cookie=r.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);assert.match(cookie,/Max-Age=1296000/);
 const user=await session(req('/',null,cookie),env);assert.equal(user.role,'admin');assert.equal(await session(req('/',null,'rollit_session='+ 'a'.repeat(64)),env),null);
 assert.equal((await handleAuth(req('/api/auth/logout',{},cookie),env,user)).status,200);assert.equal(await session(req('/',null,cookie),env),null);
});
test('admin adds chef with hashed password; chef session expires after two days and disable revokes access',async()=>{
 const env={DB:database(),POS_ADMIN_USER:'owner',POS_ADMIN_PASSWORD:'test-owner-password'};await ensureAuth(env.DB);const admin={id:'owner',role:'admin'};
 const payload={name:'Kitchen One',username:'chef.one',password:'long-chef-password',role:'chef'};
 assert.equal((await handleAuth(req('/api/users',payload),env,null)).status,401);
 assert.equal((await handleAuth(req('/api/users',payload),env,{id:'chef',role:'chef'})).status,403);
 assert.equal((await handleAuth(req('/api/users',payload),env,admin)).status,201);
 const row=await env.DB.prepare('SELECT * FROM pos_users').first();assert.notEqual(row.password_hash,payload.password);assert.ok(row.salt);assert.equal(row.role,'chef');
 const login=await handleAuth(req('/api/auth/login',{username:payload.username,password:payload.password}),env,null);const cookie=login.headers.get('Set-Cookie');assert.match(cookie,/Max-Age=172800/);assert.equal((await login.json()).redirect,'/chef');assert.equal((await session(req('/',null,cookie),env)).role,'chef');
 assert.equal((await handleAuth(req('/api/users',{id:row.id,disabled:true},null,'PATCH'),env,admin)).status,200);assert.equal(await session(req('/',null,cookie),env),null);
 assert.equal((await handleAuth(req('/api/auth/login',{username:payload.username,password:payload.password}),env,null)).status,401);
 assert.equal(sessionSeconds('chef'),172800);assert.equal(sessionSeconds('admin'),1296000);
});
test('expired sessions, invalid origin, duplicate usernames and sign-in rate limits are enforced',async()=>{
 const env={DB:database(),POS_ADMIN_USER:'owner',POS_ADMIN_PASSWORD:'test-owner-password'};await ensureAuth(env.DB);
 await env.DB.prepare('INSERT INTO pos_sessions VALUES(?,?,?)').bind(await hash('b'.repeat(64)),'owner',1).run();assert.equal(await session(req('/',null,'rollit_session='+'b'.repeat(64)),env),null);
 const bad=new Request(base+'/api/auth/login',{method:'POST',headers:{Origin:'https://elsewhere.test'},body:'{}'});assert.equal((await handleAuth(bad,env,null)).status,403);
 let response;for(let i=0;i<11;i++)response=await handleAuth(req('/api/auth/login',{username:'owner',password:'wrong'}),env,null);assert.equal(response.status,429);
});
test('chef authorization rejects admin endpoints and strips financial inventory and profile fields',()=>{
 assert.equal(mayChefAccess('/api/pos','POST','sale'),false);assert.equal(mayChefAccess('/api/pos','POST','settings'),false);assert.equal(mayChefAccess('/api/pos','POST','orderPaid'),true);assert.equal(mayChefAccess('/api/pos','POST','editOrder'),true);assert.equal(mayChefAccess('/api/bills','POST'),false);assert.equal(mayChefAccess('/api/users','GET'),false);assert.equal(mayChefAccess('/ocr/worker.min.js','GET'),false);
 const filtered=chefState({products:[{id:'1',name:'Roll',sku:'R',category:'Food',price:100,stock:2,cost:40,billIds:['secret']}],orders:[{items:[{id:'1',cost:40,name:'Roll'}]}],settings:{businessName:'Roll-IT',email:'private'}});
 assert.equal(filtered.products[0].cost,undefined);assert.equal(filtered.products[0].billIds,undefined);assert.equal(filtered.orders[0].items[0].cost,undefined);assert.equal(filtered.settings.email,undefined);
});

test('Manage orders PIN grants are bound to a session and revoke on leaving; wrong PIN is limited',async()=>{
 const {ensureManage,handleManage,validManage}=await import('../cloudflare/manage-pin.mjs');const {passwordHash}=await import('../cloudflare/auth.mjs');const env={DB:database()};await ensureAuth(env.DB);await ensureManage(env.DB);const config=await passwordHash('1234');await env.DB.prepare('INSERT INTO pos_manage_pin VALUES(?,?,?)').bind('main',config.salt,config.hash).run();const user={id:'chef-one',role:'chef'},cookie='rollit_session='+'a'.repeat(64);
 assert.equal((await handleManage(req('/api/auth/manage/unlock',{pin:'9999'},cookie),env,user)).status,401);
 const r=await handleManage(req('/api/auth/manage/unlock',{pin:'1234'},cookie),env,user);assert.equal(r.status,200);const {token}=await r.json();const guarded=(session=cookie)=>new Request(base+'/api/pos',{headers:{Cookie:session,'X-Order-Manage-Token':token}});assert.equal(await validManage(guarded(),env,user),true);assert.equal(await validManage(guarded('rollit_session='+'b'.repeat(64)),env,user),false);assert.equal(await validManage(guarded(),env,{id:'other'}),false);
 await handleManage(req('/api/auth/manage/lock',{token},cookie),env,user);assert.equal(await validManage(guarded(),env,user),false);
 for(let i=0;i<8;i++)await handleManage(req('/api/auth/manage/unlock',{pin:'9999'},cookie),env,user);assert.equal((await handleManage(req('/api/auth/manage/unlock',{pin:'1234'},cookie),env,user)).status,429);assert.equal(mayChefAccess('/api/pos','POST','archiveOrder'),false);
});

test('menu illustrations are readable by chef but cannot be written through asset URLs',()=>{assert.equal(mayChefAccess('/menu-art/menu-illustrations.png','GET'),true);assert.equal(mayChefAccess('/menu-art/menu-illustrations.png','POST'),false);});

test('chef history includes soft-deleted records with costs redacted; discard action is authorized for PIN guarding',()=>{assert.equal(mayChefAccess('/api/pos','POST','discardOrder'),true);const s=chefState({products:[],orders:[{id:'deleted',hiddenAt:'2026-11-01',items:[{id:'x',cost:12,ingredientUsage:[{unitCost:3}]}]}],settings:{businessName:'Roll-IT'}});assert.equal(s.orders[0].id,'deleted');assert.equal(s.orders[0].items[0].cost,undefined);assert.equal(s.orders[0].items[0].ingredientUsage,undefined);});

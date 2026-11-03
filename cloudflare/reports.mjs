import {businessDay,businessWindow,lastClosedWindow,buildDailyReport,renderDailyReport,DAY_MS} from './business-day.mjs';
const json=(b,status=200)=>Response.json(b,{status,headers:{'Cache-Control':'private, no-store'}});
export async function ensureReports(db){await db.batch([
 db.prepare('CREATE TABLE IF NOT EXISTS pos_daily_reports (id TEXT PRIMARY KEY,schedule_key TEXT NOT NULL,business_day TEXT NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL,kind TEXT NOT NULL)'),
 db.prepare('CREATE TABLE IF NOT EXISTS pos_report_deliveries (id TEXT PRIMARY KEY,report_id TEXT NOT NULL,recipient TEXT NOT NULL,payload_json TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,first_attempt INTEGER NOT NULL DEFAULT 0,unknown_result INTEGER NOT NULL DEFAULT 0,last_error TEXT,message_id TEXT,sent_at TEXT)')
]);}
async function stateFrom(db){const row=await db.prepare('SELECT payload FROM store WHERE id=?').bind('main').first();const state=row?JSON.parse(row.payload):{orders:[],sales:[],ingredients:[]};state.settings={businessName:'Roll-IT',orderResetTime:'00:00',reportEmails:['officialrollit@gmail.com'],reportReplyTo:'officialrollit@gmail.com',reportSender:'',dailyReportEnabled:false,reportStartAt:'',...state.settings};return state;}
const issues=(env,s)=>[...(!env.RESEND_API_KEY?['Add RESEND_API_KEY to the Cloudflare Worker secrets.']:[]),...(!s.reportSender?['Enter a sender from a domain verified in Resend.']:[]),...(!s.reportEmails.length?['Add at least one report recipient.']:[])];
async function digest(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,'0')).join('');}
async function createReport(db,state,window,id,key,kind,now){
 const existing=await db.prepare('SELECT snapshot_json FROM pos_daily_reports WHERE id=?').bind(id).first(),snapshot=existing?JSON.parse(existing.snapshot_json):buildDailyReport(state,window),content=renderDailyReport(snapshot);
 const statements=[db.prepare('INSERT OR IGNORE INTO pos_daily_reports VALUES(?,?,?,?,?,?,?,?)').bind(id,key,window.day,window.start,window.end,JSON.stringify(snapshot),new Date(now).toISOString(),kind)];
 for(const recipient of state.settings.reportEmails){const payload={from:`Roll-IT <${state.settings.reportSender}>`,to:[recipient],reply_to:state.settings.reportReplyTo||undefined,subject:(kind==='test'?'[Test] ':'')+content.subject,html:content.html,text:content.text};statements.push(db.prepare('INSERT OR IGNORE INTO pos_report_deliveries(id,report_id,recipient,payload_json,status) VALUES(?,?,?,?,?)').bind(await digest(id+'|'+recipient),id,recipient,JSON.stringify(payload),'pending'));}
 // D1 batches atomically commit both the snapshot and its recipient jobs.
 await db.batch(statements);
}
export async function deliverReports(env,now=Date.now(),onlyReport,transport=fetch){
 const state=await stateFrom(env.DB),setup=issues(env,state.settings);if(setup.length)return {sent:0,setup};let sent=0;
 const query='SELECT d.* FROM pos_report_deliveries d WHERE d.status IN (\'pending\',\'failed\',\'sending\') AND d.next_attempt<=? AND d.lease_until<=?'+(onlyReport?' AND d.report_id=?':'')+' ORDER BY d.report_id LIMIT 20';
 const result=await env.DB.prepare(query).bind(now,now,...(onlyReport?[onlyReport]:[])).all();
 for(const delivery of result.results){
  if(!state.settings.reportEmails.includes(delivery.recipient)){await env.DB.prepare('UPDATE pos_report_deliveries SET status=? WHERE id=?').bind('skipped',delivery.id).run();continue;}
  if(delivery.unknown_result&&delivery.first_attempt&&now-delivery.first_attempt>23*3600000){await env.DB.prepare('UPDATE pos_report_deliveries SET status=?,last_error=? WHERE id=?').bind('uncertain','Provider response was lost and its deduplication window expired. Check Resend before any resend.',delivery.id).run();continue;}
  const claim=await env.DB.prepare('UPDATE pos_report_deliveries SET status=?,lease_until=?,attempts=attempts+1,first_attempt=CASE WHEN first_attempt=0 THEN ? ELSE first_attempt END,unknown_result=1 WHERE id=? AND status IN (\'pending\',\'failed\',\'sending\') AND lease_until<=?').bind('sending',now+120000,now,delivery.id,now).run();if(!claim.meta.changes)continue;
  try{
   const response=await transport('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'rollit-eod-'+delivery.id},body:delivery.payload_json,signal:AbortSignal.timeout(20000)});let body;try{body=await response.json()}catch{body={}}
   if(!response.ok){const e=new Error(body.message||`Resend returned HTTP ${response.status}.`);e.unknown=response.status>=500;throw e;}if(!body.id)throw new Error('Resend did not confirm a message ID.');
   await env.DB.prepare('UPDATE pos_report_deliveries SET status=?,lease_until=0,last_error=NULL,message_id=?,sent_at=?,unknown_result=0 WHERE id=?').bind('accepted',body.id,new Date(now).toISOString(),delivery.id).run();sent++;
  }catch(error){const backoff=Math.min(3600000,300000*2**Math.min(delivery.attempts,4));await env.DB.prepare('UPDATE pos_report_deliveries SET status=?,lease_until=0,next_attempt=?,last_error=?,unknown_result=? WHERE id=?').bind('failed',now+backoff,String(error.message||'Email request failed.').slice(0,500),error.unknown===false?0:1,delivery.id).run();}
  // Resend's default API rate limit is low; keep per-recipient sends below two per second.
  if(transport===fetch)await new Promise(resolve=>setTimeout(resolve,600));
 }
 return {sent,setup:[]};
}
export async function runDailyReports(env,now=Date.now(),transport=fetch){
 if(!env.DB)return {skipped:'Database unavailable'};await ensureReports(env.DB);const state=await stateFrom(env.DB),s=state.settings;
 if(!s.dailyReportEnabled||!s.reportStartAt)return {skipped:'Daily reports disabled'};
 if(!s.reportSender||!s.reportEmails.length)return {skipped:'Sender or recipients missing'};
 const key=s.reportStartAt+'|'+s.orderResetTime,last=await env.DB.prepare('SELECT MAX(period_end) AS latest FROM pos_daily_reports WHERE schedule_key=? AND kind=?').bind(key,'daily').first();
 let end=last?.latest?Date.parse(last.latest)+DAY_MS:Date.parse(businessWindow(businessDay(s.reportStartAt,s.orderResetTime),s.orderResetTime).end);
 for(let i=0;i<31&&end<=now;i++,end+=DAY_MS){const window=businessWindow(businessDay(end-1,s.orderResetTime),s.orderResetTime);await createReport(env.DB,state,window,await digest('daily|'+key+'|'+window.end),key,'daily',now);}
 return deliverReports(env,now,undefined,transport);
}
export async function handleReports(request,env,user){
 if(!user)return json({error:'Sign in to continue.'},401);if(user.role!=='admin')return json({error:'Admin access required.'},403);await ensureReports(env.DB);const state=await stateFrom(env.DB);
 if(request.method==='GET'){
  const url=new URL(request.url);if(url.searchParams.get('preview')==='1')return json(buildDailyReport(state,lastClosedWindow(Date.now(),state.settings.orderResetTime)));
  const rows=await env.DB.prepare('SELECT r.id,r.business_day,r.period_start,r.period_end,r.kind,d.recipient,d.status,d.attempts,d.last_error,d.message_id,d.sent_at FROM pos_daily_reports r JOIN pos_report_deliveries d ON d.report_id=r.id ORDER BY r.created_at DESC LIMIT 100').all();
  return json({provider:'Resend',apiKeyConfigured:!!env.RESEND_API_KEY,setup:issues(env,state.settings),deliveries:rows.results});
 }
 if(request.method!=='POST'||request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Invalid method or origin.'},403);
 let body;const raw=await request.text();if(raw.length>2048)return json({error:'Request too large.'},413);try{body=JSON.parse(raw)}catch{return json({error:'Invalid request.'},400)}
 const missing=issues(env,state.settings);if(missing.length)return json({error:missing.join(' ')},503);
 if(body.action==='test'&&/^[a-f0-9-]{36}$/i.test(body.id||'')){
  const id='test-'+body.id,prior=await env.DB.prepare('SELECT id FROM pos_daily_reports WHERE id=?').bind(id).first();
  if(!prior){const recent=await env.DB.prepare('SELECT id FROM pos_daily_reports WHERE kind=? AND created_at>? LIMIT 1').bind('test',new Date(Date.now()-60000).toISOString()).first();if(recent)return json({error:'Wait one minute before another test email.'},429);await createReport(env.DB,state,lastClosedWindow(Date.now(),state.settings.orderResetTime),id,'manual','test',Date.now());}
  const result=await deliverReports(env,Date.now(),id);const rows=await env.DB.prepare('SELECT status,last_error FROM pos_report_deliveries WHERE report_id=?').bind(id).all();const error=rows.results.find(r=>r.status!=='accepted');return error?json({error:error.last_error||'Test is pending. Check delivery history.'},502):json({ok:true,accepted:result.sent});
 }
 return json({error:'Unknown report action.'},400);
}

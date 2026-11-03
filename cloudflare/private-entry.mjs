import app from '../dist/server/index.js';
import {ensureAuth,session,handleAuth,chefState,mayChefAccess} from './auth.mjs';
import {handleReports,runDailyReports} from './reports.mjs';
import {ensureManage,handleManage,validManage} from './manage-pin.mjs';
let ready;
export default {
 scheduled(event,env,ctx){ctx.waitUntil(runDailyReports(env,event.scheduledTime));},
 async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'};
  try{
   if(!env.POS_ADMIN_PASSWORD||!env.POS_ADMIN_USER||!env.DB)return new Response('Workspace setup is incomplete.',{status:503,headers});
   if(!ready)ready=ensureAuth(env.DB).then(()=>ensureManage(env.DB)).catch(e=>{ready=null;throw e});await ready;
   const user=await session(request,env);
   if(path==='/api/reports')return await handleReports(request,env,user);
   if(path.startsWith('/api/auth/manage/'))return await handleManage(request,env,user);
   if(path.startsWith('/api/auth/')||path==='/api/users')return await handleAuth(request,env,user);
   const publicAsset=path.startsWith('/_next/static/')||path==='/rollit-logo.jpg'||path==='/favicon.svg'||path.startsWith('/menu-art/');
   if(path==='/login'&&user)return Response.redirect(url.origin+(user.role==='admin'?'/':'/chef'),303);
   if(!user&&path!=='/login'&&!publicAsset){
    if(path.startsWith('/api/'))return Response.json({error:'Your session ended. Please sign in.'},{status:401,headers});
    return new Response(null,{status:303,headers:{...headers,Location:'/login'}});
   }
   if(user?.role==='chef'){
    if(path==='/'||path==='/login')return new Response(null,{status:303,headers:{...headers,Location:'/chef'}});
    let action='';if(path==='/api/pos'&&request.method==='POST'){
     if(Number(request.headers.get('Content-Length')||0)>100000)return new Response('Request too large',{status:413,headers});
     const text=await request.text();if(text.length>100000)return new Response('Request too large',{status:413,headers});
     try{action=JSON.parse(text).type}catch{return Response.json({error:'Invalid request.'},{status:400,headers})}
     request=new Request(request,{body:text});
    }
    if(['editOrder','cancelOrder'].includes(action)&&!await validManage(request,env,user))return Response.json({error:'Enter the Manage orders PIN again.'},{status:403,headers});
    if(!mayChefAccess(path,request.method,action))return Response.json({error:'Admin access required.'},{status:403,headers});
   }
   const trusted=new Headers(request.headers);trusted.delete('x-rollit-user');trusted.delete('x-rollit-role');
   if(user){trusted.set('x-rollit-user',user.username);trusted.set('x-rollit-role',user.role);}
   request=new Request(request,{headers:trusted});
   const response=(publicAsset||path.startsWith('/ocr/'))?await env.ASSETS.fetch(request):await app.fetch(request,env,ctx);
   if(user?.role==='chef'&&path==='/api/pos'&&response.ok)return Response.json(chefState(await response.json()),{headers});
   const out=new Headers(response.headers);for(const [k,v]of Object.entries(headers))out.set(k,v);
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers:out});
  }catch(e){console.error('Workspace request failed',e);return Response.json({error:'Unable to reach the workspace. Try again.'},{status:503,headers});}
 }
};

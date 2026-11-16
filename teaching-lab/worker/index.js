import {api} from './api.js';
import {html} from './ui.js';
export default {async fetch(request,env){const path=new URL(request.url).pathname;if(path.startsWith('/api/service/')){
 // Dispatch verifies owner-private access before this handler. A second server-only secret gates the Vercel adapter.
 if(!env.SERVICE_KEY || request.headers.get('x-studentsim-service-key')!==env.SERVICE_KEY || !env.SERVICE_OWNER)return new Response(JSON.stringify({error:'Service access denied.'}),{status:403,headers:{'content-type':'application/json'}});
 const route='/api/'+path.slice('/api/service/'.length);
 if(!['/api/status','/api/provider-check','/api/students','/api/history','/api/profile','/api/guide','/api/lesson'].includes(route))return new Response('Not found',{status:404});
 return api(request,env,route,env.SERVICE_OWNER);
 }if(path.startsWith('/api/'))return api(request,env,path);return new Response(html,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}};

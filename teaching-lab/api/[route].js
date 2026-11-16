export const config={maxDuration:120};
const routes=new Set(['status','students','history','profile','guide','lesson','provider-check']);
export async function proxy(request,env=process.env,fetcher=fetch){
 const url=new URL(request.url);const route=url.pathname.split('/').pop();
 if(!routes.has(route))return Response.json({error:'Unknown operation.'},{status:404});
 if(!['GET','POST'].includes(request.method))return Response.json({error:'Method not allowed.'},{status:405});
 if(!env.STUDENTSIM_BACKEND_URL||!env.STUDENTSIM_SERVICE_TOKEN||!env.STUDENTSIM_SERVICE_KEY)return Response.json({error:'The private teaching backend is not configured.',code:'backend_not_configured'},{status:503});
 const backend=new URL(env.STUDENTSIM_BACKEND_URL);
 if(backend.protocol!=='https:')return Response.json({error:'Invalid backend configuration.'},{status:503});
 backend.pathname='/api/service/'+route;backend.search=url.search;
 const headers={'OAI-Sites-Authorization':'Bearer '+env.STUDENTSIM_SERVICE_TOKEN,'x-studentsim-service-key':env.STUDENTSIM_SERVICE_KEY,'content-type':'application/json'};
 // Never forward browser cookies, identity headers, or credentials to the private backend.
 try{const response=await fetcher(backend,{method:request.method,headers,body:request.method==='POST'?await request.text():undefined,redirect:'manual',signal:AbortSignal.timeout(110000)});
 if(response.status>=300&&response.status<400)return Response.json({error:'The private backend rejected service authentication.',code:'backend_auth_required'},{status:502});
 const type=response.headers.get('content-type')||'';
 if(!type.includes('application/json'))return Response.json({error:'The private backend returned an unexpected response.',code:'invalid_backend_response'},{status:502});
 return new Response(await response.text(),{status:response.status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch{return Response.json({error:'The private teaching backend could not be reached. Please retry.',code:'backend_unreachable'},{status:504});}
}
export default {fetch:request=>proxy(request)};

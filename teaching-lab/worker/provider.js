export class ProviderError extends Error {
 constructor(message,code,status=502){super(message);this.code=code;this.status=status;}
}
export async function llm(env,system,user,fetcher=fetch){
 const key=env.LLM_API_KEY?.trim();
 if(!key)throw new ProviderError('AI provider is not configured. Add LLM_API_KEY as a server-side secret.','provider_not_configured',503);
 const base=(env.LLM_BASE_URL||'https://api.openai.com/v1').trim().replace(/\/$/,'');
 if(!base.startsWith('https://'))throw new ProviderError('The AI provider URL must use HTTPS.','invalid_provider_url',503);
 const model=user.whiteboard?env.LLM_VISION_MODEL:env.LLM_MODEL;
 if(user.whiteboard&&!model)throw new ProviderError('Whiteboard images require a vision model. Remove the attachment or configure LLM_VISION_MODEL.','vision_model_required',422);
 let res;
 try{res=await fetcher(base+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:model||'gpt-4.1-mini',temperature:0.35,max_tokens:1600,messages:[{role:'system',content:system},{role:'user',content:user.whiteboard?[{type:'text',text:JSON.stringify({...user,whiteboard:'Attached diagram'})},{type:'image_url',image_url:{url:user.whiteboard}}]:JSON.stringify(user)}],response_format:{type:'json_object'}}),signal:AbortSignal.timeout(45000)});}catch(e){throw new ProviderError(e.name==='TimeoutError'?'AI provider timed out. Your lesson was not saved; please retry.':'Could not reach the AI provider. Your lesson was not saved.','provider_unreachable',504);}
 if(!res.ok){
 // Only expose categories. Provider bodies can contain submitted teaching content.
 let providerCode='';try{const detail=await res.json();const c=detail.error?.code;if(typeof c==='string' && /^[a-zA-Z0-9_\-]{1,80}$/.test(c))providerCode=' ('+c+')';}catch{}
 const messages={401:'The AI provider rejected the saved API key. Replace LLM_API_KEY with a valid Groq key.',403:'The AI provider denied access to this model. Check account permissions.',404:'The configured AI model or API endpoint was not found.',429:'The AI provider rate limit was reached. Wait and try again.'};
 throw new ProviderError((messages[res.status]||'The AI provider rejected the request (HTTP '+res.status+'). Check the model and request compatibility.')+providerCode,'provider_http_'+res.status,res.status===429?429:502);
 }
 let x;try{x=await res.json();const content=x.choices?.[0]?.message?.content;if(x.choices?.[0]?.finish_reason==='length')throw Error();return JSON.parse(content);}catch{throw new ProviderError('The AI provider returned invalid or truncated JSON. No learning state was changed.','invalid_provider_output');}
}

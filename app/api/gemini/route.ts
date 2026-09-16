import {env} from 'cloudflare:workers';
import {isLiveModel} from '@/lib/live-models';
export async function POST(request:Request){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{const {model}=await request.json() as {model:string};if(!isLiveModel(model)||!model.startsWith('gemini-'))return Response.json({error:'Unknown live model'},{status:400});
 const key=(env as unknown as Record<string,string>).GEMINI_API_KEY||process.env.GEMINI_API_KEY;
 if(!key)return Response.json({error:'Gemini needs a server-side GEMINI_API_KEY. Your shopping state is preserved.'},{status:503});
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({uses:1,expireTime:new Date(Date.now()+30*60000).toISOString(),newSessionExpireTime:new Date(Date.now()+60000).toISOString()}),signal:AbortSignal.timeout(15000)});
 if(!r.ok){console.error('Gemini token failed',r.status);return Response.json({error:'Gemini could not create a session. Check model access and quota.'},{status:502});}
 const result=await r.json() as {name:string};return Response.json({token:result.name},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Gemini connection unavailable'},{status:502});}
}

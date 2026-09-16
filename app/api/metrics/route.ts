import {env} from 'cloudflare:workers';
import {calculate,type Turn} from '@/lib/measurements';
import {isLiveModel} from '@/lib/live-models';
const headers={'Cache-Control':'no-store'};
async function storage(request:Request){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw Error('Invalid origin');
 const token=request.headers.get('X-Metrics-Access')||'';if(!/^[a-f0-9-]{72}$/.test(token))throw Error('Invalid access token');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 const prefix='measurements/'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')+'/';
 const bucket=(env as unknown as {METRICS:R2Bucket}).METRICS;if(!bucket)throw Error('Measurement storage unavailable');return {bucket,prefix};
}
export async function POST(request:Request){try{const {bucket,prefix}=await storage(request);const raw=await request.text();if(raw.length>512000)return Response.json({error:'Turn too large'},{status:413});const t=JSON.parse(raw) as Turn;
 if(!/^[a-f0-9-]{36}$/.test(t.turnId)||!isLiveModel(t.model)||!Array.isArray(t.tools)||typeof t.userTranscript!=='string'||typeof t.assistantResponse!=='string'||!t.raw||!Number.isInteger(t.revision))return Response.json({error:'Invalid turn'},{status:400});
 t.metrics=calculate(t);await bucket.put(prefix+t.turnId+'.json',JSON.stringify(t),{httpMetadata:{contentType:'application/json'}});return Response.json({saved:true}, {headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Storage unavailable'},{status:503,headers});}}
export async function GET(request:Request){try{const {bucket,prefix}=await storage(request);const turns:Turn[]=[];let cursor:string|undefined;do{const page=await bucket.list({prefix,cursor,limit:100});const rows=await Promise.all(page.objects.map(async o=>{const r=await bucket.get(o.key);return r?.json<Turn>();}));turns.push(...rows.filter((t):t is Turn=>!!t));cursor=page.truncated?page.cursor:undefined;}while(cursor);return Response.json({turns:turns.sort((a,b)=>a.timestamp.localeCompare(b.timestamp))},{headers});}catch{return Response.json({error:'History unavailable'},{status:503,headers});}}

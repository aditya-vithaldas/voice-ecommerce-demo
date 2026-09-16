import {env} from 'cloudflare:workers';
import {instructions,tool,transition,context,initial,type State} from '@/lib/commerce';
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{
 const body=await request.json() as {message:string;state:State};if(typeof body.message!=='string'||body.message.length>2000)return Response.json({error:'Please keep the request under 2,000 characters.'},{status:400});
 let state=body.state || initial;context(state);
 const key=(env as unknown as Record<string,string>).OPENAI_API_KEY||process.env.OPENAI_API_KEY;if(!key)return Response.json({error:'The conversation is unavailable. You can explore using the on-screen controls.'},{status:503});
 const input:any[]=[{role:'user',content:`Current app context: ${JSON.stringify(context(state))}\nUser: ${body.message}`}];
 for(let i=0;i<3;i++){
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5.6-terra',instructions,input,tools:[tool],parallel_tool_calls:false,store:false,max_output_tokens:1000}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('The conversation service is busy. Please try again.');const data=await r.json() as any;input.push(...(data.output||[]));const calls=(data.output||[]).filter((x:any)=>x.type==='function_call');
 if(!calls.length)return Response.json({state,answer:(data.output||[]).flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==='output_text').map((x:any)=>x.text).join(' ')},{headers:{'Cache-Control':'no-store'}});
 for(const call of calls){let output;try{const changed=transition(state,JSON.parse(call.arguments));state=changed.state;output=changed.data;}catch(e){output={error:e instanceof Error?e.message:'Invalid request'};}input.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(output)});}
 }
 return Response.json({state,answer:'Here is the focused view. What would you like to know next?'});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Please try again.'},{status:502});}
}

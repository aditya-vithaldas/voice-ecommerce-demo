import {env} from 'cloudflare:workers';
import {products,type Product} from '@/lib/catalog';

type Rating={productId:string;overall:number;criteria:Array<{label:string;score:number}>};
function evidence(p:Product){return {id:p.id,name:p.name,brand:p.brand,category:p.category,color:p.color,price:p.price,intro:p.intro,attributes:p.attributes,reviews:p.reviews};}

export async function POST(request:Request){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{
 const body=await request.json() as {productIds?:unknown;need?:unknown;ratings?:unknown};
 if(!Array.isArray(body.productIds)||body.productIds.length!==3||body.productIds.some(id=>typeof id!=='string'))return Response.json({error:'Exactly three ranked products are required.'},{status:400});
 if(typeof body.need!=='string'||body.need.length>500||!Array.isArray(body.ratings))return Response.json({error:'Invalid ranking context.'},{status:400});
 const selected=body.productIds.map(id=>products.find(p=>p.id===id)).filter((p):p is Product=>Boolean(p));if(selected.length!==3)return Response.json({error:'Unknown product.'},{status:400});
 const ratings=(body.ratings as Rating[]).filter(r=>selected.some(p=>p.id===r.productId)).map(r=>({productId:r.productId,overall:Math.round(Number(r.overall)||0),criteria:Array.isArray(r.criteria)?r.criteria.slice(0,3).map(c=>({label:String(c.label).slice(0,40),score:Math.round(Number(c.score)||0)})):[]}));
 const key=(env as unknown as Record<string,string>).OPENAI_API_KEY||process.env.OPENAI_API_KEY;if(!key)return Response.json({error:'Explanations are unavailable.'},{status:503});
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5.6-luna',instructions:'Explain why each of the three ranked products earned every supplied criterion score. Use only the supplied description, attributes, and sample reviews. For each criterion, write one concrete phrase of exactly 4–5 words. Preserve the criterion label exactly. Do not repeat the score, rank, price, or product name. Return only the requested JSON.',input:JSON.stringify({shopperNeed:body.need,rankings:ratings,products:selected.map(evidence)}),text:{format:{type:'json_schema',name:'ranked_product_reasons',strict:true,schema:{type:'object',properties:{reasons:{type:'array',minItems:3,maxItems:3,items:{type:'object',properties:{productId:{type:'string'},criteria:{type:'array',minItems:1,maxItems:3,items:{type:'object',properties:{label:{type:'string'},reason:{type:'string'}},required:['label','reason'],additionalProperties:false}}},required:['productId','criteria'],additionalProperties:false}}},required:['reasons'],additionalProperties:false}}},max_output_tokens:700,store:false}),signal:AbortSignal.timeout(20000)});
 if(!response.ok){console.error('Luna explanation failed',response.status);return Response.json({error:'Explanations are temporarily unavailable.'},{status:502});}
 const data=await response.json() as any;const output=data.output_text||(data.output||[]).flatMap((item:any)=>item.content||[]).filter((item:any)=>item.type==='output_text').map((item:any)=>item.text).join('');const parsed=JSON.parse(output) as {reasons:Array<{productId:string;criteria:Array<{label:string;reason:string}>}>};
 const reasons=Object.fromEntries((parsed.reasons||[]).filter(item=>selected.some(p=>p.id===item.productId)&&Array.isArray(item.criteria)).map(item=>{const allowed=new Set(ratings.find(r=>r.productId===item.productId)?.criteria.map(c=>c.label)||[]);return [item.productId,item.criteria.filter(c=>allowed.has(c.label)&&typeof c.reason==='string').map(c=>({label:c.label,reason:c.reason.trim().split(/\s+/).slice(0,5).join(' ')}))];}));return Response.json({reasons},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Luna explanation unavailable',e instanceof Error?e.message:e);return Response.json({error:'Explanations are temporarily unavailable.'},{status:502});}
}

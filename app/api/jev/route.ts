import {env} from 'cloudflare:workers';
import {products,type Product} from '@/lib/catalog';

type ScoreAnswer={type:'score';score:number;confidence:number;probabilities:Record<string,number>};
const allowedDimensions=['running','sports','durability','comfort','breathability','value','style','rain protection','warmth','easy care','fit'] as const;

function publicProduct(p:Product){
 return {id:p.id,name:p.name,brand:p.brand,category:p.category,color:p.color,price:p.price,ageRange:`${p.ageMin}–${p.ageMax}`,sleeve:p.sleeve,intro:p.intro,attributes:p.attributes,catalogScores:p.scores,reviews:p.reviews};
}

export async function POST(request:Request){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{
 const body=await request.json() as {productIds?:unknown;need?:unknown;dimensions?:unknown};
 if(!Array.isArray(body.productIds)||body.productIds.length<2||body.productIds.length>4||body.productIds.some(id=>typeof id!=='string'))return Response.json({error:'Choose two to four visible products.'},{status:400});
 if(typeof body.need!=='string'||body.need.length>500)return Response.json({error:'Invalid shopping need.'},{status:400});
 const dimensions=Array.isArray(body.dimensions)?[...new Set(body.dimensions.filter((x):x is string=>typeof x==='string'&&allowedDimensions.includes(x as typeof allowedDimensions[number])))].slice(0,3):[];
 if(!dimensions.length)return Response.json({ratings:[],dimensions:[]});
 const selected=body.productIds.map(id=>products.find(p=>p.id===id)).filter((p):p is Product=>Boolean(p));
 if(selected.length!==body.productIds.length)return Response.json({error:'Unknown product.'},{status:400});
 const key=(env as unknown as Record<string,string>).TYPESAFE_API_KEY||process.env.TYPESAFE_API_KEY;
 if(!key)return Response.json({error:'Jev scoring is not configured.'},{status:503});
 const questions:Record<string,unknown>={};
 for(const product of selected)for(const dimension of dimensions)questions[`${product.id}::${dimension}`]={type:'score',instructions:`For product ${product.id}, how strong is the evidence that it is good for ${dimension}, given the shopper's stated need? Use every supplied attribute and review, including trade-offs.`,criteria:[`Poor for ${dimension}: evidence shows it is unsuitable`,`Weak for ${dimension}: little supporting evidence or major drawbacks`,`Mixed for ${dimension}: useful but with meaningful trade-offs`,`Strong for ${dimension}: good supporting evidence`,`Excellent for ${dimension}: direct, consistent evidence across specifications and reviews`]};
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 let response:Response;
 try{response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'jev-latest',state:{shopperNeed:body.need,products:selected.map(publicProduct)},questions}),signal:controller.signal});}finally{clearTimeout(timeout);}
 if(!response.ok){console.error('Jev scoring failed',response.status);return Response.json({error:'Purpose ratings are temporarily unavailable.'},{status:502});}
 const data=await response.json() as {model?:string;answers?:Record<string,ScoreAnswer>};
 const ratings=selected.map(product=>{const criteria=dimensions.map(dimension=>{const answer=data.answers?.[`${product.id}::${dimension}`];const score=answer?.type==='score'&&Number.isFinite(answer.score)?Math.max(0,Math.min(100,Math.round(answer.score/4*100))):0;return {label:dimension,score,confidence:answer?.confidence||0,probabilities:answer?.probabilities||{}};});return {productId:product.id,overall:Math.round(criteria.reduce((sum,item)=>sum+item.score,0)/criteria.length),criteria};}).sort((a,b)=>b.overall-a.overall);
 return Response.json({model:data.model||'jev-latest',dimensions,ratings},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Jev scoring unavailable',e instanceof Error?e.message:e);return Response.json({error:'Purpose ratings are temporarily unavailable.'},{status:502});}
}

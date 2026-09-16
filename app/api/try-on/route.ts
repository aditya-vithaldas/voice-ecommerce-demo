import {env} from 'cloudflare:workers';
import {products} from '@/lib/catalog';
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{
 if(Number(request.headers.get('content-length')||0)>14000000)return Response.json({error:'Please use a smaller photo.'},{status:413});
 const data=await request.formData(),person=data.get('person'),garment=data.get('garment'),product=products.find(p=>p.id===data.get('productId'));
 if(!product||!(person instanceof File)||!(garment instanceof File))return Response.json({error:'A personal photo and a product are required.'},{status:400});
 if([person,garment].some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>6000000||!f.size))return Response.json({error:'Use a JPG, PNG or WebP photo under 6 MB.'},{status:400});
 const key=(env as unknown as Record<string,string>).OPENAI_API_KEY||process.env.OPENAI_API_KEY;
 if(!key)return Response.json({error:'Image generation is not configured.'},{status:503});
 const form=new FormData();form.append('model','gpt-image-2');form.append('image[]',person,'person.'+(person.type==='image/png'?'png':person.type==='image/webp'?'webp':'jpg'));form.append('image[]',garment,'garment.png');form.append('size','1024x1536');form.append('quality','high');form.append('output_format','jpeg');
 form.append('prompt',`Create a photorealistic virtual clothing try-on. Image 1 is the person and identity reference. Image 2 is ONLY the garment design reference: ${product.name}, ${product.category}, ${product.color}, ${product.attributes.Material}, ${product.attributes.Fit} fit. Show the SAME person from image 1 wearing that garment, preserving their face, age, body proportions, skin tone, hair and natural identity. Treat image 2 as the authoritative garment reference. Preserve its exact color, pattern scale and placement, logos and lettering, seams, stitching, buttons, zips, pocket locations, collar, sleeve length, hem and silhouette. Do not redesign, simplify, substitute or invent garment details. Change only the clothing region in image 1; retain the person’s facial geometry, expression, hair, body proportions, pose and background. No beauty retouching or face replacement. Fit the actual garment around the body with realistic occlusion, folds, contact shadows and lighting; avoid a pasted-on look. If a model is in image 2, do not transfer their identity. Scale the garment to the person without changing its design; this is an illustrative style preview, not a claim that this children's catalog item fits adults. Keep other clothes appropriate and fully clothed. Preserve the reference setting where possible. Frame to show the garment, including full legs for jeans. Natural realistic fit, lighting and fabric drape. No text, no labels, no split screen.`);
 const res=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(180000)});
 if(!res.ok){console.error('Try-on generation rejected',res.status);return Response.json({error:res.status===429?'Image generation is busy. Please try again shortly.':'Could not create the try-on. Please try another photo.'},{status:502});}
 const body=await res.json() as {data?:{b64_json?:string}[]};const image=body.data?.[0]?.b64_json;
 if(!image)throw Error('No generated image returned');
 return Response.json({image:'data:image/jpeg;base64,'+image},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'The try-on could not finish. Please try again.'},{status:504});}
}

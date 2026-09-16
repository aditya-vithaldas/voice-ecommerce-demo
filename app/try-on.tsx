'use client';
import {useEffect,useRef,useState} from 'react';
import {Camera,RefreshCw,ArrowLeft} from 'lucide-react';
import {money,type Product} from '@/lib/catalog';
let sessionPhoto:File|null=null;
const results=new Map<string,string>();
async function garmentImage(p:Product):Promise<Blob>{
 const img=new Image();img.src=p.image;await img.decode();const canvas=document.createElement('canvas');canvas.width=768;canvas.height=768;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f7f8fb';ctx.fillRect(0,0,768,768);
 if(p.imagePosition){const [x,y]=p.imagePosition.split(' ').map(parseFloat),w=img.naturalWidth/6,h=img.naturalHeight/8;ctx.drawImage(img,Math.round(x/20)*w,Math.round(y*7/100)*h,w,h,0,0,768,768);}else ctx.drawImage(img,0,0,768,768);
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare the garment.')),'image/png'));
}
export default function TryOn({product,onBack}:{product:Product;onBack:()=>void}){
 const [photo,setPhoto]=useState<File|null>(sessionPhoto),[result,setResult]=useState(results.get(product.id)||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);const picker=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(!photo)return;const cached=results.get(product.id);if(cached){setResult(cached);return;}const controller=new AbortController();let alive=true;setBusy(true);setResult('');setError('');
 void(async()=>{try{const garment=await garmentImage(product);if(!alive)return;const form=new FormData();form.append('person',photo);form.append('garment',garment,'garment.png');form.append('productId',product.id);const response=await fetch('/api/try-on',{method:'POST',body:form,signal:controller.signal});const body=await response.json() as {image:string;error?:string};if(!response.ok)throw Error(body.error);if(alive){results.set(product.id,body.image);setResult(body.image);}}catch(e){if(alive)setError(e instanceof Error?e.message:'Try again.');}finally{if(alive)setBusy(false);}})();return()=>{alive=false;controller.abort();};
 },[photo,product.id,attempt]);
 return <section className="try-on"><div className={'try-on-frame '+(busy?'generating':'')}>
 {result?<img src={result} alt={`Your generated try-on of ${product.name}`}/>:<div className="try-on-placeholder"><Camera size={34}/><h1>{busy?'Creating your look…':'See yourself in this.'}</h1><p>{busy?'Matching the garment to your photo. This can take a minute.':'Choose your photo once. I’ll reuse it as you explore.'}</p>{!photo&&<button className="try-on-action" onClick={()=>picker.current?.click()}>Add my photo</button>}{error&&<p role="alert">{error}</p>}{error&&<button className="try-on-action" onClick={()=>setAttempt(a=>a+1)}>Try again</button>}</div>}
 </div><div className="try-on-caption"><h2>{product.name}</h2><span>{money(product.price)}</span><p>AI style preview · Adult styling adaptation of the demo garment, not a size or fit guarantee.</p><small>Your photo is sent to OpenAI to create this image. Kept in this tab’s memory only.</small><div><button onClick={onBack}><ArrowLeft size={16}/> Product details</button><button disabled={busy} onClick={()=>picker.current?.click()}><RefreshCw size={16}/> Change photo</button><button disabled={busy} onClick={()=>{sessionPhoto=null;results.clear();setPhoto(null);setResult('');}}>Forget my photo</button></div></div>
 <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>6000000){setError('Choose a photo under 6 MB.');return;}sessionPhoto=file;results.clear();setPhoto(file);setResult('');setError('');e.target.value='';}}/>
 </section>;
}

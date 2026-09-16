'use client';
import {useState,useRef,useEffect} from 'react';
import {flushSync} from 'react-dom';
import {Keyboard,ArrowUp,ArrowLeft,Mic,Square,Star,Plus,Minus,ArrowUpRight,Volume2,MessageSquare} from 'lucide-react';
import {products,money,rating,type Product} from '@/lib/catalog';
import {initial,transition,context,search,suitability,focusedReviews,focusedAttributes,comparison,tool,type State,type View} from '@/lib/commerce';
import TryOn from './try-on';
import MetricsPanel from './metrics-panel';
import {Measurements,now,type Turn} from '@/lib/measurements';
import {MeasurementStore} from '@/lib/measurement-store';
import {AudioObserver} from '@/lib/audio-observer';
import {GeminiLive} from '@/lib/gemini-live';
import {isLiveModel,modelLabel,type LiveModel} from '@/lib/live-models';
import {LiveToolBatches,screenContextEvents} from '@/lib/gpt-live';
function path(s:State){if(s.view==='home')return '/';if(s.view==='search'||s.view==='compare')return '/'+s.view;return `/product/${s.active}${s.view==='product'?'':'/'+s.view}${s.topic?'?topic='+encodeURIComponent(s.topic):''}`;}
function fromUrl():State {const parts=location.pathname.split('/').filter(Boolean),topic=new URLSearchParams(location.search).get('topic')||'';if(parts[0]==='product'&&products.some(p=>p.id===parts[1]))return {...initial,active:parts[1],view:((['intro','reviews','attributes','tryon'].includes(parts[2])?parts[2]:'product') as View),topic};if(parts[0]==='search'||parts[0]==='compare'){const s=transition(initial,{view:'search'}).state;return {...s,view:parts[0],ids:parts[0]==='compare'?s.ids.slice(0,4):s.ids};}return initial;}
export default function Surface(){
 const [state,setState]=useState<State>(initial),[answer,setAnswer]=useState(''),[heard,setHeard]=useState(''),[text,setText]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false),[status,setStatus]=useState<'off'|'connecting'|'listening'|'thinking'|'speaking'>('off'),[muted,setMuted]=useState(false),[audioBlocked,setAudioBlocked]=useState(false);
 const [typing,setTyping]=useState(false),[transcriptOpen,setTranscriptOpen]=useState(false);
 const [model,setModel]=useState<LiveModel>('gpt-live-1'),[,renderMetrics]=useState(0),[webmcp,setWebmcp]=useState('Checking WebMCP…');
 const selected=useRef<LiveModel>('gpt-live-1'),measure=useRef<Measurements|null>(null),store=useRef<MeasurementStore|null>(null),observer=useRef<AudioObserver|null>(null),gemini=useRef<GeminiLive|null>(null),mutedRef=useRef(muted),executeRef=useRef<(name:string,args:unknown,source:string)=>Promise<unknown>>(async()=>null);
 mutedRef.current=muted;
 const metrics=()=>measure.current!;
 useEffect(()=>{const m=new Measurements(),storage=new MeasurementStore();measure.current=m;store.current=storage;const saved=localStorage.getItem('surface-live-model');if(isLiveModel(saved)){selected.current=saved;setModel(saved);m.model=saved;}m.onChange=()=>renderMetrics(n=>n+1);m.onSave=t=>void storage.queue(t);m.onFinish=t=>{if(t.interrupted&&t.retention==='pending')void fetch('/api/metrics/evaluate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(t)}).then(r=>r.json()).then((data:any)=>{if(t.retentionReason==='Human review')return;t.retention=data.retention;t.retentionReason='Automated assessment: '+data.reason;m.changed(t);}).catch(()=>{t.retention='uncertain';t.retentionReason='Assessment unavailable';m.changed(t);});};storage.onStatus=()=>renderMetrics(n=>n+1);void storage.init().then(async()=>{try{const old=await storage.history();m.turns=[...old,...m.turns.filter(t=>!old.some(o=>o.turnId===t.turnId))];m.onChange();}catch{}});const retry=()=>void storage.flush();window.addEventListener('online',retry);return()=>{m.finish();storage.dispose();window.removeEventListener('online',retry);};},[]);
 useEffect(()=>{gemini.current?.mute(muted);},[muted]);
 async function switchModel(next:LiveModel){if(next===selected.current)return;stop();metrics().switch(next);selected.current=next;setModel(next);localStorage.setItem('surface-live-model',next);setAnswer('');setHeard('');await start(next,true);}
 function exportMetrics(){const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),turns:metrics().turns},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='surface-measurements.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

 const motionVersion=useRef(0);
 const activeTransition=useRef<{skipTransition:()=>void}|null>(null);
 const current=useRef(state),peer=useRef<RTCPeerConnection|null>(null),channel=useRef<RTCDataChannel|null>(null),stream=useRef<MediaStream|null>(null),audio=useRef<HTMLAudioElement|null>(null),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),asking=useRef(false);
 current.current=state;
 function send(v:unknown){if(channel.current?.readyState==='open')channel.current.send(JSON.stringify(v));}
 function sync(s:State){if(gemini.current)gemini.current.sync(s);else screenContextEvents(s).forEach(send);}
 function update(s:State,push=true,onVisible?:()=>void,valid:()=>boolean=()=>true){
 const previous=current.current,changed=JSON.stringify(previous)!==JSON.stringify(s);
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const commit=()=>{if(!valid())return;current.current=s;setState(s);if(push)history.pushState(s,'',path(s));setError('');if(changed)window.scrollTo({top:0,behavior:'instant'});if(onVisible)requestAnimationFrame(()=>requestAnimationFrame(onVisible));};
 activeTransition.current?.skipTransition();
 const motion=++motionVersion.current;
 document.documentElement.classList.remove('carousel-next','carousel-previous');
 const swap=previous.active&&s.active&&previous.active!==s.active&&['product','intro','reviews','attributes'].includes(previous.view)&&['product','intro','reviews','attributes'].includes(s.view);
 if(swap&&!reduce){
 const direction=previous.ids.indexOf(s.active!)<previous.ids.indexOf(previous.active!)?'previous':'next';
 const sign=direction==='next'?1:-1;
 if(typeof document.startViewTransition==='function'){
 document.documentElement.classList.add('carousel-'+direction);
 const vt=document.startViewTransition(()=>flushSync(commit));activeTransition.current=vt;
 void vt.ready.catch(()=>{});void vt.finished.finally(()=>{if(motionVersion.current===motion)document.documentElement.classList.remove('carousel-next','carousel-previous');});
 }else{
 const old=document.querySelector<HTMLElement>('.stage'),rect=old?.getBoundingClientRect(),clone=old?.cloneNode(true) as HTMLElement|undefined;
 if(clone&&rect){clone.setAttribute('aria-hidden','true');clone.inert=true;Object.assign(clone.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',zIndex:'20',pointerEvents:'none'});document.body.appendChild(clone);}
 flushSync(commit);
 const frames=[{transform:'translateX('+sign*70+'px)',opacity:0},{transform:'translateX(0)',opacity:1}];
 document.querySelector('.stage')?.animate(frames,{duration:650,easing:'cubic-bezier(.22,1,.36,1)'});
 if(clone){const exit=clone.animate([{transform:'translateX(0)',opacity:1},{transform:'translateX('+(-sign*100)+'px)',opacity:0}],{duration:500,easing:'cubic-bezier(.22,1,.36,1)'});void exit.finished.finally(()=>clone.remove());}
 }return;
 }
 if(changed&&!reduce&&previous.view==='home'&&s.view==='search'){
 const origin=document.querySelector('.orb')?.getBoundingClientRect();flushSync(commit);
 if(origin){const orb=document.querySelector<HTMLElement>('.orb'),end=orb?.getBoundingClientRect();if(orb&&end)orb.animate([{transform:'translate('+(origin.left+origin.width/2-end.left-end.width/2)+'px,'+(origin.top+origin.height/2-end.top-end.height/2)+'px) scale('+(origin.width/end.width)+')'},{transform:'translate(0,0) scale(1)'}],{duration:900,easing:'cubic-bezier(.22,1,.36,1)'});}
 if(origin)document.querySelectorAll<HTMLElement>('.product-card').forEach((card,i)=>{const rect=card.getBoundingClientRect();card.animate([{opacity:0,transform:'translate('+(origin.left+origin.width/2-rect.left-rect.width/2)+'px,'+(origin.top+origin.height/2-rect.top-rect.height/2)+'px) scale(.06)',filter:'blur(8px)'},{opacity:1,transform:'translate(0,0) scale(1)',filter:'blur(0)'}],{duration:760,delay:i*85,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});});
 }else if(changed&&!reduce&&typeof document.startViewTransition==='function'){
 const vt=document.startViewTransition(()=>flushSync(commit));activeTransition.current=vt;void vt.ready.catch(()=>{});
 }else if(changed&&!reduce){
 const stage=document.querySelector<HTMLElement>('.stage');
 const leaving=stage?.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-10px)'}],{duration:180,easing:'ease-in'});
 current.current=s;
 const enter=()=>{flushSync(commit);document.querySelector('.stage')?.animate([{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],{duration:520,easing:'cubic-bezier(.22,1,.36,1)'});};
 if(leaving)void leaving.finished.then(enter).catch(()=>{});else commit();
 }else commit();
 }
 async function execute(name:string,args:unknown,source:string){
 const token=generation.current,m=metrics();if(source==='click'||source==='webmcp')m.begin(source,JSON.stringify(args));const {t,call}=m.call(name,args,source);
 try{if(name==='stop_listening'){m.result(t,call,{stopped:true},true);stop();return {stopped:true};}if(!['show_surface','show_commerce_surface'].includes(name))throw Error('Unknown capability');
 const parsed=typeof args==='string'?JSON.parse(args):args;call.args=parsed;const result=transition(current.current,parsed);await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('UI change was not painted')),10000);update(result.state,true,()=>{clearTimeout(timeout);if(token!==generation.current){reject(Error('Session changed before action completed'));return;}m.mark('visibleAction',now(),'two animation frames after UI commit',t);resolve();},()=>token===generation.current);});sync(result.state);m.result(t,call,result.data,true);if(source==='click'||source==='webmcp')m.finish();return result.data;
 }catch(e){const output={error:e instanceof Error?e.message:'Invalid request'};m.result(t,call,output,false);if(source==='click'||source==='webmcp')m.finish('failed');throw e;}}
 executeRef.current=execute;
 function act(a:unknown){setAnswer('');void execute('show_surface',a,'click').catch(e=>setError(e instanceof Error?e.message:'Please try again.'));}
 function cleanup(){generation.current++;observer.current?.close();observer.current=null;gemini.current?.close();gemini.current=null;measure.current?.finish();if(timer.current)clearTimeout(timer.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;const pc=peer.current;peer.current=null;channel.current=null;pc?.close();if(audio.current)audio.current.srcObject=null;setStatus('off');}
 function stop(){send({type:'session.close'});cleanup();}
 useEffect(()=>{update(fromUrl(),false);const pop=()=>{const s=history.state?.view?history.state:fromUrl();update(s,false);sync(s);};window.addEventListener('popstate',pop);return()=>{window.removeEventListener('popstate',pop);cleanup();};},[]);
 useEffect(()=>{const mc=(document as any).modelContext||(navigator as any).modelContext;if(!mc?.registerTool){setWebmcp('WebMCP unavailable in this browser · shared tools active');return;}const lifecycle=new AbortController();try{void Promise.resolve(mc.registerTool({name:'show_commerce_surface',description:tool.description,inputSchema:tool.parameters,annotations:{readOnlyHint:false},execute:(a:unknown)=>executeRef.current('show_surface',a,'webmcp')},{signal:lifecycle.signal})).then(()=>setWebmcp('WebMCP registered')).catch(()=>setWebmcp('WebMCP registration failed'));}catch{setWebmcp('WebMCP registration failed');}return()=>lifecycle.abort();},[]);
 async function ask(message:string){if(asking.current||!message.trim())return;setText('');setHeard(message);setAnswer('');setError('');metrics().begin('text',message);if(selected.current!=='gpt-live-1'){if(!gemini.current?.ready)await start(selected.current,true);if(gemini.current?.ready)gemini.current.text(message);else metrics().finish('failed');return;}asking.current=true;setWorking(true);
 try{const r=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,state:current.current})});const body=await r.json() as any;if(!r.ok)throw Error(body.error);for(const call of body.calls||[])await execute('show_surface',call.args,'text-backend');if(!body.calls?.length){update(body.state);sync(body.state);}setAnswer(body.answer);metrics().output(body.answer);metrics().finish();}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{asking.current=false;setWorking(false);}}
 async function start(target:LiveModel=selected.current,force=false){if(peer.current||gemini.current||(!force&&status!=='off'))return;setError('');setStatus('connecting');const token=++generation.current;
 try{if(!navigator.mediaDevices?.getUserMedia)throw Error('This browser cannot use the microphone. You can type below.');const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});if(token!==generation.current){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;try{observer.current=new AudioObserver(media,metrics(),()=>!mutedRef.current);}catch{setWebmcp(old=>old+' · audio timing unavailable');}if(target!=='gpt-live-1'){
 let inputText='',outputText='';const session=new GeminiLive(target,{state:()=>current.current,measurements:metrics(),execute:(name,args,source)=>executeRef.current(name,args,source),status:s=>{if(token===generation.current)setStatus(s);},input:s=>{inputText+=s;setHeard(inputText);outputText='';},output:s=>{outputText+=s;setAnswer(outputText);inputText='';},error:message=>{if(token===generation.current){metrics().finish('failed');cleanup();setError(message);}},ready:()=>setStatus('listening'),muted:()=>mutedRef.current,outputStream:media=>observer.current?.observeOutput(media)});gemini.current=session;await session.connect(media);return;}
 const pc=new RTCPeerConnection();peer.current=pc;media.getTracks().forEach(t=>pc.addTrack(t,media));pc.ontrack=e=>{if(audio.current){audio.current.srcObject=e.streams[0]||new MediaStream([e.track]);observer.current?.observeOutput(audio.current.srcObject as MediaStream);void audio.current.play().catch(()=>setAudioBlocked(true));}};
 const dc=pc.createDataChannel('oai-events');channel.current=dc;const batches=new LiveToolBatches();let speaking='';dc.onmessage=async e=>{if(token!==generation.current)return;try{const event=JSON.parse(e.data);if(event.type==='session.started'){if(timer.current)clearTimeout(timer.current);setStatus('listening');sync(current.current);send({type:'session.instructions.append',event_id:crypto.randomUUID(),delegation_id:null,content:'Immediately say in English: Hi, I’m GPT Live 1. Then pause and listen. Do not change the shopping screen.'});}if(event.type==='session.closed'){cleanup();return;}if(event.type==='session.delegation.created')setStatus('thinking');if(event.type==='session.input_transcript.delta'){metrics().input(event.delta);setStatus('listening');setHeard(old=>speaking==='user'?old+event.delta:event.delta);speaking='user';}if(event.type==='session.output_transcript.delta'){metrics().output(event.delta);setStatus('speaking');setAnswer(old=>speaking==='assistant'?old+event.delta:event.delta);speaking='assistant';}
 if(event.type==='response.event'&&event.event?.type==='response.completed'){metrics().mark('providerComplete',now(),'gpt-delegation');metrics().scheduleFinish();}const calls=batches.receive(event);for(const call of calls){let output:unknown;try{output=await executeRef.current(call.name,call.arguments,'gpt-live');if(token!==generation.current)return;}catch(err){output={error:err instanceof Error?err.message:'Invalid request'};}send({type:'response.item.create',item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(output)}});}if(calls.length)send({type:'response.create',event_id:crypto.randomUUID()});if(event.type==='error'){metrics().finish('failed');cleanup();setError('The voice connection encountered a problem. Tap the orb to reconnect.');}}catch{setError('Please try that again.');}};
 pc.onconnectionstatechange=()=>{if(token===generation.current&&['failed','disconnected'].includes(pc.connectionState)){cleanup();setError('Connection lost. Tap the orb to continue from this screen.');}};timer.current=setTimeout(()=>{if(token===generation.current){cleanup();setError('Connection timed out. Please try again.');}},30000);
 const offer=await pc.createOffer();await pc.setLocalDescription(offer);const r=await fetch('/api/realtime',{method:'POST',headers:{'Content-Type':'application/sdp'},body:offer.sdp});const data=await r.json() as any;if(token!==generation.current)return;if(!r.ok)throw Error(data.error);await pc.setRemoteDescription({type:'answer',sdp:data.transport.sdp});
 }catch(e){if(token===generation.current){metrics().finish('failed');cleanup();setError(e instanceof Error?e.message:'Could not start voice.');}}}
 const p=products.find(x=>x.id===state.active),visible=state.ids.map(id=>products.find(x=>x.id===id)!).filter(Boolean),reviews=p?focusedReviews(p,state.topic):[],total=search(state.filters).length;
 const cues=state.view==='home'?[
 {label:'Find red sports T-shirts',prompt:'Find red T-shirts for sports.'},
 {label:'Jackets for rainy days',prompt:'Find jackets for rainy days.'},
 {label:'Jeans under €40',prompt:'Find comfortable jeans under €40.'}
 ]:state.view==='search'?[
 {label:'Compare the first two',prompt:'Compare the first and second displayed products for my needs.'},
 {label:'Which is best for sports?',prompt:'Compare the displayed products for sports and breathability.'},
 {label:'Show more options',prompt:'Show the next four results, keeping my current filters.'},
 ...(visible.length?[{label:'Tell me about the first one',prompt:'Open the first displayed product.'}]:[])
 ]:['product','intro'].includes(state.view)?[
 {label:'What do customers say?',prompt:'Show customer reviews for this product.'},
 {label:'How does it fit?',prompt:'Show sizing and fit attributes for this product.'},
 {label:'Show me wearing it',prompt:'Show me wearing this product.'},
 {label:'Show the next one',prompt:'Show the next product in these results.'}
 ]:state.view==='reviews'?[
 {label:'Anyone mention quality?',prompt:'Show reviews specifically about quality.'},
 {label:'What about the fabric?',prompt:'Show reviews about fabric.'},
 {label:'What do people dislike?',prompt:'Show all reviews and customer concerns with no topic filter.'},
 {label:'Compare alternatives',prompt:'Compare this product with the other displayed alternatives for my needs.'}
 ]:state.view==='attributes'?[
 {label:'How do I wash it?',prompt:'Show care and washing instructions.'},
 {label:'What sizes are available?',prompt:'Show size attributes.'},
 {label:'Is the fabric comfortable?',prompt:'Show reviews about fabric and comfort.'},
 {label:'Give me an overview',prompt:'Show the product introduction.'}
 ]:state.view==='compare'?[
 {label:'Which will last longer?',prompt:'Compare these products for durability.'},
 {label:'Which is best value?',prompt:'Compare these products for value.'},
 {label:'Open the first one',prompt:'Open the first displayed product.'}
 ]:[
 {label:'Back to the product',prompt:'Show this product.'},
 {label:'What do customers say?',prompt:'Show customer reviews for this product.'},
 {label:'Try the next product',prompt:'Show the next product in these results.'}
 ];
 const nav=(view:View,topic='')=>act({view,topic});
 const productImage=(item:Product,className='')=><span role="img" aria-label={item.name} className={'product-visual '+className} style={{viewTransitionName:'image-'+item.id,backgroundImage:`url(${item.image})`,backgroundSize:item.imagePosition?'600% 800%':'cover',backgroundPosition:item.imagePosition||'center'}}/>;
 const ratingText=(item:Product)=><span className="rating" style={{viewTransitionName:'rating-'+item.id}}><Star size={14} fill="currentColor"/>{rating(item).toFixed(1)} <small>({item.reviews.length})</small></span>;
 return <div className={`surface-app view-${state.view}`}><MetricsPanel model={model} turns={measure.current?.turns||[]} status={store.current?.status||'Connecting storage…'} connection={status} webmcp={webmcp} onSwitch={m=>void switchModel(m)} onRetention={(t,value)=>{t.retention=value;t.retentionReason='Human review';metrics().changed(t);}} onExport={exportMetrics}/><audio ref={audio} autoPlay muted={muted}/>{!['home','search'].includes(state.view)&&<header className="site-top"><button className="brand" onClick={()=>nav('home')}>surface<span>®</span></button><span className="demo-label">A DECISIONOS CONCEPT</span><a href="https://decisionos.me/case-studies.html">The thinking <ArrowUpRight size={15}/></a></header>}
 <main className="stage" key={state.view+state.active+state.topic+state.ids.join('')}><div className={'scene-light scene-'+state.view} aria-hidden="true"><i/><i/><i/></div>
 {state.view==='home'?<section className="home-stage" aria-label="Voice shopping"/>:<>
 {state.view!=='search'&&<div className="context-line"><button onClick={()=>nav('search')}><ArrowLeft size={16}/>Your finds</button><span>{state.need||'A little closer to what you need'}</span></div>}
 {state.view==='search'&&<section><div className="product-grid">{visible.map((item,i)=><button className="product-card" key={item.id} onClick={()=>act({view:'product',productId:item.id})}><div className="product-photo">{productImage(item)}<span className="product-number">0{i+1}</span></div><div className="card-line"><small>{item.brand}</small>{ratingText(item)}</div><h2 style={{viewTransitionName:'title-'+item.id}}>{item.name}</h2>{suitability(item,state.need).reason&&<p className="match-reason">{suitability(item,state.need).reason}</p>}<div className="card-line"><span>{money(item.price)}</span><small>{item.ageMin}–{item.ageMax} years</small></div></button>)}</div>{!visible.length&&<p className="empty-results">No matches yet. Try a different color or budget.</p>}</section>}
 {p&&state.view==='tryon'&&<TryOn product={p} onBack={()=>nav('product')}/>}
 {p&&['product','intro','reviews','attributes'].includes(state.view)&&<>
 {['product','intro'].includes(state.view)?<section className="product-focus"><div className="focus-photo">{productImage(p)}</div><div className="focus-copy"><p className="eyebrow">{p.brand}</p><h1 style={{viewTransitionName:'title-'+p.id}}>{p.name}</h1><div className="focus-price">{money(p.price)} {ratingText(p)}</div>{suitability(p,state.need).reason&&<p className="match-reason">{suitability(p,state.need).reason}</p>}{state.view==='intro'&&<div className="intro-summary"><p>{p.intro}</p><ul><li>{p.attributes.Material}</li><li>{p.attributes.Fit} fit · {p.attributes['Sizes available']}</li><li>{p.reviews[0].likes}</li></ul><p className="tradeoff">Worth knowing: {p.reviews[1].concern}.</p></div>}</div></section>:<>
 <button className="mini-product" onClick={()=>nav('product')}>{productImage(p)}<span><span style={{viewTransitionName:'title-'+p.id,display:'block'}}>{p.name}</span><small>{money(p.price)} · {p.brand}</small></span></button>
 {state.view==='reviews'&&<section className="review-focus"><div className="section-intro"><p className="eyebrow">{state.topic?'LET’S LOOK AT '+state.topic.toUpperCase():'THE PEOPLE’S PERSPECTIVE'}</p><h1>{state.topic?`What they say about ${state.topic}.`:'Loved for this. Less so for that.'}</h1></div><div className="review-overview"><div className="rating-big"><strong style={{viewTransitionName:'rating-'+p.id}}>{rating(p).toFixed(1)}</strong><span>out of 5 · {p.reviews.length} sample reviews</span><div>{[5,4,3,2,1].map(n=><div className="rating-bar" key={n}><span>{n}</span><i><b style={{width:`${p.reviews.filter(r=>r.rating===n).length/p.reviews.length*100}%`}}/></i></div>)}</div></div><div className="sentiment"><h2><Plus size={18}/> What people like</h2>{[...new Set(reviews.map(r=>r.likes).filter(Boolean))].slice(0,3).map(t=><p key={t}>{t}</p>)}</div><div className="sentiment negative"><h2><Minus size={18}/> What gives them pause</h2>{[...new Set(reviews.map(r=>r.concern).filter(Boolean))].slice(0,3).map(t=><p key={t}>{t}</p>)}</div></div><div className="topic-chips">{['','quality','fabric','fit','washing'].map(t=><button aria-pressed={state.topic===t} key={t} onClick={()=>nav('reviews',t)}>{t||'All reviews'}</button>)}</div>{!reviews.length?<p>No sample reviews address that topic. Try fabric, fit, or washing.</p>:<div className="review-quotes">{reviews.slice(0,3).map(r=><article key={r.id}><span className="rating"><Star size={14} fill="currentColor"/>{r.rating}/5</span><h3>{r.title}</h3><blockquote>“{r.text}”</blockquote><small>{r.name} · Sample review</small></article>)}</div>}</section>}
 {state.view==='attributes'&&<section className="attribute-focus"><div className="section-intro"><p className="eyebrow">THE DETAILS YOU ASKED FOR</p><h1>{state.topic?`Let’s talk ${state.topic}.`:'The fabric. The fit. The practical bits.'}</h1></div><dl>{focusedAttributes(p,state.topic).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>{focusedAttributes(p,state.topic).length===0&&<p>That detail isn’t available in the sample catalog. <button onClick={()=>nav('attributes')}>Show all attributes</button></p>}</section>}
 </>}
 </>}
 {state.view==='compare'&&<section className="comparison-focus"><div className="section-intro"><p className="eyebrow">BETTER FOR YOU, NOT JUST BETTER</p><h1>A different kind of “best”.</h1><p>{state.need||'For everyday comfort and value.'}</p><small>Fit scores use equal weight for: {state.priorities.join(', ')||'comfort, value'}. Illustrative assessment, not customer ratings.</small></div><div className="compare-grid">{visible.map(p=>({p,c:comparison(p,state.priorities)})).sort((a,b)=>b.c.score-a.c.score).map(({p,c},i)=><article key={p.id}><span className="compare-rank">{i===0?'Closest fit':'Another way to go'}</span><button className="compare-photo" onClick={()=>act({view:'product',productId:p.id})}>{productImage(p)}</button><h2 style={{viewTransitionName:'title-'+p.id}}>{p.name}</h2><div className="card-line">{money(p.price)}{ratingText(p)}</div><div className="fit-score"><strong>{c.score}</strong><span>/100<br/>for your needs</span></div><h3>Why it works</h3><p>{c.good.length?c.good.join(' · '):'No standout strength for these priorities.'}</p><h3>The trade-off</h3><p>{c.bad.length?c.bad.join(' · '):p.reviews[1].concern}</p><small>{p.reviews[1].concern}</small><button className="text-link" onClick={()=>act({view:'product',productId:p.id})}>Look closer <ArrowUpRight size={15}/></button></article>)}</div></section>}
 {state.view!=='search'&&<p className="sample-footer">Sample catalog, imagery, reviews, and fit assessments. No checkout or real seller.</p>}
 </>}
 </main>
 {cues.length>0&&<aside className="conversation-cues" aria-label="Suggested questions"><span>You can now ask</span><div>{cues.map(cue=><button key={cue.label} disabled={working} onClick={()=>ask(cue.prompt)}>“{cue.label}” <ArrowUpRight size={13}/></button>)}</div></aside>}

 <aside className={`voice-dock ${state.view==='home'?'home-dock':''} ${typing?'is-typing':''} ${transcriptOpen?'transcript-open':''}`} aria-label="Conversation controls"><div id="voice-transcript" className="voice-text" aria-live="polite">{state.view==='home'&&!error?<><p className="home-heading">Tell us what<br/>you’re looking for.</p></>:error?<p className="error">{error}</p>:working?<p>Finding the answer…</p>:answer?<p>{answer}</p>:<p>{status==='off'?'Tap the orb. Tell me what you need.':status==='connecting'?'Connecting…':status==='thinking'?'Finding the answer…':status==='speaking'?'Keep talking whenever you’re ready.':'I’m listening. Keep going.'}</p>}{heard&&state.view!=='home'&&state.view!=='search'&&<small>You: {heard}</small>}</div><div className="dock-controls">{!['home','search'].includes(state.view)&&<button className="transcript-toggle" aria-label={transcriptOpen?'Collapse transcript':'Expand transcript'} aria-expanded={transcriptOpen} aria-controls="voice-transcript" onClick={()=>setTranscriptOpen(!transcriptOpen)}><MessageSquare size={18}/></button>}{state.view==='home'&&<div className="sparkles" aria-hidden="true">{Array.from({length:32},(_,i)=><i key={i} style={{'--i':i,'--radius':(90+(i%5)*18)+'px','--duration':(9+i%7)+'s'} as React.CSSProperties}/>)}</div>}<button className={`orb ${status}`} onClick={status==='off'?()=>void start():stop} aria-label={status==='off'?'Start live shopping':'Stop live shopping'}><span className="orb-core"/><span className="orb-mist"/><span className="orb-glint"/>{status==='off'?<Mic size={23}/>:<Square size={18}/>}</button>{!['home','search'].includes(state.view)&&<button className="keyboard-toggle" aria-label={typing?'Hide keyboard':'Type instead'} aria-expanded={typing} onClick={()=>setTyping(!typing)}><Keyboard size={21}/></button>}{typing&&!['home','search'].includes(state.view)&&<form onSubmit={e=>{e.preventDefault();void ask(text);}}><input autoFocus aria-label="Ask Surface" placeholder="Or type a thought…" value={text} onChange={e=>setText(e.target.value)}/><button aria-label="Send" disabled={working||!text.trim()}><ArrowUp size={20}/></button></form>}{status!=='off'&&!['home','search'].includes(state.view)&&<button className="audio-toggle" aria-label={muted?'Unmute answers':'Mute answers'} aria-pressed={muted} onClick={()=>setMuted(!muted)}><Volume2 size={19}/>{muted&&<span/>}</button>}</div>{audioBlocked&&<button onClick={()=>{void audio.current?.play();setAudioBlocked(false);}}>Enable spoken answers</button>}</aside>
 </div>;
}

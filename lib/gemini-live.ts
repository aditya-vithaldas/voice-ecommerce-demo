import {instructions,tool,context,type State} from './commerce';
import {modelLabel,type LiveModel} from './live-models';
import {Measurements,now} from './measurements';
type Hooks={state:()=>State;measurements:Measurements;execute:(name:string,args:unknown,source:string)=>Promise<unknown>;status:(s:'listening'|'thinking'|'speaking')=>void;input:(s:string)=>void;output:(s:string)=>void;error:(s:string)=>void;ready:()=>void;muted:()=>boolean;outputStream:(media:MediaStream)=>void;};
export class GeminiLive {
 socket:WebSocket|null=null;ctx:AudioContext|null=null;capture:AudioWorkletNode|null=null;closed=false;ready=false;nextAudio=0;sources=new Set<AudioBufferSourceNode>();gain:GainNode|null=null;inputSource:MediaStreamAudioSourceNode|null=null;
 constructor(public model:LiveModel,private hooks:Hooks){}
 send(v:unknown){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(v));}
 async connect(media:MediaStream){
 const r=await fetch('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:this.model})});const data=await r.json() as {token:string;error?:string};if(!r.ok)throw Error(data.error||'Gemini unavailable');if(this.closed)return;
 this.ctx=new AudioContext();await this.ctx.resume();await this.ctx.audioWorklet.addModule('/live-capture.js');if(this.closed)return;
 this.gain=this.ctx.createGain();this.gain.connect(this.ctx.destination);const monitor=this.ctx.createMediaStreamDestination();this.gain.connect(monitor);this.hooks.outputStream(monitor.stream);this.inputSource=this.ctx.createMediaStreamSource(media);this.capture=new AudioWorkletNode(this.ctx,'live-capture');this.inputSource.connect(this.capture);const silence=this.ctx.createGain();silence.gain.value=0;this.capture.connect(silence).connect(this.ctx.destination);
 this.capture.port.onmessage=e=>{if(!this.ready)return;const bytes=new Uint8Array(e.data);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);this.send({realtimeInput:{audio:{data:btoa(binary),mimeType:'audio/pcm;rate=16000'}}});};
 const socket=new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token='+encodeURIComponent(data.token));this.socket=socket;
 await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Gemini connection timed out')),25000);
 socket.onopen=()=>this.send({setup:{model:'models/'+this.model,generationConfig:{responseModalities:['AUDIO'],...(this.model.endsWith('thinking')?{thinkingConfig:{thinkingLevel:'HIGH'}}:{})},systemInstruction:{parts:[{text:instructions+' You are '+modelLabel(this.model)+'. On connection, briefly identify yourself, then wait. Current shopping context: '+JSON.stringify(context(this.hooks.state()))}]},inputAudioTranscription:{},outputAudioTranscription:{},tools:[{functionDeclarations:[{name:tool.name,description:tool.description,parametersJsonSchema:tool.parameters,behavior:'NON_BLOCKING'},{name:'stop_listening',description:'Stop voice only on explicit request.',parametersJsonSchema:{type:'object',properties:{}},behavior:'NON_BLOCKING'}]}]}});
 socket.onmessage=async e=>{try{const message=JSON.parse(typeof e.data==='string'?e.data:await e.data.text());if(this.closed)return;if(message.setupComplete){clearTimeout(timeout);this.ready=true;this.hooks.ready();resolve();this.send({clientContent:{turns:[{role:'user',parts:[{text:'Briefly say: Hi, I’m '+modelLabel(this.model)+'. Do not change the shopping screen.'}]}],turnComplete:true}});}
 if(message.error){reject(Error(message.error.message||'Gemini error'));this.hooks.error(message.error.message||'Gemini error');return;}
 const sc=message.serverContent;
 if(sc?.interrupted){this.stopAudio();this.hooks.status('listening');}
 if(sc?.inputTranscription?.text){this.hooks.measurements.input(sc.inputTranscription.text);this.hooks.input(sc.inputTranscription.text);}
 if(sc?.outputTranscription?.text){this.hooks.measurements.output(sc.outputTranscription.text);this.hooks.output(sc.outputTranscription.text);}
 for(const part of sc?.modelTurn?.parts||[])if(part.inlineData?.data)this.play(part.inlineData.data,Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1])||24000);
 for(const call of message.toolCall?.functionCalls||[]){let result;try{result=await this.hooks.execute(call.name,call.args,'gemini');}catch(err){result={error:err instanceof Error?err.message:'Tool failed'};}if(!this.closed)this.send({toolResponse:{functionResponses:[{id:call.id,name:call.name,response:{output:result},scheduling:'WHEN_IDLE'}]}});}
 const interaction=message.interactionStatus||sc?.interactionStatus;if(interaction==='IN_PROGRESS')this.hooks.status('thinking');if(interaction==='IDLE'||(!this.model.endsWith('thinking')&&sc?.turnComplete)){this.hooks.status('listening');this.hooks.measurements.mark('providerComplete',now(),'gemini');this.hooks.measurements.scheduleFinish();}
 }catch(err){this.hooks.error(err instanceof Error?err.message:'Gemini event failed');}};
 socket.onerror=()=>{clearTimeout(timeout);reject(Error('Gemini connection failed'));};socket.onclose=()=>{clearTimeout(timeout);if(!this.closed){reject(Error('Gemini disconnected'));this.hooks.error('Gemini disconnected. Tap the orb to reconnect.');}};
 });
 }
 play(base64:string,rate:number){if(!this.ctx||!this.gain)return;const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const pcm=new Int16Array(bytes.buffer);const buffer=this.ctx.createBuffer(1,pcm.length,rate);buffer.getChannelData(0).set(Float32Array.from(pcm,n=>n/32768));const source=this.ctx.createBufferSource();source.buffer=buffer;source.connect(this.gain);this.gain.gain.value=this.hooks.muted()?0:1;const start=Math.max(this.ctx.currentTime,this.nextAudio);this.nextAudio=start+buffer.duration;const first=this.sources.size===0;this.sources.add(source);if(first)this.hooks.status('speaking');source.onended=()=>{this.sources.delete(source);};source.start(start);}
 sync(state:State){if(this.ready)this.send({clientContent:{turns:[{role:'user',parts:[{text:'Application context update, not a request; do not respond: '+JSON.stringify(context(state))}]}],turnComplete:false}});}
 text(message:string){this.send({clientContent:{turns:[{role:'user',parts:[{text:message}]}],turnComplete:true}});}
 mute(value:boolean){if(this.gain)this.gain.gain.value=value?0:1;}
 stopAudio(){for(const s of this.sources){try{s.stop();}catch{}}this.sources.clear();this.nextAudio=this.ctx?.currentTime||0;}
 close(){this.closed=true;this.ready=false;this.stopAudio();this.capture?.disconnect();this.inputSource?.disconnect();void this.ctx?.close();this.socket?.close();}
}

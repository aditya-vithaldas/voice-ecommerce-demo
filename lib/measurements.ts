import type {LiveModel} from './live-models';
export type Stamp = {at:number; source:string};
export type Invocation = {id:string; name:string; args:unknown; result:unknown; success:boolean|null; startedAt:number; completedAt:number|null; rtt:number|null; source:string};
export type Turn = {
 sessionId:string; turnId:string; model:LiveModel; timestamp:string; sequence:number;
 inputKind:'voice'|'text'|'click'|'webmcp'; userTranscript:string; assistantResponse:string;
 toolCalled:boolean; tools:Invocation[]; success:boolean|null; interrupted:boolean;
 interruptionTranscript:string; retention:'not-applicable'|'pending'|'retained'|'lost'|'uncertain'; retentionReason:string;
 raw:Record<string,Stamp>; metrics:{firstAudio:number|null;firstAction:number|null;toolRtt:number[];visibleAction:number|null;bargeIn:number|null;interruptionRetention:string};
 status:'active'|'complete'|'interrupted'|'switched'|'failed'; revision:number;
};
export const now=()=>performance.timeOrigin+performance.now();
export function calculate(t:Turn){
 const delta=(a:string,b:string)=>t.raw[a]&&t.raw[b]?t.raw[b].at-t.raw[a].at:null;
 return {firstAudio:delta('speechEnd','audioStart'),firstAction:delta('speechEnd','firstAction'),toolRtt:t.tools.flatMap(x=>x.rtt===null?[]:[x.rtt]),visibleAction:delta('speechEnd','visibleAction'),bargeIn:t.interrupted?delta('interruptionStart','assistantYield'):null,interruptionRetention:t.retention};
}
/** One observer/clock for all providers. Never substitutes transcript arrival for audio. */
export class Measurements {
 sessionId=crypto.randomUUID(); turns:Turn[]=[]; active:Turn|null=null; model:LiveModel='gpt-live-1'; outputSpeaking=false;
 idleTimer:ReturnType<typeof setTimeout>|undefined; onFinish:(t:Turn)=>void=()=>{}; onChange:()=>void=()=>{}; onSave:(t:Turn)=>void=()=>{};
 begin(kind:Turn['inputKind'],text='',at=now()) {
  clearTimeout(this.idleTimer);const interrupted=kind==='voice'&&this.outputSpeaking;
  if(this.active)this.finish(interrupted?'interrupted':'complete');
  const t:Turn={sessionId:this.sessionId,turnId:crypto.randomUUID(),model:this.model,timestamp:new Date(at).toISOString(),sequence:this.turns.length+1,inputKind:kind,userTranscript:text,assistantResponse:'',toolCalled:false,tools:[],success:null,interrupted,interruptionTranscript:'',retention:interrupted?'pending':'not-applicable',retentionReason:'',raw:{started:{at,source:kind}},metrics:{firstAudio:null,firstAction:null,toolRtt:[],visibleAction:null,bargeIn:null,interruptionRetention:interrupted?'pending':'not-applicable'},status:'active',revision:0};
  if(interrupted)t.raw.interruptionStart={at,source:'local-audio-observer'};
  if(kind!=='voice')t.raw.speechEnd={at,source:'action-submitted (not speech)'};
  this.active=t;this.turns.push(t);this.changed(t);return t;
 }
 changed(t:Turn){t.revision++;t.metrics=calculate(t);this.onChange();this.onSave(structuredClone(t));}
 mark(key:string,at=now(),source='browser',t=this.active,replace=false){if(t&&(!t.raw[key]||replace)){t.raw[key]={at,source};this.changed(t);}}
 input(text:string){const t=this.active||this.begin('voice');t.raw['inputTranscript:'+Object.keys(t.raw).length]={at:now(),source:'provider-transcript-arrival'};t.userTranscript+=text;if(t.interrupted)t.interruptionTranscript=t.userTranscript;this.changed(t);}
 output(text:string){if(this.active){this.active.raw['outputTranscript:'+Object.keys(this.active.raw).length]={at:now(),source:'provider-transcript-arrival'};this.active.assistantResponse+=text;this.changed(this.active);}}
 audioStart(at=now()){clearTimeout(this.idleTimer);this.outputSpeaking=true;this.mark('audioStart',at,'observed-playback');}
 audioStop(at=now()){this.outputSpeaking=false;if(this.active?.interrupted)this.mark('assistantYield',at,'observed-playback-stop');this.scheduleFinish();}
 scheduleFinish(){clearTimeout(this.idleTimer);const t=this.active;this.idleTimer=setTimeout(()=>{if(t&&this.active===t&&!this.outputSpeaking&&t.raw.providerComplete&&t.raw.speechEnd&&t.assistantResponse&&t.tools.every(c=>c.completedAt!==null))this.finish();},1500);}
 call(name:string,args:unknown,source:string){const t=this.active||this.begin(source==='webmcp'?'webmcp':'click');const at=now();const call:Invocation={id:crypto.randomUUID(),name,args,result:null,success:null,startedAt:at,completedAt:null,rtt:null,source};t.tools.push(call);t.toolCalled=true;this.mark('firstAction',at,'shared-capability-invocation',t);this.changed(t);return {t,call};}
 result(t:Turn,call:Invocation,result:unknown,success:boolean){call.result=result;call.success=success;call.completedAt=now();call.rtt=call.completedAt-call.startedAt;t.success=t.tools.every(c=>c.success===true);this.changed(t);}
 finish(status:Turn['status']='complete'){clearTimeout(this.idleTimer);if(!this.active)return;const t=this.active;t.status=status;if(status==='failed')t.success=false;else if(t.success===null)t.success=true;this.mark('completed',now(),'client',t);this.active=null;this.changed(t);this.onFinish(t);}
 switch(model:LiveModel){this.finish('switched');this.model=model;this.outputSpeaking=false;this.sessionId=crypto.randomUUID();this.onChange();}
}

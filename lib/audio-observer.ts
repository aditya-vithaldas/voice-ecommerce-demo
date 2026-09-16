import {Measurements,now} from './measurements';
/** Shared local VAD for comparable speech boundaries (estimates, not provider timestamps). */
export class AudioObserver {
 ctx:AudioContext; input:AnalyserNode; output?:AnalyserNode; frame=0; voiced=false; lastVoice=0; started=0; outputOn=false; lastOutput=0;
 constructor(media:MediaStream,private measurements:Measurements,private audible:()=>boolean=()=>true){this.ctx=new AudioContext();this.input=this.ctx.createAnalyser();this.input.fftSize=1024;this.ctx.createMediaStreamSource(media).connect(this.input);void this.ctx.resume();this.tick();}
 observeOutput(media:MediaStream){this.output=this.ctx.createAnalyser();this.output.fftSize=1024;this.ctx.createMediaStreamSource(media).connect(this.output);}
 level(node:AnalyserNode){const data=new Float32Array(node.fftSize);node.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length);}
 tick=()=>{const at=now(),voice=this.level(this.input)>.014;if(voice){if(!this.voiced){if(!this.started)this.started=at;if(at-this.started>65){this.voiced=true;this.measurements.begin('voice','',this.started);}}this.lastVoice=at;}else{if(!this.voiced)this.started=0;if(this.voiced&&at-this.lastVoice>500){this.measurements.mark('speechEnd',this.lastVoice,'shared local VAD, ± one frame; 500ms silence confirmation');this.voiced=false;this.started=0;}}
 if(this.output){const loud=this.audible()&&this.level(this.output)>.004;if(loud){this.lastOutput=at;if(!this.outputOn){this.outputOn=true;this.measurements.audioStart(at);}}else if(this.outputOn&&at-this.lastOutput>140){this.outputOn=false;this.measurements.audioStop(this.lastOutput);}}
 this.frame=requestAnimationFrame(this.tick);};
 close(){cancelAnimationFrame(this.frame);void this.ctx.close();}
}

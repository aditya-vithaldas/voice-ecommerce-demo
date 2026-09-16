class LiveCapture extends AudioWorkletProcessor {
 constructor(){super();this.samples=[];}
 process(inputs){const input=inputs[0]?.[0];if(input){this.samples.push(...input);if(this.samples.length>=2048){const count=Math.floor(this.samples.length*16000/sampleRate),out=new Int16Array(count);for(let i=0;i<count;i++){const start=Math.floor(i*sampleRate/16000),end=Math.min(this.samples.length,Math.floor((i+1)*sampleRate/16000));let v=0;for(let j=start;j<end;j++)v+=this.samples[j];out[i]=Math.max(-1,Math.min(1,v/Math.max(1,end-start)))*32767;}this.port.postMessage(out.buffer,[out.buffer]);this.samples=[];}}return true;}
}
registerProcessor('live-capture',LiveCapture);

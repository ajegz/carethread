// Browser-rate capture to 24 kHz PCM16. Fractional position is preserved across blocks.
class CareThreadPCM extends AudioWorkletProcessor {
  constructor(){super();this.samples=[];this.position=0;this.ratio=sampleRate/24000;this.chunk=[];}
  process(inputs){
    const input=inputs[0]?.[0]; if(!input)return true;
    for(let i=0;i<input.length;i++)this.samples.push(input[i]);
    while(this.position+1<this.samples.length){
      const a=Math.floor(this.position),f=this.position-a;
      const v=this.samples[a]*(1-f)+this.samples[a+1]*f;
      this.chunk.push(Math.max(-32768,Math.min(32767,Math.round(v*32767))));this.position+=this.ratio;
      if(this.chunk.length===1200){const pcm=new Int16Array(this.chunk);this.port.postMessage(pcm.buffer,[pcm.buffer]);this.chunk=[];}
    }
    const used=Math.floor(this.position);this.samples=this.samples.slice(used);this.position-=used;
    return true;
  }
}
registerProcessor('carethread-pcm',CareThreadPCM);

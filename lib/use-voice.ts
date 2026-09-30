'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from './handoff';
import { conversationPrompt, voiceConfig } from './voice-config';
import { nextQuestion, validateVoicePlan, type VoicePlan } from './voice-tools';

type Role='sender'|'receiver';
type Options={session:Session;getSession?:()=>Session;role:Role;onTurn:(role:Role|'agent',text:string,id:string)=>void;onTool:(name:string,args:Record<string,unknown>,id:string)=>unknown};
type Pending={name:string;arguments:Record<string,unknown>;call_id:string;invalid?:boolean};
type Runtime={ws:WebSocket|null;ctx:AudioContext|null;stream:MediaStream|null;worklet:AudioWorkletNode|null;ready:boolean;ending:boolean;pending:Pending[];sources:Set<AudioBufferSourceNode>;playAt:number;timer:ReturnType<typeof setInterval>|null;timeout:ReturnType<typeof setTimeout>|null;started:number;speakingRole:Role|null;generation:number;accessCode:string;analysis:Promise<void>};
const fresh=():Runtime=>({ws:null,ctx:null,stream:null,worklet:null,ready:false,ending:false,pending:[],sources:new Set(),playAt:0,timer:null,timeout:null,started:0,speakingRole:null,generation:0,accessCode:'',analysis:Promise.resolve()});

export function useVoice(options:Options){
 const opts=useRef(options);opts.current=options;
 const current=useRef<Runtime>(fresh());
 const [status,setStatus]=useState<'idle'|'connecting'|'listening'|'speaking'|'error'>('idle');
 const [error,setError]=useState<string|null>(null);
 const [elapsedSeconds,setElapsed]=useState(0);
 const [partial,setPartial]=useState('');
 const analyzeTurn=useCallback((r:Runtime,turnId:string,role:Role,textOnly=false)=>{
   // Serialize interpretation: each turn sees all previously validated changes.
   r.analysis=r.analysis.catch(()=>{}).then(async()=>{
     if(r.ending||current.current!==r)return;
     try{
       const session=opts.current.getSession?.()??opts.current.session;
       const request=()=>fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,role,turnId,accessCode:r.accessCode}),signal:AbortSignal.timeout(30000)});
       let response=await request(),data=await response.json();
       if(r.ending||current.current!==r)return;
       if(response.status===429){setError('AssemblyAI is busy. Retrying this saved turn shortly…');await new Promise(resolve=>setTimeout(resolve,Math.min(30,Math.max(3,data.retryAfter||10))*1000));if(r.ending||current.current!==r)return;response=await request();data=await response.json();}
       if(!response.ok)throw new Error(data.error??'This turn could not be analyzed.');
       if(r.ending||current.current!==r)return;
       const plan=data as VoicePlan;
       validateVoicePlan(opts.current.getSession?.()??opts.current.session,plan,turnId);
       for(const[index,action]of plan.actions.entries()){
         const result=opts.current.onTool(action.name,action.args,`voice-${turnId}-${index}`) as {ok?:boolean;message?:string};
         if(result?.ok===false)throw new Error(result.message??'The proposed change was rejected.');
       }
       setError(null);
       const currentSession=opts.current.getSession?.()??opts.current.session;
       const question=nextQuestion(currentSession,opts.current.role);
       if(r.ws?.readyState===WebSocket.OPEN){
         r.ws.send(JSON.stringify({type:'session.update',session:{system_prompt:conversationPrompt(currentSession,opts.current.role,question)}}));
         if(textOnly)r.ws.send(JSON.stringify({type:'reply.create',instructions:`The application processed the latest participant statement. Say this communication prompt exactly, without claiming any other action: ${JSON.stringify(question)}`}));
       }
     }catch(e){if(!r.ending&&current.current===r)setError(e instanceof Error?e.message:'This turn could not be analyzed. The transcript was kept.');}
   });
 },[]);
 const cancelAudio=useCallback((r:Runtime)=>{for(const src of r.sources){try{src.stop();}catch{}}r.sources.clear();r.playAt=r.ctx?.currentTime??0;},[]);
 const cleanup=useCallback((r:Runtime)=>{
   r.ready=false;r.ending=true;r.generation++;r.pending=[];
   if(r.timer)clearInterval(r.timer);if(r.timeout)clearTimeout(r.timeout);
   r.stream?.getTracks().forEach(t=>t.stop());r.worklet?.disconnect();cancelAudio(r);
   if(r.ctx&&r.ctx.state!=='closed')void r.ctx.close();
   r.ws?.close();if(current.current===r)setPartial('');
 },[cancelAudio]);
 const stop=useCallback(()=>{
   const r=current.current;if(r.ending)return;r.ending=true;r.ready=false;r.pending=[];r.generation++;
   r.stream?.getTracks().forEach(t=>t.stop());cancelAudio(r);
   if(r.ws?.readyState===WebSocket.OPEN){r.ws.send(JSON.stringify({type:'session.end'}));r.timeout=setTimeout(()=>{cleanup(r);if(current.current===r)setStatus('idle');},2500);}else{cleanup(r);setStatus('idle');}
 },[cleanup,cancelAudio]);
 const start=useCallback(async(config?:{microphone?:boolean;accessCode?:string})=>{
   if(['connecting','listening','speaking'].includes(status))return;
   cleanup(current.current);const r=fresh();r.accessCode=config?.accessCode??'';current.current=r;setStatus('connecting');setError(null);setElapsed(0);
   const fail=(message:string)=>{if(current.current!==r||r.ending)return;setError(message);setStatus('error');if(r.ws?.readyState===WebSocket.OPEN)r.ws.send(JSON.stringify({type:'session.end'}));cleanup(r);};
   try{
     r.ctx=new AudioContext();await r.ctx.resume();if(r.ending||current.current!==r){cleanup(r);return;}
     if(config?.microphone!==false){
       if(!navigator.mediaDevices?.getUserMedia)throw new Error('Use HTTPS or localhost to access the microphone.');
       r.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:false,channelCount:1}});
       if(r.ending){cleanup(r);return;}
       await r.ctx.audioWorklet.addModule('/pcm-worklet.js');r.worklet=new AudioWorkletNode(r.ctx,'carethread-pcm');
       const source=r.ctx.createMediaStreamSource(r.stream);source.connect(r.worklet);r.worklet.connect(r.ctx.destination);
       r.worklet.port.onmessage=(event:MessageEvent<ArrayBuffer>)=>{if(!r.ready||r.ending||r.ws?.readyState!==WebSocket.OPEN)return;const b=new Uint8Array(event.data);let raw='';for(const v of b)raw+=String.fromCharCode(v);r.ws.send(JSON.stringify({type:'input.audio',audio:btoa(raw)}));};
     }
     const tokenResponse=await fetch('/api/voice-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessCode:config?.accessCode??''})});
     const tokenData=await tokenResponse.json();if(!tokenResponse.ok)throw new Error(tokenData.error??'Could not start voice.');
     if(r.ending){cleanup(r);return;}
     const ws=new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(tokenData.token)}`);r.ws=ws;
     r.timeout=setTimeout(()=>fail('AssemblyAI did not connect in time. Please retry.'),20000);
     let finishStart:()=>void=()=>{};
     const startedPromise=new Promise<void>(resolve=>{finishStart=resolve;});
     let greetingDone=false;
     ws.onopen=()=>ws.send(JSON.stringify({type:'session.update',session:voiceConfig(opts.current.session,opts.current.role)}));
     ws.onerror=()=>fail('The voice connection failed. Check your connection and retry.');
     ws.onclose=()=>{finishStart();const expected=r.ending;cleanup(r);if(current.current===r){setStatus(expected?'idle':'error');if(!expected)setError('The voice connection ended. Your handoff has been kept; reconnect to continue.');}};
     ws.onmessage=async(event)=>{
       if(current.current!==r)return;
       let msg;try{msg=JSON.parse(event.data);}catch{return;}
       // A reset replaces the board immediately, while session.end can take
       // time. Late transcripts must never be appended to the fresh handoff.
       if(r.ending&&msg.type!=='session.ended')return;
       if(msg.type==='session.ready'){
         if(r.ending){ws.send(JSON.stringify({type:'session.end'}));return;}
         if(r.timeout)clearTimeout(r.timeout);r.ready=true;r.started=Date.now();setStatus('listening');
         r.timer=setInterval(()=>{const elapsed=Math.floor((Date.now()-r.started)/1000);setElapsed(elapsed);if(elapsed>=175)stop();},1000);
       }else if(msg.type==='session.ended'){cleanup(r);setStatus('idle');
       }else if(msg.type==='session.error'||msg.type==='error'){fail(`AssemblyAI: ${String(msg.message??msg.code??'session error')}`);
       }else if(msg.type==='input.speech.started'){
         // VAD is not an interruption decision: a short acknowledgment may
         // overlap the agent. Wait for reply.done(interrupted) before cancelling.
         r.speakingRole=opts.current.role;
       }else if(msg.type==='transcript.user.delta'){setPartial(String(msg.text??''));
       }else if(msg.type==='transcript.user'){
         setPartial('');const text=String(msg.text??'').trim();if(text){const role=r.speakingRole??opts.current.role,id=String(msg.item_id??crypto.randomUUID());opts.current.onTurn(role,text,id);analyzeTurn(r,id,role);}r.speakingRole=null;
       }else if(msg.type==='transcript.agent'){const text=String(msg.text??'').trim();if(text)opts.current.onTurn('agent',text,`agent-${String(msg.reply_id??msg.item_id??crypto.randomUUID())}`);
       }else if(msg.type==='reply.started'){r.generation++;setStatus('speaking');
       }else if(msg.type==='reply.audio'&&r.ctx&&!r.ending){
         const raw=atob(msg.data),buffer=r.ctx.createBuffer(1,raw.length/2,24000),samples=buffer.getChannelData(0);
         for(let i=0;i<samples.length;i++){let v=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);if(v>=32768)v-=65536;samples[i]=v/32768;}
         const source=r.ctx.createBufferSource();source.buffer=buffer;source.connect(r.ctx.destination);r.sources.add(source);source.onended=()=>r.sources.delete(source);
         r.playAt=Math.max(r.playAt,r.ctx.currentTime);source.start(r.playAt);r.playAt+=buffer.duration;setStatus('speaking');
       }else if(msg.type==='tool.call'){
         let args:Record<string,unknown>={};let invalid=false;try{args=typeof msg.arguments==='string'?JSON.parse(msg.arguments):msg.arguments??{};if(!args||typeof args!=='object'||Array.isArray(args))invalid=true;}catch{invalid=true;}
         r.pending.push({name:msg.name,arguments:args,call_id:msg.call_id,invalid});
       }else if(msg.type==='reply.done'){
         if(msg.status==='interrupted'){r.pending=[];r.generation++;cancelAudio(r);}
         else {
           const generation=r.generation,pending=r.pending.splice(0);
           for(const tool of pending){
             if(r.ending||r.generation!==generation)break;
             let result:unknown;try{result=tool.invalid?{ok:false,error:'Tool arguments must be a valid JSON object.'}:opts.current.onTool(tool.name,tool.arguments,tool.call_id);if(result instanceof Promise)result=await result;}catch{result={ok:false,error:'The change could not be recorded. Please retry.'};}
             // Mutations already committed remain authoritative even if a subsequent interruption prevents sending the result.
             if(!r.ending&&r.generation===generation&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'tool.result',call_id:tool.call_id,result:JSON.stringify(result),is_error:typeof result==='object'&&result!==null&&'ok' in result&&result.ok===false}));
           }
         }
         if(!r.ending)setStatus('listening');if(!greetingDone){greetingDone=true;finishStart();}
       }
     };
     await Promise.race([startedPromise,new Promise<void>(resolve=>setTimeout(resolve,20000))]);
   }catch(e){fail(e instanceof Error?(e.name==='NotAllowedError'?'Microphone permission was declined. Use the text-only session or enable microphone access.':e.message):'Could not start voice.');}
 },[cleanup,status,stop,cancelAudio,analyzeTurn]);
 const sendText=useCallback((text:string)=>{
   const r=current.current;const value=text.trim();if(!value||!r.ready||r.ending||r.ws?.readyState!==WebSocket.OPEN)return false;
   const id=crypto.randomUUID();opts.current.onTurn(opts.current.role,value,id);
   r.ws.send(JSON.stringify({type:'conversation.message',role:'user',content:`[${opts.current.role}; source turn ${id}] ${value}`}));
   analyzeTurn(r,id,opts.current.role,true);return true;
 },[analyzeTurn]);
 useEffect(()=>{const r=current.current;if(r.ready&&r.ws?.readyState===WebSocket.OPEN)r.ws.send(JSON.stringify({type:'session.update',session:{system_prompt:conversationPrompt(options.session,options.role)}}));},[options.role]);
 useEffect(()=>{const end=()=>stop();window.addEventListener('pagehide',end);return()=>{window.removeEventListener('pagehide',end);const r=current.current;if(r.ws?.readyState===WebSocket.OPEN)r.ws.send(JSON.stringify({type:'session.end'}));cleanup(r);};},[cleanup,stop]);
 return {status,error,start,stop,sendText,elapsedSeconds,partial};
}

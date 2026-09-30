// Explicit opt-in integration check: sends only the synthetic qa/handoff.pcm fixture.
// Run: node --env-file=.env.local --import tsx scripts/smoke-live.ts
import fs from 'node:fs';
import { createSession, appendTurn, applyTool } from '../lib/handoff';
import { voiceConfig } from '../lib/voice-config';

async function main(){
 const key=process.env.ASSEMBLYAI_API_KEY;if(!key)throw new Error('Server key missing.');
 const audio=fs.readFileSync('qa/handoff.pcm');let session=createSession('live-smoke');
 const request=await fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=60&max_session_duration_seconds=120',{headers:{Authorization:`Bearer ${key}`}});
 if(!request.ok)throw new Error(`Token endpoint ${request.status}`);const {token}=await request.json();
 const ws=new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(token)}`);
 const started=Date.now();let began=false,ending=false;const pending:any[]=[];let audioFrames=0;let replySerial=0;const events:object[]=[];
 const log=(data:object)=>{events.push({ms:Date.now()-started,...data});console.log(JSON.stringify(data));};
 const end=()=>{if(ending)return;ending=true;if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'session.end'}));};
 const hard=setTimeout(end,100000);
 let streamTimer:ReturnType<typeof setInterval>|undefined;
 const sendAudio=()=>{if(began)return;began=true;log({event:'synthetic_audio_started',durationSeconds:audio.length/48000});let offset=0;streamTimer=setInterval(()=>{if(ending||ws.readyState!==WebSocket.OPEN){clearInterval(streamTimer);return;}const data=offset<audio.length?audio.subarray(offset,offset+2400):Buffer.alloc(2400);offset+=2400;ws.send(JSON.stringify({type:'input.audio',audio:data.toString('base64')}));if(offset>audio.length+48000*8)clearInterval(streamTimer);},50);};
 ws.onopen=()=>ws.send(JSON.stringify({type:'session.update',session:voiceConfig(session,'sender')}));
 ws.onmessage=(event)=>{
  const m=JSON.parse(event.data.toString());
  if(m.type==='session.ready')log({event:'session.ready'});
  if(m.type==='reply.audio')audioFrames++;
  if(m.type==='reply.started'){replySerial++;log({event:m.type});}
  if(m.type==='transcript.user'){session=appendTurn(session,{id:m.item_id,role:'sender',text:m.text});log({event:m.type,text:m.text});const serial=replySerial;setTimeout(()=>{if(replySerial===serial&&!ending){log({event:'explicit_reply_requested'});ws.send(JSON.stringify({type:'session.update',session:{system_prompt:voiceConfig(session,'sender').system_prompt}}));ws.send(JSON.stringify({type:'reply.create',instructions:`Process this newly recorded sender statement as clinical data: ${JSON.stringify({sourceTurnId:m.item_id,text:m.text})}. Call get_open_items to obtain the source, then capture_pending_item. Do not infer missing facts.`}));}},1500);}
  if(m.type==='transcript.agent'){session=appendTurn(session,{id:m.item_id??m.reply_id,role:'agent',text:m.text});log({event:m.type,text:m.text});}
  if(m.type==='tool.call'){pending.push(m);log({event:m.type,name:m.name,args:m.arguments});}
  if(m.type==='reply.done'){
   if(m.status==='interrupted'){pending.length=0;log({event:'interrupted'});}else for(const tool of pending.splice(0)){
    const result=applyTool(session,tool.name,tool.arguments,tool.call_id);session=result.session;
    log({event:'tool.result',name:tool.name,ok:result.result.ok,code:result.result.code});ws.send(JSON.stringify({type:'tool.result',call_id:tool.call_id,result:JSON.stringify(result.result)}));
   }
   if(!began)setTimeout(sendAudio,300);
   if(session.items.length&&m.status==='completed'&&!pending.length)setTimeout(end,8000);
  }
  if(m.type==='session.error'){log({event:m.type,code:m.code,message:m.message});end();}
  if(m.type==='session.ended'){
   clearTimeout(hard);if(streamTimer)clearInterval(streamTimer);
   const item=session.items[0];const passed=!!item&&item.owner?.includes('Lee')===true&&item.taskStatus==='pending'&&session.turns.some(t=>t.role==='sender')&&audioFrames>0;
   const result={passed,sessionSeconds:m.session_duration_seconds,outputAudioFrames:audioFrames,items:session.items,events};
   fs.writeFileSync('qa/live-smoke.json',JSON.stringify(result,null,2));log({event:'summary',passed,sessionSeconds:m.session_duration_seconds,outputAudioFrames:audioFrames,item});ws.close();if(!passed)process.exitCode=1;
  }
 };
 ws.onclose=()=>{clearTimeout(hard);if(streamTimer)clearInterval(streamTimer);};
 ws.onerror=()=>{log({event:'connection_error'});end();process.exitCode=1;};
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

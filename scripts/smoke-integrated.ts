// Opt-in real integration: local app + AssemblyAI, synthetic audio only.
// From the repository root, generate the fixture on macOS (say + ffmpeg):
// mkdir -p qa
// say -v Samantha -o qa/handoff.aiff "For our fictional patient, the scan result is still pending. Dr Lee will review it by three PM. Discharge is waiting for that review. Please capture that pending task."
// ffmpeg -y -i qa/handoff.aiff -ar 24000 -ac 1 -c:a pcm_s16le -f s16le qa/handoff.pcm
// Start the app in another terminal: npm run dev
// Then run: node --env-file=.env.local --import tsx scripts/smoke-integrated.ts
// CARETHREAD_BASE_URL defaults to http://127.0.0.1:3000. .env.local supplies
// DEMO_ACCESS_CODE if the server requires it. No key or token is printed.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createSession, appendTurn } from '../lib/handoff';
import { voiceConfig, conversationPrompt } from '../lib/voice-config';
import { validateVoicePlan } from '../lib/voice-tools';

const resultPath='qa/integrated-voice-result.json';
const runId=randomUUID(),startedAt=new Date().toISOString();
let recordedThisRun=false;

async function main(){
 const base=process.env.CARETHREAD_BASE_URL??'http://127.0.0.1:3000',accessCode=process.env.DEMO_ACCESS_CODE??'';
 let session=createSession('integrated-voice-test');const audio=fs.readFileSync('qa/handoff.pcm');
 if(!audio.length||audio.length%2!==0)throw new Error('The fixture must contain nonempty PCM16 mono 24 kHz audio.');
 const response=await fetch(`${base}/api/voice-token`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accessCode}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw new Error(data.error);
 if(typeof data.token!=='string'||!data.token)throw new Error('The token response was invalid.');
 const ws=new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(data.token)}`);
 const started=Date.now(),events:object[]=[];let streaming=false,ending=false,heardUser=false,repliesAfterInput=0,frames=0,analysisMs=0;
 let failure:string|null=null;
 let audioTimer:ReturnType<typeof setInterval>|undefined,forceClose:ReturnType<typeof setTimeout>|undefined,finishTimer:ReturnType<typeof setTimeout>|undefined,startTimer:ReturnType<typeof setTimeout>|undefined;
 const log=(event:object)=>{const row={ms:Date.now()-started,...event};events.push(row);console.log(JSON.stringify(row));};
 const end=(reason?:string)=>{if(reason)failure??=reason;if(ending)return;ending=true;if(audioTimer)clearInterval(audioTimer);if(startTimer)clearTimeout(startTimer);if(finishTimer)clearTimeout(finishTimer);if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'session.end'}));forceClose=setTimeout(()=>ws.close(),2500);};
 const deadline=setTimeout(()=>end('The integration check exceeded its 60-second deadline.'),60000);
 const stream=()=>{if(streaming||ending||ws.readyState!==WebSocket.OPEN)return;streaming=true;let offset=0;log({event:'synthetic_audio.start',seconds:audio.length/48000});audioTimer=setInterval(()=>{if(ending||ws.readyState!==WebSocket.OPEN){clearInterval(audioTimer);return;}const chunk=offset<audio.length?audio.subarray(offset,offset+2400):Buffer.alloc(2400);offset+=2400;ws.send(JSON.stringify({type:'input.audio',audio:chunk.toString('base64')}));if(offset>audio.length+48000*5)clearInterval(audioTimer);},50);};
 ws.onopen=()=>{if(!ending)ws.send(JSON.stringify({type:'session.update',session:voiceConfig(session,'sender')}));};
 ws.onmessage=async event=>{
  try{
  const m=JSON.parse(String(event.data));
  if(ending&&m.type!=='session.ended')return;
  if(m.type==='session.ready')log({event:m.type});
  if(m.type==='reply.audio')frames++;
  if(m.type==='transcript.user'){
   heardUser=true;session=appendTurn(session,{id:m.item_id,role:'sender',text:m.text});log({event:m.type,text:m.text});
   try{
    const t=Date.now();const response=await fetch(`${base}/api/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session,role:'sender',turnId:m.item_id,accessCode}),signal:AbortSignal.timeout(30000)});const plan=await response.json();analysisMs=Date.now()-t;
    if(ending||ws.readyState!==WebSocket.OPEN)return;
    if(!response.ok)throw new Error(plan.error);
    session=validateVoicePlan(session,plan,m.item_id).session;
    log({event:'validated_board',analysisMs,item:session.items[0],question:plan.reply});
    ws.send(JSON.stringify({type:'session.update',session:{system_prompt:conversationPrompt(session,'sender',plan.reply)}}));
    finishTimer=setTimeout(()=>end(),10000);
   }catch(e){const message=e instanceof Error?e.message:'Analysis failed.';log({event:'analysis.error',message});end(message);}
  }
  if(m.type==='transcript.agent'){if(heardUser)repliesAfterInput++;session=appendTurn(session,{id:`agent-${m.reply_id}`,role:'agent',text:m.text});log({event:m.type,text:m.text});}
  if(m.type==='reply.done'&&!streaming)startTimer=setTimeout(stream,200);
  if(m.type==='session.error'){log({event:m.type,code:m.code,message:m.message});end(`AssemblyAI session error: ${String(m.code??'unknown')}.`);}
  if(m.type==='session.ended'){
   const item=session.items[0],passed=!failure&&heardUser&&!!item&&/Lee/i.test(item.owner??'')&&/3|three/i.test(item.due??'')&&item.taskStatus==='pending'&&/pending/i.test(item.uncertainty??'')&&repliesAfterInput>0&&frames>0;
   const result={runId,startedAt,passed,error:failure??(passed?null:'The session ended without all required observations.'),analysisMs,repliesAfterInput,outputAudioFrames:frames,seconds:m.session_duration_seconds,item,events};fs.writeFileSync(resultPath,JSON.stringify(result,null,2));recordedThisRun=true;log({event:'summary',runId,passed,analysisMs,repliesAfterInput,seconds:m.session_duration_seconds});if(!passed)process.exitCode=1;ending=true;ws.close();
  }
  }catch(e){const message=e instanceof Error?e.message:'Invalid session event.';log({event:'event.error',message});end(message);}
 };
 ws.onerror=()=>{log({event:'websocket_error'});end('The voice WebSocket failed.');};
 await new Promise<void>(resolve=>{ws.onclose=()=>{clearTimeout(deadline);if(audioTimer)clearInterval(audioTimer);if(forceClose)clearTimeout(forceClose);if(finishTimer)clearTimeout(finishTimer);if(startTimer)clearTimeout(startTimer);resolve();};});
 // A previous artifact is never evidence that this WebSocket session completed.
 if(!recordedThisRun)throw new Error(failure??'The connection closed without a completed result for this run.');
}
main().catch(e=>{const message=e instanceof Error?e.message:'Integration check failed.';if(!recordedThisRun){fs.mkdirSync('qa',{recursive:true});fs.writeFileSync(resultPath,JSON.stringify({runId,startedAt,passed:false,error:message},null,2));}console.error(message);process.exitCode=1;});

// Synthetic-only Gateway check; no credentials are logged.
import fs from 'node:fs';
import { appendTurn, createSession, replayStep, summarize } from '../lib/handoff';
import { buildPlannerRequest, parsePlannerResponse, validateVoicePlan } from '../lib/voice-tools';

async function main() {
 const key=process.env.ASSEMBLYAI_API_KEY;if(!key)throw new Error('Server credential unavailable.');
 let session=createSession('gateway-live-check');
 const reports:unknown[]=[];
 const allTurns=[
  {id:'probe-capture',role:'sender' as const,text:'For our fictional patient, the scan result is still pending. Dr Lee will review it by 3 PM. Discharge is waiting for that review. Please capture that pending task.'},
  {id:'probe-confirm',role:'sender' as const,text:'I confirm the captured plan: Dr Lee reviews the scan by 3 PM. The result remains pending. Discharge is waiting for the review.'},
  {id:'probe-ack',role:'receiver' as const,text:'I am Nurse Morgan. I acknowledge Dr Lee owns the scan review by 3 PM. The result is still pending and discharge is waiting for that review.'},
 ];
 const selected=process.argv[2];
 const turns=selected==='ack'?[allTurns[2]]:selected==='drift'?[{id:'probe-drift',role:'receiver' as const,text:'The scan was clear, so the patient is ready for discharge.'}]:allTurns;
 if(selected==='ack'||selected==='drift'){session=replayStep(session,0);session=replayStep(session,2);}
 for(const turn of turns){
  session=appendTurn(session,turn);const started=Date.now();
  const response=await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions',{method:'POST',headers:{authorization:key,'content-type':'application/json'},body:JSON.stringify(buildPlannerRequest(session,turn.role,turn.id)),signal:AbortSignal.timeout(45000)});
  const data=await response.json();if(!response.ok)throw new Error(`Gateway status ${response.status}`);
  const raw=data.choices?.[0]?.message?.content;
  const plan=parsePlannerResponse(raw,session,turn.id);
  const validated=validateVoicePlan(session,plan,turn.id);session=validated.session;
  const report={turn:turn.id,ms:Date.now()-started,request_id:data.request_id,plan,items:session.items,summary:summarize(session)};
  reports.push(report);fs.writeFileSync('qa/gateway-smoke.json',JSON.stringify({passed:null,reports},null,2));console.log(JSON.stringify(report));
 }
 const item=session.items[0];
 const passed=selected==='drift'?session.issues.some(issue=>issue.kind==='reconciliation'&&issue.status==='open')&&item.taskStatus==='pending'&&item.acceptance===null:session.items.length===1&&item.taskStatus==='pending'&&!!item.owner?.includes('Lee')&&!!item.due&&!!item.uncertainty?.toLowerCase().includes('pending')&&!!item.condition?.toLowerCase().includes('waiting')&&item.reviewed&&item.acceptance?.by==='Nurse Morgan';
 fs.writeFileSync('qa/gateway-smoke.json',JSON.stringify({passed,reports},null,2));
 console.log(JSON.stringify({passed}));if(!passed)process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Gateway check failed');process.exitCode=1;});

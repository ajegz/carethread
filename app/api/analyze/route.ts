import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { parseSavedWorkspace } from '../../../components/session-store';
import { buildPlannerRequest, parsePlannerResponse, validateVoicePlan, nextQuestion } from '../../../lib/voice-tools';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const counts=new Map<string,{count:number;reset:number}>();
const respond=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(req:NextRequest){
 const origin=req.headers.get('origin');
 if(origin&&origin!==req.nextUrl.origin){try{if(new URL(origin).host!==req.headers.get('host'))return respond({error:'Invalid request origin.'},403);}catch{return respond({error:'Invalid request origin.'},403);}}
 const key=process.env.ASSEMBLYAI_API_KEY,secret=process.env.DEMO_ACCESS_CODE;
 if(!key||process.env.NODE_ENV==='production'&&!secret)return respond({error:'Live analysis is not configured. Use the guided scenario.'},503);
 let body;try{const raw=await req.text();if(raw.length>300000)return respond({error:'This session is too large. Export it and start a new handoff.'},413);body=JSON.parse(raw);if(!body||typeof body!=='object')throw new Error();}catch{return respond({error:'Invalid analysis request.'},400);}
 if(secret){const a=Buffer.from(typeof body.accessCode==='string'?body.accessCode:''),b=Buffer.from(secret);if(a.length!==b.length||!timingSafeEqual(a,b))return respond({error:'Enter the demo access code to analyze this turn.'},401);}
 const role=body.role;
 if(role!=='sender'&&role!=='receiver')return respond({error:'Choose a valid participant role.'},400);
 const parsed=parseSavedWorkspace({session:body.session,role,mode:'live',replayIndex:0});
 if(!parsed||typeof body.turnId!=='string'||parsed.session.items.length>20||parsed.session.turns.length>200)return respond({error:'The handoff state is invalid or too large.'},400);
 const turn=parsed.session.turns.find(t=>t.id===body.turnId&&t.role===role);
 if(!turn||turn.text.length>12000)return respond({error:'A valid participant source turn is required.'},400);
 const now=Date.now(),ip=req.headers.get('x-forwarded-for')?.split(',')[0]??'local';
 for(const[k,v]of counts)if(v.reset<now)counts.delete(k);
 const bucket=counts.get(ip)??{count:0,reset:now+60000};if(bucket.count>=20)return respond({error:'Please pause before sending another turn.'},429);bucket.count++;counts.set(ip,bucket);
 try{
  const upstream=await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions',{method:'POST',headers:{authorization:key,'content-type':'application/json'},body:JSON.stringify(buildPlannerRequest(parsed.session,role,body.turnId)),signal:AbortSignal.timeout(25000),cache:'no-store'});
  if(upstream.status===429)return respond({error:'AssemblyAI is temporarily limiting requests. Your transcript is preserved; please wait briefly and retry.',retryAfter:Math.min(30,Math.max(3,Number(upstream.headers.get('retry-after'))||10))},429);
  if(!upstream.ok)return respond({error:'AssemblyAI could not analyze this turn. Your transcript is preserved; please retry.'},502);
  const data=await upstream.json();
  const plan=parsePlannerResponse(data.choices?.[0]?.message?.content,parsed.session,body.turnId);
  const validated=validateVoicePlan(parsed.session,plan,body.turnId);
  return respond({...plan,reply:nextQuestion(validated.session,role)});
 }catch{return respond({error:'The proposed change could not be validated. Please restate the task, owner, and time, or use the review controls.'},422);}
}

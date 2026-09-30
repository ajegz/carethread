import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const buckets = new Map<string, { count: number; reset: number }>();
const headers = { 'Cache-Control': 'no-store, max-age=0' };
const response = (body: object, status = 200) => NextResponse.json(body, { status, headers });

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) {
    try { if(new URL(origin).host !== req.headers.get('host')) return response({error:'This voice request must come from CareThread.'},403); }
    catch { return response({error:'Invalid request origin.'},403); }
  }
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) return response({error:'Live voice is not configured. The guided replay is available.'},503);
  const secret = process.env.DEMO_ACCESS_CODE;
  if (process.env.NODE_ENV === 'production' && !secret) return response({error:'Live voice is awaiting a demo access code on the server. Try the guided replay.'},503);
  let code = '';
  try { const body = await req.json(); code = typeof body.accessCode === 'string' ? body.accessCode : ''; } catch { return response({error:'Invalid request.'},400); }
  if (secret) {
    const a = Buffer.from(code), b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a,b)) return response({error:'Enter the demo access code to start live voice.'},401);
  }
  // Per-process backstop; the private access code is the primary demo gate.
  const now=Date.now(), ip=req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';
  for (const [k,v] of buckets) if (v.reset < now) buckets.delete(k);
  const bucket=buckets.get(ip) ?? {count:0,reset:now+3600000};
  if(bucket.count >= 10) return response({error:'The demo session limit has been reached. Please use the guided replay.'},429);
  bucket.count++; buckets.set(ip,bucket);
  try {
    const upstream=await fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=60&max_session_duration_seconds=180',{headers:{Authorization:`Bearer ${key}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!upstream.ok) return response({error:upstream.status===401?'The voice service credential needs updating.':'AssemblyAI is unavailable for this session. Please retry or use the guided replay.'},502);
    const data=await upstream.json();
    if(typeof data.token!=='string') return response({error:'The voice service returned an invalid response.'},502);
    return response({token:data.token,maxSessionSeconds:180});
  } catch { return response({error:'Could not reach AssemblyAI. Please retry or use the guided replay.'},502); }
}

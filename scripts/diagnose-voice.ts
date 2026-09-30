// Opt-in, synthetic-only diagnosis. No key/token/config body is logged.
// node --env-file=.env.local --import tsx scripts/diagnose-voice.ts simple|direct|textprobe|lean|full
import fs from 'node:fs';
import { appendTurn, applyTool, createSession, toolDefinitions } from '../lib/handoff';
import { voiceConfig } from '../lib/voice-config';

const variant = process.argv[2] ?? 'simple';
if (!['simple', 'direct', 'textprobe', 'lean', 'full'].includes(variant)) throw new Error('Use simple, direct, textprobe, lean, or full.');
const key = process.env.ASSEMBLYAI_API_KEY;
if (!key) throw new Error('Server credential is unavailable.');
const audio = fs.readFileSync('qa/handoff.pcm');
let session = createSession(`diagnostic-${variant}`);

function simplify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(simplify);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (name === 'description' || name === 'additionalProperties') continue;
    result[name] = name === 'type' && Array.isArray(entry) ? entry.find((type) => type !== 'null') : simplify(entry);
  }
  return result;
}

const simpleTools = [
  { type: 'function', name: 'get_open_items', description: 'Get the current handoff and transcript source IDs.', parameters: { type: 'object', properties: {} } },
  { type: 'function', name: 'capture_pending_item', description: 'Record the pending task reported by the sender.', parameters: {
    type: 'object', properties: {
      task: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string' },
      condition: { type: 'string' }, uncertainty: { type: 'string' }, sourceTurnId: { type: 'string' },
    }, required: ['task', 'sourceTurnId'],
  } },
];

const shortPrompt = 'You record a FICTIONAL clinical handoff. Do not diagnose or give medical advice. After the sender speaks, call get_open_items to read the actual source turn ID. Then call capture_pending_item using only the stated task, owner, time, condition, uncertainty and source ID. Preserve missing fields as empty strings. Do not capture the greeting. After successful capture say one brief acknowledgment. If a tool fails use the error to correct it.';
const base = voiceConfig(session, 'sender');
const directTool = structuredClone(simpleTools[1]);
delete directTool.parameters.properties.sourceTurnId;
directTool.parameters.required = ['task'];
const markerTool = { type: 'function', name: 'record_marker', description: 'Record the marker requested by the user.', parameters: { type: 'object', properties: { marker: { type: 'string' } }, required: ['marker'] } };
const config = variant === 'full' ? base : {
  ...base,
  system_prompt: variant === 'textprobe' ? 'When the user asks to record a marker, call record_marker with the exact requested marker. Do not record your greeting. After a successful tool result say Recorded.' : variant === 'direct' ? 'You record unfinished work in a FICTIONAL clinical handoff. After the sender speaks, immediately call capture_pending_item with their stated task, owner, time, condition and uncertainty. Use empty strings for unstated facts. The application attaches the source statement automatically. Do not record the greeting. Do not diagnose or advise. After the tool succeeds, acknowledge in one short sentence.' : shortPrompt,
  greeting: 'Ready for the fictional handoff.',
  tools: variant === 'textprobe' ? [markerTool] : variant === 'direct' ? [directTool] : variant === 'simple' ? simpleTools : toolDefinitions.map((tool) => ({ ...simplify(tool) as object, description: tool.name.replaceAll('_', ' ') })),
};

async function main() {
  const response = await fetch('https://agents.assemblyai.com/v1/token?expires_in_seconds=60&max_session_duration_seconds=60', {
    headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Token request failed (${response.status}).`);
  const payload = await response.json();
  if (typeof payload.token !== 'string') throw new Error('Token response was invalid.');
  const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(payload.token)}`);
  const started = Date.now();
  let ending = false, streaming = false, inputTurn = false, audioFrames = 0;
  const recordedMarkers: string[] = [];
  let streamTimer: ReturnType<typeof setInterval> | undefined;
  let forceClose: ReturnType<typeof setTimeout> | undefined;
  const pending: Array<Record<string, unknown>> = [];
  const log = (data: object) => console.log(JSON.stringify({ variant, ms: Date.now() - started, ...data }));
  const end = () => {
    if (ending) return;
    ending = true;
    if (streamTimer) clearInterval(streamTimer);
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'session.end' }));
    forceClose = setTimeout(() => ws.close(), 2000);
  };
  const deadline = setTimeout(end, 55000);
  const startAudio = () => {
    if (streaming || ending) return;
    streaming = true;
    if (variant === 'textprobe') {
      log({ event: 'text.context', marker: 'OCEAN42' });
      ws.send(JSON.stringify({ type: 'conversation.message', role: 'user', content: 'Please record the marker OCEAN42.' }));
      ws.send(JSON.stringify({ type: 'reply.create' }));
      setTimeout(() => {
        if (ending || ws.readyState !== WebSocket.OPEN) return;
        log({ event: 'text.instructions', marker: 'CORAL84' });
        ws.send(JSON.stringify({ type: 'reply.create', instructions: 'Call record_marker now with marker CORAL84. This is an explicit user request.' }));
      }, 12000);
      return;
    }
    log({ event: 'audio.start', syntheticSeconds: audio.length / 48000 });
    let offset = 0;
    streamTimer = setInterval(() => {
      if (ending || ws.readyState !== WebSocket.OPEN) { clearInterval(streamTimer); return; }
      const frame = offset < audio.length ? audio.subarray(offset, offset + 2400) : Buffer.alloc(2400);
      offset += 2400;
      ws.send(JSON.stringify({ type: 'input.audio', audio: frame.toString('base64') }));
      if (offset >= audio.length + 48000 * 6) clearInterval(streamTimer);
    }, 50);
  };
  ws.onopen = () => ws.send(JSON.stringify({ type: 'session.update', session: config }));
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type === 'reply.audio') { audioFrames++; return; }
    if (message.type === 'session.ready') log({ event: message.type, configuredTools: message.config?.tools?.map((tool: {name: string}) => tool.name) });
    if (message.type === 'reply.started') log({ event: message.type });
    if (message.type === 'transcript.user') {
      inputTurn = true;
      session = appendTurn(session, { id: message.item_id, role: 'sender', text: message.text });
      log({ event: message.type, text: message.text });
    }
    if (message.type === 'transcript.agent') log({ event: message.type, text: message.text });
    if (message.type === 'tool.call') { pending.push(message); log({ event: message.type, name: message.name, args: message.arguments }); }
    if (message.type === 'reply.done') {
      log({ event: message.type, status: message.status, replyId: message.reply_id });
      if (message.status === 'interrupted') pending.length = 0;
      else {
        for (const tool of pending.splice(0)) {
          const args = typeof tool.arguments === 'string' ? JSON.parse(tool.arguments) : { ...tool.arguments as object };
          if (variant === 'textprobe' && tool.name === 'record_marker') {
            recordedMarkers.push(args.marker);
            log({ event: 'marker.recorded', marker: args.marker });
            ws.send(JSON.stringify({ type: 'tool.result', call_id: tool.call_id, result: JSON.stringify({ ok: true, marker: args.marker }) }));
            if (recordedMarkers.includes('CORAL84')) setTimeout(end, 2500);
            continue;
          }
          if (variant === 'simple' && tool.name === 'capture_pending_item') {
            args.sourceTurnIds = [args.sourceTurnId]; delete args.sourceTurnId;
          }
          if (variant === 'direct' && tool.name === 'capture_pending_item') {
            args.sourceTurnIds = [session.turns.filter((turn) => turn.role === 'sender').at(-1)?.id];
          }
          const transition = applyTool(session, String(tool.name), args, String(tool.call_id));
          session = transition.session;
          log({ event: 'tool.result', name: tool.name, ok: transition.result.ok, code: transition.result.code });
          ws.send(JSON.stringify({ type: 'tool.result', call_id: tool.call_id, result: JSON.stringify(transition.result), is_error: !transition.result.ok }));
        }
        if (!streaming) setTimeout(startAudio, 200);
        else if (inputTurn && session.items.length) setTimeout(end, 2500);
      }
    }
    if (message.type === 'session.error') { log({ event: message.type, code: message.code, message: message.message }); end(); }
    if (message.type === 'session.ended') {
      log({ event: 'summary', sessionSeconds: message.session_duration_seconds, capturedItems: session.items.length, audioFrames, item: session.items[0] ?? null, recordedMarkers });
      clearTimeout(deadline); if (forceClose) clearTimeout(forceClose); if (streamTimer) clearInterval(streamTimer);
      ws.close();
    }
  };
  ws.onerror = () => { log({ event: 'connection.error' }); end(); };
  await new Promise<void>((resolve) => { ws.onclose = () => { clearTimeout(deadline); if (forceClose) clearTimeout(forceClose); if (streamTimer) clearInterval(streamTimer); resolve(); }; });
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Diagnosis failed.'); process.exitCode = 1; });

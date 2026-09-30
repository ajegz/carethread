# CareThread

**Every handoff has a next step.** A voice agent that helps unfinished clinical work, responsibility and uncertainty survive a care transition.

**Status:** Local prototype; guided workflow verified. Live transcription verified; full live tool flow under repair.

Built for the AssemblyAI Voice Agent Hackathon. This is a communication simulation using fictional patients. It does not diagnose, prescribe, validate treatment, authenticate clinicians or authorize discharge.

## Try the workflow

Open the app and choose **Guided replay** for a reproducible fictional handoff. Move through the pending report, changed readback, clarification and acknowledgment. Acknowledging the handoff leaves the clinical work pending. Corrections invalidate earlier acknowledgment.

For **Live voice**, start a microphone session, select Sender or Receiver before speaking, and describe a fictional pending task. Ask the agent to record its owner, time or trigger, conditions and uncertainty. A text-only live session also exercises the real AssemblyAI agent without microphone permission. Guided replay is scripted and clearly labeled; it is not a live inference benchmark.

## Run locally

Requires Node.js 20.9+ and npm.

```sh
npm ci
cp .env.example .env.local
# Set ASSEMBLYAI_API_KEY in .env.local; never commit it.
npm run dev
```

Open http://localhost:3000. Set `DEMO_ACCESS_CODE` to protect live sessions in production. The key is read only by the server token route; browsers receive single-use tokens expiring after 60 seconds, with a 180-second session cap. Replay requires no API credential. The token route also has a per-process rate-limit backstop, which is not a distributed quota system.

```sh
npm test
npm run typecheck
npm run build
npm start
```

## Architecture

Browser microphone → 24 kHz PCM16 → AssemblyAI managed Voice Agent → structured tool proposals → validated state → evidence-linked handoff board.

- Next.js, React and TypeScript interface and server token endpoint.
- AssemblyAI performs speech recognition, agent reasoning, spoken replies and function calling. Its managed stack needs no separate LLM or TTS key.
- Client tools commit at a completed reply boundary. Interrupted uncommitted calls are discarded; duplicate call IDs return the recorded result.
- The state engine controls item revisions, required fields, acknowledgment and reported completion. The model does not directly mutate the interface.
- Same-browser IndexedDB persistence, JSON export and printable report. Print includes the current handoff and source conversation; JSON also includes the full revision history. There is no multi-device sync, hospital identity verification or EHR integration.

## Evaluation

`npm test` passes **42 automated tests**, and `npm run typecheck` passes. The tests cover missing owner/timing, required participant evidence, receiver acknowledgment, stale revisions, idempotent tool calls, atomic failed changes, preservation of uncertainty, sourced completion reports, clean and mismatched scripted handoffs, saved-state validation, and token endpoint access/error handling.

These are deterministic workflow and security checks with synthetic inputs. They do not measure transcription accuracy, live semantic detection, clinical outcomes, or usability with clinicians. The full live tool flow is still being repaired and is not included in the passing test claim.

## What the state means

**Mentioned ≠ accepted responsibility ≠ reported complete.** Each pending item retains its source turns, revision, stated owner and due time/trigger. An acknowledgment belongs to one revision. Changing the task invalidates that acknowledgment. Unknown fields remain unknown. A clinician's report of completion is labeled *reported complete*; software does not observe physical care.

Semantic differences should prompt reconciliation, not a medical verdict. A new result can legitimately update a plan. Source quotes help review what was said; they do not establish clinical truth.

## Privacy and scope

Use synthetic information only. Audio, transcripts and relevant session context are sent to AssemblyAI during live sessions. Browser storage is local, but voice processing is not offline. This prototype has not been clinically validated, assessed for hospital compliance or connected to real patient systems. Browser role labels are simulation controls, not authenticated identities. Public deployments should retain the private voice access gate and a usage budget.

## Clinical communication references

- [AHRQ TeamSTEPPS: Handoff](https://www.ahrq.gov/teamstepps-program/curriculum/communication/tools/handoff.html)
- [AHRQ TeamSTEPPS: Check-Back](https://www.ahrq.gov/teamstepps-program/curriculum/communication/tools/checkback.html)

These motivate structured handoffs and check-backs. They do not validate this app or support a claim of improved patient outcomes.

## AssemblyAI references

- [Browser integration](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/browser-integration)
- [Client-side tools](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/tools/client-side-tools)
- [Events reference](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/events-reference)

## License

MIT. Submission assets are in `submission/`. Original UI and workflow implementation; conceptual cover artwork is AI-generated.

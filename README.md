# CareThread

**Every handoff has a next step.** A voice agent that helps unfinished clinical work, responsibility and uncertainty survive a care transition.

**Status:** Working local prototype. Guided handoffs and one synthetic audio fixture through the live transcription, planning, validated board update, and spoken reply pipeline have been verified.

Built for the AssemblyAI Voice Agent Hackathon. This is a communication simulation using fictional patients. It does not diagnose, prescribe, validate treatment, authenticate clinicians or authorize discharge.

## Try the workflow

Open the app and choose **Guided replay** for a reproducible fictional handoff. Move through the pending report, changed readback, clarification and acknowledgment. Acknowledging the handoff leaves the clinical work pending. Corrections invalidate earlier acknowledgment.

For **Live voice**, start a microphone session, select Sender or Receiver before speaking, and describe a fictional pending task. The app proposes its owner, time or trigger, conditions and uncertainty for review. Confirm the captured plan, then switch to Receiver for a readback and explicit named acknowledgment. A text-only live session uses the same planning and validation flow without microphone permission. Guided replay is scripted and clearly labeled; it is not a live inference benchmark.

## Run locally

Requires Node.js 20.9+ and npm.

```sh
npm ci
cp .env.example .env.local
# Set ASSEMBLYAI_API_KEY in .env.local; never commit it.
npm run dev
```

Open http://localhost:3000. Set `DEMO_ACCESS_CODE` to protect live sessions in production. The AssemblyAI key stays in the server token and analysis routes; browsers receive single-use voice tokens expiring after 60 seconds, with a 180-second session cap. The same private demo code gates analysis. Replay requires no API credential. Both routes have per-process rate-limit backstops, which are not distributed quota systems.

```sh
npm test
npm run typecheck
npm run build
npm start
```

## Architecture

Browser microphone → 24 kHz PCM16 → AssemblyAI managed Voice Agent transcription → AssemblyAI LLM Gateway JSON plan → server and client validation → evidence-linked handoff board.

- Next.js, React and TypeScript interface with server token and analysis endpoints.
- The managed Voice Agent supplies speech recognition and spoken conversation, configured without native function tools. AssemblyAI LLM Gateway runs `qwen3.5-4b-32k-fast` to propose structured actions from the latest participant turn and current board. Both services use the same server-held AssemblyAI key; no separate LLM or TTS key is needed.
- The server parses the JSON plan and checks it with `validateVoicePlan`. The client validates it again against the latest local state before committing actions through `applyTool`. Source IDs, participant roles, expected revisions and the entire action sequence must pass validation. Duplicate call IDs return their recorded results.
- Analysis runs in turn order. The next communication question comes from validated state, and the spoken agent receives the updated board. The state engine controls required fields, acknowledgment and reported completion; generated speech alone cannot update a task.
- Same-browser IndexedDB persistence, JSON export and printable report. Print includes the current handoff and source conversation; JSON also includes the full revision history. There is no multi-device sync, hospital identity verification or EHR integration.

## Evaluation

`npm test` passes **80 automated tests** (78 domain/API checks plus two voice lifecycle regressions), and `npm run typecheck` passes. The tests cover missing owner/timing, required participant evidence, receiver acknowledgment, stale revisions, idempotent calls, atomic failed changes, preservation of uncertainty, sourced completion reports, clean and mismatched scripted handoffs, saved-state validation, JSON plan validation, and both server endpoints' access controls, rate limits and sanitized errors. The lifecycle regressions cover late events after reset and role changes during analysis. Provider requests in automated route tests are mocked.

Separately, [the recorded live integration result](docs/evaluation/synthetic-voice-result.json) passed using one 9.4-second synthetic audio fixture through the actual AssemblyAI services. It captured “Review the scan result,” owner “Dr Lee,” and due time “3 PM,” while retaining the pending result and review prerequisite. The item remained unreviewed, unacknowledged and pending, with its source transcript attached. A spoken follow-up asked the participant to review the capture.

That single run took **1.714 seconds from the final transcript to the validated board update**; this is not total conversational latency or a performance benchmark. It does not establish broader transcription accuracy, reliable live discrepancy detection, usability with clinicians, or clinical benefit. The automated tests and scripted scenarios verify software behavior with synthetic inputs, not patient outcomes.

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
- [LLM Gateway quickstart](https://www.assemblyai.com/docs/llm-gateway/quickstart)
- [Events reference](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/events-reference)

## License

MIT. Submission assets are in `submission/`. Original UI and workflow implementation; conceptual cover artwork is AI-generated.

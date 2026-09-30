# CareThread submission copy

## Title

CareThread: Clinical Handoffs with Context

## Short description

CareThread is a voice-guided clinical handoff simulation. It keeps pending work, owners, timing and uncertainty linked to source statements, with receiver acceptance separate from task completion. Built with AssemblyAI and synthetic data.

## Long description

CareThread is a clinical communication simulation prototype for a specific handoff problem: unfinished work can lose its owner, timing or uncertainty when one clinician hands care to another.

In a guided scenario with a synthetic patient, the sender describes a pending scan review. CareThread captures the task, clinician-stated owner, due time or trigger, conditions and source statements. Missing information remains unresolved until someone clarifies it. The receiving participant reviews the current plan and explicitly accepts it. Acceptance does not complete the clinical task. A substantive correction creates a new revision and invalidates the previous acceptance.

AssemblyAI's managed Voice Agent API handles speech and conversation. Final transcripts go to a server-side AssemblyAI LLM Gateway planner. It proposes structured board changes, which application rules validate against source statements and current revisions. Participants select sender and receiver roles. Synthetic records persist in the same browser, with JSON and printable exports. Scripted replay is labeled separately from live mode.

Our initial users are clinical educators and simulation centers. An institutional training subscription is a business hypothesis to test with them. The prototype focuses on reviewable responsibility and uncertainty across a transition, beyond generating a transcript or summary.

The suite passes 78 software checks. One synthetic spoken fixture passed the speech-to-validated-board path, preserving the task, owner, timing, condition and uncertainty as pending work. Browser microphone-device testing and clinical evaluation remain outstanding. The prototype does not diagnose, prescribe or authorize discharge.

## Tags

Suggested technologies: AssemblyAI Voice Agent API, AssemblyAI LLM Gateway, Next.js, React, TypeScript.

Suggested categories: Healthcare, Communication, Education.

Select matching tags actually offered by the live form. Add the actual hosting platform when deployed.

## Evidence boundary

The video is a narrated synthetic scenario, not a recording of a live AssemblyAI session. The integrated live pipeline passed one synthetic audio fixture. This does not establish browser microphone-device behavior, interruption reliability or clinical benefit. The app runs locally; deployment is not yet verified.

Repository: https://github.com/ajegz/carethread

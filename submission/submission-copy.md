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

The suite passes 80 software checks. One synthetic spoken fixture passed the speech-to-validated-board path, preserving the task, owner, timing, condition and uncertainty as pending work. Browser microphone-device testing and clinical evaluation remain outstanding. The prototype does not diagnose, prescribe or authorize discharge.

## Tags

Suggested technologies: AssemblyAI Voice Agent API, AssemblyAI LLM Gateway, Next.js, React, TypeScript, Vercel.

Suggested categories: Healthcare, Communication, Education.

Select matching tags actually offered by the live form. Demo application platform: Web application, hosted on Vercel.

## Evidence boundary

The latest video is a 48-second animated synthetic scenario with music and sound effects, prepared without narration for the creator to add their voiceover. It is not a recording of a live AssemblyAI session. The integrated live pipeline passed one synthetic audio fixture. This does not establish browser microphone-device behavior, interruption reliability or clinical benefit. The deployed public app was verified reachable on Vercel. Guided scenario mode is scripted and requires no access code. Live voice and live text analysis call AssemblyAI and require the host-provided demo access code.

Repository: https://github.com/ajegz/carethread


## Application and assets

Application URL: https://carethread-six.vercel.app

Demo application platform: Web application (Vercel)

Public repository: https://github.com/ajegz/carethread

Cover image: https://github.com/ajegz/carethread/releases/download/v0.2.0/carethread-poster.png

Slides (PDF): https://github.com/ajegz/carethread/releases/download/v0.2.0/carethread-redesigned.pdf

Editable slides (PPTX): https://github.com/ajegz/carethread/releases/download/v0.2.0/carethread-redesigned.pptx

Latest video, before creator voiceover: https://github.com/ajegz/carethread/releases/download/v0.2.0/carethread-dynamic-no-voiceover.mp4

Voiceover edit kit: https://github.com/ajegz/carethread/releases/download/v0.2.0/carethread-dynamic-edit-kit.zip

## Remaining submission steps

- Add the creator's intended voiceover and export the final presentation video.
- Supply judge access instructions and the private demo code through an appropriate submission field; never share the AssemblyAI API key.
- Select available technology/category tags and upload or link the required assets in the lablab.ai form.
- Review and complete the final submission on lablab.ai. The assistant has not submitted the entry.

Before judging, test the deployed Live voice mode with an actual microphone. The synthetic integration fixture does not verify browser microphone-device behavior. If the form requires a separately hosted video or slide URL, use a host the form accepts; the current GitHub release links provide downloadable assets.

# CareThread submission copy

## Title

CareThread: Clinical Handoffs with Context

## Short description

CareThread is a voice-guided clinical handoff simulation. It keeps pending work, owners, timing and uncertainty linked to source statements, with receiver acceptance separate from task completion. Built with AssemblyAI and synthetic data.

## Long description

CareThread is a clinical communication simulation prototype for a specific handoff problem: unfinished work can lose its owner, timing or uncertainty when one clinician hands care to another.

In a guided scenario with a synthetic patient, the sender describes a pending scan review. CareThread captures the task, clinician-stated owner, due time or trigger, conditions and source statements. Missing information remains unresolved until someone clarifies it. The receiving participant reviews the current plan and explicitly accepts it. Acceptance does not complete the clinical task. A substantive correction creates a new revision and invalidates the previous acceptance.

AssemblyAI's managed Voice Agent API provides the conversational speech interface and structured function-tool calls. Application rules validate state changes and preserve evidence. Participants explicitly select sender and receiver roles. Synthetic records persist in the same browser, with JSON and printable exports. Scenario replay is labeled separately from live microphone mode.

Our initial users are clinical educators and simulation centers. An institutional training subscription is a business hypothesis to test with them. The prototype focuses on reviewable responsibility and uncertainty across a transition, beyond generating a transcript or summary.

This is a synthetic communication demonstration, not a clinical decision system. It does not diagnose, prescribe or authorize discharge. We have not established clinical benefit, real-world reliability or suitability for patient care. Evaluation results and known limitations belong in the public repository.

## Tags

Suggested technologies: AssemblyAI Voice Agent API, Next.js, React, TypeScript, Vercel.

Suggested categories: Healthcare, Communication, Education.

Select matching tags actually offered by the live form. Use Vercel only if that is the deployed platform. Do not add technologies that are not used.

## Before submission

Before final submission, parent must reconcile these present-tense feature statements with the completed app, include the actual repository and hosted URL, and publish actual evaluation results. No results are invented here.

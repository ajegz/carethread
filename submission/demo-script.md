# CareThread narrated presentation

A 4:26 presentation with AI narration and a labeled synthetic scenario walkthrough. This video is not a recording of a live microphone session.

## Slide 1

CareThread is a voice-guided clinical handoff simulation. It focuses on work that remains unfinished when care changes hands. Who owns the task? When does it need attention? What is still uncertain? Those details need to survive the conversation. This presentation uses a fictional patient and a labeled scenario replay. It demonstrates communication behavior, not clinical effectiveness, and it does not authorize treatment or discharge.

## Slide 2

Consider this fictional exchange. The sender says: the scan result is pending, and discharge is waiting for the review. The receiver says: the scan was clear, so the patient is ready for discharge. Something important has changed. A transcript can preserve both sentences without resolving their disagreement. CareThread's purpose is to make the unresolved meaning visible and ask whether new information exists. The clinicians remain responsible for deciding what is correct.

## Slide 3

The demonstration keeps one pending item explicit. The task is to review the scan result. The stated owner is Doctor Lee. The due time is three p.m. The stated condition is that discharge awaits review. The result itself remains pending. Each captured detail keeps a link to the source statement. When an owner or time is missing, the item remains incomplete. The agent asks for clarification rather than silently inventing a value or treating an unknown field as none.

## Slide 4

The key distinction is between accepting a handoff and completing the work. A receiver can accept the current plan while the scan review remains pending. Those are separate states. If the sender corrects a substantive detail after acceptance, the old acknowledgment no longer covers the new version. The receiver needs to review it again. A later completion is a separate clinician-reported event, with its source retained. The software does not claim that it independently observed the clinical action.

## Slide 5

AssemblyAI powers speech and planning. Its managed Voice Agent API handles speech input and conversational replies. Each final transcript goes to a server-side LLM Gateway planner, which proposes board changes as structured data. Application code validates sources, required fields and revisions before applying them. Temporary tokens keep the permanent key out of the browser. AssemblyAI processes audio and text. Synthetic records persist in this browser and can be exported. The architecture supports a focused communication simulation.

## Slide 6

Our starting users are clinical educators and simulation centers. The product hypothesis is a handoff exercise whose omissions, clarifications and acceptance can be reviewed afterward. An institution subscription for training sessions is a possible business model, not current revenue. The next step is feedback from clinicians on whether the exercise reflects their work, followed by measured comparisons of task understanding and time added. We are not claiming customers, validated demand or improved patient outcomes.

## Slide 7

Seventy-eight automated checks passed. They cover handoff state, restored records, access controls and planner validation. One synthetic spoken fixture passed the complete speech-to-board path: AssemblyAI transcribed it, the Gateway proposed a task, and the application validated its details. The task stayed pending and unreviewed. AssemblyAI also spoke a request for review. This was generated test audio. Browser microphone-device testing and clinical evaluation remain outstanding. The video itself presents a scripted synthetic walkthrough.

## Slide 8

CareThread's proposed contribution is a handoff that stays reviewable. Every open item keeps its owner, timing and source statement. Uncertainty remains visible, acceptance applies to a specific revision, and clinical task completion stays separate. The next milestone is clinician feedback on the simulation and a transparent usability evaluation. The interactive app distinguishes live microphone mode from scenario replay. This is a narrow first step toward preserving responsibility across a care transition, using synthetic data throughout the demonstration.

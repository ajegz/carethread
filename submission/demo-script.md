# CareThread narrated presentation

Target: about four minutes, depending on reading pace. AI narration accompanies a labeled synthetic scenario replay. Do not describe this video as a live microphone test.

## Slide 1

CareThread is a voice-guided clinical handoff simulation. It focuses on work that remains unfinished when care changes hands. Who owns the task? When does it need attention? What is still uncertain? Those details need to survive the conversation. This presentation uses a fictional patient and a labeled scenario replay. It demonstrates communication behavior, not clinical effectiveness, and it does not authorize treatment or discharge.

## Slide 2

Consider this fictional exchange. The sender says: the scan result is pending, and discharge is waiting for the review. The receiver says: the scan was clear, so the patient is ready for discharge. Something important has changed. A transcript can preserve both sentences without resolving their disagreement. CareThread's purpose is to make the unresolved meaning visible and ask whether new information exists. The clinicians remain responsible for deciding what is correct.

## Slide 3

The demonstration keeps one pending item explicit. The task is to review the scan result. The stated owner is Doctor Lee. The due time is three p.m. The stated condition is that discharge awaits review. The result itself remains pending. Each captured detail keeps a link to the source statement. When an owner or time is missing, the item remains incomplete. The agent asks for clarification rather than silently inventing a value or treating an unknown field as none.

## Slide 4

The key distinction is between accepting a handoff and completing the work. A receiver can accept the current plan while the scan review remains pending. Those are separate states. If the sender corrects a substantive detail after acceptance, the old acknowledgment no longer covers the new version. The receiver needs to review it again. A later completion is a separate clinician-reported event, with its source retained. The software does not claim that it independently observed the clinical action.

## Slide 5

AssemblyAI's managed Voice Agent API provides speech input, conversational response and structured tool requests. The browser shows the selected participant role, transcript and source evidence. Application code validates required fields, revisions and state changes. A server route issues temporary connection tokens, keeping the permanent key out of the browser. Audio goes to AssemblyAI. Synthetic records persist in this browser and can be exported. This architecture supports a focused demonstration, not a hospital identity or shared records system.

## Slide 6

Our starting users are clinical educators and simulation centers. The product hypothesis is a handoff exercise whose omissions, clarifications and acceptance can be reviewed afterward. An institution subscription for training sessions is a possible business model, not current revenue. The next step is feedback from clinicians on whether the exercise reflects their work, followed by measured comparisons of task understanding and time added. We are not claiming customers, validated demand or improved patient outcomes.

## Slide 7

Validation needs more than one successful scenario. State checks should cover missing owners, missing timing, duplicate calls and stale acceptance. Conversation checks should include legitimate new information and a clean handoff where the agent stays quiet. Live speech needs its own interruption and latency measurements. The slide shows the current recorded validation status. Automated checks can support implementation claims, but they cannot establish real-world clinical reliability or patient benefit.

## Slide 8

CareThread's proposed contribution is a handoff that stays reviewable. Every open item keeps its owner, timing and source statement. Uncertainty remains visible, acceptance applies to a specific revision, and clinical task completion stays separate. The next milestone is clinician feedback on the simulation and a transparent usability evaluation. The interactive app distinguishes live microphone mode from scenario replay. This is a narrow first step toward preserving responsibility across a care transition, using synthetic data throughout the demonstration.
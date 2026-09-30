# CareThread delivery assets

## Files for the entry

- `carethread-cover.png`: 1920 x 1080 project cover.
- `carethread-deck.pdf`: eight-slide presentation.
- `carethread-deck.pptx`: editable deck with source notes.
- `carethread-presentation.mp4`: 4:26 narrated synthetic scenario walkthrough, 1920 x 1080 H.264/AAC, 7.87 MB. This is a presentation video, not a live microphone recording.
- `carethread-narration.mp3`: the narration track.
- `submission-copy.md`: title, descriptions and suggested tags.
- `demo-script.md`: narration and presentation script.
- `carethread-submission-package.zip`: the upload assets and copy in one archive. Upload the PNG, PDF and MP4 individually to their corresponding form fields.

## Current completion boundary

The final suite passes **80 checks**: the **78 domain and API checks** shown in the deck and video, plus two voice lifecycle regressions covering late events after reset and a role switch during analysis; the production build also passes. The suite covers state rules, saved browser records, token access, planner validation and the analysis endpoint, including nested cases. These are software checks rather than 78 clinical or speech scenarios.

One generated spoken fixture passed the complete live speech-to-board path. AssemblyAI's managed Voice Agent transcribed the audio. A server-side AssemblyAI LLM Gateway planner proposed the structured update. Deterministic validation preserved the task, Dr Lee as owner, 3 p.m. timing, the stated review condition and pending uncertainty as an unreviewed pending item. AssemblyAI returned spoken audio asking for review. The test record is `docs/evaluation/synthetic-voice-result.json` in the repository. Three separate Gateway cases covered capture, confirmation and acknowledgment. A rapid request returned 429 before a spaced retry succeeded.

This confirms one synthetic fixture, not a browser microphone-device test or general speech reliability. Clinical benefit remains unvalidated. No performance benchmark is inferred from the single recorded timing.

The video labels its synthetic scenario and AI narration throughout. It must not be represented as a recording of a successful live AssemblyAI connection. Actual app screenshots or a live recording can replace the scenario frames when available, with their origin stated accurately.

Repository: https://github.com/ajegz/carethread . The app runs locally; a hosted demo has not yet been verified. Select only technology/category tags that exist in the form and reflect the deployed app. The current field copy passes the observed title/summary/long-description limits (42 / 238 / 1,730 characters, and 235 words in the long description).

## Verification

All eight presentation renders were visually inspected in the prior revision. Both changed slides were reviewed again after this update, including rendered PDF pages and decoded video frames. The PowerPoint finalizer reported zero findings and zero warnings. The final MP4 has H.264 video and AAC audio and meets the five-minute and 300 MB tutorial limits. The 266.282-second video has a non-silent narration signal, with a measured peak of -0.7 dB. This is technical media verification, not a claim that a person has listened to the entire narration.

## Source and rebuild

`source/submission-copy.json` and `source/narration.json` hold the editable copy. `source/build-deck.mjs` holds the presentation authoring source, using the bundled `@oai/artifact-tool` runtime. The validated deck has native editable text. `source/build-media.py` assembles the rendered slides into a PDF and renders local macOS Samantha narration plus a video with ffmpeg. `source/media-manifest.json` records actual durations after successful export.

This source uses the current machine's bundled runtime paths. The active deck builder runs from `.build/build-deck.mjs`, where `.build/node_modules` links to the bundled dependencies. Set `RUNTIME_NODE_MODULES` to that runtime's module directory when running the deck builder. All generated intermediate files stay inside `.build/`. Narration requires access to the local macOS speech service. `preview/` contains the eight 1920 x 1080 slide renders.

To update validation, edit `source/validation.json` with `status`, `headline`, a three-element `lines` array and an evidence note. Update slide 7 in `source/narration.json` and `demo-script.md` to match. Rebuild, render and visually inspect the changed slide before replacing the final PDF/video. Domain-test success does not establish live speech reliability or clinical benefit.

## Artwork provenance

The abstract background in `assets/thread-background.png` uses the built-in imagegen tool. It is conceptual artwork, not clinical evidence. The final cover combines this background with native presentation text.

Prompt: “Use case: productivity-visual. Asset: conceptual background for a 16:9 hackathon deck and cover about clinical handoffs. Create a restrained, elegant abstract editorial 3D still life: a single continuous lime-green thread passes through two translucent frosted glass loops, suggesting responsibility carried across a handoff. Deep dark teal background (#073A37), soft white reflections, accent lime (#D7FF78). Subject occupies only the rightmost 40 percent. Entire left 58 percent must be empty, near-solid dark teal for later editable typography. Wide 16:9 composition, 1920x1080 or similar. Soft studio illumination, sophisticated quiet healthcare technology aesthetic, generous negative space. No text, no letters, no numbers, no logo, no medical symbols, no people, no devices, no UI, no ECG traces. This is abstract artwork, not a clinical illustration.”

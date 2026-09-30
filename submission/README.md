# CareThread delivery assets

## Files for the entry

- `carethread-cover.png`: 1920 x 1080 project cover.
- `carethread-deck.pdf`: eight-slide presentation.
- `carethread-deck.pptx`: editable deck with source notes.
- `carethread-presentation.mp4`: 4:24 narrated synthetic scenario walkthrough, 1920 x 1080 H.264/AAC, 7.78 MB. This is a presentation video, not a live microphone recording.
- `carethread-narration.mp3`: the narration track.
- `submission-copy.md`: title, descriptions and suggested tags.
- `demo-script.md`: narration and presentation script.

## Current completion boundary

The deck reports 20 passing deterministic state-engine tests, as verified by the implementation lead. It also records that a voice session connected while the full voice flow is still under review. These checks do not establish clinical benefit or live speech reliability. The copy describes the intended completed prototype, so compare every feature claim with the final application before submitting.

The video labels its synthetic scenario and AI narration throughout. It must not be represented as a recording of a successful live AssemblyAI connection. Actual app screenshots or a live recording can replace the scenario frames when available, with their origin stated accurately.

The repository URL and hosted demo URL belong in the actual submission fields. Select only technology/category tags that exist in the form. The current field copy passes the observed title/summary/long-description limits (42 / 238 / 1,650 characters, and 225 words in the long description).

## Verification

All eight presentation renders and all eight PDF page renders were visually inspected. The PowerPoint finalizer reported zero findings and zero warnings. The final MP4 has both video and audio streams and meets the five-minute and 300 MB tutorial limits. A decoded video frame was inspected; the narration signal is non-silent, with a measured peak of -2.0 dB. This is technical media verification, not a claim that a person has listened to the entire narration.

## Source and rebuild

`source/submission-copy.json` and `source/narration.json` hold the editable copy. `source/build-deck.mjs` holds the presentation authoring source, using the bundled `@oai/artifact-tool` runtime. The validated deck has native editable text. `source/build-media.py` assembles the rendered slides into a PDF and renders local macOS Samantha narration plus a video with ffmpeg. `source/media-manifest.json` records actual durations after successful export.

This source uses the current machine's bundled runtime paths. The active deck builder runs from `.build/build-deck.mjs`, where `.build/node_modules` links to the bundled dependencies. All generated intermediate files stay inside `.build/`. Narration requires access to the local macOS speech service. `preview/` contains the eight 1920 x 1080 slide renders.

To update validation, create `source/validation.json` with `status`, `headline` and a three-element `lines` array. Keep lines brief enough for the existing layout. Rebuild, render and visually inspect the changed slide before replacing the final PDF/video. Domain-test success does not establish live speech reliability or clinical benefit.

## Artwork provenance

The abstract background in `assets/thread-background.png` uses the built-in imagegen tool. It is conceptual artwork, not clinical evidence. The final cover combines this background with native presentation text.

Prompt: “Use case: productivity-visual. Asset: conceptual background for a 16:9 hackathon deck and cover about clinical handoffs. Create a restrained, elegant abstract editorial 3D still life: a single continuous lime-green thread passes through two translucent frosted glass loops, suggesting responsibility carried across a handoff. Deep dark teal background (#073A37), soft white reflections, accent lime (#D7FF78). Subject occupies only the rightmost 40 percent. Entire left 58 percent must be empty, near-solid dark teal for later editable typography. Wide 16:9 composition, 1920x1080 or similar. Soft studio illumination, sophisticated quiet healthcare technology aesthetic, generous negative space. No text, no letters, no numbers, no logo, no medical symbols, no people, no devices, no UI, no ECG traces. This is abstract artwork, not a clinical illustration.”

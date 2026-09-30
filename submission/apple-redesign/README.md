# CareThread redesigned submission assets

The app is live at https://carethread-six.vercel.app. Final files are in `final/`:

Latest video revision: `carethread-context-hook-no-voiceover.mp4` — 48 seconds, 1080p/60fps, short main text, continuous animated motion, original 120 BPM music and synchronized sound effects. No narration. The edit kit includes a silent video and separate music/effects tracks for recording your own voiceover. See `video/DYNAMIC-EDIT.md`.

Original delivery:

- `carethread-poster.png`: 1920 × 1080 poster.
- `carethread-redesigned.pptx`: eight slides with editable text and speaker notes.
- `carethread-redesigned.pdf`: matching presentation PDF.
- `carethread-film.mp4`: 72 seconds, 1920 × 1080, 30 fps, H.264/AAC stereo.

The interface uses silver and white surfaces, restrained blue controls, readable opaque content, and translucent navigation. Apple design references informed the style; this remains a browser application with no claimed Apple integration.

## Media provenance

All new interface illustrations, motion, poster and music were authored in code. The film follows the supplied reference rhythm: communication gap, product reveal, interface demonstration, implementation and closing message. React/Remotion rendered the MP4 locally; there was no paid cloud rendering. The procedural score uses original synthesized pads, arpeggios, bass and percussion. Narration uses the locally installed macOS Samantha voice. No reference footage, reference soundtrack or third-party stock assets were copied.

The film and product slide are labeled code-rendered synthetic illustrations. They represent verified application states, not a screen recording. Chrome controls and DOM checks worked, but screenshot capture timed out. The guided scenario is scripted; the live pipeline is separately supported by one synthetic audio integration fixture. Clinical efficacy and browser microphone-device behavior remain unvalidated.

## Reproduce

In `video/`, run `npm ci`, then `node render.mjs` for local Remotion rendering. Run `python3 make-audio.py` with NumPy installed on macOS for local narration and the original score. The speech service must be accessible; empty narration causes an error. Run `node render.mjs --stills` for poster and interface previews only. Combine the silent MP4 and WAV with FFmpeg, copying video and encoding AAC audio at 192 kbps.

`content.json` and `design.json` hold the presentation content and design. `build-deck.mjs --build` uses the Codex bundled Artifact Tool and writes dated output and validation receipts. `build-pdf.py` assembles reviewed slide renders. Presentation copy remains editable; the interface illustration is a raster image. The poster is editable through its React source.

## Validation

Production build passed; 80 domain/API/lifecycle tests passed. Public deployment returned HTTP 200; unauthenticated live-token requests remained blocked. Browser checks verified sender clarification and receiver acknowledgment without completing pending work. Desktop 1440 px and mobile 390 px layouts had no horizontal overflow. All eight presentation renders and PDF pages were visually inspected; package/layout/import validation passed. Video preview scenes and encoded contact sheet were inspected; final export has 72-second video and stereo audio, with peak audio at −3.0 dB.

The latest context-focused revision opens with a nurse shift change and an unfinished scan result. `final/carethread-voiceover-script.txt` contains the complete timed creator script. The AHRQ statistic is cited on screen, with the full source link in the script and motion edit notes.

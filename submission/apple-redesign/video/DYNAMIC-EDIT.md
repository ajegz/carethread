# CareThread dynamic edit — no voiceover

48 seconds · 1920 × 1080 · 60 fps · original 120 BPM music · 19 sound-effect cue groups · no narration.

## Timeline

| Time | Main text / scene |
|---|---|
| 00–04 | One word changes the handoff. |
| 04–08 | Keep responsibility in the conversation. |
| 08–12 | Speak naturally. |
| 12–16 | Capture unfinished work. |
| 16–20 | Catch a changed readback. |
| 20–24 | Fill the gaps. Keep the context. |
| 24–28 | Acknowledged. Still pending. |
| 28–32 | Every detail has a source. |
| 32–36 | Speech. Planning. Validation. |
| 36–40 | Built. Tested. Ready to try. |
| 40–44 | Practice better handoffs. Keep the next step clear. |
| 44–48 | CareThread closing and app URL. |

All animation is driven by frame numbers: spring entrances, staggered words, camera perspective and drift, waveform movement, cursor paths, UI state changes, source connector drawing, counters, background movement and progress. Transitions use short directional blur/zoom exits and entrances. No recorded webpage, third-party video, sampled music, or voiceover is included.

## Rebuild locally

From this directory, install the locked packages with `npm ci`. Render with `node render-dynamic.mjs`. Preview only with `node render-dynamic.mjs --stills`. Run `python3 make-dynamic-audio.py` in an environment with NumPy for the original instrumental and sound effects. Mux `out/dynamic/carethread-dynamic-silent.mp4` with `out/dynamic/music-and-sfx.wav` using FFmpeg (copy H.264 video; AAC 256 kbps audio; +faststart).

## Add your voiceover

The edit kit provides the silent video and separate music-only and sound-effects-only WAV tracks. Place all three at 00:00. Record your voiceover against the timeline above, then lower the music and effects to suit your recording. Both audio tracks are stereo, 48 kHz, 16-bit PCM. Keep all media at the original speed to preserve synchronization.

The app states shown are synthetic interface illustrations; the film is not a live product recording or clinical validation.

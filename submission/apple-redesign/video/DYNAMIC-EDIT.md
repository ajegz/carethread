# CareThread dynamic edit — no voiceover

48 seconds · 1920 × 1080 · 60 fps · original 120 BPM music · 19 sound-effect cue groups · no narration.

## Timeline

| Time | Main text / scene |
|---|---|
| 00–04 | Nearly one in three medical errors and adverse events… |
| 04–08 | …is linked to communication and coordination gaps during care transitions. |
| 08–12 | Your nurse’s shift ends; the scan result has not arrived. Who follows up? |
| 12–16 | Meet CareThread. What needs doing? Who will do it? |
| 16–20 | Did the next nurse hear it correctly? |
| 20–24 | Name the person. Set the time. |
| 24–28 | Acknowledged. Still pending. |
| 28–32 | See exactly what was said. |
| 32–36 | Speech. Planning. Validation. |
| 36–40 | Built. Tested. Ready to try. |
| 40–44 | Practice clearer shift changes. Keep the next step clear. |
| 44–48 | CareThread closing and app URL. |

All animation is driven by frame numbers: spring entrances, staggered words, camera perspective and drift, waveform movement, cursor paths, UI state changes, source connector drawing, counters, background movement and progress. Transitions use short directional blur/zoom exits and entrances. No recorded webpage, third-party video, sampled music, or voiceover is included.

## Rebuild locally

From this directory, install the locked packages with `npm ci`. Render with `node render-dynamic.mjs`. Preview only with `node render-dynamic.mjs --stills`. Run `python3 make-dynamic-audio.py` in an environment with NumPy for the original instrumental and sound effects. Mux `out/dynamic/carethread-dynamic-silent.mp4` with `out/dynamic/music-and-sfx.wav` using FFmpeg (copy H.264 video; AAC 256 kbps audio; +faststart).

## Add your voiceover

The edit kit provides the silent video and separate music-only and sound-effects-only WAV tracks. Place all three at 00:00. Record your voiceover against the timeline above, then lower the music and effects to suit your recording. Both audio tracks are stereo, 48 kHz, 16-bit PCM. Keep all media at the original speed to preserve synchronization.

The app states shown are synthetic interface illustrations; the film is not a live product recording or clinical validation.


## Revised creator voiceover

**00–08 seconds:** Nearly one in three medical errors and adverse events is linked to communication and coordination gaps during care transitions.

**08–12 seconds:** Your nurse’s shift ends. Who follows up on that missing result?

**12–16 seconds:** Meet CareThread. AssemblyAI turns spoken handoffs into a shared plan.

**16–20 seconds:** A result still pending gets repeated as normal. Pause.

**20–24 seconds:** Clarify: Doctor Lee reviews the result by three p.m.

**24–28 seconds:** The next nurse acknowledges the plan. The work stays pending.

**28–32 seconds:** Need to check a detail? Go back to its source.

**32–36 seconds:** AI suggests updates. Application rules check them before saving.

**36–40 seconds:** Eighty automated checks passed, plus one synthetic voice test.

**40–44 seconds:** A practice tool for clearer conversations when clinical teams change.

**44–48 seconds:** CareThread. Know what’s unfinished. Know who’s following up.

The 00–08 second statistic is from [AHRQ’s 2023 research spotlight](https://digital.ahrq.gov/program-overview/research-stories/improving-safety-postoperative-handoff-communication-telemedicine). It motivates the problem and does not establish CareThread efficacy.

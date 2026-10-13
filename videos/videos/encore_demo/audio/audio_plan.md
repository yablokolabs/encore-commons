# Audio Plan

## Plan

VO-only track. One narration cue, the whole file, placed at 0s, loudness-normalised
to broadcast speech level. The narration carries the whole demo; there is no music
and no sound effects, so nothing competes with the figures being read out.

### Cue 1 — narration (full file, 0s)

```
SOURCE:      audio/originals/voiceovers/alice-uk-v1/audio.mp3
PROVIDER:    elevenlabs (eleven_multilingual_v2)
VOICE:       Alice - Clear, Engaging Educator (premade, British, female)
PLACEMENT:   0s, full file, no trim
VOLUME:      0 dB, loudnorm to -16 LUFS integrated, true peak -1.5 dB
FADES:       none
```

ffmpeg snippet:

```
[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[v0]
```

### Final mix command

```bash
ffmpeg -y \
  -i audio/originals/voiceovers/alice-uk-v1/audio.mp3 \
  -filter_complex "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[v0]" \
  -map "[v0]" -c:a libmp3lame -q:a 2 \
  audio/tracks/v1/track.mp3
```

## Log

### 2026-10-13 — VO-only plan created

Single narration cue, no music, no sound effects. The take measures 115.9 s across
270 words, inside the 90–120 s window for the walkthrough.

Voice selection note: the brief asked for a youthful adult British female voice. No
British female voice available to this account carries a young age label; the
account's British female premades are Alice and Lily, both labelled `middle_aged`,
and the British female young voices are ElevenLabs library voices, which the free
tier refuses through the API with HTTP 402 `paid_plan_required`. Voice design and
cloning are paid-plan features. No additional spend was authorised, so the closest
permitted British female voice was chosen by audition: both candidates were
synthesised, both returned HTTP 200, and Alice was picked for its clear,
explainer-appropriate delivery. The refusal, both auditions and the full voice
settings are recorded in
`audio/originals/voiceovers/alice-uk-v1/audio_meta.json`.

### 2026-10-13 — the first take was over the cap

Take 1 ran 124.4 s against the 120 s limit. Prose the screen already carries was cut
rather than claims: the closing clause of scene 3 (its 100% coverage figure is drawn
in the scene's own stat row), one clause in scene 2, and two word-level tightenings
in scenes 5 and 7. Take 2 is the delivered take at 115.9 s, 1,571 billed characters.
Because the scenes' advance times are derived from the take's alignment, re-recording
re-timed every scene in one command; nothing was hand-adjusted.

# Native Frontend scene audio

Declare `frontend-audio@1` in the Experience features when using the fixed `host.media` audio targets. The Package receives typed receipts and exact asset references, never media elements, URLs or WebAudio.

| Fixed method | Purpose |
| --- | --- |
| `audioStatus` | Read unlock, mute, group gains, playback state and bounded failure reason |
| `enableAudio` | Enable playback after a trusted pointer or keyboard gesture |
| `setAudioPreferences` | Set `muted`, `ambience` and `effects` gains (0–1); persist through existing presentation preferences |
| `setAudioScene` | Set up to three exact ambient references and up to eight submitted event references, with gains and a 0–2000 ms transition |
| `stopAudio` | Release current voices |

The host permits at most six ambient voices during transitions and two effects. An effect needs a successful current Authority Transaction receipt from this live bridge; reads, presentation tasks, history and SavePoint restoration cannot arm old sounds. Event identities are consumed once per presentation epoch. Recovery reconstructs current ambience; it does not restore recording positions or replay past effects. Hidden pages pause sound and clear pending effects; disposal releases all voices.

Playback refusal and missing/undecodable assets return explicit presentation status. Essential story information must remain readable with sound disabled. Exact image load failures likewise preserve surrounding text and controls instead of retaining a stale picture from another location.

Computation effects can explicitly copy already validated JSON with `{ "computed": "field.path" }`. The selected type must exactly match its destination schema. This does not allow formulas to copy whole private records, and receipt projections retain their existing disclosure boundary.

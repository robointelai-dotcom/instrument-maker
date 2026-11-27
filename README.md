# Instrument Maker

A mobile web app that makes an SFZ instrument from a few recorded notes.
Play some notes, and it finds each one, removes steady room noise, fills in
every key in between, and gives a ZIP with the samples and SFZ files.

Everything runs in the browser. Nothing is uploaded.

## Use it

`index.html` is the whole app in one file.

- **On your own domain (recommended):** put `index.html` on any `https` host.
  With Cloudflare Pages: create a project from this repository, no build
  command, output directory `/`. Microphone recording and guided recording
  need `https`.
- **Opened as a local file:** the microphone buttons do not work (browsers
  allow the microphone only on `https`). "Use the phone recorder" and
  "Choose a recording or video" still work.

## What it does

1. **Record** in one of four ways:
   - A demo of guided recording that needs no microphone.
   - Guided recording: learns the room for 3 seconds, shows which note to
     play, starts and stops by itself, and checks the key was the right one.
     Plans: any notes; piano 5 / 15 / 30 notes; app instrument, violin or
     flute 5 notes; violin range 12; high instrument 13; low instrument 10.
   - Free recording with the microphone.
   - The phone's own recorder.
   - An existing audio file or a screen-recording video (for sampling an app
     on the same device).
2. **Check**: a strip of keys shows which are real recordings and which are
   filled in from the nearest one. Tap a key to hear it.
3. **Download**: `<name>.zip` containing `samples/*.wav` (24-bit mono) and
   five SFZ files: Natural, Warm, Bright, Soft, Vibrato (the player
   adds the vibrato, so it is the same speed on every key).

## Limits

- One note at a time. Chords and overlapping notes cannot be separated.
- Steady noise (fan, AC, hum, hiss) is removed. Sudden sounds are not.
- A key more than 3 to 4 keys from a recording sounds less natural.
- Notes are not looped: a held note lasts as long as it was played.

## Tested and not tested

Tested with generated notes and a simulated microphone: note finding, pitch
from A0 to C8, noise removal (about 28 dB less noise, note unchanged),
velocity layers and round-robins, SFZ and ZIP output, guided recording
including a wrong key and a skipped capture, reading a video file.

Not yet tested: a real phone, a real room, a real instrument, and the SFZ
files loaded in sfizz.

## Files

| Path | What it is |
|---|---|
| `index.html` | The built app. This is the file to host |
| `src/page.html` | The page: layout, styles and screen logic |
| `src/core.js` | The sound work: notes, pitch, noise, SFZ, WAV, ZIP |
| `build.py` | Puts `core.js` inside `page.html` to make `index.html` |
| `tests/` | Node tests for `core.js` (`node tests/<file>`) |

After changing anything in `src/`, run `python build.py`.

## Sounds you sample

An instrument made here is yours when you recorded an instrument you own or
may record. Samples taken from another company's app or sound library stay
under that company's licence: keep them for your own use, and do not share,
sell or bundle them.

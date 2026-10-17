# Twinline

Two drum machines. One booth.

Amber and Lacquer share a clock, a crossfader, and a 16-step mix track. Each deck plays kick, snare, hat, and perc through Sample, FM, Physical, or Granular. The mix track records channel faders, EQ, filters, and the crossfade, and it only drives the mixer while Use track is on.

## Run

```bash
npm install
npm run dev
```

Press play to arm the audio. Patterns and mix locks stay in the browser. Wizard writes both machines from a sentence, then shows the score before it replaces the booth. Undo restores the last clear, randomize, copy, or wizard load on that deck. Save and Load move the booth as JSON. Bounce writes four bars to a WAV. Copy sends one machine's pattern, engines, and patches to the other.

## Audio engine

The rack is one Web Audio graph in `src/lib/audio/engine.ts`. Pressing Play builds it. Hits are scheduled about 120 ms ahead of the audio clock so a 16th note does not slip. Odd steps can lag by up to half a step of that deck's swing. The lit pad follows the same queue, a few milliseconds early, so the grid and the sound stay together.

Every hit enters that deck's channel. The channel is a low shelf at 120 Hz, a mid peak at 1.1 kHz, a high shelf at 6.2 kHz, a DJ filter, a fader, then an equal-power crossfade into the main fader and a compressor. Fader and main gains are squared, so a reading of 50 is a quarter of full level. The DJ filter is a lowpass from 160 Hz up to open below center, and a highpass from 40 Hz upward above center. The middle of the knob leaves the filter open.

Each voice picks its own engine. A sample kick can sit next to FM hats on the same deck. The patch for that engine stays with the voice.

**Sample.** Each voice is a one-shot buffer rendered at load. Pitch sets playback rate across two octaves around that voice's center. Decay is the amplitude envelope. Tone is a lowpass from about 200 Hz to 14 kHz. Start trims into the buffer. Punch drives a soft clipper before the filter.

**FM.** Two sine operators. The modulator's frequency is the carrier times the ratio, and its depth falls faster than the carrier. Kick and perc pitch-drop into the note. Snare and hat can add a highpassed noise burst into the same amp. Hats leave through a highpass. The other voices leave through a lowpass.

**Physical.** The voice picks the instrument. Kick is five membrane modes at drum-head ratios, plus a short noise click, each mode pitched down over the first few dozen milliseconds. Snare is a Karplus-Strong loop with a bandpassed noise snare wire. Hat is noise through nine inharmonic bandpasses. Perc is the same waveguide as the snare, without the wires. Size lengthens the ring and drops the tuning slightly.

**Granular.** The hit is a short cloud of grains read from that voice's texture. Density sets 4 to 12 grains. Size and density set how long the cloud lasts. Position chooses where in the buffer the grains start. Spray jitters timing, position, and pitch. Grain level is divided by the square root of the count so a denser cloud does not jump in loudness.

Voice knobs are stored as six numbers (`a` through `e`, plus level). `src/lib/audio/model.ts` maps those numbers onto the ranges above. Level is squared again inside the voice, separate from the channel fader. Tapping a voice name previews the current engine and patch without waiting for the sequencer.

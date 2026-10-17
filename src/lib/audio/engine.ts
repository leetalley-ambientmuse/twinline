import {
  VOICES,
  modelFm,
  modelGrain,
  modelPhysical,
  modelSample,
  type DeckId,
  type EngineId,
  type Patch,
  type VoiceId,
} from "@/lib/audio/model";
import { renderNoise, renderTexture, renderVoice } from "@/lib/audio/samples";

export type RackSnapshot = {
  bpm: number;
  master: number;
  crossfade: number;
  decks: Record<
    DeckId,
    {
      engine: EngineId;
      swing: number;
      volume: number;
      eqLow: number;
      eqMid: number;
      eqHigh: number;
      filter: number;
      mute: Record<VoiceId, boolean>;
      steps: Record<VoiceId, boolean[]>;
      patches: Record<EngineId, Record<VoiceId, Patch>>;
    }
  >;
};

type Channel = {
  input: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  filter: BiquadFilterNode;
  fader: GainNode;
  xf: GainNode;
};

const DECKS: DeckId[] = ["a", "b"];

export class Rack {
  readonly ctx: AudioContext;
  private readonly getState: () => RackSnapshot;
  private readonly onStep: (step: number) => void;
  private readonly channels: Record<DeckId, Channel>;
  private readonly master: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly timeBuf: Uint8Array<ArrayBuffer>;
  private readonly curve: Float32Array<ArrayBuffer>;
  private readonly samples: Record<VoiceId, AudioBuffer>;
  private readonly textures: Record<VoiceId, AudioBuffer>;
  private readonly noise: AudioBuffer;
  private timer: number | null = null;
  private raf = 0;
  private nextNoteTime = 0;
  private stepIndex = 0;
  private queue: { step: number; time: number }[] = [];
  private visualStep = -1;
  private running = false;

  constructor(ctx: AudioContext, getState: () => RackSnapshot, onStep: (step: number) => void) {
    this.ctx = ctx;
    this.getState = getState;
    this.onStep = onStep;
    const curveBuffer = new ArrayBuffer(512 * 4);
    this.curve = new Float32Array(curveBuffer);
    for (let i = 0; i < this.curve.length; i++) {
      const x = (i / (this.curve.length - 1)) * 2 - 1;
      this.curve[i] = Math.tanh(x * 1.7);
    }

    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.75;
    this.timeBuf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    const sr = ctx.sampleRate;
    this.noise = toBuffer(ctx, renderNoise(sr, 1.2));
    this.samples = {
      kick: toBuffer(ctx, renderVoice("kick", sr)),
      snare: toBuffer(ctx, renderVoice("snare", sr)),
      hat: toBuffer(ctx, renderVoice("hat", sr)),
      perc: toBuffer(ctx, renderVoice("perc", sr)),
    };
    this.textures = {
      kick: toBuffer(ctx, renderTexture("kick", sr)),
      snare: toBuffer(ctx, renderTexture("snare", sr)),
      hat: toBuffer(ctx, renderTexture("hat", sr)),
      perc: toBuffer(ctx, renderTexture("perc", sr)),
    };

    this.channels = { a: this.makeChannel(), b: this.makeChannel() };
    this.sync();
  }

  private makeChannel(): Channel {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 120;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1100;
    mid.Q.value = 0.85;
    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 6200;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 18000;
    filter.Q.value = 0.7;
    const fader = ctx.createGain();
    const xf = ctx.createGain();
    input.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(filter);
    filter.connect(fader);
    fader.connect(xf);
    xf.connect(this.master);
    return { input, low, mid, high, filter, fader, xf };
  }

  sync(): void {
    const state = this.getState();
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(state.master * state.master, now, 0.03);
    const x = state.crossfade;
    this.channels.a.xf.gain.setTargetAtTime(Math.cos(x * Math.PI * 0.5), now, 0.02);
    this.channels.b.xf.gain.setTargetAtTime(Math.sin(x * Math.PI * 0.5), now, 0.02);
    for (const id of DECKS) {
      const deck = state.decks[id];
      const ch = this.channels[id];
      ch.fader.gain.setTargetAtTime(deck.volume * deck.volume, now, 0.02);
      ch.low.gain.setTargetAtTime((deck.eqLow - 0.5) * 24, now, 0.03);
      ch.mid.gain.setTargetAtTime((deck.eqMid - 0.5) * 18, now, 0.03);
      ch.high.gain.setTargetAtTime((deck.eqHigh - 0.5) * 24, now, 0.03);
      applyDjFilter(ch.filter, deck.filter, now);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stepIndex = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.queue = [];
    this.scheduler();
    this.raf = requestAnimationFrame(this.pumpVisual);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.queue = [];
    this.visualStep = -1;
    this.onStep(-1);
  }

  preview(deck: DeckId, voice: VoiceId): void {
    const state = this.getState();
    const d = state.decks[deck];
    const patch = d.patches[d.engine][voice];
    this.trigger(deck, d.engine, voice, patch, this.ctx.currentTime + 0.02);
  }

  readLevel(): number {
    this.analyser.getByteTimeDomainData(this.timeBuf);
    let sum = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = (this.timeBuf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.timeBuf.length) * 3.4);
  }

  private scheduler = (): void => {
    if (!this.running) return;
    const ahead = this.ctx.currentTime + 0.12;
    if (this.nextNoteTime < this.ctx.currentTime - 0.08) {
      this.nextNoteTime = this.ctx.currentTime + 0.02;
    }
    while (this.nextNoteTime < ahead) {
      this.scheduleStep(this.stepIndex, this.nextNoteTime);
      const bpm = Math.min(180, Math.max(70, this.getState().bpm));
      this.nextNoteTime += 60 / bpm / 4;
      this.stepIndex = (this.stepIndex + 1) % 16;
    }
    this.timer = window.setTimeout(this.scheduler, 25);
  };

  private pumpVisual = (): void => {
    this.raf = requestAnimationFrame(this.pumpVisual);
    const t = this.ctx.currentTime + 0.012;
    let s = this.visualStep;
    while (this.queue.length && this.queue[0].time <= t) {
      s = this.queue.shift()!.step;
    }
    if (s !== this.visualStep) {
      this.visualStep = s;
      this.onStep(s);
    }
  };

  private scheduleStep(step: number, time: number): void {
    const state = this.getState();
    const stepDur = 60 / Math.min(180, Math.max(70, state.bpm)) / 4;
    for (const id of DECKS) {
      const deck = state.decks[id];
      const swung = time + (step % 2 === 1 ? deck.swing * stepDur * 0.5 : 0);
      for (const voice of VOICES) {
        if (!deck.steps[voice][step] || deck.mute[voice]) continue;
        const patch = deck.patches[deck.engine][voice];
        this.trigger(id, deck.engine, voice, patch, swung);
      }
    }
    this.queue.push({ step, time });
  }

  private trigger(
    deck: DeckId,
    engine: EngineId,
    voice: VoiceId,
    patch: Patch,
    time: number,
  ): void {
    const dest = this.channels[deck].input;
    if (engine === "sample") this.triggerSample(dest, voice, patch, time);
    else if (engine === "fm") this.triggerFm(dest, voice, patch, time);
    else if (engine === "physical") this.triggerPhysical(dest, voice, patch, time);
    else this.triggerGrain(dest, voice, patch, time);
  }

  private triggerSample(dest: AudioNode, voice: VoiceId, patch: Patch, time: number): void {
    const m = modelSample(voice, patch);
    const ctx = this.ctx;
    const buf = this.samples[voice];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const rate = m.rate * (1 + (Math.random() - 0.5) * 0.012);
    src.playbackRate.setValueAtTime(Math.max(0.25, rate), time);
    const offset = Math.min(m.offset * buf.duration, Math.max(0, buf.duration - 0.02));
    const pre = ctx.createGain();
    pre.gain.setValueAtTime(m.drive, time);
    const shaper = this.shaper();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(m.cutoff, time);
    filter.Q.value = 0.65;
    const amp = ctx.createGain();
    envGain(ctx, amp.gain, m.gain, time, 0.003, m.decay);
    src.connect(pre);
    pre.connect(shaper);
    shaper.connect(filter);
    filter.connect(amp);
    amp.connect(dest);
    const stop = time + m.decay + 0.05;
    src.start(time, offset);
    src.stop(stop);
    this.drop([src, pre, shaper, filter, amp], stop);
  }

  private triggerFm(dest: AudioNode, voice: VoiceId, patch: Patch, time: number): void {
    const m = modelFm(voice, patch);
    const ctx = this.ctx;
    const t = Math.max(time, ctx.currentTime);
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    carrier.type = "sine";
    mod.type = "sine";
    const freq = Math.max(20, m.freq);
    if (m.glide > 1.05) {
      carrier.frequency.setValueAtTime(freq * m.glide, t);
      carrier.frequency.exponentialRampToValueAtTime(freq, t + 0.055);
    } else {
      carrier.frequency.setValueAtTime(freq, t);
    }
    mod.frequency.setValueAtTime(Math.max(1, freq * m.ratio), t);
    const modGain = ctx.createGain();
    const depth = Math.max(0.0001, m.index * freq);
    modGain.gain.setValueAtTime(depth, t);
    modGain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, m.modDecay));
    const filter = ctx.createBiquadFilter();
    filter.type = voice === "hat" ? "highpass" : "lowpass";
    filter.frequency.setValueAtTime(voice === "hat" ? 1800 : voice === "kick" ? 4200 : 7000, t);
    const amp = ctx.createGain();
    envGain(ctx, amp.gain, m.gain, t, 0.003, m.decay);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(filter);
    filter.connect(amp);
    const nodes: AudioNode[] = [mod, carrier, modGain, filter, amp];
    const sources: AudioBufferSourceNode[] = [];
    if (m.noise > 0.015) {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      n.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = m.noiseHp;
      const ng = ctx.createGain();
      envGain(ctx, ng.gain, m.gain * m.noise, t, 0.002, Math.min(m.decay, voice === "hat" ? 0.08 : 0.2));
      n.connect(hp);
      hp.connect(ng);
      ng.connect(amp);
      n.start(t);
      n.stop(t + m.decay + 0.05);
      nodes.push(hp, ng);
      sources.push(n);
    }
    amp.connect(dest);
    carrier.start(t);
    mod.start(t);
    const stop = t + m.decay + 0.08;
    carrier.stop(stop);
    mod.stop(stop);
    this.drop(nodes, stop, sources);
  }

  private triggerPhysical(dest: AudioNode, voice: VoiceId, patch: Patch, time: number): void {
    const m = modelPhysical(voice, patch);
    if (m.kind === "membrane") this.membrane(dest, m.freq, m.decay, m.brightness, m.strike, m.gain, time);
    else if (m.kind === "cymbal") this.cymbal(dest, m.freq, m.decay, m.brightness, m.strike, m.gain, time);
    else this.karplus(dest, m.kind === "snare", m.freq, m.decay, m.brightness, m.strike, m.gain, time);
  }

  private membrane(
    dest: AudioNode,
    f0: number,
    decay: number,
    bright: number,
    strike: number,
    level: number,
    time: number,
  ): void {
    const ctx = this.ctx;
    const t = Math.max(time, ctx.currentTime);
    const ratios = [1, 1.594, 2.135, 2.295, 2.917];
    const amps = [1, 0.48, 0.26, 0.16, 0.08];
    const sum = ctx.createGain();
    sum.gain.value = 0.9;
    const nodes: AudioNode[] = [sum];
    const oscs: OscillatorNode[] = [];
    ratios.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const g = ctx.createGain();
      const f = Math.max(22, f0 * ratio);
      const startF = f * (1 + strike * (i === 0 ? 2.4 : 0.4));
      osc.frequency.setValueAtTime(startF, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.04 + strike * 0.02);
      const modeDecay = Math.max(0.05, decay * (1 - i * 0.14));
      const peak = level * amps[i] * (i === 0 ? 1 : 0.45 + bright * 0.7);
      envGain(ctx, g.gain, peak, t, 0.003, modeDecay);
      osc.connect(g);
      g.connect(sum);
      osc.start(t);
      osc.stop(t + modeDecay + 0.06);
      oscs.push(osc);
      nodes.push(g);
    });
    const click = ctx.createBufferSource();
    click.buffer = this.noise;
    const cg = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 700 + bright * 1800;
    envGain(ctx, cg.gain, level * strike * 0.4, t, 0.001, 0.018);
    click.connect(hp);
    hp.connect(cg);
    cg.connect(sum);
    click.start(t);
    click.stop(t + 0.04);
    nodes.push(hp, cg);
    sum.connect(dest);
    this.drop(nodes, t + decay + 0.1, [click], oscs);
  }

  private karplus(
    dest: AudioNode,
    snare: boolean,
    freq: number,
    decay: number,
    bright: number,
    strike: number,
    level: number,
    time: number,
  ): void {
    const ctx = this.ctx;
    const t = Math.max(time, ctx.currentTime);
    const delay = ctx.createDelay(0.05);
    const dt = 1 / Math.max(40, freq);
    delay.delayTime.setValueAtTime(Math.min(0.045, dt), t);
    const feedback = ctx.createGain();
    const fb = Math.exp((Math.log(0.001) * dt) / Math.max(0.05, decay));
    feedback.gain.setValueAtTime(Math.min(0.985, Math.max(0.82, fb)), t);
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.setValueAtTime(500 + bright * 7800, t);
    const burst = ctx.createBufferSource();
    burst.buffer = this.noise;
    const bg = ctx.createGain();
    envGain(ctx, bg.gain, level * (0.7 + strike * 0.5), t, 0.001, 0.02);
    const out = ctx.createGain();
    envGain(ctx, out.gain, 0.85, t, 0.002, decay);
    burst.connect(bg);
    bg.connect(delay);
    bg.connect(out);
    delay.connect(lpf);
    lpf.connect(feedback);
    feedback.connect(delay);
    lpf.connect(out);
    const nodes: AudioNode[] = [delay, feedback, lpf, bg, out];
    const sources: AudioBufferSourceNode[] = [burst];
    if (snare) {
      const wires = ctx.createBufferSource();
      wires.buffer = this.noise;
      wires.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1400 + bright * 2800;
      bp.Q.value = 0.7;
      const wg = ctx.createGain();
      envGain(ctx, wg.gain, level * (0.35 + strike * 0.55), t, 0.002, decay * 0.7);
      wires.connect(bp);
      bp.connect(wg);
      wg.connect(out);
      wires.start(t);
      wires.stop(t + decay + 0.05);
      nodes.push(bp, wg);
      sources.push(wires);
    }
    out.connect(dest);
    burst.start(t);
    burst.stop(t + 0.05);
    const stop = t + decay + 0.08;
    feedback.gain.setTargetAtTime(0.0001, stop - 0.03, 0.01);
    this.drop(nodes, stop, sources);
  }

  private cymbal(
    dest: AudioNode,
    base: number,
    decay: number,
    bright: number,
    strike: number,
    level: number,
    time: number,
  ): void {
    const ctx = this.ctx;
    const t = Math.max(time, ctx.currentTime);
    const partials = [1, 1.37, 1.58, 1.93, 2.51, 3.08, 3.72, 4.55, 5.4];
    const bus = ctx.createGain();
    const noise = ctx.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const ng = ctx.createGain();
    envGain(ctx, ng.gain, level * (0.35 + strike * 0.4), t, 0.001, decay);
    noise.connect(ng);
    const nodes: AudioNode[] = [bus, ng];
    partials.forEach((ratio, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = Math.min(this.ctx.sampleRate * 0.45, base * ratio);
      bp.Q.value = 4 + bright * 16;
      const g = ctx.createGain();
      g.gain.value = (0.22 + bright * 0.15) / Math.sqrt(partials.length);
      ng.connect(bp);
      bp.connect(g);
      g.connect(bus);
      nodes.push(bp, g);
    });
    bus.connect(dest);
    noise.start(t);
    noise.stop(t + decay + 0.04);
    this.drop(nodes, t + decay + 0.08, [noise]);
  }

  private triggerGrain(dest: AudioNode, voice: VoiceId, patch: Patch, time: number): void {
    const m = modelGrain(voice, patch);
    const ctx = this.ctx;
    const buf = this.textures[voice];
    const t = Math.max(time, ctx.currentTime);
    const nodes: AudioNode[] = [];
    const sources: AudioBufferSourceNode[] = [];
    const peak = m.gain / Math.sqrt(m.count);
    for (let i = 0; i < m.count; i++) {
      const spread = m.count <= 1 ? 0 : i / (m.count - 1);
      const jitter = (Math.random() - 0.5) * m.spray * m.cloud * 0.85;
      const when = t + Math.max(0, spread * m.cloud + jitter);
      const posJitter = (Math.random() - 0.5) * m.spray * 0.45;
      const gdur = m.grain * (0.85 + Math.random() * 0.3);
      const rate = Math.max(0.25, m.rate * (1 + (Math.random() - 0.5) * m.spray * 0.18));
      const read = gdur * rate;
      const maxOffset = Math.max(0, buf.duration - read - 0.005);
      const offset = Math.min(maxOffset, Math.max(0, (m.position + posJitter) * maxOffset));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.setValueAtTime(rate, when);
      const g = ctx.createGain();
      const attack = Math.max(0.003, gdur * 0.28);
      const hold = Math.max(attack + 0.004, gdur);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(peak, when + attack);
      g.gain.linearRampToValueAtTime(0.0001, when + hold);
      src.connect(g);
      g.connect(dest);
      src.start(when, offset, read);
      src.stop(when + hold + 0.02);
      nodes.push(g);
      sources.push(src);
    }
    const end = t + m.cloud + m.grain + 0.08;
    this.drop(nodes, end, sources);
  }

  private shaper(): WaveShaperNode {
    const s = this.ctx.createWaveShaper();
    s.curve = this.curve;
    s.oversample = "2x";
    return s;
  }

  private drop(
    nodes: AudioNode[],
    when: number,
    sources: AudioScheduledSourceNode[] = [],
    oscs: OscillatorNode[] = [],
  ): void {
    const ms = Math.max(40, (when - this.ctx.currentTime + 0.06) * 1000);
    window.setTimeout(() => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* already gone */
        }
      }
      for (const s of [...sources, ...oscs]) {
        try {
          s.disconnect();
        } catch {
          /* already gone */
        }
      }
    }, ms);
  }
}

function toBuffer(ctx: AudioContext, data: Float32Array): AudioBuffer {
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  return buffer;
}

function envGain(
  ctx: AudioContext,
  param: AudioParam,
  peak: number,
  time: number,
  attack: number,
  decay: number,
): void {
  const t = Math.max(time, ctx.currentTime);
  const a = Math.max(0.0015, attack);
  const d = Math.max(0.02, decay);
  const p = Math.max(0.001, peak);
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(p, t + a);
  param.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function applyDjFilter(filter: BiquadFilterNode, knob: number, now: number): void {
  if (knob < 0.46) {
    const t = knob / 0.46;
    filter.type = "lowpass";
    filter.Q.setTargetAtTime(0.75, now, 0.02);
    filter.frequency.setTargetAtTime(160 * Math.pow(18000 / 160, t), now, 0.02);
    return;
  }
  if (knob > 0.54) {
    const t = (knob - 0.54) / 0.46;
    filter.type = "highpass";
    filter.Q.setTargetAtTime(0.7, now, 0.02);
    filter.frequency.setTargetAtTime(40 * Math.pow(5000 / 40, t), now, 0.02);
    return;
  }
  filter.type = "lowpass";
  filter.frequency.setTargetAtTime(18000, now, 0.02);
  filter.Q.setTargetAtTime(0.7, now, 0.02);
}

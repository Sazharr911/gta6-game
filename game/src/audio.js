// audio.js — every sound in PALMSHADE HEAT is synthesized in WebAudio.
//
// There are no audio files. A tiny synth builds the radio's pad chords from
// the station table in config.js, an engine hum whose pitch follows the
// speedometer, a two-tone siren that fades with police distance, and the
// one-shot effects: gunfire, punches, impacts, pickups, cash, doors and UI.
// The context is created lazily on the first user gesture, as browsers ask.

import { RADIO_STATIONS } from './config.js';

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.radioGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.stationIndex = 0;
    this.chordTimer = 0;
    this.chordStep = 0;
    this.started = false;
  }

  // Call from a click or keypress: browsers unlock audio on a gesture.
  init() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    this.radioGain = this.ctx.createGain();
    this.radioGain.gain.value = 0.0;
    this.radioGain.connect(this.master);

    // Engine: a sawtooth through a lowpass, pitch driven by setEngine().
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    // Siren: a square wave whose frequency an LFO swings between two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.frequency.value = 0.55;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 160;
    this.sirenLfo.connect(lfoGain).connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();

    this.started = true;
  }

  station() {
    return RADIO_STATIONS[this.stationIndex % RADIO_STATIONS.length];
  }

  cycleStation() {
    this.stationIndex = (this.stationIndex + 1) % RADIO_STATIONS.length;
    this.chordStep = 0;
    this.chordTimer = 0;
    return this.station();
  }

  // Per-frame: advance the radio chord pad while the player is in a car.
  update(dt, inCar, engineLoad, sirenLevel) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const radioTarget = inCar ? 0.16 : 0.0;
    this.radioGain.gain.setTargetAtTime(radioTarget, t, 0.4);
    this.engineGain.gain.setTargetAtTime(inCar ? 0.05 + engineLoad * 0.05 : 0, t, 0.1);
    if (inCar) this.engineOsc.frequency.setTargetAtTime(46 + engineLoad * 130, t, 0.08);
    this.sirenGain.gain.setTargetAtTime(Math.min(0.11, sirenLevel), t, 0.2);
    if (inCar) {
      this.chordTimer -= dt;
      if (this.chordTimer <= 0) {
        this.playChord();
        this.chordTimer = 2.6;
      }
    }
  }

  playChord() {
    const st = this.station();
    const t = this.ctx.currentTime;
    const degree = [0, 3, 2, 1][this.chordStep % 4];
    this.chordStep++;
    const rootFreq = st.root * Math.pow(2, degree / 12);
    for (const step of st.mode) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = rootFreq * Math.pow(2, step / 12);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.5);
      g.gain.linearRampToValueAtTime(0.0, t + 2.7);
      osc.connect(g).connect(this.radioGain);
      osc.start(t);
      osc.stop(t + 2.8);
    }
  }

  // One-shot noise burst shaped by `kind`: the whole foley kit.
  blip(kind) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const presets = {
      pistol: { dur: 0.13, freq: 190, gain: 0.24, type: 'square' },
      smg: { dur: 0.09, freq: 240, gain: 0.2, type: 'square' },
      punch: { dur: 0.09, freq: 90, gain: 0.22, type: 'sine' },
      hit: { dur: 0.07, freq: 140, gain: 0.16, type: 'triangle' },
      crash: { dur: 0.3, freq: 70, gain: 0.3, type: 'sawtooth' },
      door: { dur: 0.12, freq: 120, gain: 0.12, type: 'triangle' },
      pickup: { dur: 0.16, freq: 660, gain: 0.14, type: 'sine' },
      cash: { dur: 0.22, freq: 880, gain: 0.15, type: 'sine' },
      hurt: { dur: 0.15, freq: 200, gain: 0.18, type: 'sawtooth' },
      ui: { dur: 0.05, freq: 520, gain: 0.08, type: 'sine' },
      splash: { dur: 0.4, freq: 300, gain: 0.1, type: 'sine' },
    };
    const p = presets[kind] || presets.ui;
    const osc = this.ctx.createOscillator();
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, p.freq * 0.4), t + p.dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(p.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + p.dur + 0.02);
    if (kind === 'pistol' || kind === 'smg' || kind === 'crash') {
      // A breath of white noise on top sells the transient.
      const len = Math.floor(this.ctx.sampleRate * p.dur);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const ng = this.ctx.createGain();
      ng.gain.value = p.gain * 0.7;
      src.connect(ng).connect(this.master);
      src.start(t);
    }
  }
}

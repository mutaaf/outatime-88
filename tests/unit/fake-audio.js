// A minimal recording stand-in for the Web Audio API, enough for graph and scheduling tests.
class Param {
  constructor(v = 0) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this.value = v; this.events.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.value = v; this.events.push(['exp', v, t]); return this; }
  setTargetAtTime(v, t, c) { this.value = v; this.events.push(['target', v, t, c]); return this; }
  cancelScheduledValues() { return this; }
}

class Node {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.outputs = []; ctx.nodes.push(this); }
  connect(dest) { this.outputs.push(dest); this.ctx.edges.push([this, dest]); return dest; }
  disconnect() { this.outputs = []; }
}

class Source extends Node {
  start(when = 0) { this.ctx.started.push({ node: this, when }); }
  stop() {}
}

export class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.state = 'running';
    this.nodes = [];
    this.edges = [];
    this.started = [];
    this.destination = new Node(this, 'destination');
  }
  createGain() { const n = new Node(this, 'gain'); n.gain = new Param(1); return n; }
  createOscillator() { const n = new Source(this, 'osc'); n.frequency = new Param(440); n.detune = new Param(0); n.type = 'sine'; return n; }
  createBiquadFilter() { const n = new Node(this, 'filter'); n.frequency = new Param(1000); n.Q = new Param(1); n.type = 'lowpass'; return n; }
  createDynamicsCompressor() {
    const n = new Node(this, 'compressor');
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(0);
    return n;
  }
  createBuffer(ch, len) { return { length: len, getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { const n = new Source(this, 'buffer'); n.buffer = null; n.playbackRate = new Param(1); return n; }
  createConvolver() { const n = new Node(this, 'convolver'); n.buffer = null; return n; }
  createStereoPanner() { const n = new Node(this, 'panner'); n.pan = new Param(0); return n; }
  createWaveShaper() { const n = new Node(this, 'shaper'); n.curve = null; return n; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

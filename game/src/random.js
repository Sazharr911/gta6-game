// random.js — deterministic seeded randomness for PALMSHADE HEAT.
//
// The whole city is generated from one seed so Port Palmshade is the same
// place on every visit (and in every screenshot). Two independent streams are
// used: `layout` decides streets, buildings and places (the tuned map), and
// `deco` decides purely decorative detail, so adding a rooftop vent can never
// reshuffle the city itself.

// mulberry32: a tiny, fast, well-distributed 32-bit PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.next = mulberry32(seed);
  }

  // Float in [0, 1).
  float() {
    return this.next();
  }

  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max] inclusive.
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  // True with probability p.
  chance(p) {
    return this.next() < p;
  }

  // One element of arr.
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // One element of arr, removed from it.
  take(arr) {
    const i = Math.floor(this.next() * arr.length);
    return arr.splice(i, 1)[0];
  }

  // A shuffled copy of arr.
  shuffled(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }
}

// A stable numeric hash of a string, for per-block seeds.
export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

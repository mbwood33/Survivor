// Simple seeded pseudo-random number generator (LCG) for reproducible layouts.

export class RNG {
  constructor(seed = 0x12345678) {
    // Force seed into 32-bit signed int range.
    this._state = seed | 0;
  }

  // Returns a float in [0, 1).
  next() {
    // LCG parameters from Numerical Recipes
    this._state = (1664525 * this._state + 1013904223) | 0;
    // Convert to [0, 1)
    return ((this._state >>> 0) / 0x100000000);
  }

  // Returns an integer in [min, max] inclusive.
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Returns a float in [min, max)
  float(min, max) {
    return this.next() * (max - min) + min;
  }
}


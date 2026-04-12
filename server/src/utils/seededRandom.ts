/**
 * Mulberry32 — fast, deterministic PRNG from a 32-bit seed.
 * Returns a function that yields floats in [0, 1).
 */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roll a fair die with `sides` faces (1..sides) using the given rng. */
export function rollDie(sides: number, rng: () => number): number {
  return Math.floor(rng() * sides) + 1;
}

/** Pick a random integer in [min, max] inclusive. */
export function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

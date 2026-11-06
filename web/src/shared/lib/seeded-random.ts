/**
 * Park–Miller "minimal standard" generator, exactly as the reference uses it:
 * s = s * 16807 % 2147483647, returning s / 2147483647.
 * The same seed always yields the same sequence.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

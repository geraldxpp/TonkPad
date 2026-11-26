/** At most `max` actions per key in `windowMs`; past that the bot stays quiet for a moment. */
export class Limiter {
  private readonly hits = new Map<number, number[]>();
  constructor(private readonly max = 8, private readonly windowMs = 10_000) {}

  allow(key: number, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    const ok = recent.length < this.max;
    if (ok) recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return ok;
  }

  /**
   * Forgets every key with nothing in the window, so module 14's own limits
   * hold no ID past a minute; the privacy page's keeps.memory line (10
   * minutes at most) also covers the community agent's windows.
   */
  prune(now: number): void {
    for (const [key, times] of this.hits) if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(key);
  }
}

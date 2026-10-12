/** Simple token bucket for per-socket message rate limiting. */
export class RateLimiter {
  private tokens: number;
  private last = Date.now();
  constructor(private readonly ratePerSec: number, private readonly burst: number) {
    this.tokens = burst;
  }
  take(n = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.ratePerSec);
    this.last = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

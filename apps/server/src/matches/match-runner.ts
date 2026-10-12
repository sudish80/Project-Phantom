import { Match, TICK_MS, type MatchResult, type RoomConfig, type Snapshot, type TeamId, type CharacterId } from '@phantom/shared';
import { log } from '../log';

/**
 * Drives a shared `Match` at a fixed tick rate on the server, independent of any
 * client's frame rate. Uses an accumulator so the average rate stays exact.
 */
export class MatchRunner {
  readonly match: Match;
  private timer: NodeJS.Timeout | null = null;
  private last = 0;
  private acc = 0;
  private resultSent = false;

  constructor(
    config: RoomConfig,
    private readonly onSnapshot: (s: Snapshot) => void,
    private readonly onResult: (r: MatchResult) => void,
    private readonly onFinished: () => void,
  ) {
    this.match = new Match({
      mode: config.mode,
      map: config.map,
      maxRounds: config.maxRounds,
      killLimit: config.killLimit,
      timeLimitSec: config.timeLimitMin * 60,
      friendlyFire: config.friendlyFire,
      timeOfDay: config.timeOfDay,
      weather: config.weather,
    });
  }

  addPlayer(id: string, name: string, team: TeamId, character: CharacterId, skin = 'standard') {
    this.match.addPlayer(id, name, team, character, skin);
  }

  start() {
    this.last = performance.now();
    this.timer = setInterval(() => this.loop(), Math.max(4, Math.floor(TICK_MS / 2)));
  }

  private loop() {
    const now = performance.now();
    this.acc += now - this.last;
    this.last = now;
    if (this.acc > TICK_MS * 10) this.acc = TICK_MS; // server hiccup: don't spiral
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      try {
        const snap = this.match.update();
        this.onSnapshot(snap);
        if (this.match.result && !this.resultSent) {
          this.resultSent = true;
          this.onResult(this.match.result);
        }
        if (this.match.finished) {
          this.stop();
          this.onFinished();
          return;
        }
      } catch (err) {
        log.error('Match tick failed', err);
      }
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

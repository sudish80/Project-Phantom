import { Match, TICK_MS, type Ack, type InputCmd, type PracticeDifficulty, type Snapshot, type CharacterId } from '@phantom/shared';
import { getSocket, measurePing } from '../../multiplayer/socket';

/** Transport abstraction: the game engine doesn't care whether the match runs on the LAN server or locally. */
export interface GameConnection {
  sendInputs(cmds: InputCmd[]): void;
  buy(item: string): Promise<Ack>;
  sell(item: string): Promise<Ack>;
  practice?(cmd: string): void;
  onSnapshot(cb: (s: Snapshot) => void): void;
  ping(): number;
  close(): void;
}

export class NetConnection implements GameConnection {
  private cb: ((s: Snapshot) => void) | null = null;
  private rtt = 0;
  private timer: ReturnType<typeof setInterval>;
  private handler = (s: Snapshot) => this.cb?.(s);

  constructor() {
    const sock = getSocket();
    sock.on('game:snap', this.handler);
    const update = () => measurePing().then((p) => (this.rtt = p >= 0 ? p : this.rtt));
    update();
    this.timer = setInterval(update, 2000);
  }

  sendInputs(cmds: InputCmd[]) {
    const sock = getSocket();
    if (sock.connected) sock.emit('game:input', cmds);
  }

  private ack(ev: 'game:buy' | 'game:sell', item: string): Promise<Ack> {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve({ ok: false, error: 'No response from server.' }), 4000);
      getSocket().emit(ev, { item }, (r) => {
        clearTimeout(t);
        resolve(r);
      });
    });
  }

  buy(item: string) {
    return this.ack('game:buy', item);
  }

  sell(item: string) {
    return this.ack('game:sell', item);
  }

  onSnapshot(cb: (s: Snapshot) => void) {
    this.cb = cb;
  }

  ping() {
    return this.rtt;
  }

  close() {
    clearInterval(this.timer);
    getSocket().off('game:snap', this.handler);
    this.cb = null;
  }
}

/**
 * Practice range: runs the exact same authoritative `Match` simulation in the browser,
 * so weapons, movement and hit detection behave identically to multiplayer.
 */
export class LocalConnection implements GameConnection {
  readonly match: Match;
  private cb: ((s: Snapshot) => void) | null = null;
  private timer: ReturnType<typeof setInterval>;
  private last = performance.now();
  private acc = 0;

  constructor(name: string, character: CharacterId, opts: { difficulty: PracticeDifficulty; infiniteAmmo: boolean; map?: 'range' | 'frontier'; skin?: string }) {
    this.match = new Match({ mode: 'practice', map: opts.map ?? 'range', practice: opts, timeOfDay: 'map', weather: 'map' });
    this.match.addPlayer('you', name, 'alpha', character, opts.skin);
    this.timer = setInterval(() => {
      const now = performance.now();
      this.acc += now - this.last;
      this.last = now;
      if (this.acc > TICK_MS * 8) this.acc = TICK_MS;
      while (this.acc >= TICK_MS) {
        this.acc -= TICK_MS;
        const snap = this.match.update();
        this.cb?.(snap);
      }
    }, TICK_MS / 2);
  }

  sendInputs(cmds: InputCmd[]) {
    this.match.pushInputs('you', cmds);
  }

  async buy(item: string) {
    return this.match.buy('you', item);
  }

  async sell(item: string) {
    return this.match.sell('you', item);
  }

  practice(cmd: string) {
    this.match.practiceCommand('you', cmd);
  }

  onSnapshot(cb: (s: Snapshot) => void) {
    this.cb = cb;
  }

  ping() {
    return 0;
  }

  close() {
    clearInterval(this.timer);
    this.cb = null;
  }
}

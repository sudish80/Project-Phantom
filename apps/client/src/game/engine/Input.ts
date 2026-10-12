import { useSettings, type Action } from '../../stores/settings';

/**
 * Keyboard + mouse input with pointer lock. Tracks held keys (by KeyboardEvent.code),
 * one-shot presses, raw mouse deltas and wheel steps. Gameplay input is ignored while
 * the pointer is not locked (menus, lost focus).
 *
 * Touch mode: there is no pointer lock on phones, so input counts as "locked" while the
 * touch controls are active. The on-screen controls drive the same codes as the keyboard
 * (virtualDown / virtualUp / virtualTap), an analog move axis, and look deltas.
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  dx = 0;
  dy = 0;
  wheel = 0;
  locked = false;
  /** touch controls active (phone / tablet) */
  touch = false;
  /** analog movement from the touch stick, -1..1 (forward / right) */
  move = { f: 0, r: 0 };
  private onLockChange: (locked: boolean) => void = () => {};
  private disposers: (() => void)[] = [];

  constructor(private readonly el: HTMLElement) {
    const on = <K extends keyof DocumentEventMap>(t: K, f: (e: DocumentEventMap[K]) => void, target: Document | Window = document, opts?: AddEventListenerOptions) => {
      target.addEventListener(t, f as EventListener, opts);
      this.disposers.push(() => target.removeEventListener(t, f as EventListener, opts));
    };
    on('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (this.locked && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || (e.ctrlKey && e.code !== 'KeyR'))) e.preventDefault();
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    on('keyup', (e) => {
      this.down.delete(e.code);
    });
    on('mousedown', (e) => {
      if (this.touch) return; // compatibility mouse events synthesised from taps
      const code = 'Mouse' + e.button;
      if (this.locked) {
        e.preventDefault();
        this.down.add(code);
        this.pressed.add(code);
      }
    });
    on('mouseup', (e) => {
      if (this.touch) return;
      this.down.delete('Mouse' + e.button);
    });
    on('mousemove', (e) => {
      if (!this.locked || this.touch) return;
      // ignore pathological spikes some browsers emit on lock
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    on('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, window as unknown as Document, { passive: true });
    on('contextmenu', (e) => {
      if (this.locked || e.target === this.el) e.preventDefault();
    });
    on('pointerlockchange', () => {
      if (this.touch) return;
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.releaseAll();
      this.onLockChange(this.locked);
    });
    on('blur', () => this.releaseAll(), window as unknown as Document);
    on('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  /** Switch to (or from) touch controls. */
  setTouchMode(on: boolean) {
    this.touch = on;
    this.locked = on ? true : document.pointerLockElement === this.el;
    this.releaseAll();
  }

  virtualDown(code: string) {
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  }

  virtualUp(code: string) {
    this.down.delete(code);
  }

  /** a one-shot press without holding (toggles, menu buttons) */
  virtualTap(code: string) {
    this.pressed.add(code);
  }

  /** look delta in mouse-count units */
  look(dx: number, dy: number) {
    this.dx += dx;
    this.dy += dy;
  }

  wheelStep(n: number) {
    this.wheel += n;
  }

  setLockListener(f: (locked: boolean) => void) {
    this.onLockChange = f;
  }

  requestLock() {
    if (this.touch) {
      this.locked = true;
      return;
    }
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: true } as any) as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => this.el.requestPointerLock());
    } catch {
      try {
        this.el.requestPointerLock();
      } catch {
        /* ignore */
      }
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  releaseAll() {
    this.down.clear();
    this.pressed.clear();
    this.dx = this.dy = this.wheel = 0;
    this.move.f = this.move.r = 0;
  }

  code(a: Action) {
    return useSettings.getState().binds[a];
  }

  held(a: Action) {
    return this.down.has(this.code(a));
  }

  heldCode(code: string) {
    return this.down.has(code);
  }

  /** consume a one-shot press of an action */
  press(a: Action) {
    const c = this.code(a);
    if (this.pressed.has(c)) {
      this.pressed.delete(c);
      return true;
    }
    return false;
  }

  pressCode(code: string) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame() {
    this.pressed.clear();
    this.dx = this.dy = 0;
    this.wheel = 0;
  }

  dispose() {
    this.exitLock();
    this.disposers.forEach((d) => d());
  }
}

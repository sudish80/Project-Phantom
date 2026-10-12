import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from '../game/engine/Game';
import { LocalConnection, NetConnection } from '../game/engine/connection';
import { leaveRoom } from '../multiplayer/socket';
import { useApp } from '../stores/app';
import { useGameUi } from '../stores/gameUi';
import { useHud } from '../stores/hud';
import { useAim } from '../stores/aim';
import { useSettings } from '../stores/settings';
import { Hud } from '../components/Hud';
import { BuyMenu } from '../components/BuyMenu';
import { Scoreboard } from '../components/Scoreboard';
import { Minimap } from '../components/Minimap';
import { SettingsPanel } from '../components/SettingsPanel';
import { WorldMap } from '../components/WorldMap';
import { TouchControls } from '../components/TouchControls';
import { HudEditor } from '../components/HudEditor';
import { useTouchMode } from '../stores/settings';

/** Fullscreen + landscape lock (phones); both are best-effort and may be refused. */
async function enterMobileFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' } as FullscreenOptions);
  } catch {
    /* not allowed (iOS Safari has no element fullscreen) */
  }
  try {
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape');
  } catch {
    /* orientation lock unsupported */
  }
}

export function GameScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const app = useApp();
  const active = app.game;
  const ui = useGameUi();
  const ready = useHud((s) => s.ready);
  const practice = useHud((s) => s.practice);
  const [err, setErr] = useState<string | null>(null);
  const touch = useTouchMode();
  const [isFull, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  useEffect(() => {
    if (!active || !canvasRef.current) return;
    let game: Game;
    try {
      const s = useSettings.getState();
      const conn =
        active.kind === 'practice'
          ? new LocalConnection(s.nickname || 'Agent', s.character, { ...(active.practice ?? { difficulty: 'normal', infiniteAmmo: true }), skin: s.skin })
          : new NetConnection();
      game = new Game(canvasRef.current, conn, active.start, active.kind);
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : String(e));
      return;
    }
    gameRef.current = game;
    (window as unknown as { __phantomGame?: Game; __phantomHud?: typeof useHud }).__phantomGame = game; // test/debug hooks
    (window as unknown as { __phantomHud?: typeof useHud }).__phantomHud = useHud;
    (window as unknown as { __phantomAim?: typeof useAim }).__phantomAim = useAim;
    const guard = (e: BeforeUnloadEvent) => {
      if (active.kind === 'online') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => {
      window.removeEventListener('beforeunload', guard);
      game.dispose();
      gameRef.current = null;
      useHud.getState().set({ ready: false });
    };
  }, [active]);

  // When the server returns the room to the lobby, leave the game view.
  const roomStatus = app.room?.status;
  const prevStatus = useRef(roomStatus);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = roomStatus;
    if (active?.kind === 'online' && was === 'in-match' && roomStatus === 'lobby') {
      useApp.getState().set({ game: null });
      useApp.getState().go(useApp.getState().results ? 'results' : 'lobby');
    }
  }, [roomStatus, active]);

  const minimapSource = useCallback(() => gameRef.current?.minimap() ?? null, []);
  const resume = () => {
    if (touch && useSettings.getState().autoFullscreen) void enterMobileFullscreen();
    gameRef.current?.requestLock();
  };
  const leave = () => {
    if (active?.kind === 'online') {
      leaveRoom();
      app.set({ game: null });
      app.go('menu');
    } else {
      app.set({ game: null });
      app.go('practice');
    }
  };

  if (!active) return null;
  if (err)
    return (
      <div className="error-screen">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Unable to start the 3D renderer</h2>
          <p className="dim">{err}</p>
          <p className="dim">
            Make sure hardware acceleration is enabled in your browser settings and that WebGL is available (visit <span className="mono">chrome://gpu</span>).
          </p>
          <button className="btn" onClick={leave}>
            Back
          </button>
        </div>
      </div>
    );
  return (
    <div className={`game-root ${touch ? 'touch' : ''}`}>
      <canvas ref={canvasRef} className="game-canvas" onClick={() => ui.overlay === null && resume()} />
      <Hud />
      {ready && ui.minimap && useSettings.getState().showMinimap && <Minimap source={minimapSource} />}
      {ready && touch && ui.overlay === null && <TouchControls input={gameRef.current?.input ?? null} />}
      {ready && touch && <div className="rotate-prompt">Rotate your device to landscape</div>}
      {ui.scoreboard && ui.overlay === null && <Scoreboard />}
      {!ready && (
        <div className="loading">
          <div className="brand-name">PHANTOM</div>
          <div className="bar" />
          <div className="faint">{active.kind === 'online' ? 'Synchronising with server…' : 'Loading range…'}</div>
        </div>
      )}
      {ready && ui.overlay === 'capture' && (
        <div className="overlay" onClick={resume}>
          {touch ? (
            <div className="click-capture">
              <h2>TAP TO PLAY</h2>
              <div className="dim">Left thumb: move (push fully forward to sprint) · Right thumb: drag to look, tap buttons to act.</div>
              <div className="faint" style={{ marginTop: 14, fontSize: 13 }}>Ⅱ opens the menu, where you can rearrange the HUD and buttons.</div>
            </div>
          ) : (
            <div className="click-capture">
              <h2>CLICK TO PLAY</h2>
              <div className="dim">Your mouse will be captured. Press Esc to release it.</div>
              <div className="faint" style={{ marginTop: 14, fontSize: 13 }}>
                WASD move · Space jump · Ctrl crouch · Shift walk · R reload · B buy · Z V H X abilities · F plant/defuse · Tab scoreboard
              </div>
            </div>
          )}
        </div>
      )}
      {ready && ui.overlay === 'pause' && (
        <div className="overlay">
          <div className="panel pause">
            <h2>PAUSED</h2>
            <div className="faint" style={{ fontSize: 12, marginBottom: 16 }}>
              {active.kind === 'online' ? 'The match keeps running while you are in this menu.' : 'Practice range'}
            </div>
            <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <button className="btn primary" onClick={resume}>
                Resume
              </button>
              {practice && (
                <>
                  <button className="btn" onClick={() => gameRef.current?.practice('reset')}>
                    Reset targets & position
                  </button>
                  <div className="row">
                    {(['easy', 'normal', 'hard'] as const).map((d) => (
                      <button key={d} className={`btn small grow ${practice.difficulty === d ? 'primary' : ''}`} onClick={() => gameRef.current?.practice(`difficulty:${d}`)}>
                        {d}
                      </button>
                    ))}
                  </div>
                  <button className="btn" onClick={() => gameRef.current?.practice(practice.infiniteAmmo ? 'ammo:off' : 'ammo:on')}>
                    Infinite ammo: {practice.infiniteAmmo ? 'On' : 'Off'}
                  </button>
                </>
              )}
              <button className="btn" onClick={() => ui.set({ overlay: 'settings' })}>
                Settings
              </button>
              <button className="btn" onClick={() => ui.set({ overlay: 'hudEdit' })}>
                Edit HUD layout
              </button>
              {touch && 'requestFullscreen' in document.documentElement && (
                <button className="btn" onClick={() => (isFull ? void document.exitFullscreen() : void enterMobileFullscreen())}>
                  {isFull ? 'Exit fullscreen' : 'Fullscreen'}
                </button>
              )}
              <button className="btn danger" onClick={leave}>
                {active.kind === 'online' ? 'Leave match' : 'Exit range'}
              </button>
            </div>
          </div>
        </div>
      )}
      {ui.overlay === 'settings' && (
        <div className="overlay">
          <div className="panel card" style={{ width: 'min(1000px, 94vw)', height: '84vh', display: 'flex', flexDirection: 'column' }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Settings</h3>
              <button className="btn small" onClick={() => ui.set({ overlay: 'pause' })}>
                Done
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <SettingsPanel inGame />
            </div>
          </div>
        </div>
      )}
      {ui.overlay === 'hudEdit' && <HudEditor onDone={() => ui.set({ overlay: 'pause' })} />}
      {ui.overlay === 'map' && gameRef.current && (
        <WorldMap
          source={minimapSource}
          setMarker={(mk) => gameRef.current && (gameRef.current.marker = mk)}
          onClose={() => {
            ui.set({ overlay: null });
            resume();
          }}
        />
      )}
      {ui.overlay === 'buy' && gameRef.current && (
        <BuyMenu
          buy={(i) => gameRef.current!.buy(i)}
          sell={(i) => gameRef.current!.sell(i)}
          onClose={() => {
            ui.set({ overlay: null });
            resume();
          }}
        />
      )}
    </div>
  );
}

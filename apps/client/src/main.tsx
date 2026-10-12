import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';
import { applyMobileDefaults, touchModeActive, useSettings } from './stores/settings';

// phones: lighter graphics on first launch; mark the document so CSS can adapt menus and HUD
applyMobileDefaults();
const markTouch = () => document.documentElement.classList.toggle('touch', touchModeActive(useSettings.getState().controlMode));
markTouch();
useSettings.subscribe(markTouch);

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-screen">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
          <p className="dim mono" style={{ fontSize: 13 }}>
            {this.state.error.message}
          </p>
          <button className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

function NoWebGL() {
  return (
    <div className="error-screen">
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>WebGL is not available</h2>
        <p className="dim">
          Project Phantom needs WebGL to render the game. Use a recent Chrome, Edge or Firefox with hardware acceleration enabled, then reload this page.
        </p>
        <button className="btn primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>{webglAvailable() ? <App /> : <NoWebGL />}</ErrorBoundary>
  </StrictMode>,
);

import { useEffect } from 'react';
import { getSocket } from './multiplayer/socket';
import { useApp } from './stores/app';
import { useSettings } from './stores/settings';
import { audio } from './game/audio/AudioEngine';
import { Toasts } from './components/Toasts';
import { NicknameGate } from './components/NicknameGate';
import { MainMenu } from './screens/MainMenu';
import { PlayScreen } from './screens/PlayScreen';
import { CreateRoom } from './screens/CreateRoom';
import { JoinRoom } from './screens/JoinRoom';
import { Lobby } from './screens/Lobby';
import { SettingsScreen } from './screens/SettingsScreen';
import { Profile } from './screens/Profile';
import { PracticeSetup } from './screens/PracticeSetup';
import { GameScreen } from './screens/GameScreen';
import { Results } from './screens/Results';

export function App() {
  const screen = useApp((s) => s.screen);
  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.muted);

  useEffect(() => {
    getSocket();
    // invite links: /?room=CODE opens the join screen pre-filled
    if (new URLSearchParams(location.search).get('room')) useApp.getState().go('join');
  }, []);
  useEffect(() => audio.setVolumes(volume, muted), [volume, muted]);
  useEffect(() => {
    if (screen === 'game') audio.stopMusic();
  }, [screen]);

  return (
    <>
      {screen === 'menu' && <MainMenu />}
      {screen === 'play' && <PlayScreen />}
      {screen === 'create' && <CreateRoom />}
      {screen === 'join' && <JoinRoom />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'profile' && <Profile />}
      {screen === 'practice' && <PracticeSetup />}
      {screen === 'game' && <GameScreen />}
      {screen === 'results' && <Results />}
      {screen !== 'game' && <NicknameGate />}
      <Toasts />
    </>
  );
}

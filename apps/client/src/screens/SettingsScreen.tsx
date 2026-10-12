import { MenuBackground } from '../components/MenuBackground';
import { SettingsPanel } from '../components/SettingsPanel';
import { PageHead } from './PlayScreen';

export function SettingsScreen() {
  return (
    <div className="screen">
      <MenuBackground />
      <div className="page">
        <PageHead title="Settings" sub="Saved automatically in this browser" />
        <div className="panel card" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <SettingsPanel />
        </div>
      </div>
    </div>
  );
}

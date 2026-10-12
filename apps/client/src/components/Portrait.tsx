import { useMemo } from 'react';
import type { CharacterId } from '@phantom/shared';
import { characterPortrait } from '../game/player/CharacterModel';

export function Portrait({ id, size = 48, className = 'portrait' }: { id: CharacterId; size?: number; className?: string }) {
  const src = useMemo(() => characterPortrait(id, 256), [id]);
  return src ? <img className={className} src={src} width={size} height={size} alt={id} draggable={false} /> : <div className={className} style={{ width: size, height: size }} />;
}

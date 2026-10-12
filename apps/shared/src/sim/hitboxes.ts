import type { Box } from '../collision';
import { heightFor } from '../movement';

export type HitZone = 'head' | 'body' | 'leg';

/** Axis-aligned hit volumes for a humanoid standing with feet at (x,y,z). */
export function hitboxes(x: number, y: number, z: number, crouch: number): { zone: HitZone; box: Box }[] {
  const h = heightFor(crouch);
  const legTop = y + h * 0.45;
  const bodyTop = y + h * 0.8;
  return [
    { zone: 'head', box: { minX: x - 0.17, maxX: x + 0.17, minY: bodyTop, maxY: y + h + 0.02, minZ: z - 0.17, maxZ: z + 0.17 } },
    { zone: 'body', box: { minX: x - 0.33, maxX: x + 0.33, minY: legTop, maxY: bodyTop, minZ: z - 0.3, maxZ: z + 0.3 } },
    { zone: 'leg', box: { minX: x - 0.28, maxX: x + 0.28, minY: y, maxY: legTop, minZ: z - 0.25, maxZ: z + 0.25 } },
  ];
}

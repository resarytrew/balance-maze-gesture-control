import type { BallState, LevelConfig } from './types.ts';

/** Self-contained first mission: rescue beacon activation + two-way wormhole.
 * No changes to Classic Maze levels or their physics.
 */
export const COSMIC_MISSION: LevelConfig = {
  id: 100,
  name: 'Миссия 01: Сигнал с Сатурна',
  difficulty: 'easy',
  description: 'Зажгите два спасательных маяка, испытайте портал и доставьте шар-капсулу на станцию.',
  boardSize: 20,
  startPos: { x: -6, z: 6 },
  goal: { x: 6, z: -6, radius: 1.05 },
  gems: [
    { id: 'beacon-a', x: -4.5, z: -1, collected: false },
    { id: 'beacon-b', x: 3.5, z: 0.5, collected: false },
  ],
  holes: [
    { id: 'blackhole-1', x: 5, z: 5, radius: 0.82 },
    { id: 'blackhole-2', x: -4.8, z: -5.2, radius: 0.82 },
  ],
  walls: [
    { id: 'wall-a', x1: -7, z1: 2.5, x2: -1.5, z2: 2.5, thickness: 0.35 },
    { id: 'wall-b', x1: 0.7, z1: -2.4, x2: 7, z2: -2.4, thickness: 0.35 },
  ],
};

export const PORTALS = [
  { x: -1.0, z: 3.8 },
  { x: 1.9, z: -0.8 },
] as const;

export interface MissionState {
  beacons: number;
  collected: string[];
  portalCooldown: number;
  lastPortal: number | null;
  hops: number;
}

export function createMissionState(): MissionState {
  return { beacons: 0, collected: [], portalCooldown: 0, lastPortal: null, hops: 0 };
}

export function stepMission(state: MissionState, ball: BallState, dt: number):
  { state: MissionState; ball: BallState; changed: boolean; teleported: boolean } {
  const next = { ...state, portalCooldown: Math.max(0, state.portalCooldown - dt) };
  let nextBall = ball;
  let changed = false;
  let teleported = false;
  for (const beacon of COSMIC_MISSION.gems) {
    if (!next.collected.includes(beacon.id) && Math.hypot(ball.x - beacon.x, ball.z - beacon.z) < ball.radius + 0.45) {
      next.collected = [...next.collected, beacon.id];
      next.beacons = next.collected.length;
      changed = true;
    }
  }
  if (next.portalCooldown === 0) {
    for (let i = 0; i < PORTALS.length; i++) {
      const from = PORTALS[i];
      if (Math.hypot(ball.x - from.x, ball.z - from.z) < 0.7) {
        const to = PORTALS[1-i];
        // Leave velocity and orientation intact; destination deliberately
        // stays clear of fixed walls and black holes.
        nextBall = { ...ball, x: to.x, z: to.z };
        next.portalCooldown = 1.5;
        next.lastPortal = 1-i;
        next.hops++;
        changed = true;
        teleported = true;
        break;
      }
    }
  }
  return { state: next, ball: nextBall, changed, teleported };
}

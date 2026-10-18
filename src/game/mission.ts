import type { BallState, LevelConfig } from './types.ts';
import { BOARD_SIZE, fitLevelToBoard } from './mechanics.ts';

/**
 * A three-stop 1960s space adventure. Every stage uses the *existing*
 * 18-unit chassis and the untouched core rolling/contact solver.
 */
const SOURCE_MISSION_SIZE = 20;
const SCALE = BOARD_SIZE / SOURCE_MISSION_SIZE;
const fit = (level: LevelConfig) => fitLevelToBoard(level);

export const COSMIC_MISSIONS: LevelConfig[] = [
  fit({
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
  }),
  fit({
    id: 101,
    name: 'Миссия 02: Лунные руины',
    difficulty: 'medium',
    description: 'Промчитесь через лунные проходы, найдите оба маяка и покиньте заброшенную базу.',
    boardSize: 20,
    startPos: { x: -6, z: 6 },
    goal: { x: 6.3, z: -6, radius: 1.05 },
    gems: [
      { id: 'moon-beacon-a', x: -4.4, z: 0.1, collected: false },
      { id: 'moon-beacon-b', x: 4.3, z: -0.2, collected: false },
    ],
    holes: [
      { id: 'moon-hole-a', x: 5, z: 4.5, radius: 0.8 },
      { id: 'moon-hole-b', x: -5, z: -4.5, radius: 0.8 },
      { id: 'moon-hole-c', x: 0.3, z: -5.8, radius: 0.75 },
    ],
    walls: [
      { id: 'moon-wall-a', x1: -7, z1: 2.7, x2: -1.7, z2: 2.7, thickness: 0.35 },
      { id: 'moon-wall-b', x1: 1.4, z1: -2.8, x2: 7, z2: -2.8, thickness: 0.35 },
      { id: 'moon-wall-c', x1: -1.8, z1: -1.1, x2: -1.8, z2: -2.8, thickness: 0.35 },
    ],
  }),
  fit({
    id: 102,
    name: 'Миссия 03: Сердце туманности',
    difficulty: 'hard',
    description: 'Последний участок экспедиции: три сигнальных маяка и опасные гравитационные колодцы.',
    boardSize: 20,
    startPos: { x: -6.4, z: 6 },
    goal: { x: 6.2, z: -6, radius: 1.05 },
    gems: [
      { id: 'nebula-beacon-a', x: -4.6, z: 0.6, collected: false },
      { id: 'nebula-beacon-b', x: 0.2, z: -1.7, collected: false },
      { id: 'nebula-beacon-c', x: 4.5, z: -4.6, collected: false },
    ],
    holes: [
      { id: 'nebula-hole-a', x: 5.1, z: 4.4, radius: 0.78 },
      { id: 'nebula-hole-b', x: -5.5, z: -4.6, radius: 0.78 },
      { id: 'nebula-hole-c', x: 4.6, z: -0.9, radius: 0.76 },
      { id: 'nebula-hole-d', x: 0.1, z: -5.6, radius: 0.76 },
    ],
    walls: [
      { id: 'nebula-wall-a', x1: -7, z1: 3.1, x2: -1.6, z2: 3.1, thickness: 0.35 },
      { id: 'nebula-wall-b', x1: 1.8, z1: 0.0, x2: 7, z2: 0.0, thickness: 0.35 },
      { id: 'nebula-wall-c', x1: -7, z1: -3.1, x2: -1.7, z2: -3.1, thickness: 0.35 },
    ],
  }),
];

export const COSMIC_MISSION = COSMIC_MISSIONS[0];
export const isCosmicLevel = (level: LevelConfig): boolean => COSMIC_MISSIONS.some(l => l.id === level.id);
export const chapterIndex = (level: LevelConfig): number => COSMIC_MISSIONS.findIndex(l => l.id === level.id);
export const requiredBeacons = (level: LevelConfig): number => level.gems.length;

export interface PortalPoint { x: number; z: number; }
const STAGE_PORTALS: Record<number, readonly [PortalPoint, PortalPoint]> = {
  100: [{ x: -1.0 * SCALE, z: 3.8 * SCALE }, { x: 1.9 * SCALE, z: -0.8 * SCALE }],
  101: [{ x: -0.6 * SCALE, z: 4.1 * SCALE }, { x: 2.3 * SCALE, z: -0.6 * SCALE }],
  102: [{ x: 0.1 * SCALE, z: 4.5 * SCALE }, { x: -0.3 * SCALE, z: -3.9 * SCALE }],
};
export const PORTALS = STAGE_PORTALS[100];
export const getMissionPortals = (level: LevelConfig): readonly [PortalPoint, PortalPoint] =>
  STAGE_PORTALS[level.id] ?? PORTALS;

export interface MissionState {
  beacons: number;
  collected: string[];
  portalCooldown: number;
  lastPortal: number | null;
  hops: number;
  charges: number;
  stasisRemaining: number;
  message: string;
}

export function createMissionState(): MissionState {
  return {
    beacons: 0, collected: [], portalCooldown: 0, lastPortal: null, hops: 0,
    charges: 0, stasisRemaining: 0, message: 'Найдите маяки и доберитесь до станции.',
  };
}

/** Stasis is a limited *magic* time-dilation ability, not rolling friction. */
export const STASIS_DURATION = 2.8;
export const STASIS_TIME_SCALE = 0.22;
export function activateStasis(state: MissionState): MissionState {
  if (state.charges < 1 || state.stasisRemaining > 0) return state;
  return {
    ...state, charges: state.charges - 1, stasisRemaining: STASIS_DURATION,
    message: '⏳ Время замедлено! Теперь можно точнее наклонить поле.',
  };
}

export function stepMission(
  state: MissionState, ball: BallState, dt: number, level: LevelConfig = COSMIC_MISSION,
): { state: MissionState; ball: BallState; changed: boolean; teleported: boolean; collectedBeacon: boolean } {
  const remaining = Math.max(0, state.stasisRemaining - dt);
  const cooldown = Math.max(0, state.portalCooldown - dt);
  const next: MissionState = { ...state, portalCooldown: cooldown, stasisRemaining: remaining };
  let nextBall = ball;
  let changed = state.stasisRemaining > 0 && remaining === 0;
  let teleported = false;
  let collectedBeacon = false;
  if (changed) next.message = 'Время снова идёт как обычно.';

  for (const beacon of level.gems) {
    if (!next.collected.includes(beacon.id) &&
      Math.hypot(ball.x - beacon.x, ball.z - beacon.z) < ball.radius + 0.45) {
      next.collected = [...next.collected, beacon.id];
      next.beacons = next.collected.length;
      next.charges = Math.min(3, next.charges + 1);
      next.message = next.beacons === level.gems.length
        ? 'Все маяки активированы! Пора к космической станции.'
        : 'Маяк зажжён! Заряд замедления времени получен.';
      changed = true;
      collectedBeacon = true;
    }
  }

  if (next.portalCooldown === 0) {
    const portals = getMissionPortals(level);
    for (let i=0;i<portals.length;i++) {
      const from=portals[i];
      if (Math.hypot(ball.x-from.x, ball.z-from.z) < 0.7) {
        const to=portals[1-i];
        // A game-specific portal: world trajectory/spin are conserved at exit.
        // The contact solver itself is never modified.
        nextBall = { ...ball, x: to.x, z: to.z };
        next.portalCooldown = 1.5;
        next.lastPortal = 1-i;
        next.hops++;
        next.message = '✨ Гиперпрыжок выполнен!';
        changed = true;
        teleported = true;
        break;
      }
    }
  }
  return { state: next, ball: nextBall, changed, teleported, collectedBeacon };
}

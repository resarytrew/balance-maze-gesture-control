import type { GameStatus, LevelConfig, TiltState } from './types.ts';

/** One physical tabletop instrument, independent of level difficulty. */
export const BOARD_SIZE = 18;
/** Drueke No.1960 physical height ~3.75 in (source refers to total product envelope). */
export const DRUEKE_WIDTH_IN = 13;
export const DRUEKE_HEIGHT_IN = 3.75;
/** Conservative engineering cap, NOT a documented original Drueke rotation stop. */
export const CABINET_OUTER_SIZE = BOARD_SIZE + 4.2;
/** Preserve real-case H/W proportions in the Three.js world scene. */
export const CABINET_HEIGHT = CABINET_OUTER_SIZE * DRUEKE_HEIGHT_IN / DRUEKE_WIDTH_IN;
/** Top of cabinet at +0.4; felt feet rest on the table. */
export const TABLE_Y = 0.4 - CABINET_HEIGHT - 0.35 - 0.06;
export const MAX_TILT_DEG = 8;
export const MAX_TILT_RAD = MAX_TILT_DEG * Math.PI / 180;

/**
 * Limit the resultant tilt, not just each axis: a diagonal gesture must not
 * tilt the board more than either a pure pitch or pure roll gesture.
 */
export function clampBoardTilt(tilt: TiltState): TiltState {
  const pitch = Number.isFinite(tilt.pitch) ? tilt.pitch : 0;
  const roll = Number.isFinite(tilt.roll) ? tilt.roll : 0;
  const magnitude = Math.hypot(pitch, roll);
  if (magnitude <= MAX_TILT_RAD) return { pitch, roll };
  const scale = MAX_TILT_RAD / magnitude;
  return { pitch: pitch * scale, roll: roll * scale };
}

/** Keep authored obstacle topology while mapping to one physical board. */
export function fitLevelToBoard(level: LevelConfig): LevelConfig {
  if (level.boardSize === BOARD_SIZE) return level;
  const factor = BOARD_SIZE / level.boardSize;
  const coord = (n: number) => Number((n * factor).toFixed(6));
  return {
    ...level,
    boardSize: BOARD_SIZE,
    startPos: { x: coord(level.startPos.x), z: coord(level.startPos.z) },
    goal: { ...level.goal, x: coord(level.goal.x), z: coord(level.goal.z) },
    holes: level.holes.map(h => ({ ...h, x: coord(h.x), z: coord(h.z) })),
    gems: level.gems.map(g => ({ ...g, x: coord(g.x), z: coord(g.z) })),
    walls: level.walls.map(w => ({ ...w, x1: coord(w.x1), z1: coord(w.z1), x2: coord(w.x2), z2: coord(w.z2) })),
  };
}

export function nextHoleState(current: GameStatus, isFalling: boolean, fallProgress: number): GameStatus {
  if (current === 'playing' && isFalling) return 'falling';
  if (current === 'falling' && fallProgress >= 1) return 'fallen';
  return current;
}

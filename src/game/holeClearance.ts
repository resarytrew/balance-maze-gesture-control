import type { Hole, LevelConfig } from './types.ts';
import { getClosestPointOnSegment } from './physics.ts';

/** Matches the brass rim drawn by ThreeLabyrinth.tsx. */
export const holeBezelOuterRadius = (hole: Hole) => hole.radius + 0.04 + 0.095;
export const HOLE_DECORATIVE_GAP = 0.28;

/** Visual clearance is independent of ball-centre reachability. */
export function holePlacementIssues(level: LevelConfig, hole: Hole, otherHoles: Hole[] = level.holes): string[] {
  const rim = holeBezelOuterRadius(hole);
  const margin = HOLE_DECORATIVE_GAP;
  const issues: string[] = [];
  const half = level.boardSize / 2;
  const borderClearance = rim + margin + 0.10;
  if (half - Math.abs(hole.x) < borderClearance || half - Math.abs(hole.z) < borderClearance) {
    issues.push('border');
  }
  for (const wall of level.walls) {
    const { dist } = getClosestPointOnSegment(hole.x, hole.z, wall.x1, wall.z1, wall.x2, wall.z2);
    // Box wall, brass top rail and cylindrical end cap all fit within this envelope.
    if (dist < rim + wall.thickness / 2 + 0.045 + margin) issues.push(`wall:${wall.id}`);
  }
  for (const other of otherHoles) {
    if (other.id === hole.id) continue;
    if (Math.hypot(hole.x - other.x, hole.z - other.z) < rim + holeBezelOuterRadius(other) + margin) {
      issues.push(`hole:${other.id}`);
    }
  }
  for (const gem of level.gems) {
    if (Math.hypot(hole.x - gem.x, hole.z - gem.z) < rim + 0.45 + margin) issues.push(`gem:${gem.id}`);
  }
  const dStart = Math.hypot(hole.x - level.startPos.x, hole.z - level.startPos.z);
  const dGoal = Math.hypot(hole.x - level.goal.x, hole.z - level.goal.z);
  if (dStart < rim + 0.48 + margin) issues.push('start');
  if (dGoal < rim + level.goal.radius + margin) issues.push('goal');
  return issues;
}

export function validateHoleLayout(level: LevelConfig): { valid: boolean; errors: string[] } {
  const errors = level.holes.flatMap(hole => holePlacementIssues(level, hole).map(issue => `${hole.id}: ${issue}`));
  return { valid: errors.length === 0, errors };
}

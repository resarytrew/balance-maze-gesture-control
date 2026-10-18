import type { LevelConfig } from './types.ts';
import { getClosestPointOnSegment } from './physics.ts';
import { PLAYFIELD_INSET } from './mechanics.ts';

export interface ValidationResult {
  isSolvable: boolean;
  canReachGoal: boolean;
  reachableGemsCount: number;
  totalGemsCount: number;
  unreachableGems: string[];
  gridResolution: number;
  reason?: string;
}

/**
 * Validates that a labyrinth level has a guaranteed passable physical path
 * from startPos to goal, and that every gem is safely collectible without falling into holes.
 * Uses BFS pathfinding on a discretized collision grid taking ball radius and wall clearances into account.
 */
export function validateLevelPath(
  level: LevelConfig,
  ballRadius = 0.48,
  step = 0.15
): ValidationResult {
  const halfSize = level.boardSize / 2 - PLAYFIELD_INSET;
  const minCoord = -halfSize;
  const maxCoord = halfSize;
  const span = maxCoord - minCoord;
  const gridDim = Math.ceil(span / step);

  const toGridX = (x: number) => Math.max(0, Math.min(gridDim - 1, Math.floor((x - minCoord) / step)));
  const toGridZ = (z: number) => Math.max(0, Math.min(gridDim - 1, Math.floor((z - minCoord) / step)));
  const toWorldX = (gx: number) => minCoord + (gx + 0.5) * step;
  const toWorldZ = (gz: number) => minCoord + (gz + 0.5) * step;

  // 0 = open, 1 = blocked (wall or hole danger zone)
  const blocked = new Uint8Array(gridDim * gridDim);
  const clearance = ballRadius + 0.06; // physical safety margin

  // 1. Mark outer boundary walls
  for (let gz = 0; gz < gridDim; gz++) {
    for (let gx = 0; gx < gridDim; gx++) {
      const wx = toWorldX(gx);
      const wz = toWorldZ(gz);
      if (
        wx < minCoord + clearance ||
        wx > maxCoord - clearance ||
        wz < minCoord + clearance ||
        wz > maxCoord - clearance
      ) {
        blocked[gz * gridDim + gx] = 1;
      }
    }
  }

  // 2. Mark internal walls
  for (const wall of level.walls) {
    const minWallDist = clearance + wall.thickness / 2;
    const minWx = Math.min(wall.x1, wall.x2) - minWallDist;
    const maxWx = Math.max(wall.x1, wall.x2) + minWallDist;
    const minWz = Math.min(wall.z1, wall.z2) - minWallDist;
    const maxWz = Math.max(wall.z1, wall.z2) + minWallDist;

    const startGx = toGridX(minWx);
    const endGx = toGridX(maxWx);
    const startGz = toGridZ(minWz);
    const endGz = toGridZ(maxWz);

    for (let gz = startGz; gz <= endGz; gz++) {
      for (let gx = startGx; gx <= endGx; gx++) {
        const wx = toWorldX(gx);
        const wz = toWorldZ(gz);
        const { dist } = getClosestPointOnSegment(wx, wz, wall.x1, wall.z1, wall.x2, wall.z2);
        if (dist < minWallDist) {
          blocked[gz * gridDim + gx] = 1;
        }
      }
    }
  }

  // 3. Mark holes as impassable danger zones
  for (const hole of level.holes) {
    // A point is blocked if the ball center at this point would fall into the hole
    const dangerRadius = hole.radius * 0.72 + ballRadius * 0.45;
    const startGx = toGridX(hole.x - dangerRadius);
    const endGx = toGridX(hole.x + dangerRadius);
    const startGz = toGridZ(hole.z - dangerRadius);
    const endGz = toGridZ(hole.z + dangerRadius);

    for (let gz = startGz; gz <= endGz; gz++) {
      for (let gx = startGx; gx <= endGx; gx++) {
        const wx = toWorldX(gx);
        const wz = toWorldZ(gz);
        const d = Math.hypot(wx - hole.x, wz - hole.z);
        if (d < dangerRadius) {
          blocked[gz * gridDim + gx] = 1;
        }
      }
    }
  }

  // 4. BFS from startPos
  const startGx = toGridX(level.startPos.x);
  const startGz = toGridZ(level.startPos.z);

  if (blocked[startGz * gridDim + startGx]) {
    return {
      isSolvable: false,
      canReachGoal: false,
      reachableGemsCount: 0,
      totalGemsCount: level.gems.length,
      unreachableGems: level.gems.map((g) => g.id),
      gridResolution: step,
      reason: 'Start position is inside a wall or hole zone',
    };
  }

  const visited = new Uint8Array(gridDim * gridDim);
  const queue = new Int32Array(gridDim * gridDim * 2);
  let head = 0;
  let tail = 0;

  queue[tail++] = startGx;
  queue[tail++] = startGz;
  visited[startGz * gridDim + startGx] = 1;

  const dx = [1, -1, 0, 0, 1, -1, 1, -1];
  const dz = [0, 0, 1, -1, 1, 1, -1, -1];

  while (head < tail) {
    const cx = queue[head++];
    const cz = queue[head++];

    for (let i = 0; i < 8; i++) {
      const nx = cx + dx[i];
      const nz = cz + dz[i];

      if (nx >= 0 && nx < gridDim && nz >= 0 && nz < gridDim) {
        const idx = nz * gridDim + nx;
        if (!visited[idx] && !blocked[idx]) {
          // If diagonal move, ensure orthogonal neighbors are not both blocked
          if (i >= 4) {
            const o1 = cz * gridDim + nx;
            const o2 = nz * gridDim + cx;
            if (blocked[o1] && blocked[o2]) continue;
          }
          visited[idx] = 1;
          queue[tail++] = nx;
          queue[tail++] = nz;
        }
      }
    }
  }

  // Check goal reachability
  const goalGx = toGridX(level.goal.x);
  const goalGz = toGridZ(level.goal.z);
  let canReachGoal = visited[goalGz * gridDim + goalGx] === 1;

  // If goal exact center is blocked, check adjacent cells within goal radius
  if (!canReachGoal) {
    const gRange = Math.ceil(level.goal.radius / step);
    for (let rz = -gRange; rz <= gRange && !canReachGoal; rz++) {
      for (let rx = -gRange; rx <= gRange; rx++) {
        const gx = goalGx + rx;
        const gz = goalGz + rz;
        if (gx >= 0 && gx < gridDim && gz >= 0 && gz < gridDim) {
          if (visited[gz * gridDim + gx]) {
            const wx = toWorldX(gx);
            const wz = toWorldZ(gz);
            if (Math.hypot(wx - level.goal.x, wz - level.goal.z) <= level.goal.radius) {
              canReachGoal = true;
              break;
            }
          }
        }
      }
    }
  }

  // Check reachability of each gem
  const unreachableGems: string[] = [];
  let reachableGemsCount = 0;

  for (const gem of level.gems) {
    const gemGx = toGridX(gem.x);
    const gemGz = toGridZ(gem.z);
    let reached = visited[gemGz * gridDim + gemGx] === 1;

    if (!reached) {
      // Check within collection radius (ballRadius + 0.3)
      const reachDist = ballRadius + 0.35;
      const gRange = Math.ceil(reachDist / step);
      for (let rz = -gRange; rz <= gRange && !reached; rz++) {
        for (let rx = -gRange; rx <= gRange; rx++) {
          const gx = gemGx + rx;
          const gz = gemGz + rz;
          if (gx >= 0 && gx < gridDim && gz >= 0 && gz < gridDim) {
            if (visited[gz * gridDim + gx]) {
              const wx = toWorldX(gx);
              const wz = toWorldZ(gz);
              if (Math.hypot(wx - gem.x, wz - gem.z) <= reachDist) {
                reached = true;
                break;
              }
            }
          }
        }
      }
    }

    if (reached) {
      reachableGemsCount++;
    } else {
      unreachableGems.push(gem.id);
    }
  }

  const isSolvable = canReachGoal && unreachableGems.length === 0;

  return {
    isSolvable,
    canReachGoal,
    reachableGemsCount,
    totalGemsCount: level.gems.length,
    unreachableGems,
    gridResolution: step,
    reason: isSolvable
      ? undefined
      : !canReachGoal
      ? 'No passable route from start to goal'
      : `Unreachable gems: ${unreachableGems.join(', ')}`,
  };
}

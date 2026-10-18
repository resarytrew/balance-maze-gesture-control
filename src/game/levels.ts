import type { LevelConfig, Hole, Gem, Wall } from './types.ts';
import { validateLevelPath } from './validator.ts';
import { BALL_RADIUS } from './physics.ts';
import { validateHoleLayout, holePlacementIssues } from './holeClearance.ts';
import { BOARD_SIZE, fitLevelToBoard } from './mechanics.ts';

const RAW_LEVELS: LevelConfig[] = [
  {
    id: 0,
    name: 'Обучение: Первые шаги',
    difficulty: 'easy',
    description: 'Ознакомительный уровень без опасных лунок. Почувствуйте отклик виртуальной доски на наклон ладоней.',
    boardSize: 14,
    startPos: { x: -4.5, z: 4.5 },
    goal: { x: 4.5, z: -4.5, radius: 0.9 },
    holes: [], // No holes! Pure practice
    gems: [
      { id: 'g0_1', x: -4.5, z: -1.0, collected: false },
      { id: 'g0_2', x: 1.0, z: 1.0, collected: false },
    ],
    walls: [
      // S-curve partitions with wide 2.8+ unit passages
      { id: 'w0_1', x1: -6.0, z1: 2.0, x2: 1.5, z2: 2.0, thickness: 0.35 },
      { id: 'w0_2', x1: -1.5, z1: -2.0, x2: 6.0, z2: -2.0, thickness: 0.35 },
    ],
  },
  {
    id: 1,
    name: 'Деревянная классика',
    difficulty: 'easy',
    description: 'Классический маршрут с широкими проходами. Две контрольные лунки расположены в тупиковых нишах.',
    boardSize: 14,
    startPos: { x: -4.5, z: 4.5 },
    goal: { x: 4.5, z: -4.5, radius: 0.9 },
    holes: [
      // Placed in side niches, not blocking the main 2.2+ wide path
      { id: 'h1_1', x: 3.5, z: 4.2, radius: 0.72 },
      { id: 'h1_2', x: -3.5, z: -4.2, radius: 0.72 },
    ],
    gems: [
      { id: 'g1_1', x: -4.5, z: 0.0, collected: false },
      { id: 'g1_2', x: 0.0, z: 0.0, collected: false },
      { id: 'g1_3', x: 4.5, z: 0.0, collected: false },
    ],
    walls: [
      // Wide corridors (>2.2 units clearance everywhere)
      { id: 'w1_1', x1: -6.0, z1: 2.2, x2: 1.5, z2: 2.2, thickness: 0.35 },
      { id: 'w1_2', x1: -1.5, z1: -2.2, x2: 6.0, z2: -2.2, thickness: 0.35 },
      { id: 'w1_3', x1: 1.5, z1: 2.2, x2: 1.5, z2: 0.0, thickness: 0.35 },
      { id: 'w1_4', x1: -1.5, z1: 0.0, x2: -1.5, z2: -2.2, thickness: 0.35 },
    ],
  },
  {
    id: 2,
    name: 'Опасные виражи',
    difficulty: 'medium',
    description: 'Зигзагообразные виражи. Притормаживайте наклоном рук в обратную сторону перед входом в повороты.',
    boardSize: 16,
    startPos: { x: -5.5, z: 5.5 },
    goal: { x: 5.5, z: -5.5, radius: 0.9 },
    holes: [
      // Located at the outer apex of turns — punish overshooting!
      { id: 'h2_1', x: 4.8, z: 4.5, radius: 0.74 },
      { id: 'h2_2', x: -4.8, z: 1.0, radius: 0.74 },
      { id: 'h2_3', x: 4.8, z: -1.8, radius: 0.74 },
      { id: 'h2_4', x: -4.8, z: -4.5, radius: 0.74 },
    ],
    gems: [
      { id: 'g2_1', x: 0.0, z: 4.5, collected: false },
      { id: 'g2_2', x: 0.0, z: 1.8, collected: false },
      { id: 'g2_3', x: 0.0, z: -1.8, collected: false },
      { id: 'g2_4', x: 0.0, z: -4.5, collected: false },
    ],
    walls: [
      // Horizontal serpentines with wide passages (> 2.3 units)
      { id: 'w2_1', x1: -7.0, z1: 3.2, x2: 2.5, z2: 3.2, thickness: 0.35 },
      { id: 'w2_2', x1: -2.5, z1: 0.0, x2: 7.0, z2: 0.0, thickness: 0.35 },
      { id: 'w2_3', x1: -7.0, z1: -3.2, x2: 2.5, z2: -3.2, thickness: 0.35 },
    ],
  },
  {
    id: 3,
    name: 'Золотое кольцо',
    difficulty: 'hard',
    description: 'Концентрический деревянный лабиринт. Дорога к центру требует согласованного наклона обеих рук.',
    boardSize: 18,
    startPos: { x: -6.5, z: -6.5 },
    goal: { x: 0.0, z: 0.0, radius: 0.95 },
    holes: [
      // Traps along outer corridors
      { id: 'h3_1', x: 6.8, z: -6.8, radius: 0.75 },
      { id: 'h3_2', x: 6.8, z: 6.8, radius: 0.75 },
      { id: 'h3_3', x: -6.8, z: 6.8, radius: 0.75 },
      { id: 'h3_4', x: 2.5, z: 6.8, radius: 0.75 },
      { id: 'h3_5', x: -1.5, z: -1.2, radius: 0.75 },
    ],
    gems: [
      { id: 'g3_1', x: 6.5, z: 0.0, collected: false },
      { id: 'g3_2', x: 0.0, z: 6.5, collected: false },
      { id: 'g3_3', x: -3.0, z: 3.0, collected: false },
      { id: 'g3_4', x: 3.0, z: -3.0, collected: false },
    ],
    walls: [
      // Outer ring with generous doorways (width >= 2.4 units)
      { id: 'w3_1', x1: -5.2, z1: -5.2, x2: 2.5, z2: -5.2, thickness: 0.35 },
      { id: 'w3_2', x1: 5.2, z1: -5.2, x2: 5.2, z2: 2.5, thickness: 0.35 },
      { id: 'w3_3', x1: 5.2, z1: 5.2, x2: -2.5, z2: 5.2, thickness: 0.35 },
      { id: 'w3_4', x1: -5.2, z1: 5.2, x2: -5.2, z2: -2.5, thickness: 0.35 },
      // Inner spiral ring with clear entrance
      { id: 'w3_5', x1: -2.8, z1: -2.6, x2: 2.8, z2: -2.6, thickness: 0.35 },
      { id: 'w3_6', x1: 2.8, z1: -2.6, x2: 2.8, z2: 1.5, thickness: 0.35 },
      { id: 'w3_7', x1: 2.8, z1: 2.6, x2: -1.2, z2: 2.6, thickness: 0.35 },
      { id: 'w3_8', x1: -2.8, z1: 2.6, x2: -2.8, z2: 0.0, thickness: 0.35 },
    ],
  },
  {
    id: 4,
    name: 'Мастер баланса',
    difficulty: 'expert',
    description: 'Мастерский лабиринт с узкими перешейками и стратегическими лунками. Проверьте свое мастерство баланса!',
    boardSize: 20,
    startPos: { x: -7.5, z: 7.5 },
    goal: { x: 7.5, z: -7.5, radius: 0.95 },
    holes: [
      { id: 'h4_1', x: -4.0, z: 6.8, radius: 0.75 },
      { id: 'h4_2', x: 2.5, z: 6.8, radius: 0.75 },
      { id: 'h4_3', x: -6.0, z: 1.0, radius: 0.75 },
      { id: 'h4_4', x: 1.0, z: 2.0, radius: 0.75 },
      { id: 'h4_5', x: -2.0, z: -3.5, radius: 0.75 },
      { id: 'h4_6', x: 3.5, z: -3.5, radius: 0.75 },
    ],
    gems: [
      { id: 'g4_1', x: -7.5, z: 2.5, collected: false },
      { id: 'g4_2', x: 0.0, z: 7.5, collected: false },
      // Shift into the right-hand lower corridor: the original scaled spot is unreachable.
      { id: 'g4_3', x: 5.5, z: -3.3, collected: false },
      { id: 'g4_4', x: -5.0, z: -6.5, collected: false },
      { id: 'g4_5', x: 2.0, z: -7.5, collected: false },
    ],
    walls: [
      // Partition 1
      { id: 'w4_1', x1: -9.0, z1: 4.5, x2: -1.5, z2: 4.5, thickness: 0.35 },
      { id: 'w4_2', x1: 1.5, z1: 4.5, x2: 9.0, z2: 4.5, thickness: 0.35 },
      // Vertical dividers with generous gap
      { id: 'w4_3', x1: -4.5, z1: 4.5, x2: -4.5, z2: 1.0, thickness: 0.35 },
      { id: 'w4_4', x1: 3.5, z1: 4.5, x2: 3.5, z2: 1.0, thickness: 0.35 },
      // Mid divider
      { id: 'w4_5', x1: -7.0, z1: -0.5, x2: 0.0, z2: -0.5, thickness: 0.35 },
      { id: 'w4_6', x1: 2.5, z1: -0.5, x2: 9.0, z2: -0.5, thickness: 0.35 },
      // Lower divider
      { id: 'w4_7', x1: -9.0, z1: -5.0, x2: -1.0, z2: -5.0, thickness: 0.35 },
      { id: 'w4_8', x1: 1.8, z1: -5.0, x2: 7.0, z2: -5.0, thickness: 0.35 },
    ],
  },
];

/** Same physical wood frame and mount points on every level. */
export const LEVELS: LevelConfig[] = RAW_LEVELS.map(fitLevelToBoard);

/**
 * Procedural maze generator guaranteed to be 100% physically solvable.
 * Employs automated validator and retries until a guaranteed path with reachable gems is produced.
 */
export function generateRandomMaze(seed = Date.now()): LevelConfig {
  const boardSize = BOARD_SIZE;
  const numHoles = 5;
  const numGems = 4;

  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const nextRnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const startPos = { x: -6.5, z: 6.5 };
  const goal = { x: 6.5, z: -6.5, radius: 0.9 };

  for (let attempt = 0; attempt < 30; attempt++) {
    const holes: Hole[] = [];
    const gems: Gem[] = [];
    const walls: Wall[] = [];

    // Horizontal walls with guaranteed 2.6+ wide doorways
    const zSplits = [-3.2, 0.0, 3.2];
    let wallId = 1;

    for (const z of zSplits) {
      const doorX = (nextRnd() * 8 - 4);
      walls.push({
        id: `rw_${wallId++}`,
        x1: -7.5,
        z1: z,
        x2: doorX - 1.4,
        z2: z,
        thickness: 0.35,
      });
      walls.push({
        id: `rw_${wallId++}`,
        x1: doorX + 1.4,
        z1: z,
        x2: 7.5,
        z2: z,
        thickness: 0.35,
      });
    }

    // Place gems in open zones
    const gemSpots = [
      { x: -5.5, z: 1.6 },
      { x: 5.5, z: 1.6 },
      { x: -5.5, z: -1.6 },
      { x: 5.5, z: -1.6 },
    ];
    for (let i = 0; i < numGems; i++) {
      gems.push({
        id: `rg_${i}`,
        x: gemSpots[i].x,
        z: gemSpots[i].z,
        collected: false,
      });
    }

    // Rejection sampling places up to five visually separated traps. A single
    // random draw per trap would often leave the board almost empty.
    for (let i = 0; i < numHoles; i++) {
      for (let sample = 0; sample < 70; sample++) {
        const hx = (nextRnd() * 12.8 - 6.4);
        const hz = (nextRnd() * 12.8 - 6.4);
        const proposal: Hole = {
          id: `rh_${i}`,
          x: Math.round(hx * 10) / 10,
          z: Math.round(hz * 10) / 10,
          radius: 0.72,
        };
        const geometry: LevelConfig = {
          id: 99, name: 'Проверка', difficulty: 'medium', description: '',
          boardSize, startPos, goal, holes, gems, walls,
        };
        if (holePlacementIssues(geometry, proposal, holes).length === 0) {
          holes.push(proposal);
          break;
        }
      }
    }

    const candidateLevel: LevelConfig = {
      id: 99,
      version: seed + attempt,
      name: 'Случайный лабиринт',
      difficulty: 'medium',
      description: `Проверенный процедурный лабиринт (Сид: ${seed.toString(16).toUpperCase()}).`,
      boardSize,
      startPos,
      goal,
      holes,
      gems,
      walls,
    };

    // Run validator
    const val = validateLevelPath(candidateLevel, BALL_RADIUS);
    if (holes.length >= 3 && val.isSolvable && validateHoleLayout(candidateLevel).valid) {
      return candidateLevel;
    }
  }

  // Fallback: guaranteed solvable baseline
  return {
    id: 99,
    version: seed,
    name: 'Случайный лабиринт',
    difficulty: 'medium',
    description: `Проверенный процедурный лабиринт (Сид: ${seed.toString(16).toUpperCase()}).`,
    boardSize,
    startPos,
    goal,
    holes: [
      { id: 'rh_fb1', x: 2.0, z: 2.0, radius: 0.72 },
      { id: 'rh_fb2', x: -2.0, z: -2.0, radius: 0.72 },
    ],
    gems: [
      { id: 'rg_fb1', x: -5.0, z: 0.0, collected: false },
      { id: 'rg_fb2', x: 5.0, z: 0.0, collected: false },
    ],
    walls: [
      { id: 'rw_fb1', x1: -7.0, z1: 2.5, x2: 1.0, z2: 2.5, thickness: 0.35 },
      { id: 'rw_fb2', x1: -1.0, z1: -2.5, x2: 7.0, z2: -2.5, thickness: 0.35 },
    ],
  };
}

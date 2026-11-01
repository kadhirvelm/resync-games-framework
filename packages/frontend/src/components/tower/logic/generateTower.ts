import { scaleEnemy } from "./enemyMoves";
import { SeededRandom } from "./random";
import type {
  EnemySpawn,
  EnemyTemplate,
  RoomRewardKind,
  TowerContent,
  TowerRoom,
} from "./towerTypes";

/** One floor's encounter budget, before each enemy's own toughness. */
interface FloorPlan {
  /** Average attack of each enemy */
  attack: number;
  enemyCount: number;
  /** Health of each enemy */
  hitPoints: number;
}

/**
 * Floors below the boss, bottom first. Pairs split the budget so two
 * enemies feel like a targeting puzzle, not a wall.
 */
export const FLOOR_PLANS: FloorPlan[] = [
  { attack: 6, enemyCount: 1, hitPoints: 20 },
  { attack: 7, enemyCount: 1, hitPoints: 26 },
  { attack: 5, enemyCount: 2, hitPoints: 16 },
  { attack: 10, enemyCount: 1, hitPoints: 38 },
  { attack: 6, enemyCount: 2, hitPoints: 22 },
  { attack: 8, enemyCount: 2, hitPoints: 23 },
];

/** The boss at the top of every tower. */
export const BOSS_PLAN: FloorPlan = {
  attack: 13,
  enemyCount: 1,
  hitPoints: 80,
};

/** Highest ascension level a tower can be climbed at. */
export const MAX_ASCENSION = 5;

/** Extra enemy health for each ascension level. */
export const ASCENSION_HEALTH_STEP = 0.12;

/** Extra enemy attack for each ascension level. */
export const ASCENSION_ATTACK_STEP = 0.08;

/**
 * @param ascension - Ascension level from 0
 * @returns Health and attack multipliers for every enemy at that level
 */
export function ascensionScale(ascension: number): {
  attack: number;
  hitPoints: number;
} {
  const level = clamp(Math.floor(ascension), 0, MAX_ASCENSION);
  return {
    attack: 1 + level * ASCENSION_ATTACK_STEP,
    hitPoints: 1 + level * ASCENSION_HEALTH_STEP,
  };
}

/** Total floors, including the boss. */
export const TOWER_FLOOR_COUNT = FLOOR_PLANS.length + 1;

/** Rewards for floors 2 and up are shuffled from this pool. */
const LATER_REWARDS: RoomRewardKind[] = [
  "techniques",
  "monster-cards",
  "coreborn",
  "health",
  "techniques",
];

/**
 * Builds the room sequence for one climb. Rooms are strictly linear:
 * each won battle moves the party up one floor until the boss.
 * @param content - Tower content to draw enemies and rooms from
 * @param random - Run generator. Its state advances.
 * @param ascension - Ascension level. Each level makes enemies tougher.
 * @returns Rooms from the entrance to the boss
 */
export function generateTower(
  content: TowerContent,
  random: SeededRandom,
  ascension = 0,
): TowerRoom[] {
  const rewards = planRewards(random);
  const scale = ascensionScale(ascension);
  /**
   * @param plan - Floor budget before ascension
   * @returns The same budget scaled for this climb's ascension
   */
  const ascend = (plan: FloorPlan): FloorPlan => ({
    ...plan,
    attack: plan.attack * scale.attack,
    hitPoints: plan.hitPoints * scale.hitPoints,
  });
  const meanHitPoints =
    content.enemies.reduce((sum, enemy) => sum + enemy.maxHitPoints, 0) /
    Math.max(1, content.enemies.length);
  const rotation = random.shuffle(content.enemies);
  let rotationIndex = 0;

  /**
   * @returns The next enemy in a shuffled rotation, so floors vary
   */
  const nextEnemy = (): EnemyTemplate => {
    const enemy = rotation[rotationIndex % rotation.length] as EnemyTemplate;
    rotationIndex += 1;
    return enemy;
  };

  const rooms: TowerRoom[] = FLOOR_PLANS.map((plan, index) => {
    const floor = index + 1;
    const enemies = Array.from({ length: plan.enemyCount }, (_, slot) =>
      spawnEnemy(
        nextEnemy(),
        ascend(plan),
        meanHitPoints,
        `f${floor}-e${slot}`,
        false,
      ),
    );
    return {
      enemies,
      floor,
      isBoss: false,
      reward: rewards[index],
      scene: sceneFor(content, index),
    };
  });

  const boss = strongestEnemy(content.enemies);
  rooms.push({
    enemies: [
      spawnEnemy(
        boss,
        ascend(BOSS_PLAN),
        meanHitPoints,
        `f${TOWER_FLOOR_COUNT}-boss`,
        true,
      ),
    ],
    floor: TOWER_FLOOR_COUNT,
    isBoss: true,
    scene: content.scenes[content.scenes.length - 1],
  });
  return rooms;
}

/** Shuffles tried before falling back to the last one. */
const REWARD_SHUFFLE_ATTEMPTS = 24;

/**
 * The first floor always offers a Coreborn so the party grows early.
 * Later floors shuffle the rest so no two neighbours repeat.
 * @param random - Run generator
 * @returns One reward kind for each non-boss floor
 */
export function planRewards(random: SeededRandom): RoomRewardKind[] {
  let rewards: RoomRewardKind[] = [];
  for (let attempt = 0; attempt < REWARD_SHUFFLE_ATTEMPTS; attempt += 1) {
    const order: RoomRewardKind[] = [
      "coreborn",
      ...random.shuffle(LATER_REWARDS),
    ];
    rewards = order.slice(0, FLOOR_PLANS.length);
    if (rewards.every((kind, index) => kind !== rewards[index - 1])) {
      return rewards;
    }
  }
  return rewards;
}

/**
 * @param template - Enemy as generated
 * @param plan - Floor budget
 * @param meanHitPoints - Average health across the tower's enemies
 * @param id - Unique spawn id
 * @param isBoss - Whether this is the boss
 * @returns The enemy scaled for its floor. Tougher templates keep more health.
 */
function spawnEnemy(
  template: EnemyTemplate,
  plan: FloorPlan,
  meanHitPoints: number,
  id: string,
  isBoss: boolean,
): EnemySpawn {
  const toughness = clamp(
    template.maxHitPoints / Math.max(1, meanHitPoints),
    0.8,
    1.2,
  );
  const scaled = scaleEnemy(template, {
    attack: plan.attack * clamp(toughness, 0.85, 1.15),
    hitPoints: plan.hitPoints * (isBoss ? 1 : toughness),
  });
  return {
    description: template.description,
    id,
    imageUrl: template.imageUrl,
    isBoss,
    maxHitPoints: scaled.maxHitPoints,
    moves: scaled.moves,
    name: isBoss ? `${template.name}, Tower Heart` : template.name,
    ...(template.sprite ? { sprite: template.sprite } : {}),
    templateId: template.id,
  };
}

/**
 * @param enemies - Tower enemies
 * @returns The enemy with the most health, used as the boss
 */
function strongestEnemy(enemies: EnemyTemplate[]): EnemyTemplate {
  return enemies.reduce((best, enemy) =>
    enemy.maxHitPoints > best.maxHitPoints ? enemy : best,
  );
}

/**
 * @param content - Tower content
 * @param index - Floor index, 0 for the entrance
 * @returns The room backdrop, alternating through the tower's scenes
 */
function sceneFor(content: TowerContent, index: number) {
  if (content.scenes.length === 0) {
    return undefined;
  }
  // With three or more rooms, the last one is saved for the boss.
  const usable =
    content.scenes.length > 2 ? content.scenes.slice(0, -1) : content.scenes;
  return usable[index % usable.length];
}

/**
 * @param value - Number to clamp
 * @param min - Lower bound
 * @param max - Upper bound
 * @returns The value inside the bounds
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

import type { PlayableCardRules } from "@towers-of-coreborn/api";
import { ROLE_BASE_HIT_POINTS, synthesizeTierCards } from "./characterRoles";
import { toEnemyMoves } from "./enemyMoves";
import type {
  CardDefinition,
  CorebornRole,
  CorebornTemplate,
  CultivatorDefinition,
  EnemyTemplate,
  RoomScene,
  TowerContent,
} from "./towerTypes";

/**
 * @param id - Stable card id
 * @param rules - Cost, effects, and name
 * @param flavor - Lore line under the rules
 * @returns A card with no illustration
 */
function card(
  id: string,
  rules: PlayableCardRules,
  flavor: string,
): CardDefinition {
  return { flavor, id, rules };
}

const JADE_PALM = card(
  "cultivator-jade-palm",
  {
    aetherCost: 1,
    effects: [{ amount: 6, kind: "attack", text: "Deal 6 damage." }],
    name: "Jade Palm",
  },
  "Qi gathered in the palm, released in a single breath.",
);

const QI_BARRIER = card(
  "cultivator-qi-barrier",
  {
    aetherCost: 1,
    effects: [{ amount: 5, kind: "defend", text: "Grant 5 block." }],
    name: "Qi Barrier",
  },
  "A ring of still air, thin as rice paper and twice as stubborn.",
);

const MERIDIAN_BREATH = card(
  "cultivator-meridian-breath",
  {
    aetherCost: 1,
    effects: [{ amount: 2, kind: "draw", text: "Draw 2 cards." }],
    name: "Meridian Breath",
  },
  "Breathe in through the twelve channels. Breathe out what you need.",
);

/** The cultivator every climb starts with. */
export const BUILT_IN_CULTIVATOR: CultivatorDefinition = {
  aetherPerTurn: 3,
  maxHitPoints: 48,
  name: "The Cultivator",
  starterDeck: [
    JADE_PALM,
    JADE_PALM,
    JADE_PALM,
    JADE_PALM,
    QI_BARRIER,
    QI_BARRIER,
    MERIDIAN_BREATH,
  ],
  title: "Walker of the Jade Path",
};

/** Cultivation techniques offered as card rewards. */
export const BUILT_IN_TECHNIQUES: CardDefinition[] = [
  card(
    "technique-thousand-leaf-strike",
    {
      aetherCost: 2,
      effects: [{ amount: 13, kind: "attack", text: "Deal 13 damage." }],
      name: "Thousand Leaf Strike",
    },
    "Every leaf in the courtyard falls at once, and all of them are blades.",
  ),
  card(
    "technique-flowing-river",
    {
      aetherCost: 1,
      effects: [
        { amount: 7, kind: "defend", text: "Grant 7 block." },
        { amount: 1, kind: "draw", text: "Draw 1 card." },
      ],
      name: "Flowing River Stance",
    },
    "The river does not resist the stone. It simply goes on.",
  ),
  card(
    "technique-dew-gathering",
    {
      aetherCost: 0,
      effects: [{ amount: 1, kind: "aether", text: "Gain 1 Aether." }],
      name: "Dew Gathering",
    },
    "One drop at dawn, held on the tongue of a leaf.",
  ),
  card(
    "technique-crane-returns",
    {
      aetherCost: 1,
      effects: [
        { amount: 4, kind: "attack", text: "Deal 4 damage." },
        {
          amount: 8,
          chainsFrom: "attack",
          kind: "combo",
          text: "Combo (after an attack): deal 8 more.",
        },
      ],
      name: "Crane Returns Twice",
    },
    "The crane strikes, withdraws, and strikes the same place again.",
  ),
  card(
    "technique-stone-root",
    {
      aetherCost: 2,
      effects: [{ amount: 13, kind: "defend", text: "Grant 13 block." }],
      name: "Stone Root Posture",
    },
    "Roots older than the tower hold its stones together.",
  ),
  card(
    "technique-lotus-burst",
    {
      aetherCost: 1,
      effects: [
        { amount: 3, kind: "attack", text: "Deal 3 damage." },
        {
          amount: 11,
          chainsFrom: "aether",
          kind: "combo",
          text: "Combo (after Aether): deal 11 more.",
        },
      ],
      name: "Lotus Bloom Burst",
    },
    "A bud of qi, fed and fed until it cannot stay closed.",
  ),
  card(
    "technique-twin-dragon",
    {
      aetherCost: 2,
      effects: [
        { amount: 9, kind: "attack", text: "Deal 9 damage." },
        {
          amount: 9,
          chainsFrom: "attack",
          kind: "combo",
          text: "Combo (after an attack): deal 9 more.",
        },
      ],
      name: "Twin Dragon Fist",
    },
    "Two dragons, one spine. Neither strikes alone.",
  ),
  card(
    "technique-still-water",
    {
      aetherCost: 1,
      effects: [
        { amount: 2, kind: "draw", text: "Draw 2 cards." },
        { amount: 1, kind: "aether", text: "Gain 1 Aether." },
      ],
      name: "Still Water Mind",
    },
    "When the pond is still, you can see every fish.",
  ),
  card(
    "technique-inner-furnace",
    {
      aetherCost: 1,
      effects: [{ amount: 3, kind: "aether", text: "Gain 3 Aether." }],
      name: "Inner Furnace",
    },
    "The dantian burns like a kiln. Feed it carefully.",
  ),
  card(
    "technique-willow-parry",
    {
      aetherCost: 1,
      effects: [
        { amount: 5, kind: "defend", text: "Grant 5 block." },
        {
          amount: 7,
          chainsFrom: "defend",
          kind: "combo",
          text: "Combo (after defend): grant 7 more block.",
        },
      ],
      name: "Willow Parry",
    },
    "The willow bends twice, and the storm passes twice.",
  ),
  card(
    "technique-heaven-splitting",
    {
      aetherCost: 3,
      effects: [{ amount: 22, kind: "attack", text: "Deal 22 damage." }],
      name: "Heaven-Splitting Palm",
    },
    "Said to have cracked the ninth floor's ceiling. The crack is still there.",
  ),
  card(
    "technique-mountain-echo",
    {
      aetherCost: 1,
      effects: [
        { amount: 4, kind: "defend", text: "You gain 4 block." },
        {
          amount: 9,
          chainsFrom: "attack",
          kind: "combo",
          text: "Combo (after an attack): deal 9 damage.",
        },
      ],
      name: "Mountain Echo",
    },
    "Strike the mountain and it strikes back, a heartbeat later.",
  ),
];

/**
 * @param id - Template id
 * @param name - Display name
 * @param role - Fighting role
 * @param description - Lore line
 * @param tierTitles - Name of each tier, weakest first
 * @param techniqueName - Name of the card it brings
 * @returns A Coreborn with painted stand-ins for art
 */
function coreborn(
  id: string,
  name: string,
  role: CorebornRole,
  description: string,
  tierTitles: [string, string, string, string],
  techniqueName: string,
): CorebornTemplate {
  const cards = synthesizeTierCards(role, id, techniqueName);
  return {
    baseHitPoints: ROLE_BASE_HIT_POINTS[role],
    description,
    id,
    name,
    role,
    tiers: tierTitles.map((title, index) => ({
      card: cards[index] as CardDefinition,
      tier: (index + 1) as 1 | 2 | 3 | 4,
      title,
    })),
  };
}

/** Coreborn used when no generated characters exist. */
export const BUILT_IN_COREBORN: CorebornTemplate[] = [
  coreborn(
    "builtin-xuanwu",
    "Xuanwu Hatchling",
    "guardian",
    "A tortoise-serpent spirit no bigger than a teacup. It will grow into a wall.",
    ["Hatchling", "Shell-Bearer", "Black Tortoise", "Xuanwu Ascendant"],
    "Shell of the North",
  ),
  coreborn(
    "builtin-huli",
    "Huli Kit",
    "striker",
    "A fox spirit with one tail and a great deal of ambition.",
    ["One-Tail Kit", "Three-Tail Huli", "Six-Tail Huli", "Nine-Tail Sovereign"],
    "Foxfire Claw",
  ),
  coreborn(
    "builtin-carp",
    "Jade Carp",
    "mystic",
    "Every carp that leaps the Dragon Gate becomes a dragon. This one is practising.",
    ["River Carp", "Gate-Leaper", "Scaled Fry", "Dragon of the Gate"],
    "Gate-Leap Ripple",
  ),
  coreborn(
    "builtin-crane",
    "Lantern Crane",
    "mender",
    "Folded from temple paper, lit from within, loyal to whoever relights it.",
    ["Paper Crane", "Lantern Crane", "Moon Crane", "Immortal Crane"],
    "Crane's Lantern",
  ),
];

/**
 * @param id - Template id
 * @param name - Display name
 * @param maxHitPoints - Health before floor scaling
 * @param description - Lore line
 * @param pattern - Attack cycle, written like a generated enemy's
 * @returns An enemy with a painted stand-in
 */
function enemy(
  id: string,
  name: string,
  maxHitPoints: number,
  description: string,
  pattern: { amount: number; kind: "attack" | "defend"; text: string }[],
): EnemyTemplate {
  return {
    description,
    id,
    maxHitPoints,
    moves: toEnemyMoves(pattern, maxHitPoints),
    name,
  };
}

/** Enemies used when no generated enemies exist. */
export const BUILT_IN_ENEMIES: EnemyTemplate[] = [
  enemy(
    "builtin-jiangshi",
    "Ashen Jiangshi",
    40,
    "A hopping corpse in moss-green court robes, a faded talisman flapping on its brow.",
    [
      { amount: 7, kind: "attack", text: "Stiff-armed grasp: Deal 7 damage." },
      { amount: 10, kind: "attack", text: "Hopping lunge: Deal 10 damage." },
      { amount: 6, kind: "defend", text: "Talisman shroud: Gain 6 block." },
    ],
  ),
  enemy(
    "builtin-thornbound",
    "Thornbound Yaoguai",
    60,
    "A forest demon wearing the tower's vines like a cloak, patient as bark.",
    [
      { amount: 8, kind: "defend", text: "Bark hide: Gain 8 block." },
      { amount: 9, kind: "attack", text: "Thorn lash: Deal 9 damage." },
      { amount: 10, kind: "attack", text: "Thorn rain: Deal 10 damage." },
    ],
  ),
  enemy(
    "builtin-stone-lion",
    "Stone Lion Warden",
    90,
    "The tower's gate guardian, its granite mane split by roots, still loyal to a vanished sect.",
    [
      { amount: 12, kind: "defend", text: "Granite stance: Gain 12 block." },
      { amount: 12, kind: "attack", text: "Crushing paw: Deal 12 damage." },
      { amount: 16, kind: "attack", text: "Roar of the gate: Deal 16 damage." },
    ],
  ),
];

/** Rooms used when no generated backgrounds exist. */
export const BUILT_IN_SCENES: RoomScene[] = [
  {
    description:
      "Moss swallows the lower gate. Pale light leaks through the hanging vines.",
    id: "builtin-overgrown-gate",
    title: "The Overgrown Gate",
  },
  {
    description:
      "A spiral stair of jade stone, every step littered with leaves that never rot.",
    id: "builtin-leaf-stair",
    title: "The Leaf-Littered Stair",
  },
  {
    description:
      "Old meditation halls, their gears long still, wrapped in green and silence.",
    id: "builtin-vine-hall",
    title: "Hall of Hanging Vines",
  },
  {
    description:
      "The summit shrine, open to the sky, where the tower's heart still beats.",
    id: "builtin-summit-shrine",
    title: "The Summit Shrine",
  },
];

/** A tower that needs no generated assets. */
export const BUILT_IN_TOWER: TowerContent = {
  coreborn: BUILT_IN_COREBORN,
  cultivator: BUILT_IN_CULTIVATOR,
  enemies: BUILT_IN_ENEMIES,
  id: "built-in",
  scenes: BUILT_IN_SCENES,
  source: "built-in",
  summary:
    "A jade tower, abandoned by its sect and slowly reclaimed by the forest. Spirits that were bound to guard it have turned on anyone who climbs. Gather Coreborn, climb to the summit, and quiet its heart.",
  techniques: BUILT_IN_TECHNIQUES,
  title: "The Overgrown Tower",
};

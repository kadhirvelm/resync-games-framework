import type { CrosswordCryptDifficulty } from "./types";

/** Curated content family used for filtering and future theme bias. */
export type CrosswordCryptPack = "animals" | "crypt" | "food" | "space";

/** One curated word and the three speakable facets a room may distribute. */
export interface CrosswordCryptWordEntry {
  answer: string;
  clue: string;
  difficulty: CrosswordCryptDifficulty;
  id: string;
  pack: CrosswordCryptPack;
  pictureHintTag?: string;
  slices: { clue: string; letters: string; rule: string };
}

/** One pre-split anagram password. */
export interface CrosswordCryptAnagramEntry {
  answer: string;
  difficulty: CrosswordCryptDifficulty;
  id: string;
  pack: CrosswordCryptPack;
  splits: Record<2 | 3 | 4, string[]>;
}

/** One three-line riddle; every line is a private slice. */
export interface CrosswordCryptRiddleEntry {
  answer: string;
  difficulty: CrosswordCryptDifficulty;
  id: string;
  lines: readonly [string, string, string];
  pack: CrosswordCryptPack;
}

/** One hand-authored small crossword with keys separate from clue slices. */
export interface CrosswordCryptGridEntry {
  /** Across clues in clue-number order, one per across word. */
  across: string[];
  difficulty: CrosswordCryptDifficulty;
  /** Down clues in clue-number order, one per down word. */
  down: string[];
  grid: string[];
  id: string;
  pack: CrosswordCryptPack;
}

/** Builds one picture-backed easy word entry. */
const easy = (
  id: string,
  pack: CrosswordCryptPack,
  answer: string,
  clue: string,
): CrosswordCryptWordEntry => ({
  answer,
  clue,
  difficulty: "easy",
  id,
  pack,
  pictureHintTag: `Crossword Crypt picture hint: ${answer.toLowerCase()}`,
  slices: {
    clue,
    letters: `${answer.length} letters; begins with ${answer[0]}`,
    rule: `The answer belongs to the ${pack} pack.`,
  },
});

/** Builds one text-only standard word entry. */
const standard = (
  id: string,
  pack: CrosswordCryptPack,
  answer: string,
  clue: string,
): CrosswordCryptWordEntry => ({
  answer,
  clue,
  difficulty: "standard",
  id,
  pack,
  slices: {
    clue,
    letters: `${answer.length} letters; ends with ${answer.at(-1)}`,
    rule: `The answer belongs to the ${pack} pack.`,
  },
});

/**
 * Builds one expert word for adults: the length is the only letter clue, and
 * the second slice is another oblique clue instead of a pack name.
 */
const expert = (
  id: string,
  pack: CrosswordCryptPack,
  answer: string,
  clue: string,
  secondClue: string,
): CrosswordCryptWordEntry => ({
  answer,
  clue,
  difficulty: "expert",
  id,
  pack,
  slices: {
    clue,
    letters: `${answer.length} letters. No other help.`,
    rule: secondClue,
  },
});

/** Twenty-four short, picture-backed words suitable for younger players. */
export const EASY_WORDS: readonly CrosswordCryptWordEntry[] = [
  easy("easy-cat", "animals", "CAT", "A pet that purrs."),
  easy("easy-dog", "animals", "DOG", "A pet that may bark."),
  easy("easy-fox", "animals", "FOX", "A red animal with a bushy tail."),
  easy("easy-owl", "animals", "OWL", "A night bird with big eyes."),
  easy("easy-bear", "animals", "BEAR", "A large animal that likes honey."),
  easy("easy-frog", "animals", "FROG", "A green jumper near ponds."),
  easy("easy-lion", "animals", "LION", "A big cat with a mane."),
  easy("easy-duck", "animals", "DUCK", "A bird that paddles and quacks."),
  easy("easy-pear", "food", "PEAR", "A green fruit with a narrow top."),
  easy("easy-plum", "food", "PLUM", "A small purple stone fruit."),
  easy("easy-cake", "food", "CAKE", "A sweet treat with candles."),
  easy("easy-corn", "food", "CORN", "Yellow kernels grow on a cob."),
  easy("easy-rice", "food", "RICE", "Tiny grains served in a bowl."),
  easy("easy-taco", "food", "TACO", "A folded shell with a filling."),
  easy("easy-moon", "space", "MOON", "It shines in the night sky."),
  easy("easy-star", "space", "STAR", "A bright point in the night sky."),
  easy("easy-mars", "space", "MARS", "The red planet."),
  easy("easy-comet", "space", "COMET", "An icy visitor with a glowing tail."),
  easy("easy-sun", "space", "SUN", "Our nearest star."),
  easy("easy-door", "crypt", "DOOR", "You open it to enter a room."),
  easy("easy-key", "crypt", "KEY", "It can open a lock."),
  easy("easy-book", "crypt", "BOOK", "Pages held between two covers."),
  easy("easy-bell", "crypt", "BELL", "It rings when struck."),
  easy("easy-lamp", "crypt", "LAMP", "It makes light in a room."),
];

/** Forty text-only words for standard-difficulty players. */
export const STANDARD_WORDS: readonly CrosswordCryptWordEntry[] = [
  standard(
    "std-badger",
    "animals",
    "BADGER",
    "A burrowing animal with a striped face.",
  ),
  standard("std-falcon", "animals", "FALCON", "A swift bird of prey."),
  standard(
    "std-otter",
    "animals",
    "OTTER",
    "A playful swimmer with dense fur.",
  ),
  standard("std-rabbit", "animals", "RABBIT", "A long-eared burrower."),
  standard("std-turtle", "animals", "TURTLE", "A reptile carrying a shell."),
  standard(
    "std-walrus",
    "animals",
    "WALRUS",
    "A tusked swimmer from icy seas.",
  ),
  standard(
    "std-gecko",
    "animals",
    "GECKO",
    "A small lizard that climbs walls.",
  ),
  standard(
    "std-heron",
    "animals",
    "HERON",
    "A tall bird that fishes in shallows.",
  ),
  standard(
    "std-mantis",
    "animals",
    "MANTIS",
    "An insect with folded hunting arms.",
  ),
  standard("std-panda", "animals", "PANDA", "A black-and-white bamboo eater."),
  standard("std-bagel", "food", "BAGEL", "A ring-shaped bread roll."),
  standard("std-cocoa", "food", "COCOA", "A warm chocolate drink."),
  standard("std-ginger", "food", "GINGER", "A spicy root used in cooking."),
  standard("std-lentil", "food", "LENTIL", "A tiny pulse used in soups."),
  standard("std-noodle", "food", "NOODLE", "A long strip of pasta."),
  standard(
    "std-papaya",
    "food",
    "PAPAYA",
    "A tropical fruit with black seeds.",
  ),
  standard("std-pickle", "food", "PICKLE", "A cucumber preserved in brine."),
  standard(
    "std-saffron",
    "food",
    "SAFFRON",
    "A golden spice gathered from flowers.",
  ),
  standard(
    "std-waffle",
    "food",
    "WAFFLE",
    "A breakfast cake with square pockets.",
  ),
  standard("std-yogurt", "food", "YOGURT", "A cultured creamy snack."),
  standard(
    "std-asteroid",
    "space",
    "ASTEROID",
    "A rocky body orbiting the Sun.",
  ),
  standard("std-cosmos", "space", "COSMOS", "Another word for the universe."),
  standard(
    "std-eclipse",
    "space",
    "ECLIPSE",
    "One celestial body hides another.",
  ),
  standard("std-galaxy", "space", "GALAXY", "A vast family of stars."),
  standard(
    "std-meteor",
    "space",
    "METEOR",
    "A streak of light from a falling space rock.",
  ),
  standard(
    "std-nebula",
    "space",
    "NEBULA",
    "A cloud of gas and dust among stars.",
  ),
  standard("std-orbit", "space", "ORBIT", "A curved path around another body."),
  standard("std-planet", "space", "PLANET", "A world circling a star."),
  standard(
    "std-pulsar",
    "space",
    "PULSAR",
    "A spinning star that sends regular signals.",
  ),
  standard("std-rocket", "space", "ROCKET", "A vehicle propelled into space."),
  standard(
    "std-archway",
    "crypt",
    "ARCHWAY",
    "A curved opening through a wall.",
  ),
  standard(
    "std-candle",
    "crypt",
    "CANDLE",
    "Wax and a wick make a small flame.",
  ),
  standard("std-chalice", "crypt", "CHALICE", "A decorative drinking cup."),
  standard(
    "std-cipher",
    "crypt",
    "CIPHER",
    "A system for disguising a message.",
  ),
  standard(
    "std-keystone",
    "crypt",
    "KEYSTONE",
    "The central stone at the top of an arch.",
  ),
  standard("std-lantern", "crypt", "LANTERN", "A protected portable light."),
  standard(
    "std-mosaic",
    "crypt",
    "MOSAIC",
    "A picture assembled from small pieces.",
  ),
  standard("std-passage", "crypt", "PASSAGE", "A narrow route between rooms."),
  standard(
    "std-riddle",
    "crypt",
    "RIDDLE",
    "A question whose answer must be puzzled out.",
  ),
  standard(
    "std-vault",
    "crypt",
    "VAULT",
    "A secure chamber behind a strong door.",
  ),
];

/** Curated dictionary used by vaults and future room variants. */
/** Ten long, obliquely clued words for adult vaults. */
export const EXPERT_WORDS: readonly CrosswordCryptWordEntry[] = [
  expert(
    "exp-candelabra",
    "crypt",
    "CANDELABRA",
    "Branched holder for several flames.",
    "Liberace kept one on his piano.",
  ),
  expert(
    "exp-sepulchre",
    "crypt",
    "SEPULCHRE",
    "A tomb cut into rock.",
    "Whited, in a biblical insult to hypocrites.",
  ),
  expert(
    "exp-astrolabe",
    "space",
    "ASTROLABE",
    "Brass disc for reading the height of stars.",
    "Navigators trusted it before the sextant.",
  ),
  expert(
    "exp-hieroglyph",
    "crypt",
    "HIEROGLYPH",
    "A picture that is also a letter.",
    "The Rosetta Stone finally cracked it.",
  ),
  expert(
    "exp-cryptogram",
    "crypt",
    "CRYPTOGRAM",
    "Puzzle where every letter stands in for another.",
    "Often printed beside the crossword.",
  ),
  expert(
    "exp-necropolis",
    "crypt",
    "NECROPOLIS",
    "A city where nobody lives.",
    "Greek for a city of the dead.",
  ),
  expert(
    "exp-portcullis",
    "crypt",
    "PORTCULLIS",
    "A gate that falls from above.",
    "The emblem on the British Parliament's notepaper.",
  ),
  expert(
    "exp-lodestone",
    "space",
    "LODESTONE",
    "A rock that always finds north.",
    "The first compass needle was rubbed on one.",
  ),
  expert(
    "exp-reliquary",
    "crypt",
    "RELIQUARY",
    "Ornate box for a saint's remains.",
    "Pilgrims travelled across Europe to kneel before one.",
  ),
  expert(
    "exp-alchemist",
    "crypt",
    "ALCHEMIST",
    "Would-be maker of gold from lead.",
    "Paulo Coelho's shepherd boy is guided by one.",
  ),
];

export const CROSSWORD_CRYPT_WORDS = [
  ...EASY_WORDS,
  ...STANDARD_WORDS,
  ...EXPERT_WORDS,
] as const;

/** Eight 4–6 letter anagram passwords with explicit player-count splits. */
const ANAGRAM_SOURCE = [
  ["altar", "crypt", "easy", "LAMP"],
  ["orbit", "space", "easy", "MOON"],
  ["feast", "food", "easy", "TACO"],
  ["den", "animals", "easy", "FROG"],
  ["lock", "crypt", "standard", "CIPHER"],
  ["trail", "space", "standard", "COMET"],
  ["spice", "food", "standard", "GINGER"],
  ["claw", "animals", "standard", "FALCON"],
  ["maze", "crypt", "expert", "LABYRINTH"],
  ["coffin", "crypt", "expert", "SARCOPHAGUS"],
  ["vigil", "crypt", "expert", "CANDLELIGHT"],
  ["carving", "crypt", "expert", "INSCRIPTION"],
  ["scroll", "crypt", "expert", "MANUSCRIPT"],
  ["tomb", "crypt", "expert", "MAUSOLEUM"],
  ["dig", "crypt", "expert", "ARCHAEOLOGY"],
  ["sky", "space", "expert", "CONSTELLATION"],
] as const;

/**
 * Scrambles an answer's letters in a fixed order per entry, so split tiles
 * never follow the answer's own order. Never returns the answer unchanged.
 * @param id - Entry id, used as the shuffle seed
 * @param answer - Password to scramble
 * @returns The same letters in a stable scrambled order
 */
function scrambleLetters(id: string, answer: string): string[] {
  const rank = (index: number) => {
    let hash = 2166136261;
    for (const character of `${id}:${index}`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const scrambled = [...answer]
    .map((letter, index) => ({ letter, rank: rank(index) }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ letter }) => letter);
  if (scrambled.join("") !== answer) {
    return scrambled;
  }
  return [...scrambled.slice(1), ...scrambled.slice(0, 1)];
}

export const ANAGRAM_ENTRIES: readonly CrosswordCryptAnagramEntry[] =
  ANAGRAM_SOURCE.map(([id, pack, difficulty, answer]) => {
    const letters = scrambleLetters(id, answer);
    const split = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        letters
          .filter((_, letterIndex) => letterIndex % count === index)
          .join(" "),
      );
    return {
      answer,
      difficulty: difficulty as CrosswordCryptDifficulty,
      id: `anagram-${id}`,
      pack: pack as CrosswordCryptPack,
      splits: { 2: split(2), 3: split(3), 4: split(4) },
    };
  });

/** Twelve exactly-three-line riddles designed for split delivery. */
const RIDDLE_SOURCE = [
  [
    "footsteps",
    "crypt",
    "expert",
    "The more of me you take,",
    "the more of me you leave behind.",
    "In a silent corridor, you can count me.",
  ],
  [
    "candle",
    "crypt",
    "expert",
    "Every hour I work, I grow shorter.",
    "I feed only on my own body.",
    "A breath from you is enough to end me.",
  ],
  [
    "map",
    "space",
    "expert",
    "I hold cities, but not one house.",
    "I hold rivers, but not a drop of water.",
    "I hold mountains, but not a single stone.",
  ],
  [
    "silence",
    "crypt",
    "expert",
    "Name me and you have broken me.",
    "Libraries beg for me; tombs are full of me.",
    "I am golden, they say, when speech is silver.",
  ],
  [
    "tomorrow",
    "space",
    "expert",
    "I am always on my way, but I never arrive.",
    "Promise me something and I recede.",
    "When I finally come, you call me by another name.",
  ],
  [
    "keyboard",
    "crypt",
    "expert",
    "I have keys, but I open no lock.",
    "I have space, but no room.",
    "You can enter, but you can never go inside.",
  ],
  [
    "hole",
    "crypt",
    "expert",
    "The more you take from me, the bigger I grow.",
    "Fill me up and I vanish.",
    "Gravediggers make me for a living.",
  ],
  [
    "name",
    "crypt",
    "expert",
    "I belong to you, yet others use me far more than you do.",
    "You were given me before you could speak.",
    "Carved on a tombstone, I outlast you.",
  ],
  [
    "shadow",
    "crypt",
    "easy",
    "I copy every step you take.",
    "I grow long when daylight is low.",
    "In total darkness I disappear.",
  ],
  [
    "clock",
    "crypt",
    "easy",
    "I have hands but cannot clap.",
    "I have a face but never smile.",
    "I tell you when the hour arrives.",
  ],
  [
    "echo",
    "crypt",
    "easy",
    "I answer though I never speak first.",
    "I live best in caves and halls.",
    "Each reply repeats what I heard.",
  ],
  [
    "rain",
    "animals",
    "easy",
    "I fall but never trip.",
    "Clouds carry me over the land.",
    "Puddles remain after I leave.",
  ],
  [
    "orbit",
    "space",
    "standard",
    "I travel without leaving my path.",
    "Gravity keeps my journey curved.",
    "Worlds and moons follow me endlessly.",
  ],
  [
    "nebula",
    "space",
    "standard",
    "I am a cloud no wind can move.",
    "New stars may wake inside me.",
    "I glow across the dark between worlds.",
  ],
  [
    "waffle",
    "food",
    "standard",
    "My pockets are made before I am filled.",
    "A hot iron gives me a golden grid.",
    "Syrup often pools on my squares.",
  ],
  [
    "ginger",
    "food",
    "standard",
    "I grow underground but warm the tongue.",
    "I can be sliced, dried, or grated.",
    "My root gives biscuits a spicy bite.",
  ],
  [
    "turtle",
    "animals",
    "standard",
    "My house travels wherever I roam.",
    "I have no door to close behind me.",
    "When afraid, I pull my head inside.",
  ],
  [
    "falcon",
    "animals",
    "standard",
    "I circle high before I dive.",
    "My eyes find movement far below.",
    "I am a swift hunter with feathers.",
  ],
  [
    "lantern",
    "crypt",
    "standard",
    "I carry a flame inside a cage.",
    "A handle lets me travel safely.",
    "I make a small island of light.",
  ],
  [
    "keystone",
    "crypt",
    "standard",
    "I stand highest while holding the rest.",
    "Remove me and an arch may fail.",
    "My wedge locks curved stones together.",
  ],
] as const;

export const RIDDLE_ENTRIES: readonly CrosswordCryptRiddleEntry[] =
  RIDDLE_SOURCE.map(
    ([answer, pack, difficulty, line1, line2, line3], index) => ({
      answer,
      difficulty: difficulty as CrosswordCryptDifficulty,
      id: `riddle-${index + 1}`,
      lines: [line1, line2, line3] as const,
      pack: pack as CrosswordCryptPack,
    }),
  );

/** Hand-authored grids, no larger than 5×5. `#` is a blocked square. */
export const CROSSWORD_ENTRIES: readonly CrosswordCryptGridEntry[] = [
  {
    across: ["Pet that purrs", "A spider spins one"],
    difficulty: "easy",
    down: ["Farm animal that moos", "You take a bath in it"],
    grid: ["CAT", "O#U", "WEB"],
    id: "grid-cat",
    pack: "animals",
  },
  {
    across: [
      "It shines in the daytime sky",
      "Tiny insect that lives in a hill",
    ],
    difficulty: "easy",
    down: ["Big salty water", "Squirrels hide them for winter"],
    grid: ["SUN", "E#U", "ANT"],
    id: "grid-sun",
    pack: "space",
  },
  {
    across: ["A baked dish with a crust", "A very small child"],
    difficulty: "easy",
    down: ["A dog or cat that lives with you", "What you do at dinner"],
    grid: ["PIE", "E#A", "TOT"],
    id: "grid-pie",
    pack: "food",
  },
  {
    across: ["Night bird that hoots", "A small carpet"],
    difficulty: "standard",
    down: ["Paddle for a rowboat", "Piece of a chopped-down tree"],
    grid: ["OWL", "A#O", "RUG"],
    id: "grid-owl",
    pack: "animals",
  },
  {
    across: ["Opens a lock", "A precious stone"],
    difficulty: "standard",
    down: ["A small barrel", "Orange root vegetable, like a sweet potato"],
    grid: ["KEY", "E#A", "GEM"],
    id: "grid-key",
    pack: "crypt",
  },
  {
    across: ["It twinkles in the night sky", "Ocean water rolling to shore"],
    difficulty: "standard",
    down: ["Cold white flakes", "Thick cord for climbing"],
    grid: ["STAR", "N##O", "O##P", "WAVE"],
    id: "grid-star",
    pack: "space",
  },
  {
    across: [
      "Said to be thicker than water",
      "Snake that rises from a charmer's basket",
      "Mark cut into a belt, or a bedpost",
    ],
    difficulty: "expert",
    down: [
      "What a breadwinner proverbially brings home",
      "A path that always comes back to where it started",
      "One of Franklin's two certainties",
    ],
    grid: ["BLOOD", "A#R#E", "COBRA", "O#I#T", "NOTCH"],
    id: "grid-blood",
    pack: "crypt",
  },
  {
    across: [
      "Poe's visitor, who only ever says one word",
      "A rehearsal for an emergency you hope never comes",
      "Clooney's crew numbered eleven, then twelve, then thirteen",
    ],
    difficulty: "expert",
    down: [
      "Queen sang that it was all 'Ga Ga'",
      "What a hoarse singer has lost",
      "Fabric that replaced silk in wartime parachutes",
    ],
    grid: ["RAVEN", "A#O#Y", "DRILL", "I#C#O", "OCEAN"],
    id: "grid-raven",
    pack: "crypt",
  },
  {
    across: [
      "An endearing oddity",
      "The Big one never sleeps",
      "Faithful to the end, like a good dog",
    ],
    difficulty: "expert",
    down: [
      "Cower in fear, or a small game bird",
      "Suggest without ever saying it",
      "Get down on one knee, or both",
    ],
    grid: ["QUIRK", "U#M#N", "APPLE", "I#L#E", "LOYAL"],
    id: "grid-quirk",
    pack: "food",
  },
  {
    across: [
      "Where a river finally ends",
      "The daily routine, or what coffee beans need",
      "A craft you are told never to rock",
    ],
    difficulty: "expert",
    down: [
      "Johnson of the Lakers, or what a conjurer performs",
      "Jack on a flag, or what a strike needs",
      "Bet both ways to soften a loss",
    ],
    grid: ["MOUTH", "A#N#E", "GRIND", "I#O#G", "CANOE"],
    id: "grid-mouth",
    pack: "crypt",
  },
  {
    across: [
      "Measured from side to side",
      "Swoon, or barely visible",
      "A flush that beats every other hand",
    ],
    difficulty: "expert",
    down: [
      "A thin crisp, or a slice of silicon",
      "The ___ Planet, where Clark Kent works",
      "Monopoly's upgrade from four houses",
    ],
    grid: ["WIDTH", "A#A#O", "FAINT", "E#L#E", "ROYAL"],
    id: "grid-width",
    pack: "space",
  },
  {
    across: [
      "Archimedes needed one, and somewhere to stand",
      "Leap forward, or tied up tight",
      "What the alligator is told to see you",
    ],
    difficulty: "expert",
    down: [
      "A record company, or a sticker on a jar",
      "Pole ___, or where the gold sleeps",
      "A palindrome that pings passing planes",
    ],
    grid: ["LEVER", "A#A#A", "BOUND", "E#L#A", "LATER"],
    id: "grid-lever",
    pack: "crypt",
  },
];

/** Minimal blocked-term list applied to every curated and future entry. */
export const CROSSWORD_CRYPT_PROFANITY_DENYLIST = [
  "asshole",
  "bastard",
  "bitch",
  "fuck",
  "shit",
] as const;

/** Typed extension point reserved for later family-authored packs. */
export const FAMILY_WORD_PACKS: readonly CrosswordCryptWordEntry[] = [];

/** Player-facing labels for the three MVP content packs. */
export const CROSSWORD_CRYPT_PACK_LABELS = {
  animals: "Animal Friends",
  food: "Kitchen Table",
  space: "Star Maps",
} as const;

/**
 * Checks untrusted content against the shipped whole-word denylist.
 * @param text - Answer, clue, or riddle line to inspect
 * @returns Whether a blocked token occurs
 */
export function containsBlockedTerm(text: string): boolean {
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return tokens.some((token) =>
    CROSSWORD_CRYPT_PROFANITY_DENYLIST.includes(
      token as (typeof CROSSWORD_CRYPT_PROFANITY_DENYLIST)[number],
    ),
  );
}

import type { ClassId, FormationId, SchoolId } from "../logic/types";
import type { InspectTarget } from "./inspect";
import { idleVillagerIds, type Selection } from "./selection";
import type { ShellBuilding, ShellModel, ShellUnit } from "./shellModel";
import { SCHOOL_LABEL } from "./text";
import { shiftTrainQuote } from "./trainingQuote";

/** An intent that opens a confirm step before a command is emitted. */
export type ConfirmIntent =
  | { altarId: string; calamityId: string; type: "summon" }
  | { furnaceId: string; pillId: string; type: "brew" }
  | { hallId: string; heroId: string; type: "revive" }
  | { pillId: string; type: "feed"; unitId: string }
  | { school: SchoolId; type: "school"; unitId: string }
  | { treasureId: string; type: "equip"; unitId: string }
  | { type: "breakthrough"; unitId: string }
  | { type: "descend" }
  | { type: "market" }
  | { type: "rations" }
  | { type: "upgrade" };

/** Every command-card button. Only confirm intents open a dialog. */
export type CardIntent =
  | ConfirmIntent
  | {
      buildingId: string;
      classId: ClassId;
      /** Orders a shift-click will queue. A plain click omits this. */
      count?: number;
      type: "train";
    }
  | { buildingId: string; type: "rally" }
  | { type: "build" }
  | { formation: FormationId; type: "formation" }
  | { count: "all" | "one"; nodeId: string; type: "gather_idle" }
  | { type: "hotkeys" }
  | { type: "idle" }
  | { type: "recall" }
  | { type: "release" }
  | { type: "stop"; unitIds: string[] };

/** Card intents that act at once instead of opening a confirm step. */
const IMMEDIATE_INTENTS: ReadonlySet<CardIntent["type"]> = new Set([
  "build",
  "formation",
  "gather_idle",
  "hotkeys",
  "idle",
  "recall",
  "rally",
  "release",
  "stop",
  "train",
]);

/** Painted marks for every command that is not a training portrait or a school. */
const COMMAND_ICONS = {
  breakthrough: "/descent/command-icons/breakthrough.png",
  brew: "/descent/command-icons/brew.png",
  build: "/descent/command-icons/build.png",
  descend: "/descent/command-icons/descend.png",
  equip: "/descent/command-icons/equip.png",
  feed: "/descent/command-icons/feed.png",
  gather_idle: "/descent/command-icons/idle.png",
  hotkeys: "/descent/command-icons/hotkeys.png",
  idle: "/descent/command-icons/idle.png",
  market: "/descent/command-icons/market.png",
  rally: "/descent/command-icons/rally.png",
  rations: "/descent/command-icons/rations.png",
  recall: "/descent/command-icons/recall.png",
  release: "/descent/command-icons/release.png",
  revive: "/descent/command-icons/revive.png",
  stop: "/descent/command-icons/stop.png",
  summon: "/descent/command-icons/summon.png",
  upgrade: "/descent/command-icons/upgrade.png",
} as const satisfies Record<
  Exclude<CardIntent["type"], "formation" | "school" | "train">,
  string
>;

/**
 * Painted icon for a command-card action.
 * Training choices keep their unit portraits.
 * @param button - Command button
 * @returns Public icon path
 */
export function commandIconSrc(button: CardButton): string {
  const intent = button.intent;
  if (intent.type === "train") return button.imageSrc ?? "";
  if (intent.type === "formation") return "";
  if (intent.type === "school") {
    return `/descent/command-icons/school-${intent.school}.png`;
  }
  return COMMAND_ICONS[intent.type];
}

/** One button on the command card. */
export interface CardButton {
  /** Orders a shift-click will queue, when more than one fit. */
  batchCount?: number;
  /** Cost of {@link batchCount}, shown while Shift is held. */
  batchDetail?: string;
  description?: string;
  detail?: string;
  disabled?: boolean;
  /** Keyboard shortcut shown on the tile. */
  hotkey?: string;
  id: string;
  imageSrc?: string;
  intent: CardIntent;
  label: string;
  pressed?: boolean;
  role?: string;
}

/** Player-facing formation choices, ordered from broadest to narrowest. */
const FORMATION_CHOICES: readonly {
  description: string;
  formation: FormationId;
  label: string;
}[] = [
  {
    description: "Balanced ranks with melee in front and ranged behind.",
    formation: "ranks",
    label: "Ranks",
  },
  {
    description: "A broad battle line that spreads the group across the field.",
    formation: "line",
    label: "Line",
  },
  {
    description: "A pointed assault shape with the center leading.",
    formation: "wedge",
    label: "Wedge",
  },
  {
    description: "A narrow two-wide marching column for tight approaches.",
    formation: "column",
    label: "Column",
  },
];

/** Plain-language identity shown before a unit is added to the queue. */
export interface UnitTrainingGuide {
  description: string;
  iconSrc: string;
  role: string;
}

/** Stable offline portraits and battlefield jobs for every trainable class. */
export const UNIT_TRAINING_GUIDES: Record<ClassId, UnitTrainingGuide> = {
  adept: {
    description: "Ranged spirit caster that heals badly wounded allies.",
    iconSrc: "/descent/unit-icons/adept.svg",
    role: "Support",
  },
  breaker: {
    description: "Slow maul unit with double damage against structures.",
    iconSrc: "/descent/unit-icons/breaker.svg",
    role: "Siege",
  },
  hunter: {
    description: "Long-range archer that stays behind the front line.",
    iconSrc: "/descent/unit-icons/hunter.svg",
    role: "Ranged",
  },
  raider: {
    description: "Fast twin-blade flanker that rushes fragile units.",
    iconSrc: "/descent/unit-icons/raider.svg",
    role: "Skirmisher",
  },
  villager: {
    description: "Gathers resources, constructs buildings, and repairs.",
    iconSrc: "/descent/unit-icons/villager.svg",
    role: "Worker",
  },
  warden: {
    description: "Durable shield unit that anchors the front line.",
    iconSrc: "/descent/unit-icons/warden.svg",
    role: "Frontline",
  },
};

/**
 * Whether an intent should open the confirm dialog.
 * @param intent - Card intent
 * @returns Whether the intent is a confirm step
 */
export function isConfirmIntent(intent: CardIntent): intent is ConfirmIntent {
  return !IMMEDIATE_INTENTS.has(intent.type);
}

/**
 * The last selected unit, which the unit panel describes.
 * @param model - Shell model
 * @param selection - Current selection
 * @returns The primary unit, or null
 */
export function primaryUnit(
  model: ShellModel,
  selection: Selection,
): ShellUnit | null {
  const id = selection.unitIds[selection.unitIds.length - 1];
  if (id === undefined) return null;
  return model.units.find((unit) => unit.id === id) ?? null;
}

/**
 * Buttons that apply to the selected Hold unit.
 * @param model - Shell model
 * @param selection - Current selection
 * @param activeFormation - Formation used for the group's next move
 * @returns Unit actions, possibly empty
 */
function unitButtons(
  model: ShellModel,
  selection: Selection,
  activeFormation: FormationId,
): CardButton[] {
  const selected = model.units.filter((unit) =>
    selection.unitIds.includes(unit.id),
  );
  const primary = primaryUnit(model, selection);
  const buttons: CardButton[] = [];
  const holdIds = selected
    .filter((unit) => unit.factionId === "hold")
    .map((unit) => unit.id);
  if (
    selected.some(
      (unit) => unit.classId === "villager" && unit.factionId === "hold",
    )
  ) {
    buttons.push({
      description: "Place a new building; selected villagers build it.",
      hotkey: "B",
      id: "build",
      intent: { type: "build" },
      label: "Build",
    });
  }
  if (holdIds.length > 0) {
    buttons.push({
      description: "Drop the current order and stand still.",
      id: "stop",
      intent: { type: "stop", unitIds: holdIds },
      label: "Stop",
    });
  }
  const militaryGroup =
    selected.length >= 2 &&
    selected.every(
      (unit) => unit.factionId === "hold" && unit.classId !== "villager",
    );
  if (militaryGroup) {
    for (const choice of FORMATION_CHOICES) {
      buttons.push({
        description: choice.description,
        id: `formation-${choice.formation}`,
        intent: { formation: choice.formation, type: "formation" },
        label: choice.label,
        pressed: choice.formation === activeFormation,
        role: "Formation",
      });
    }
  }
  if (primary === null || primary.factionId !== "hold") return buttons;
  if (primary.cultivation !== null) {
    buttons.push({
      description: "Try to advance a rank at the Cultivation Hall.",
      id: "breakthrough",
      intent: { type: "breakthrough", unitId: primary.id },
      label: "Breakthrough",
    });
  }
  for (const feed of model.pillFeeds) {
    if (feed.unitId !== primary.id) continue;
    buttons.push({
      id: `feed-${feed.preview.pillId}`,
      intent: {
        pillId: feed.preview.pillId,
        type: "feed",
        unitId: primary.id,
      },
      label: `Feed ${feed.pillName}`,
    });
  }
  const rank = primary.cultivation?.rank;
  if (rank === "Sworn" && primary.cultivation?.school === undefined) {
    const schools = [
      "ember",
      "rime",
      "blood",
    ] as const satisfies readonly SchoolId[];
    for (const school of schools) {
      const name = SCHOOL_LABEL[school];
      buttons.push({
        id: `school-${school}`,
        intent: { school, type: "school", unitId: primary.id },
        label: name,
      });
    }
  }
  for (const treasure of model.treasures) {
    if (treasure.unitId !== primary.id) continue;
    buttons.push({
      id: `equip-${treasure.treasureId}`,
      intent: {
        treasureId: treasure.treasureId,
        type: "equip",
        unitId: primary.id,
      },
      label: `Equip ${treasure.name}`,
    });
  }
  return buttons;
}

/**
 * Buttons that apply to the selected building.
 * @param model - Shell model
 * @param building - Selected building
 * @returns Context actions for that building
 */
function buildingButtons(
  model: ShellModel,
  building: ShellBuilding,
): CardButton[] {
  const buttons: CardButton[] = [];
  if (
    !building.constructing &&
    (building.buildingType === "camp" || building.buildingType === "barracks")
  ) {
    buttons.push({
      description: "Choose where new units walk. Or just right-click the map.",
      id: "set-rally",
      intent: { buildingId: building.id, type: "rally" },
      label: "Set rally",
    });
  }
  if (building.buildingType === "camp" && model.holdUpgrade !== null) {
    buttons.push({
      detail: model.holdUpgrade.allowed
        ? model.holdUpgrade.costLabel
        : model.holdUpgrade.reason,
      id: "upgrade-hold",
      intent: { type: "upgrade" },
      label: `Upgrade to ${model.holdUpgrade.targetTier}`,
    });
  }
  for (const option of model.trainOptions) {
    if (option.buildingId !== building.id) continue;
    const guide = UNIT_TRAINING_GUIDES[option.classId];
    const popFree = model.pop === null ? null : model.pop.cap - model.pop.used;
    const quote = option.allowed
      ? shiftTrainQuote(
          {
            food: model.resources.food,
            popFree,
            queueLength: building.trainingQueue.length,
            water: model.resources.water,
          },
          option,
        )
      : null;
    buttons.push({
      batchCount: quote?.count,
      batchDetail: quote?.detail,
      description: guide.description,
      detail: option.allowed ? option.detail : option.reason,
      disabled: !option.allowed,
      id: `train-${option.classId}`,
      imageSrc: guide.iconSrc,
      intent: {
        buildingId: building.id,
        classId: option.classId,
        type: "train",
      },
      label: `Train ${option.label}`,
      role: guide.role,
    });
  }
  if (building.buildingType === "camp") {
    buttons.push(
      {
        description: "Call every villager into the Camp for safety.",
        hotkey: "R",
        id: "recall",
        intent: { type: "recall" },
        label: "Ring the bell",
      },
      {
        description: "Send sheltered villagers back to their jobs.",
        hotkey: "G",
        id: "release",
        intent: { type: "release" },
        label: "Back to work",
      },
    );
  }
  if (building.buildingType === "alchemy_furnace") {
    for (const option of model.brewOptions) {
      if (option.furnaceId !== building.id) continue;
      buttons.push({
        id: `brew-${option.pillId}`,
        intent: {
          furnaceId: option.furnaceId,
          pillId: option.pillId,
          type: "brew",
        },
        label: `Brew ${option.name}`,
      });
    }
  }
  if (
    building.buildingType === "mess_hall" &&
    model.rations !== null &&
    model.rations.messHallId === building.id
  ) {
    buttons.push({
      id: "rations",
      intent: { type: "rations" },
      label: "Issue rations",
    });
  }
  if (building.buildingType === "hero_hall") {
    for (const hero of model.revives) {
      if (hero.hallId !== building.id) continue;
      buttons.push({
        id: `revive-${hero.heroId}`,
        intent: { hallId: hero.hallId, heroId: hero.heroId, type: "revive" },
        label: `Revive ${hero.name}`,
      });
    }
  }
  if (building.buildingType === "calamity_altar") {
    for (const calamity of model.calamities) {
      if (calamity.altarId !== building.id) continue;
      buttons.push({
        id: `summon-${calamity.calamityId}`,
        intent: {
          altarId: calamity.altarId,
          calamityId: calamity.calamityId,
          type: "summon",
        },
        label: `Summon ${calamity.name}`,
      });
    }
  }
  if (building.buildingType === "hell_market" && model.marketRates.length > 0) {
    buttons.push({
      id: "market",
      intent: { type: "market" },
      label: "Trade",
    });
  }
  return buttons;
}

/**
 * Buttons for an inspected resource node: put idle villagers to work on it.
 * @param model - Shell model
 * @param nodeId - Inspected node
 * @returns Gather actions
 */
function nodeButtons(model: ShellModel, nodeId: string): CardButton[] {
  const idle = idleVillagerIds(model.units).length;
  const none = idle === 0;
  return [
    {
      description: "Send the next idle villager to gather here.",
      detail: none ? "No idle villagers" : `${idle} idle`,
      disabled: none,
      id: "gather-one",
      intent: { count: "one", nodeId, type: "gather_idle" },
      label: "Send 1 idle",
    },
    {
      description: "Send every idle villager to gather here.",
      detail: none ? "No idle villagers" : `${idle} idle`,
      disabled: none,
      id: "gather-all",
      intent: { count: "all", nodeId, type: "gather_idle" },
      label: "Send all idle",
    },
  ];
}

/**
 * Buttons shown when nothing is selected, or for an inspected feature that
 * has no actions of its own.
 * @param model - Shell model
 * @returns Idle villager, controls, and descend
 */
function generalButtons(model: ShellModel): CardButton[] {
  const idle = idleVillagerIds(model.units).length;
  return [
    {
      description: "Select the next villager with nothing to do.",
      detail: idle === 0 ? "None idle" : `${idle} idle`,
      hotkey: ".",
      id: "idle",
      intent: { type: "idle" },
      label: "Idle villager",
    },
    {
      description: "Mouse and keyboard controls.",
      hotkey: "?",
      id: "hotkeys",
      intent: { type: "hotkeys" },
      label: "Controls",
    },
    {
      description: "Go down to the next layer once the boss is dead.",
      detail: model.bossGateCleared ? "Boss gate clear" : "Boss still lives",
      id: "descend",
      intent: { type: "descend" },
      label: "Descend",
    },
  ];
}

/**
 * Lists the command card for the current selection.
 * @param model - Shell model
 * @param selection - Current selection
 * @param target - Inspected map feature or stockpile entry, if any
 * @param activeFormation - Formation selected for grouped military movement
 * @returns Buttons in display order
 */
export function buildCardButtons(
  model: ShellModel,
  selection: Selection,
  target: InspectTarget | null = null,
  activeFormation: FormationId = "ranks",
): CardButton[] {
  if (target?.kind === "node") return nodeButtons(model, target.id);
  if (target?.kind === "vein") {
    return [
      {
        description: "Open the build menu, then place a building on the vein.",
        hotkey: "B",
        id: "build",
        intent: { type: "build" },
        label: "Build",
      },
    ];
  }
  if (target !== null) return generalButtons(model);
  const building = model.buildings.find(
    (item) => item.id === selection.buildingId,
  );
  const context =
    building === undefined
      ? unitButtons(model, selection, activeFormation)
      : buildingButtons(model, building);
  if (selection.unitIds.length > 0 || selection.buildingId !== null) {
    return context;
  }
  return generalButtons(model);
}

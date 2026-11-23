import { isCultivatorClass } from "../logic/slice/sliceCultivatorPowers";
import { isTrainingBuilding } from "../logic/slice/sliceTraining";
import type {
  ClassId,
  FormationId,
  ResourceId,
  SchoolId,
} from "../logic/types";
import {
  type BlockerItem,
  blockersFromLines,
  pricedActionBlockers,
} from "./blockers";
import { type CostLine, type CostStock, costLineFrom } from "./costLine";
import type { InspectTarget } from "./inspect";
import { schoolChoiceSummary } from "./schoolGuidance";
import {
  idleVillagerIds,
  isLocalPlayerOwned,
  type Selection,
} from "./selection";
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
  | { sell?: ResourceId; type: "market" }
  | { messHallId: string; type: "rations" }
  | { type: "upgrade" };

/** Every command-card button. Only confirm intents open a dialog. */
export type CardIntent =
  | ConfirmIntent
  | { buildingId: string; type: "cancel_construction" }
  | { type: "disband"; unitIds: string[] }
  | {
      buildingId: string;
      classId: ClassId;
      /** Orders a shift-click will queue. A plain click omits this. */
      count?: number;
      type: "train";
    }
  | { buildingId: string; type: "rally" }
  | { type: "attack_move"; unitIds: string[] }
  | { type: "build" }
  | { formation: FormationId; type: "formation"; unitIds: string[] }
  | { count: "all" | "one"; nodeId: string; type: "gather_idle" }
  | { type: "hotkeys" }
  | { type: "idle" }
  | { type: "meditate"; unitIds: string[] }
  | { type: "qi_art"; unitIds: string[] }
  | { type: "recall" }
  | { type: "release" }
  | { type: "stop"; unitIds: string[] };

/** Card intents that act at once instead of opening a confirm step. */
const IMMEDIATE_INTENTS: ReadonlySet<CardIntent["type"]> = new Set([
  "attack_move",
  "build",
  "cancel_construction",
  "disband",
  "formation",
  "gather_idle",
  "hotkeys",
  "idle",
  "meditate",
  "qi_art",
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
  meditate: "/descent/command-icons/meditate.svg",
  qi_art: "/descent/command-icons/qi_art.svg",
  rally: "/descent/command-icons/rally.png",
  rations: "/descent/command-icons/rations.png",
  recall: "/descent/command-icons/recall.png",
  release: "/descent/command-icons/release.png",
  revive: "/descent/command-icons/revive.png",
  stop: "/descent/command-icons/stop.png",
  summon: "/descent/command-icons/summon.png",
  upgrade: "/descent/command-icons/upgrade.png",
} as const satisfies Record<
  Exclude<
    CardIntent["type"],
    | "attack_move"
    | "cancel_construction"
    | "disband"
    | "formation"
    | "school"
    | "train"
  >,
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
  if (
    intent.type === "formation" ||
    intent.type === "attack_move" ||
    intent.type === "cancel_construction" ||
    intent.type === "disband"
  ) {
    return "";
  }
  if (intent.type === "school") {
    return `/descent/command-icons/school-${intent.school}.png`;
  }
  return COMMAND_ICONS[intent.type];
}

/** One button on the command card. */
export interface CardButton {
  /** Orders a shift-click will queue, when more than one fit. */
  batchCount?: number;
  /** Price of {@link batchCount}, drawn while Shift is held. */
  batchCost?: CostLine;
  /** Cost of {@link batchCount}, shown while Shift is held. */
  batchDetail?: string;
  /**
   * Why a disabled action cannot run and how to fix it. Every disabled
   * button carries at least one item so clicks and hovers can explain it.
   */
  blockers?: readonly BlockerItem[];
  /** Price drawn as resource icons and amounts. */
  cost?: CostLine;
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
    description:
      "Ranged spirit healer that mends wounded allies and supports your cultivator.",
    iconSrc: "/descent/unit-icons/adept.svg",
    role: "Healer",
  },
  breaker: {
    description: "Slow maul unit with double damage against structures.",
    iconSrc: "/descent/unit-icons/breaker.svg",
    role: "Siege",
  },
  cultivator: {
    description:
      "Unique spirit-blade champion (Limit 1). Unleashes Sword Qi bursts and Dao Arts.",
    iconSrc: "/descent/unit-icons/cultivator.svg",
    role: "Qi Cultivator",
  },
  formation_master: {
    description:
      "Unique talisman champion (Limit 1) whose arrays heal allies, grant Spirit Surge, and pulse foes.",
    iconSrc: "/descent/unit-icons/formation_master.svg",
    role: "Qi Cultivator",
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
  rider: {
    description:
      "Very fast outrider with exceptional sight but light combat power.",
    iconSrc: "/descent/unit-icons/rider.svg",
    role: "Scout",
  },
  sword_sage: {
    description:
      "Unique flying-sword champion (Limit 1) that pierces armor and rains spirit blades.",
    iconSrc: "/descent/unit-icons/sword_sage.svg",
    role: "Qi Cultivator",
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
  attackMoving = false,
): CardButton[] {
  const selected = model.units.filter((unit) =>
    selection.unitIds.includes(unit.id),
  );
  const primary = primaryUnit(model, selection);
  const buttons: CardButton[] = [];
  const holdIds = selected
    .filter((unit) => unit.factionId === "hold")
    .map((unit) => unit.id);
  const hasMilitary = selected.some(
    (unit) => unit.factionId === "hold" && unit.classId !== "villager",
  );
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
  if (hasMilitary && holdIds.length > 0) {
    buttons.push({
      description: "Move to a point and engage enemies along the way.",
      hotkey: "X",
      id: "attack-move",
      intent: { type: "attack_move", unitIds: holdIds },
      label: "Attack-Move",
      pressed: attackMoving,
    });
  }
  if (holdIds.length > 0) {
    buttons.push(
      {
        description: "Drop the current order and stand still.",
        hotkey: "Z",
        id: "stop",
        intent: { type: "stop", unitIds: holdIds },
        label: "Stop",
      },
      {
        description:
          "Permanently remove the selected units to free their population.",
        detail: "No resource refund",
        hotkey: "Del",
        id: "disband",
        intent: { type: "disband", unitIds: holdIds },
        label: "Disband",
      },
    );
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
        intent: {
          formation: choice.formation,
          type: "formation",
          unitIds: holdIds,
        },
        label: choice.label,
        pressed: choice.formation === activeFormation,
        role: "Formation",
      });
    }
  }
  if (primary === null || primary.factionId !== "hold") return buttons;
  const cultivatorIds = selected
    .filter((unit) => unit.factionId === "hold" && unit.qiArt !== null)
    .map((unit) => unit.id);
  if (primary.qiArt !== null && cultivatorIds.length > 0) {
    const art = primary.qiArt;
    // The art casts for every selected cultivator, so it is blocked only
    // when none of them can cast it.
    const anyReady = selected.some(
      (unit) => unit.factionId === "hold" && unit.qiArt?.ready === true,
    );
    const detail =
      art.cooldownSeconds > 0
        ? `Cooldown ${art.cooldownSeconds}s`
        : `${art.qiCost} Qi`;
    buttons.push({
      blockers: anyReady ? undefined : qiArtBlockers(primary),
      description: art.description,
      detail,
      disabled: !anyReady,
      hotkey: "C",
      id: "qi-art",
      intent: { type: "qi_art", unitIds: cultivatorIds },
      label: art.name,
      role: "Qi Art",
    });
    buttons.push({
      description:
        "Channel Qi in place for personal Essence, Merit, and healing (2.5× near Spirit Veins, Arrays, or Seclusion Pavilions).",
      detail: primary.meditating ? "Active" : "Seclusion",
      hotkey: "M",
      id: "meditate",
      intent: { type: "meditate", unitIds: cultivatorIds },
      label: primary.meditating ? "End Meditation" : "Meditate",
      pressed: primary.meditating,
      role: "Seclusion",
    });
  }
  if (primary.cultivation !== null) {
    const missing = primary.cultivation.missingRequirements;
    const rankCapped = primary.cultivation.rankCapReached === true;
    const maxRank = rankCapped || primary.cultivation.meritToNext === 0;
    const blocked = maxRank || missing.length > 0;
    const capLine = `${primary.cultivation.rank} is the ${primary.cultivation.rankCapLabel ?? "current scenario"} rank cap.`;
    let gateLines = missing;
    if (maxRank) gateLines = ["Already at the highest rank."];
    if (rankCapped) gateLines = [capLine];
    let breakthroughDetail = missing[0];
    if (rankCapped) breakthroughDetail = capLine;
    if (primary.breakthroughReady) {
      breakthroughDetail = `Ready! (${Math.round(primary.cultivation.successChance * 100)}%)`;
    }
    buttons.push({
      blockers: blocked ? blockersFromLines(gateLines) : undefined,
      description: primary.captain
        ? "Captain breakthrough: no Hall required for the first promotion. Other soldiers use a Cultivation Hall; Spirit Veins improve success."
        : "Advance a rank. The first breakthrough needs no pill; a Hall on a Spirit Vein improves success.",
      detail: breakthroughDetail,
      disabled: blocked,
      id: "breakthrough",
      intent: { type: "breakthrough", unitId: primary.id },
      label: "Breakthrough",
    });
  }
  for (const feed of model.pillFeeds) {
    if (feed.unitId !== primary.id) continue;
    buttons.push({
      description:
        feed.effectLabel ??
        "Feed this pill for its published cultivation effect.",
      detail: `Toxicity ${feed.preview.toxicity} → ${feed.preview.toxicityAfter}/${feed.preview.toxicityCap}`,
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
        description: schoolChoiceSummary(primary, school),
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
 * @param model - Shell model
 * @returns What the player can spend, for marking short amounts
 */
export function costStock(model: ShellModel): CostStock {
  return {
    popFree: model.pop === null ? null : model.pop.cap - model.pop.used,
    resources: model.resources,
  };
}

/**
 * The text line a priced button shows besides its cost row. A shortfall the
 * row already marks in red gets no text; other blockers are spelled out.
 * @param readout - Whether the action can run, why not, and if that is cost
 * @param cost - Price drawn on the button, if the snapshot published one
 * @param costText - Cost as text, for a snapshot without a structured price
 * @returns The line to show, or undefined for none
 */
function blockerDetail(
  readout: { allowed: boolean; reason?: string; shortfall?: boolean },
  cost: CostLine | undefined,
  costText: string,
): string | undefined {
  if (cost === undefined) return readout.allowed ? costText : readout.reason;
  if (readout.allowed || readout.shortfall === true) return undefined;
  return readout.reason;
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
  if (building.constructing) {
    buttons.push({
      description: "Remove this unfinished building and refund its full cost.",
      hotkey: "Del",
      id: "cancel-construction",
      intent: { buildingId: building.id, type: "cancel_construction" },
      label: "Cancel construction",
    });
  }
  if (!building.constructing && isTrainingBuilding(building.buildingType)) {
    buttons.push({
      description: "Choose where new units walk. Or just right-click the map.",
      id: "set-rally",
      intent: { buildingId: building.id, type: "rally" },
      label: "Set rally",
    });
  }
  // A running upgrade leaves the card; the Camp panel shows its progress.
  if (
    building.buildingType === "camp" &&
    model.holdUpgrade !== null &&
    (model.holdUpgrade.inProgress ?? null) === null
  ) {
    const upgrade = model.holdUpgrade;
    const cost =
      upgrade.cost === undefined ? undefined : costLineFrom(upgrade.cost);
    buttons.push({
      blockers: upgrade.allowed
        ? undefined
        : pricedActionBlockers(upgrade.reason, cost, costStock(model)),
      cost,
      description: upgrade.unlocks,
      detail: blockerDetail(upgrade, cost, upgrade.costLabel),
      disabled: !upgrade.allowed,
      id: "upgrade-hold",
      intent: { type: "upgrade" },
      label: `Upgrade to ${model.holdUpgrade.targetTier}`,
    });
  }
  for (const option of model.trainOptions) {
    if (option.buildingId !== building.id) continue;
    const guide = UNIT_TRAINING_GUIDES[option.classId];
    const popFree = model.pop === null ? null : model.pop.cap - model.pop.used;
    const quote =
      option.allowed && !isCultivatorClass(option.classId)
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
    const cost =
      option.cost === undefined
        ? undefined
        : costLineFrom(option.cost, {
            count: option.count,
            pop: option.pop,
            seconds: option.seconds,
          });
    buttons.push({
      batchCost: quote?.cost,
      batchCount: quote?.count,
      batchDetail: quote?.detail,
      blockers: option.allowed
        ? undefined
        : pricedActionBlockers(option.reason, cost, costStock(model)),
      cost,
      description: guide.description,
      detail: blockerDetail(option, cost, option.detail),
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
        description: option.effectLabel,
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
    model.rationOptions.some((option) => option.messHallId === building.id)
  ) {
    buttons.push({
      id: "rations",
      intent: { messHallId: building.id, type: "rations" },
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
  if (
    !building.constructing &&
    building.buildingType === "hell_market" &&
    model.marketRates.length > 0
  ) {
    for (const rate of model.marketRates) {
      buttons.push({
        description: rate.label,
        id: `market-${rate.sell}`,
        intent: { sell: rate.sell, type: "market" },
        label: `Sell ${resourceLabel(rate.sell)}`,
      });
    }
  }
  return buttons;
}

/** Shown on gather buttons when every villager already has a job. */
const NO_IDLE_BLOCKERS: readonly BlockerItem[] = [
  {
    fix: "Train a Villager at the Camp, or select busy villagers and right-click this node.",
    problem: "No idle villagers",
  },
];

/**
 * Explains why a cultivator's Qi Art cannot be cast yet.
 * @param unit - Cultivator whose art is not ready
 * @returns Cooldown and Qi shortfall items
 */
function qiArtBlockers(unit: ShellUnit): BlockerItem[] {
  const art = unit.qiArt;
  if (art === null) return [];
  const items: BlockerItem[] = [];
  if (art.cooldownSeconds > 0) {
    items.push({
      fix: "Wait for the cooldown to finish.",
      problem: `Recharging — ${art.cooldownSeconds}s left`,
    });
  }
  const qi = unit.qi ?? 0;
  if (qi < art.qiCost) {
    items.push({
      fix: "Qi refills over time; Meditate (M) or stand in a Spirit Array to refill faster.",
      problem: `Need ${art.qiCost} Qi (have ${qi})`,
    });
  }
  if (items.length === 0) items.push({ problem: "Not ready yet" });
  return items;
}

/**
 * @param resource - Stable resource id
 * @returns Player-facing resource name
 */
function resourceLabel(resource: ResourceId): string {
  if (resource === "spirit_herbs") return "Spirit Herbs";
  return resource.slice(0, 1).toUpperCase() + resource.slice(1);
}

/**
 * Buttons for an inspected resource node: put idle villagers to work on it.
 * @param model - Shell model
 * @param nodeId - Inspected node
 * @returns Gather actions
 */
function nodeButtons(
  model: ShellModel,
  nodeId: string,
  localPlayerId?: string,
): CardButton[] {
  const idle = idleVillagerIds(model.units, localPlayerId).length;
  const none = idle === 0;
  const blockers = none ? NO_IDLE_BLOCKERS : undefined;
  return [
    {
      blockers,
      description: "Send the next idle villager to gather here.",
      detail: none ? "No idle villagers" : `${idle} idle`,
      disabled: none,
      id: "gather-one",
      intent: { count: "one", nodeId, type: "gather_idle" },
      label: "Send 1 idle",
    },
    {
      blockers,
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
function generalButtons(
  model: ShellModel,
  localPlayerId?: string,
): CardButton[] {
  const idle = idleVillagerIds(model.units, localPlayerId).length;
  let completionDetail = "Boss still lives";
  let completionFix =
    model.exploration === null
      ? "Defeat the layer boss at the far side of the map."
      : "Find Cinderjaw's guarded hoard and defeat its camp when ready.";
  let completionProblem = "The boss still lives";
  if (model.exploration?.bossDefeated && !model.bossGateCleared) {
    completionDetail = "Hoard still guarded";
    completionFix = "Clear the remaining guards around Cinderjaw's hoard.";
    completionProblem = "Cinderjaw's prize is still guarded";
  }
  if (model.bossGateCleared) {
    completionDetail =
      model.exploration === null ? "Boss gate clear" : "Cinderjaw defeated";
  }
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
      blockers: model.bossGateCleared
        ? undefined
        : [
            {
              fix: completionFix,
              problem: completionProblem,
            },
          ],
      description:
        model.exploration === null
          ? "Go down to the next layer once the boss is dead."
          : "Finish once Cinderjaw and his hoard guards are dead. Remaining camps are optional.",
      detail: completionDetail,
      disabled: !model.bossGateCleared,
      id: "descend",
      intent: { type: "descend" },
      label: model.exploration === null ? "Descend" : "Finish expedition",
    },
  ];
}

/**
 * Lists the command card for the current selection.
 * @param model - Shell model
 * @param selection - Current selection
 * @param target - Inspected map feature or stockpile entry, if any
 * @param activeFormation - Formation selected for grouped military movement
 * @param localPlayerId - Multiplayer owner whose actions should be exposed
 * @returns Buttons in display order
 */
export function buildCardButtons(
  model: ShellModel,
  selection: Selection,
  target: InspectTarget | null = null,
  activeFormation: FormationId = "ranks",
  localPlayerId?: string,
  attackMoving = false,
): CardButton[] {
  if (target?.kind === "node") {
    return nodeButtons(model, target.id, localPlayerId);
  }
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
  if (target !== null) return generalButtons(model, localPlayerId);

  const ownedSelection =
    localPlayerId === undefined
      ? selection
      : {
          ...selection,
          unitIds: selection.unitIds.filter((unitId) => {
            const unit = model.units.find((entry) => entry.id === unitId);
            return (
              unit !== undefined && isLocalPlayerOwned(unit, localPlayerId)
            );
          }),
        };
  const building = model.buildings.find(
    (item) => item.id === selection.buildingId,
  );
  if (building !== undefined && !isLocalPlayerOwned(building, localPlayerId)) {
    return ownedSelection.unitIds.length > 0
      ? unitButtons(model, ownedSelection, activeFormation, attackMoving)
      : generalButtons(model, localPlayerId);
  }

  const context =
    building === undefined
      ? unitButtons(model, ownedSelection, activeFormation, attackMoving)
      : buildingButtons(model, building);
  if (ownedSelection.unitIds.length > 0 || selection.buildingId !== null) {
    return context;
  }
  return generalButtons(model, localPlayerId);
}

import { REALMS } from "../logic/cultivation/data";
import type { BreakthroughDefinition } from "../logic/cultivation/types";
import { LAYER_TABLE } from "../logic/layers/layerTable";
import type { Command, SchoolId } from "../logic/types";
import type { ConfirmIntent } from "./card";
import { pillEffectLabel } from "./pillGuidance";
import {
  schoolPassiveDescription,
  schoolQiArtDescription,
} from "./schoolGuidance";
import type { ShellBuilding, ShellModel, ShellUnit } from "./shellModel";
import {
  breakthroughToast,
  feedBlockMessage,
  formatChance,
  populationToast,
  RESOURCE_COPY,
  SCHOOL_LABEL,
  toxicityLabel,
} from "./text";

/** One labeled number or sentence in a confirm dialog. */
export interface CommitRow {
  label: string;
  value: string;
}

/** The confirm step. `command` is null when the published preview blocks it. */
export interface CommitModel {
  blockedMessage: string | null;
  command: Command | null;
  confirmLabel: string;
  revive: { hallId: string; heroId: string } | null;
  rows: readonly CommitRow[];
  title: string;
  tradeAmount: boolean;
}

/**
 * Finds a unit that is still on the snapshot.
 * @param model - Shell model
 * @param unitId - Selected unit
 * @returns The unit, or null
 */
function unitById(model: ShellModel, unitId: string): ShellUnit | null {
  return model.units.find((unit) => unit.id === unitId) ?? null;
}

/**
 * A confirm that cannot emit a command.
 * @param title - Dialog title
 * @param message - Why the commit is blocked
 * @param rows - Numbers already on screen
 * @param confirmLabel - Attempt button label
 * @returns A blocked confirm model
 */
function blocked(
  title: string,
  message: string,
  rows: readonly CommitRow[],
  confirmLabel: string,
): CommitModel {
  return {
    blockedMessage: message,
    command: null,
    confirmLabel,
    revive: null,
    rows,
    title,
    tradeAmount: false,
  };
}

/**
 * Chooses the eligible Hall with the largest Spirit Vein bonus, breaking ties by id.
 * @param model - Shell model with completed buildings
 * @param ownerId - Owning co-op player, or undefined in solo play
 * @returns The best Hall to use, or null
 */
function bestCultivationHall(
  model: ShellModel,
  ownerId: string | undefined,
): ShellBuilding | null {
  let best: ShellBuilding | null = null;
  for (const building of model.buildings) {
    if (building.buildingType !== "cultivation_hall" || building.constructing) {
      continue;
    }
    if (building.ownerId !== ownerId) continue;
    if (best === null) {
      best = building;
      continue;
    }
    const bonus = building.breakthroughSuccessBonus;
    if (bonus > best.breakthroughSuccessBonus) {
      best = building;
      continue;
    }
    if (bonus === best.breakthroughSuccessBonus && building.id < best.id) {
      best = building;
    }
  }
  return best;
}

/**
 * Formats the actual consumables for one rank transition.
 * @param definition - Breakthrough requirements from the realm catalog
 * @returns Pill/material cost, or the free introductory transition
 */
function breakthroughCostLabel(definition: BreakthroughDefinition): string {
  const parts = Object.entries(definition.materials).map(
    ([resource, amount]) => {
      const copy = RESOURCE_COPY[resource as keyof typeof RESOURCE_COPY];
      return `${amount} ${copy.name}`;
    },
  );
  if (definition.requiresPill !== false) parts.push("1 Breakthrough Pill");
  return parts.length === 0 ? "No pill or tier materials" : parts.join(" · ");
}

/**
 * Explains a school's modifier in the current scenario.
 * @param model - Shell model with the layer banner
 * @param school - School being considered
 * @returns Exact layer modifier and scenario name
 */
function schoolLayerModifierLabel(model: ShellModel, school: SchoolId): string {
  const layer = LAYER_TABLE.layers.find(
    (candidate) => candidate.name === model.banner.name,
  );
  const scenario = layer?.name ?? model.banner.name;
  const multiplier = layer?.schoolModifiers[school] ?? 1;
  if (multiplier > 1) {
    return `+${Math.round((multiplier - 1) * 100)}% school effect in ${scenario}`;
  }
  if (multiplier < 1) {
    return `-${Math.round((1 - multiplier) * 100)}% school effect in ${scenario}`;
  }
  return `Neutral school effect in ${scenario}`;
}

/**
 * Builds the breakthrough confirm from the unit's published cultivation view.
 * @param model - Shell model
 * @param unitId - Unit that would channel
 * @returns The confirm model
 */
function breakthroughCommit(model: ShellModel, unitId: string): CommitModel {
  const unit = unitById(model, unitId);
  if (unit === null || unit.cultivation === null) {
    return blocked(
      "Breakthrough",
      "Cultivation unavailable.",
      [],
      "Begin breakthrough",
    );
  }
  const cultivation = unit.cultivation;
  if (cultivation.rankCapReached === true) {
    return blocked(
      "Breakthrough",
      `${cultivation.rank} is the ${cultivation.rankCapLabel ?? "current scenario"} rank cap.`,
      [
        {
          label: "Rank cap",
          value: `${cultivation.rankCapLabel ?? "Current scenario"} · ${cultivation.rank}`,
        },
      ],
      "Begin breakthrough",
    );
  }
  const currentRealm = REALMS.find((realm) => realm.rank === cultivation.rank);
  const definition = currentRealm?.breakthrough;
  const targetRealm = REALMS.find(
    (realm) => realm.rank === definition?.targetRank,
  );
  const hall = bestCultivationHall(model, unit.ownerId);
  const hallBonus = hall?.breakthroughSuccessBonus ?? 0;
  let route = "Cultivation Hall required";
  if (unit.captain && hall === null) {
    route = "Captain battlefield · no Hall required";
  } else if (hall !== null) {
    route = `${hall.name} · ${hallBonus > 0 ? `+${Math.round(hallBonus * 100)}% from Spirit Vein` : "no Spirit Vein bonus"}`;
  }
  const rows: CommitRow[] = [
    {
      label: "Rank",
      value: definition
        ? `${cultivation.rank} → ${definition.targetRank}`
        : `${cultivation.rank} · no next rank`,
    },
    { label: "Chance", value: formatChance(cultivation.successChance) },
    { label: "Channel", value: `${definition?.channelSeconds ?? 20}s` },
    {
      label: "Cost",
      value: definition
        ? breakthroughCostLabel(definition)
        : "No promotion available",
    },
    {
      label: "Payoff",
      value: targetRealm
        ? `×${targetRealm.statMultiplier} health & damage · school unlock`
        : "No promotion available",
    },
    {
      label: "Failure",
      value: "Keep Merit · halve Personal Essence · injured 45s",
    },
    { label: "Route", value: route },
    ...cultivation.missingRequirements.map((line) => ({
      label: "Missing",
      value: line,
    })),
  ];
  if (cultivation.missingRequirements.length > 0) {
    return blocked(
      "Breakthrough",
      breakthroughToast(cultivation.missingRequirements),
      rows,
      "Begin breakthrough",
    );
  }
  if (hall === null && !unit.breakthroughReady) {
    return blocked(
      "Breakthrough",
      "Cultivation Hall is not on the map.",
      rows,
      "Begin breakthrough",
    );
  }
  return {
    blockedMessage: null,
    command:
      hall === null
        ? { type: "start_breakthrough", unitId }
        : { hallId: hall.id, type: "start_breakthrough", unitId },
    confirmLabel: "Begin breakthrough",
    revive: null,
    rows,
    title: "Breakthrough",
    tradeAmount: false,
  };
}

/**
 * Builds the pill-feed confirm from the published pill preview.
 * @param model - Shell model
 * @param unitId - Recipient
 * @param pillId - Pill to feed
 * @returns The confirm model
 */
function feedCommit(
  model: ShellModel,
  unitId: string,
  pillId: string,
): CommitModel {
  const unit = unitById(model, unitId);
  const feed = model.pillFeeds.find(
    (item) => item.unitId === unitId && item.preview.pillId === pillId,
  );
  if (unit === null || feed === undefined) {
    return blocked("Feed pill", "Pill unavailable.", [], "Feed pill");
  }
  const rows: CommitRow[] = [
    {
      label: "Effect",
      value:
        feed.effectLabel ??
        pillEffectLabel(feed.preview.pillId, feed.preview.projectedAmount),
    },
    { label: "Duration", value: "Permanent for this run" },
    { label: "School", value: feed.schoolMatchLabel },
    { label: "Toxicity", value: toxicityLabel(feed.preview) },
  ];
  if (!feed.preview.canFeed) {
    return blocked(
      `Feed ${feed.pillName}`,
      feedBlockMessage(feed.preview, feed.schoolMatchLabel),
      rows,
      "Feed pill",
    );
  }
  return {
    blockedMessage: null,
    command: { pillId, type: "feed_pill", unitId },
    confirmLabel: "Feed pill",
    revive: null,
    rows,
    title: `Feed ${feed.pillName}`,
    tradeAmount: false,
  };
}

/**
 * Builds a school-choice confirm. The lock is stated before the command.
 * @param model - Shell model
 * @param unitId - Unit choosing
 * @param school - School the button named
 * @returns The confirm model
 */
function schoolCommit(
  model: ShellModel,
  unitId: string,
  school: SchoolId,
): CommitModel {
  const unit = unitById(model, unitId);
  const name = SCHOOL_LABEL[school];
  if (unit === null || unit.cultivation === null) {
    return blocked(name, "Cultivation unavailable.", [], `Lock ${name}`);
  }
  const art = schoolQiArtDescription(unit, school);
  return {
    blockedMessage: null,
    command: { school, type: "choose_school", unitId },
    confirmLabel: `Lock ${name}`,
    revive: null,
    rows: [
      { label: "Passive", value: schoolPassiveDescription(school) },
      { label: "Scenario", value: schoolLayerModifierLabel(model, school) },
      ...(art === null ? [] : [{ label: "Qi Art", value: art }]),
      { label: "Lock", value: `${name} · permanent for this run` },
    ],
    title: `Choose ${name}`,
    tradeAmount: false,
  };
}

/**
 * Builds the confirm dialog for a command-card intent.
 * @param model - Shell model
 * @param intent - Intent waiting for commit
 * @param tradeAmount - Market amount typed in the dialog
 * @returns The dialog model, or null when the intent is not a confirm
 */
export function buildConfirm(
  model: ShellModel,
  intent: ConfirmIntent,
  tradeAmount: number,
): CommitModel {
  if (intent.type === "breakthrough") {
    return breakthroughCommit(model, intent.unitId);
  }
  if (intent.type === "feed") {
    return feedCommit(model, intent.unitId, intent.pillId);
  }
  if (intent.type === "school") {
    return schoolCommit(model, intent.unitId, intent.school);
  }
  if (intent.type === "brew") {
    const option = model.brewOptions.find(
      (item) =>
        item.furnaceId === intent.furnaceId && item.pillId === intent.pillId,
    );
    if (option === undefined) {
      return blocked("Brew", "Pill unavailable.", [], "Brew pill");
    }
    const rows = [
      { label: "Pill", value: option.name },
      { label: "Brew", value: option.detail },
      ...(option.effectLabel === undefined
        ? []
        : [{ label: "Effect", value: option.effectLabel }]),
    ];
    if (!option.allowed) {
      return blocked(
        `Brew ${option.name}`,
        option.reason ?? "That pill cannot be brewed.",
        rows,
        "Brew pill",
      );
    }
    return {
      blockedMessage: null,
      command: {
        furnaceId: intent.furnaceId,
        pillId: intent.pillId,
        type: "brew_pill",
      },
      confirmLabel: "Brew pill",
      revive: null,
      rows,
      title: `Brew ${option.name}`,
      tradeAmount: false,
    };
  }
  if (intent.type === "summon") {
    const calamity = model.calamities.find(
      (item) =>
        item.altarId === intent.altarId &&
        item.calamityId === intent.calamityId,
    );
    if (calamity === undefined) {
      return blocked("Summon", "Calamity unavailable.", [], "Summon");
    }
    const rows = [
      { label: "Calamity", value: calamity.name },
      { label: "School", value: SCHOOL_LABEL[calamity.school] },
      { label: "Cost", value: calamity.costLabel },
    ];
    if (!calamity.allowed) {
      return blocked(
        `Summon ${calamity.name}`,
        populationToast(calamity.reasons.join(". ")),
        rows,
        "Summon",
      );
    }
    return {
      blockedMessage: null,
      command: {
        altarId: intent.altarId,
        calamityId: intent.calamityId,
        type: "summon_calamity",
      },
      confirmLabel: "Summon",
      revive: null,
      rows,
      title: `Summon ${calamity.name}`,
      tradeAmount: false,
    };
  }
  if (intent.type === "revive") {
    const hero = model.revives.find(
      (item) => item.heroId === intent.heroId && item.hallId === intent.hallId,
    );
    if (hero === undefined) {
      return blocked("Revive", "Hero unavailable.", [], "Revive");
    }
    const rows = [
      { label: "Hero", value: hero.name },
      { label: "Cost", value: hero.costLabel },
    ];
    if (!hero.allowed) {
      return blocked(
        `Revive ${hero.name}`,
        populationToast(hero.reasons.join(". ")),
        rows,
        "Revive",
      );
    }
    return {
      blockedMessage: null,
      command: null,
      confirmLabel: "Revive",
      revive: { hallId: hero.hallId, heroId: hero.heroId },
      rows,
      title: `Revive ${hero.name}`,
      tradeAmount: false,
    };
  }
  if (intent.type === "rations") {
    const rations =
      model.rationOptions.find(
        (option) => option.messHallId === intent.messHallId,
      ) ??
      (model.rations?.messHallId === intent.messHallId ? model.rations : null);
    if (rations === null) {
      return blocked("Rations", "Rations unavailable.", [], "Issue rations");
    }
    const rows = [{ label: "Rations", value: rations.detail }];
    if (!rations.allowed) {
      return blocked(
        "Rations",
        rations.reason ?? "Rations cannot be issued.",
        rows,
        "Issue rations",
      );
    }
    return {
      blockedMessage: null,
      command: {
        messHallId: rations.messHallId,
        type: "issue_rations",
        unitIds: [...rations.unitIds],
      },
      confirmLabel: "Issue rations",
      revive: null,
      rows,
      title: "Issue rations",
      tradeAmount: false,
    };
  }
  if (intent.type === "upgrade") {
    const upgrade = model.holdUpgrade;
    if (upgrade === null) {
      return blocked(
        "Upgrade Hold",
        "Upgrade unavailable.",
        [],
        "Upgrade Hold",
      );
    }
    const rows = [
      {
        label: "Tier",
        value: `${upgrade.currentTier} → ${upgrade.targetTier}`,
      },
      { label: "Cost", value: upgrade.costLabel },
      ...(upgrade.unlocks === undefined
        ? []
        : [{ label: "Unlocks", value: upgrade.unlocks }]),
    ];
    if (!upgrade.allowed) {
      return blocked(
        "Upgrade Hold",
        upgrade.reason ?? "The Hold cannot upgrade yet.",
        rows,
        "Upgrade Hold",
      );
    }
    return {
      blockedMessage: null,
      command: { type: "upgrade_hold" },
      confirmLabel: "Upgrade Hold",
      revive: null,
      rows,
      title: `Upgrade to ${upgrade.targetTier}`,
      tradeAmount: false,
    };
  }
  if (intent.type === "market") {
    const rate = model.marketRates.find(
      (candidate) =>
        intent.sell === undefined || candidate.sell === intent.sell,
    );
    if (rate === undefined) {
      return blocked("Trade", "Market unavailable.", [], "Trade");
    }
    const rows = [{ label: "Rate", value: rate.label }];
    if (!(tradeAmount > 0) || !Number.isFinite(tradeAmount)) {
      return blocked("Trade", "Enter an amount.", rows, "Trade");
    }
    return {
      blockedMessage: null,
      command: {
        amount: tradeAmount,
        buy: rate.buy,
        sell: rate.sell,
        type: "market_trade",
      },
      confirmLabel: "Trade",
      revive: null,
      rows,
      title: `Sell ${rate.sell === "spirit_herbs" ? "Spirit Herbs" : rate.sell.slice(0, 1).toUpperCase() + rate.sell.slice(1)}`,
      tradeAmount: true,
    };
  }
  const rows: CommitRow[] = [];
  const label = model.exploration === null ? "Descend" : "Finish expedition";
  const blockedMessage =
    model.exploration?.bossDefeated === true
      ? "Hoard still guarded"
      : "Boss still lives";
  if (!model.bossGateCleared) {
    return blocked(label, blockedMessage, rows, label);
  }
  return {
    blockedMessage: null,
    command: { type: "descend" },
    confirmLabel: label,
    revive: null,
    rows,
    title: label,
    tradeAmount: false,
  };
}

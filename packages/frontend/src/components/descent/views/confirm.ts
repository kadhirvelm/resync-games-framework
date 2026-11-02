import type { Command, SchoolId } from "../logic/types";
import type { ConfirmIntent } from "./card";
import type { ShellModel, ShellUnit } from "./shellModel";
import {
  breakthroughToast,
  feedBlockMessage,
  formatChance,
  populationToast,
  SCHOOL_LABEL,
  schoolCommitValue,
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
 * The three numbers every cultivation commit must show.
 * @param unit - Unit being committed
 * @param schoolValue - School-match sentence
 * @param toxicity - Toxicity sentence
 * @returns Success, toxicity, and school rows
 */
function cultivationRows(
  unit: ShellUnit,
  schoolValue: string,
  toxicity: string,
): CommitRow[] {
  const chance =
    unit.cultivation === null
      ? "Unpublished"
      : formatChance(unit.cultivation.successChance);
  return [
    { label: "Chance", value: chance },
    { label: "Toxicity", value: toxicity },
    { label: "School", value: schoolValue },
  ];
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
  const rows = [
    ...cultivationRows(
      unit,
      schoolCommitValue(cultivation.school),
      `${cultivation.toxicity}/${cultivation.toxicityCap}`,
    ),
    ...cultivation.missingRequirements.map((line) => ({
      label: "Missing",
      value: line,
    })),
  ];
  const hall = model.buildings.find(
    (building) => building.buildingType === "cultivation_hall",
  );
  if (cultivation.missingRequirements.length > 0) {
    return blocked(
      "Breakthrough",
      breakthroughToast(cultivation.missingRequirements),
      rows,
      "Begin breakthrough",
    );
  }
  if (hall === undefined) {
    return blocked(
      "Breakthrough",
      "Cultivation Hall is not on the map.",
      rows,
      "Begin breakthrough",
    );
  }
  return {
    blockedMessage: null,
    command: { hallId: hall.id, type: "start_breakthrough", unitId },
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
  const rows = [
    ...cultivationRows(
      unit,
      feed.schoolMatchLabel,
      toxicityLabel(feed.preview),
    ),
    {
      label: "Effect",
      value: String(feed.preview.projectedAmount),
    },
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
  return {
    blockedMessage: null,
    command: { school, type: "choose_school", unitId },
    confirmLabel: `Lock ${name}`,
    revive: null,
    rows: cultivationRows(
      unit,
      `${name} · locked`,
      `${unit.cultivation.toxicity}/${unit.cultivation.toxicityCap}`,
    ),
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
    const rations = model.rations;
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
    const rate = model.marketRates[0];
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
      title: "Hell Market",
      tradeAmount: true,
    };
  }
  const rows: CommitRow[] = [];
  if (!model.bossGateCleared) {
    return blocked("Descend", "Boss still lives", rows, "Descend");
  }
  return {
    blockedMessage: null,
    command: { type: "descend" },
    confirmLabel: "Descend",
    revive: null,
    rows,
    title: "Descend",
    tradeAmount: false,
  };
}

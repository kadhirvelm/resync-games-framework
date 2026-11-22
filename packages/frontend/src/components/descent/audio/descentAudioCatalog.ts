import type { AudioAsset } from "@resync-game-framework/api";
import {
  ASHEN_GATE_AUDIO,
  type AshenGateAudioId,
  ashenGateAudioPrompt,
} from "../data/layers/ashen_gate/audio";
import type { ClassId } from "../logic/types";
import type { FxReadout, NoticeReadout } from "../views/presentation";
import type {
  DescentUnitAcknowledgement,
  DescentUnitAcknowledgementKind,
} from "./descentCommandAck";

/** Generated clips resolved by their stable Descent ids. */
export type DescentAudioCatalog = Partial<Record<AshenGateAudioId, AudioAsset>>;

/**
 * Resolves only current, exact prompt versions from the shared audio gallery.
 * @param clips - Generated audio assets, newest first
 * @returns Descent clips keyed by runtime id
 */
export function resolveDescentAudioCatalog(
  clips: readonly AudioAsset[],
): DescentAudioCatalog {
  const catalog: DescentAudioCatalog = {};
  for (const spec of ASHEN_GATE_AUDIO) {
    const prompt = ashenGateAudioPrompt(spec);
    const clip = clips.find((candidate) => candidate.prompt === prompt);
    if (clip !== undefined) catalog[spec.id] = clip;
  }
  return catalog;
}

/**
 * Selects the one-shot paired with a published renderer effect.
 * @param effect - Visible simulation effect
 * @returns Audio id, or null when the effect is visual-only
 */
export function audioIdForFx(effect: FxReadout): AshenGateAudioId | null {
  if (effect.kind === "melee") return "melee-attack";
  if (effect.kind === "projectile") {
    return effect.sound === "magic" ? "magic-attack" : "projectile-attack";
  }
  if (effect.kind === "damage") return "combat-impact";
  if (effect.kind === "death") return "unit-death";
  if (effect.kind === "collapse") {
    return effect.sound === "impact" ? "combat-impact" : "building-collapse";
  }
  if (effect.kind === "heal") return "heal";
  if (effect.kind === "ascend") return "breakthrough";
  if (effect.kind === "qi_nova") return "magic-attack";
  if (effect.kind === "spawn") {
    return effect.sound === "villager" ? "villager-born" : "soldier-born";
  }
  return null;
}

/** Exact generated response ids for every selectable class and gesture. */
const UNIT_ACKNOWLEDGEMENT_AUDIO = {
  adept: { command: "adept-command", select: "adept-select" },
  breaker: { command: "breaker-command", select: "breaker-select" },
  cultivator: { command: "cultivator-command", select: "cultivator-select" },
  formation_master: {
    command: "formation_master-command",
    select: "formation_master-select",
  },
  hunter: { command: "hunter-command", select: "hunter-select" },
  raider: { command: "raider-command", select: "raider-select" },
  rider: { command: "rider-command", select: "rider-select" },
  sword_sage: {
    command: "sword_sage-command",
    select: "sword_sage-select",
  },
  villager: { command: "villager-command", select: "villager-select" },
  warden: { command: "warden-command", select: "warden-select" },
} as const satisfies Record<
  ClassId,
  Record<DescentUnitAcknowledgementKind, AshenGateAudioId>
>;

/**
 * Resolves the class-specific response to a selection or issued order.
 * @param acknowledgement - Unit class and player gesture
 * @returns Generated response clip id
 */
export function audioIdForUnitAcknowledgement(
  acknowledgement: DescentUnitAcknowledgement,
): AshenGateAudioId {
  return UNIT_ACKNOWLEDGEMENT_AUDIO[acknowledgement.classId][
    acknowledgement.kind
  ];
}

/**
 * Gives rejected actions an immediate cue and boss taunts a distinct roar.
 * Notice semantics stay in the simulation; this presentation-only mapping
 * deliberately recognizes its published boss dialogue and phase callout.
 * @param notice - Newly published game notice
 * @returns Boss taunt or denied cue for warnings, otherwise null
 */
export function audioIdForNotice(
  notice: NoticeReadout,
): AshenGateAudioId | null {
  if (notice.tone !== "warn") return null;
  if (isBossTauntNotice(notice.text)) return "boss-taunt";
  return "denied";
}

/**
 * Recognizes Cinderjaw's introduction and phase transition without changing
 * the warn tone used to present either notice.
 * @param text - Published notice text
 * @returns Whether this notice is a boss taunt rather than a rejected action
 */
function isBossTauntNotice(text: string): boolean {
  if (/^Cinderjaw:\s*[“"]/u.test(text)) return true;
  return /^Cinderjaw roars\s+[—-]\s+the vents spit imps!$/u.test(text);
}

/**
 * Chooses the generated music bed for the current encounter.
 * @param state - Boss and live horde presence
 * @returns Music asset id
 */
export function musicIdForEncounter(state: {
  boss: boolean;
  liveEnemies: number;
}): AshenGateAudioId {
  if (state.boss) return "boss-music";
  if (state.liveEnemies > 0) return "battle-music";
  return "hold-music";
}

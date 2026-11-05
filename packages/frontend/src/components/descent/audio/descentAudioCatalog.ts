import type { AudioAsset } from "@resync-game-framework/api";
import {
  ASHEN_GATE_AUDIO,
  type AshenGateAudioId,
  ashenGateAudioPrompt,
} from "../data/layers/ashen_gate/audio";
import type { FxReadout, NoticeReadout } from "../views/presentation";

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
  if (effect.kind === "spawn") {
    return effect.sound === "villager" ? "villager-born" : "soldier-born";
  }
  return null;
}

/**
 * Gives rejected actions an immediate restrained acknowledgement.
 * @param notice - Newly published game notice
 * @returns Denied cue for warnings, otherwise null
 */
export function audioIdForNotice(
  notice: NoticeReadout,
): AshenGateAudioId | null {
  return notice.tone === "warn" ? "denied" : null;
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

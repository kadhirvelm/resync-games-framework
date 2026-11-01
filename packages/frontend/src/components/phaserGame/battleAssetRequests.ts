import type { CombatSetup } from "../tower/logic/combat";
import type { BattleReport } from "../tower/logic/run";
import { resolveBattleAssetUrl } from "./resolveBattleAssetUrl";

/** Texture key for the room backdrop. */
export const BACKDROP_IMAGE_KEY = "battle-backdrop";

/** Room details the battle shows in its banner. */
export interface BattleRoomInfo {
  backdropUrl?: string;
  floor: number;
  floorCount: number;
  isBoss: boolean;
  title: string;
}

/** Everything the battle scene needs from the run. */
export interface BattleSceneInput {
  /** Called once when the battle ends, after the outcome has been shown. */
  onFinish: (report: BattleReport) => void;
  /**
   * Multiplier on battle delays and tween durations from the player's
   * battle speed setting. 1 is normal; lower is faster.
   */
  pace: number;
  /** Skip camera shakes, flashes, and drifting particles */
  reducedMotion: boolean;
  room: BattleRoomInfo;
  setup: CombatSetup;
}

/** One file the battle scene queues in Phaser's loader. */
export interface BattleAssetRequest {
  key: string;
  url: string;
}

/**
 * @param unitId - Party member or enemy id
 * @returns Texture key for that unit's portrait
 */
export function unitImageKey(unitId: string): string {
  return `battle-unit-${unitId}`;
}

/**
 * @param cardId - Card definition id, shared by every copy
 * @returns Texture key for that card's illustration
 */
export function cardImageKey(cardId: string): string {
  return `battle-card-${cardId}`;
}

/**
 * Lists every image the battle can draw. Units and cards without art are
 * skipped and keep their painted stand-ins. Each card design loads once.
 * @param input - Battle scene input
 * @param backendOrigin - Backend origin used to resolve `/static/...` paths
 * @returns Loader requests: backdrop, party, enemies, then cards
 */
export function listBattleAssetRequests(
  input: Pick<BattleSceneInput, "room" | "setup">,
  backendOrigin = process.env.NEXT_PUBLIC_API_CLIENT_URL ?? "",
): BattleAssetRequest[] {
  const requests: BattleAssetRequest[] = [];
  const seen = new Set<string>();

  /**
   * @param key - Texture key
   * @param url - Asset URL, possibly blank
   */
  const push = (key: string, url: string | undefined): void => {
    const resolved = resolveBattleAssetUrl(url ?? "", backendOrigin);
    if (resolved === undefined || seen.has(key)) {
      return;
    }
    seen.add(key);
    requests.push({ key, url: resolved });
  };

  push(BACKDROP_IMAGE_KEY, input.room.backdropUrl);
  for (const unit of input.setup.party) {
    push(unitImageKey(unit.id), unit.portraitUrl);
  }
  for (const enemy of input.setup.enemies) {
    push(unitImageKey(enemy.id), enemy.imageUrl);
  }
  for (const card of input.setup.cards) {
    push(cardImageKey(card.definition.id), card.definition.imageUrl);
  }
  return requests;
}

import type { CultivatorRecord } from "@towers-of-coreborn/api";
import { toUnitSprite } from "./buildTowerContent";
import { BUILT_IN_CULTIVATOR } from "./builtInContent";
import type { CultivatorDefinition, TowerContent } from "./towerTypes";

/**
 * The player's cultivators in play: who they are and how they look. Realm
 * portraits during a climb live in `cultivatorRealm`.
 */

/** Stand-in name for a climb whose cultivator was released. */
export const UNKNOWN_CULTIVATOR_NAME = "A cultivator";

/**
 * @param record - Cultivator from the server
 * @returns Built-in stats and starting deck under the cultivator's own
 * name, title, realm portraits, and battle sprite
 */
export function cultivatorDefinition(
  record: CultivatorRecord,
): CultivatorDefinition {
  const realms = record.portrait.asset?.levels.map((level) => level.url) ?? [];
  const sprite = record.sprite.asset;
  return {
    ...BUILT_IN_CULTIVATOR,
    name: record.name,
    portraitUrl: realms[0],
    realmPortraitUrls: realms.length > 0 ? realms : undefined,
    sprite: sprite ? toUnitSprite(sprite) : undefined,
    title: record.title,
  };
}

/**
 * Puts a cultivator's identity on a tower. The tower keeps its own stats
 * and starting deck.
 * @param content - Tower content
 * @param cultivator - Who climbs it
 * @returns The content with that cultivator's name, title, and art
 */
export function withCultivator(
  content: TowerContent,
  cultivator: CultivatorDefinition,
): TowerContent {
  return {
    ...content,
    cultivator: {
      ...content.cultivator,
      name: cultivator.name,
      portraitUrl: cultivator.portraitUrl,
      realmPortraitUrls: cultivator.realmPortraitUrls,
      sprite: cultivator.sprite,
      title: cultivator.title,
    },
  };
}

/**
 * @param record - Cultivator from the server
 * @returns Whether its portrait or sprite is being painted
 */
export function isCultivatorPainting(record: CultivatorRecord): boolean {
  return (
    record.portrait.status === "painting" || record.sprite.status === "painting"
  );
}

/**
 * @param record - Cultivator from the server
 * @returns One line on the state of its art, for roster cards
 */
export function cultivatorArtLine(record: CultivatorRecord): string {
  if (isCultivatorPainting(record)) {
    return "Being painted…";
  }
  const failed = [record.portrait, record.sprite].some(
    (part) => part.status === "failed",
  );
  if (failed) {
    return "Painting failed";
  }
  if (record.portrait.asset && record.sprite.asset) {
    return "Portrait and battle sprite";
  }
  if (record.portrait.asset) {
    return "Portrait only";
  }
  if (record.sprite.asset) {
    return "Battle sprite only";
  }
  return "Not yet painted";
}

import calamitiesJson from "../../data/calamities.json";
import heroesJson from "../../data/heroes.json";
import type { RealmId, SchoolId } from "../types";
import type {
  CalamityDefinition,
  CalamityTable,
  HeroDefinition,
  HeroTable,
  HoldTier,
} from "./types";

const SCHOOL_IDS: readonly SchoolId[] = ["ember", "rime", "blood"];
const COMBAT_CLASS_IDS = ["warden", "hunter", "raider", "breaker", "adept"];
const HOLD_TIERS: readonly HoldTier[] = ["Camp", "Stronghold", "Citadel"];

/** Realm ids from lowest to highest; the index is the realm's step count. */
export const REALM_ORDER: readonly RealmId[] = [
  "qi_gathering",
  "foundation",
  "core_formation",
  "nascent_soul",
  "ascension",
];

/** The realm a hero must reach before picking a school (Sworn). */
export const SCHOOL_CHOICE_REALM: RealmId = "foundation";

/**
 * @param condition - Must be true for the data to be valid
 * @param message - Error text when it is not
 */
function assertData(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Descent heroes data: ${message}`);
  }
}

/**
 * Checks one hero definition against the shared vocabulary.
 *
 * @param hero - Hero row from `heroes.json`
 */
function validateHero(hero: HeroDefinition): void {
  assertData(hero.ultimate.executes === false, `${hero.id} ultimate executes`);
  if (hero.schoolChoice === "preset") {
    assertData(
      hero.schoolId !== null && SCHOOL_IDS.includes(hero.schoolId),
      `${hero.id} needs a preset school`,
    );
  }
  if (hero.classId === null) {
    assertData(
      COMBAT_CLASS_IDS.includes(hero.provisionalClassId ?? ""),
      `${hero.id} has an open class but no provisional class`,
    );
    return;
  }
  assertData(
    COMBAT_CLASS_IDS.includes(hero.classId),
    `${hero.id} has unknown class`,
  );
}

/**
 * Checks one Calamity definition against the shared vocabulary.
 *
 * @param calamity - Calamity row from `calamities.json`
 */
function validateCalamity(calamity: CalamityDefinition): void {
  assertData(
    SCHOOL_IDS.includes(calamity.schoolId),
    `${calamity.id} has unknown school`,
  );
  assertData(
    COMBAT_CLASS_IDS.includes(calamity.classId),
    `${calamity.id} has unknown class`,
  );
  assertData(calamity.bossCores >= 1, `${calamity.id} must cost a boss core`);
}

/**
 * Validates raw hero JSON and returns it typed.
 *
 * @param raw - Parsed `heroes.json`
 * @returns The hero table
 * @throws When a row breaks the shared contract
 */
export function parseHeroTable(raw: unknown): HeroTable {
  const table = raw as HeroTable;
  assertData(table.aliveCap > 0, "aliveCap must be positive");
  assertData(HOLD_TIERS.includes(table.hallMinTier), "unknown hallMinTier");
  for (const hero of table.heroes) {
    validateHero(hero);
  }
  return table;
}

/**
 * Validates raw Calamity JSON and returns it typed.
 *
 * @param raw - Parsed `calamities.json`
 * @returns The Calamity table
 * @throws When a row breaks the shared contract
 */
export function parseCalamityTable(raw: unknown): CalamityTable {
  const table = raw as CalamityTable;
  assertData(table.maxActive === 1, "only one Calamity may be active");
  assertData(HOLD_TIERS.includes(table.altarMinTier), "unknown altarMinTier");
  for (const calamity of table.calamities) {
    validateCalamity(calamity);
  }
  return table;
}

/** Hero Hall data. */
export const HERO_TABLE: HeroTable = parseHeroTable(heroesJson);

/** Calamity Altar data. */
export const CALAMITY_TABLE: CalamityTable = parseCalamityTable(calamitiesJson);

/**
 * @param tier - Building's current tier
 * @param minimum - Tier the gate needs
 * @returns Whether `tier` is at or above `minimum`
 */
export function meetsTier(tier: HoldTier, minimum: HoldTier): boolean {
  return HOLD_TIERS.indexOf(tier) >= HOLD_TIERS.indexOf(minimum);
}

/**
 * @param realmId - Realm to rank
 * @returns Steps above Ashborn (0 for `qi_gathering`)
 */
export function realmIndex(realmId: RealmId): number {
  return Math.max(0, REALM_ORDER.indexOf(realmId));
}

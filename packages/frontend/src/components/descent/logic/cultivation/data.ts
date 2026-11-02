import pillsJson from "../../data/pills.json";
import realmsJson from "../../data/realms.json";
import treasuresJson from "../../data/treasures.json";
import type {
  PillDefinition,
  RealmDefinition,
  TreasureDefinition,
} from "./types";

/** Canonical ordered cultivation ladder loaded from data. */
export const REALMS = realmsJson as RealmDefinition[];

/** Pill catalog, including the non-executable Battle Pill stub. */
export const PILLS = pillsJson as PillDefinition[];

/** The five MVP treasure definitions. */
export const TREASURES = treasuresJson as TreasureDefinition[];

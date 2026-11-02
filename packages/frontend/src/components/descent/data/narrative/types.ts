/** Stable ids for the five playable layers. */
export type NarrativeLayerId =
  | "ashen_gate"
  | "bone_wastes"
  | "frozen_pit"
  | "blood_sea"
  | "throne_of_hell";

/** Stable ids used to load boss introductions. */
export type NarrativeBossId =
  | "cinderjaw"
  | "marshal_orrec_vane"
  | "queen_isolde"
  | "maw_of_tides"
  | "warden_of_layers";

/** The four narrative acts covered by the five playable layers. */
export type NarrativeActId = "orders" | "doubt" | "truth" | "choice";

/** One layer's short command briefing and hazard reminder. */
export interface LayerBriefing {
  actId: NarrativeActId;
  actTitle: string;
  briefing: string;
  faction: string;
  hazard: string;
  layerId: NarrativeLayerId;
  layerName: string;
}

/** A single spoken line in a boss introduction. */
export interface BossIntroLine {
  speaker: string;
  text: string;
}

/** Grievance-aware dialogue shown before a required boss fight. */
export interface BossIntro {
  bossId: NarrativeBossId;
  bossName: string;
  bossTitle: string;
  layerId: NarrativeLayerId;
  lines: readonly BossIntroLine[];
}

/** Flavor copy for a buildable structure. */
export interface BuildingTooltip {
  buildingId: string;
  name: string;
  lore: string;
}

/** Flavor copy and provenance for an MVP treasure. */
export interface TreasureTooltip {
  lore: string;
  name: string;
  previousOwnerLine: string;
  treasureId: string;
}

/** Situation in which a short bark can be played. */
export type BarkCue =
  | "selected"
  | "move"
  | "work"
  | "build"
  | "danger"
  | "recall"
  | "idle"
  | "spawn"
  | "attack"
  | "retreat"
  | "death";

/** One addressable bark line in a faction or villager pool. */
export interface BarkLine {
  cue: BarkCue;
  id: string;
  text: string;
}

/** Optional collectible that reveals one layer of the Hold's accounting. */
export interface LedgerFragment {
  itemId: string;
  layerId: NarrativeLayerId;
  text: string;
  title: string;
}

/** Stable ids for the three authored conclusion blurbs. */
export type EndingId = "quota" | "shutdown" | "compact";

/** Copy shown after a conclusion is selected by a future ending system. */
export interface EndingBlurb {
  endingId: EndingId;
  name: string;
  text: string;
  stretch: boolean;
}

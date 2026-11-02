import type { LayerBriefing, NarrativeLayerId } from "./types";

/** Canonical story progression for consumers that render every layer. */
export const NARRATIVE_LAYER_ORDER = [
  "ashen_gate",
  "bone_wastes",
  "frozen_pit",
  "blood_sea",
  "throne_of_hell",
] as const satisfies readonly NarrativeLayerId[];

/** Edda's command briefings, keyed by the layer id used by layer data. */
export const LAYER_BRIEFINGS = {
  ashen_gate: {
    actId: "orders",
    actTitle: "Orders",
    briefing:
      "Orders are plain: raise the Hold, secure the Spirit Veins, and bring Cinderjaw down. The imps look hungry, not disciplined. Hunger still burns a wall, so keep the workers close and the Ward Towers lit.",
    faction: "Imp Swarm",
    hazard:
      "Ember vents burn any unit that lingers; fire-ward walls make safe lanes through the heat.",
    layerId: "ashen_gate",
    layerName: "Ashen Gate",
  },
  blood_sea: {
    actId: "truth",
    actTitle: "Truth",
    briefing:
      "The Sea moves like one wounded animal. Sera says every voice in it once passed through our furnaces. Raise the Altar, ration your healing, and do not call this cleanup again.",
    faction: "Drowned Wraiths",
    hazard:
      "The Blood Sea halves healing, while nearby deaths feed essence back into the fight.",
    layerId: "blood_sea",
    layerName: "Blood Sea",
  },
  bone_wastes: {
    actId: "doubt",
    actTitle: "Doubt",
    briefing:
      "The dead ahead wear Hold colors. I know Orrec Vane's drill, and I know the companies we left behind. Build for the fog, watch their formation, and spare me any speech about nameless invaders.",
    faction: "Bone Legion",
    hazard:
      "The fog halves sight beyond Ward Tower range; advance under overlapping lamps.",
    layerId: "bone_wastes",
    layerName: "Bone Wastes",
  },
  frozen_pit: {
    actId: "truth",
    actTitle: "Truth",
    briefing:
      "Queen Isolde sent terms before our scouts crossed the frost. She names an Ember Compact our histories omit. We will hear her grievance, but the gate still opens only when its keeper falls.",
    faction: "Frostbound",
    hazard:
      "Cold slows movement and gathering outside a Hearth Ward; move the frontier one warm circle at a time.",
    layerId: "frozen_pit",
    layerName: "Frozen Pit",
  },
  throne_of_hell: {
    actId: "choice",
    actTitle: "Choice",
    briefing:
      "Voss orders the harvest finished. The Ledger names Ilya as the governor who sealed its first account, and the throne ahead holds the furnace that turns the dead into our light. We reach the Warden alive; then we decide what the Hold is willing to pay.",
    faction: "Combined hordes",
    hazard:
      "The Throne rotates the hazards of every cleared layer; read each change before committing the army.",
    layerId: "throne_of_hell",
    layerName: "Throne of Hell",
  },
} as const satisfies Record<NarrativeLayerId, LayerBriefing>;

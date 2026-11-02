import type { BossIntro, NarrativeBossId } from "./types";

/** Pre-fight dialogue keyed by boss id; every encounter still requires a kill. */
export const BOSS_INTROS = {
  cinderjaw: {
    bossId: "cinderjaw",
    bossName: "Cinderjaw",
    bossTitle: "Gatekeeper",
    layerId: "ashen_gate",
    lines: [
      {
        speaker: "Cinderjaw",
        text: "Hold-folk take the ember, close the gate, and call the mouths outside a swarm.",
      },
      {
        speaker: "Cinderjaw",
        text: "I keep this gate because behind me the small ones are still eating.",
      },
      {
        speaker: "Edda",
        text: "Then I know what you guard. I also know what happens to my Hold if I turn back.",
      },
    ],
  },
  marshal_orrec_vane: {
    bossId: "marshal_orrec_vane",
    bossName: "Marshal Orrec Vane",
    bossTitle: "Bone Warden",
    layerId: "bone_wastes",
    lines: [
      {
        speaker: "Marshal Orrec Vane",
        text: "Cinder Company, dress the line. Hold colors forward. The living have come to spend us twice.",
      },
      {
        speaker: "Edda",
        text: "Orrec, those colors were buried with honors.",
      },
      {
        speaker: "Marshal Orrec Vane",
        text: "No, Commander. We were entered as yield.",
      },
    ],
  },
  maw_of_tides: {
    bossId: "maw_of_tides",
    bossName: "Maw-of-Tides",
    bossTitle: "Crimson Tyrant",
    layerId: "blood_sea",
    lines: [
      {
        speaker: "Maw-of-Tides",
        text: "We remember the cup. We remember the fire. We remember waking without names.",
      },
      {
        speaker: "Maw-of-Tides",
        text: "Feed us what was taken, or be taken into us.",
      },
      {
        speaker: "Edda",
        text: "You are not a sea. You are everyone we poured away.",
      },
    ],
  },
  queen_isolde: {
    bossId: "queen_isolde",
    bossName: "Queen Isolde",
    bossTitle: "Rime Matron",
    layerId: "frozen_pit",
    lines: [
      {
        speaker: "Queen Isolde",
        text: "The Ember Compact fixed a measure: warmth for the living, rest for the dead. Your governors kept the warmth and broke the measure.",
      },
      {
        speaker: "Queen Isolde",
        text: "Withdraw your drills, restore the Ledger, and I will open no road against your Hold.",
      },
      {
        speaker: "Edda",
        text: "Those are honest terms. They are also terms Voss has left me no power to accept.",
      },
    ],
  },
  warden_of_layers: {
    bossId: "warden_of_layers",
    bossName: "The Warden of Layers",
    bossTitle: "Hell King",
    layerId: "throne_of_hell",
    lines: [
      {
        speaker: "The Warden of Layers",
        text: "I did not build the furnace to punish your dead. I kept it so the living world could borrow their last heat.",
      },
      {
        speaker: "The Warden of Layers",
        text: "Ilya sealed the true account. Voss erased the limit. You came to kill the keeper of a machine your Hold refuses to stop.",
      },
      {
        speaker: "Edda",
        text: "Then stand aside and let the truth reach daylight—or make me carry it through you.",
      },
    ],
  },
} as const satisfies Record<NarrativeBossId, BossIntro>;

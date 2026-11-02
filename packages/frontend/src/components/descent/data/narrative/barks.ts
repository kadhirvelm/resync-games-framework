import type { BarkLine } from "./types";

/** Short maxims painted, carved, and repeated throughout the Hold. */
export const HOLD_SAYINGS = [
  "Quota is a promise.",
  "Down is the only forward.",
  "Light the ward before you need it.",
  "A full bowl wins tomorrow's wall.",
  "Count every lantern coming home.",
  "The Hold stands because someone gathers.",
  "An Omen ignored is a grave prepared.",
  "Build warm. Dig careful. Return together.",
] as const;

/** Context-tagged lines for ordinary Hold villagers. */
export const VILLAGER_BARKS = [
  { cue: "selected", id: "villager_selected_01", text: "Hands ready." },
  { cue: "selected", id: "villager_selected_02", text: "Name the work." },
  { cue: "move", id: "villager_move_01", text: "Taking the lit road." },
  { cue: "move", id: "villager_move_02", text: "We go together." },
  { cue: "work", id: "villager_work_01", text: "Carry, count, return." },
  {
    cue: "work",
    id: "villager_work_02",
    text: "The Storehouse will know our names.",
  },
  {
    cue: "build",
    id: "villager_build_01",
    text: "Foundation first. Fear later.",
  },
  {
    cue: "build",
    id: "villager_build_02",
    text: "Give me a lamp and level ground.",
  },
  { cue: "danger", id: "villager_danger_01", text: "Horn! Leave the load!" },
  { cue: "danger", id: "villager_danger_02", text: "Ward light, now!" },
  { cue: "recall", id: "villager_recall_01", text: "Back to the Hold!" },
  {
    cue: "recall",
    id: "villager_recall_02",
    text: "Tools down—run the marked road!",
  },
  {
    cue: "idle",
    id: "villager_idle_01",
    text: "Do they count us before or after the ore?",
  },
  {
    cue: "idle",
    id: "villager_idle_02",
    text: "Quota is a promise. That's what the paint says.",
  },
] as const satisfies readonly BarkLine[];

/** Broken roll-call fragments used by the Imp Swarm. */
export const IMP_SWARM_BARKS = [
  {
    cue: "spawn",
    id: "imp_spawn_01",
    text: "First claw—present. Second claw—eaten. Third claw—burning.",
  },
  {
    cue: "spawn",
    id: "imp_spawn_02",
    text: "Count the mouths! Count them before the Hold does!",
  },
  {
    cue: "attack",
    id: "imp_attack_01",
    text: "Gate line, bite line, no one left behind!",
  },
  {
    cue: "attack",
    id: "imp_attack_02",
    text: "They took the ember. Take it back warm!",
  },
  {
    cue: "retreat",
    id: "imp_retreat_01",
    text: "Small ones behind! Big teeth last!",
  },
  { cue: "death", id: "imp_death_01", text: "Mark me... present..." },
  {
    cue: "idle",
    id: "imp_idle_01",
    text: "Quota one, quota two, quota ate the rest of you.",
  },
  {
    cue: "idle",
    id: "imp_idle_02",
    text: "Cinderjaw counts. Cinderjaw remembers.",
  },
] as const satisfies readonly BarkLine[];

/** Drill commands retained by the Bone Legion's former Hold soldiers. */
export const BONE_LEGION_BARKS = [
  {
    cue: "spawn",
    id: "bone_spawn_01",
    text: "Company, dress on the red seam.",
  },
  {
    cue: "spawn",
    id: "bone_spawn_02",
    text: "Sound off by the names they struck from us.",
  },
  {
    cue: "move",
    id: "bone_move_01",
    text: "Hold colors forward. Dead do not tire.",
  },
  {
    cue: "move",
    id: "bone_move_02",
    text: "Eyes front. The fog remembers your flank.",
  },
  {
    cue: "attack",
    id: "bone_attack_01",
    text: "Wardens lock. Hunters loose. Advance through the living.",
  },
  {
    cue: "attack",
    id: "bone_attack_02",
    text: "Second service, same command.",
  },
  {
    cue: "retreat",
    id: "bone_retreat_01",
    text: "Fall back by file. Leave no bone uncounted.",
  },
  { cue: "death", id: "bone_death_01", text: "Enter me... as yield..." },
] as const satisfies readonly BarkLine[];

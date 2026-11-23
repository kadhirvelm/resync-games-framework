import type { AudioCue, AudioRole } from "@resync-game-framework/api";

/** One generated clip required by the playable Ashen Gate slice. */
export interface AshenGateAudioSpec {
  cue: AudioCue;
  direction: string;
  id: string;
  loop: boolean;
  role: AudioRole;
}

/** Stable source tag shared by the batch generator and runtime resolver. */
export const ASHEN_GATE_AUDIO_TAG = "[descent:ashen-gate:audio";

/** Complete generated score and effects pack for the current Descent slice. */
export const ASHEN_GATE_AUDIO = [
  {
    cue: "camp",
    direction:
      "Instrumental dark-fantasy cultivation RTS exploration bed: low bowed strings, sparse guqin-like plucks, breathy wooden flutes, distant bronze resonance, and a slow restrained pulse. Ancient volcanic fortress at night, tense but not yet in combat. Seamless-feeling loop, no vocals, no choir, no trailer rise, no ending cadence.",
    id: "hold-music",
    loop: true,
    role: "music",
  },
  {
    cue: "battle",
    direction:
      "Instrumental dark-fantasy RTS battle bed: urgent taiko-like war drums, low strings, hammered bronze, dry wooden percussion, and sharp plucked-string ostinato. Determined defenders holding a volcanic fortress against a horde. Driving but readable under effects, seamless-feeling loop, no vocals, no choir, no intro, no ending cadence.",
    id: "battle-music",
    loop: true,
    role: "music",
  },
  {
    cue: "boss",
    direction:
      "Instrumental boss battle bed for a dark cultivation RTS: massive low drums, distorted bronze gongs, grinding bass strings, fierce bowed-string rhythm, and sparse dissonant horn blasts. A colossal demon at a lava gate. Heavy and threatening, seamless-feeling loop, no vocals, no choir, no intro, no ending cadence.",
    id: "boss-music",
    loop: true,
    role: "music",
  },
  {
    cue: "room",
    direction:
      "Seamless volcanic fortress ambience: deep distant lava rumble, soft hot wind through basalt ruins, intermittent ember crackle, faint iron chain movement, and a huge open cavern tail. Quiet enough to sit beneath music. No melody, no voices, no creature calls, no discrete impact, no crescendo.",
    id: "volcanic-ambience",
    loop: true,
    role: "ambience",
  },
  {
    cue: "impact",
    direction:
      "Very short denied action cue: one dull wooden knock followed by a low muted bronze click, restrained and readable. Single gesture, no melody, no voice, no comic buzzer.",
    id: "denied",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One close melee attack for a dark-fantasy RTS: fast heavy weapon whoosh into a compact steel-and-leather strike, with a little grit and no exaggerated boom. Single attack, no voice, no music.",
    id: "melee-attack",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One ranged attack for a dark-fantasy RTS: taut bowstring snap, arrow hiss, then a light wood-and-armor contact. Fast and compact, single shot, no voice, no music.",
    id: "projectile-attack",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One cultivation magic attack: compressed ember energy gathers for an instant, launches with a sharp airy flare, and ends in a small crackling burst. Fast single spell, no voice, no music, no long drone.",
    id: "magic-attack",
    loop: false,
    role: "effect",
  },
  {
    cue: "impact",
    direction:
      "One compact combat hit for a dark-fantasy RTS: layered leather thud, brief metal scrape, and a small low-end body impact. Dry and readable, no weapon swing, no voice, no music.",
    id: "combat-impact",
    loop: false,
    role: "effect",
  },
  {
    cue: "death",
    direction:
      "One unit defeat sound for a dark-fantasy RTS: armor and weapon dropping onto gritty basalt with a short low spiritual exhale. Somber, compact, no spoken voice, no scream, no music.",
    id: "unit-death",
    loop: false,
    role: "effect",
  },
  {
    cue: "heal",
    direction:
      "One restrained cultivation healing effect: a warm breath of energy, soft crystalline shimmer, and low wooden chime resolving cleanly. Short single gesture, no voice, no melody bed.",
    id: "heal",
    loop: false,
    role: "effect",
  },
  {
    cue: "build",
    direction:
      "One building-complete cue for a volcanic dark-fantasy RTS: final stone block settles, wooden brace locks, then a confident muted bronze bell. Solid and compact, no voice, no music bed.",
    id: "building-complete",
    loop: false,
    role: "effect",
  },
  {
    cue: "death",
    direction:
      "One structure collapse in a volcanic fortress: heavy basalt cracking and falling, timber snapping, dust and small stones scattering into a cavern. Compact destructive event, no voice, no music.",
    id: "building-collapse",
    loop: false,
    role: "effect",
  },
  {
    cue: "train",
    direction:
      "One soldier-ready cue for a dark-fantasy cultivation RTS: a heavy armored stomp onto basalt, a spear haft striking stone, and one short low bronze war-gong hit. Martial and assertive, compact single gesture under one second, no voice, no melody, no music bed.",
    id: "soldier-born",
    loop: false,
    role: "effect",
  },
  {
    cue: "train",
    direction:
      "One villager-ready cue for a dark-fantasy cultivation RTS: a light footstep on gravel, a wooden tool lifted onto a shoulder, and a soft warm wooden chime. Humble and friendly, compact single gesture under one second, no voice, no melody, no music bed.",
    id: "villager-born",
    loop: false,
    role: "effect",
  },
  {
    cue: "impact",
    direction:
      "One villager selection acknowledgement for a dark-fantasy RTS: a light cloth shift, a wooden tool lifted once, and a soft warm wooden tick. Humble and immediate, under one second, no voice, no melody, no music bed.",
    id: "villager-select",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One villager move-out acknowledgement for a dark-fantasy RTS: two quick gravel footsteps and a wooden tool settling against a shoulder. Willing and compact, under one second, no voice, no melody, no music bed.",
    id: "villager-command",
    loop: false,
    role: "effect",
  },
  {
    cue: "impact",
    direction:
      "One cultivator selection acknowledgement for a dark-fantasy RTS: a restrained sleeve sweep and a tiny clear spiritual chime with a warm ember breath. Calm and immediate, under one second, no voice, no melody, no music bed.",
    id: "cultivator-select",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One cultivator move-out acknowledgement for a dark-fantasy RTS: a decisive sleeve sweep, one firm step on basalt, and a short controlled ember-energy pulse. Compact single gesture, no voice, no melody, no music bed.",
    id: "cultivator-command",
    loop: false,
    role: "effect",
  },
  {
    cue: "impact",
    direction:
      "One sword sage selection acknowledgement for a dark-fantasy RTS: a controlled blade-tip turn, a quiet scabbard click, and one fine spiritual ring. Precise and immediate, under one second, no voice, no melody, no music bed.",
    id: "sword_sage-select",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One sword sage move-out acknowledgement for a dark-fantasy RTS: one clean blade draw, a light stepping slash through air, and a brief clear qi resonance. Compact single gesture, no voice, no melody, no music bed.",
    id: "sword_sage-command",
    loop: false,
    role: "effect",
  },
  {
    cue: "impact",
    direction:
      "One formation master selection acknowledgement for a dark-fantasy RTS: a wooden command baton lifting through cloth and a restrained bronze tactics-chime tick. Composed and immediate, under one second, no voice, no melody, no music bed.",
    id: "formation_master-select",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One formation master move-out acknowledgement for a dark-fantasy RTS: a command baton tapping the palm, one firm basalt step, and a short orderly bronze resonance. Compact single gesture, no voice, no melody, no music bed.",
    id: "formation_master-command",
    loop: false,
    role: "effect",
  },
  {
    cue: "impact",
    direction:
      "One warden selection acknowledgement for a dark-fantasy RTS: a heavy armored shoulder shift and one muted shield-rim knock. Steadfast and immediate, under one second, no voice, no melody, no music bed.",
    id: "warden-select",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One warden move-out acknowledgement for a dark-fantasy RTS: a spear haft striking stone once and one weighty armored step. Disciplined and compact, under one second, no voice, no melody, no music bed.",
    id: "warden-command",
    loop: false,
    role: "effect",
  },
  {
    cue: "impact",
    direction:
      "One hunter selection acknowledgement for a dark-fantasy RTS: a light leather strap tightening and one soft fingertip tap on a wooden bow. Alert and immediate, under one second, no voice, no melody, no music bed.",
    id: "hunter-select",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One hunter move-out acknowledgement for a dark-fantasy RTS: a quick bowstring tension tick, two light steps, and a faint arrow-fletching rustle. Agile and compact, no voice, no melody, no music bed.",
    id: "hunter-command",
    loop: false,
    role: "effect",
  },
  {
    cue: "impact",
    direction:
      "One rider selection acknowledgement for a dark-fantasy RTS: a saddle creak, brief bridle jingle, and one restrained mount hoof tap. Readied and immediate, under one second, no voice, no melody, no music bed.",
    id: "rider-select",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One rider move-out acknowledgement for a dark-fantasy RTS: a short mount snort, bridle snap, and two quick hoof strikes on basalt. Energetic and compact, no voice, no melody, no music bed.",
    id: "rider-command",
    loop: false,
    role: "effect",
  },
  {
    cue: "impact",
    direction:
      "One raider selection acknowledgement for a dark-fantasy RTS: a short blade sliding against its guard and one light metal armor tick. Keen and immediate, under one second, no voice, no melody, no music bed.",
    id: "raider-select",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One raider move-out acknowledgement for a dark-fantasy RTS: a fast blade whisper and two light running footsteps over grit. Aggressive but restrained, compact single gesture, no voice, no melody, no music bed.",
    id: "raider-command",
    loop: false,
    role: "effect",
  },
  {
    cue: "impact",
    direction:
      "One breaker selection acknowledgement for a dark-fantasy RTS: a massive hammer head settling against a gloved palm with a low metal thunk. Heavy and immediate, under one second, no voice, no melody, no music bed.",
    id: "breaker-select",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One breaker move-out acknowledgement for a dark-fantasy RTS: a heavy hammer haft knock and one deep boot stomp with a brief stone grit scrape. Forceful and compact, no voice, no melody, no music bed.",
    id: "breaker-command",
    loop: false,
    role: "effect",
  },
  {
    cue: "impact",
    direction:
      "One adept selection acknowledgement for a dark-fantasy RTS: a fingertip brush through cloth and a tiny crystalline ember shimmer. Focused and immediate, under one second, no voice, no melody, no music bed.",
    id: "adept-select",
    loop: false,
    role: "effect",
  },
  {
    cue: "attack",
    direction:
      "One adept move-out acknowledgement for a dark-fantasy RTS: a compact arcane sigil ignition, one light step, and a brief airy ember flare. Precise single gesture, no voice, no melody, no music bed.",
    id: "adept-command",
    loop: false,
    role: "effect",
  },
  {
    cue: "wave",
    direction:
      "One ominous horde warning horn across a vast volcanic cavern: deep rough bronze war horn with a short echo, followed by a faint distant chain rattle. Single warning call, no melody, no voice, no music bed.",
    id: "wave-horn",
    loop: false,
    role: "effect",
  },
  {
    cue: "wave",
    direction:
      "One short boss taunt for a colossal volcanic demon: a deep bestial intake becomes a grinding roar layered with cracked bronze resonance and a huge cavern tail. Threatening and readable beneath dialogue text, no intelligible speech, no music bed.",
    id: "boss-taunt",
    loop: false,
    role: "effect",
  },
  {
    cue: "wave",
    direction:
      "Very short under-attack warning for a dark-fantasy RTS: one dry low war-drum strike immediately answered by a restrained rough bronze horn pulse, urgent and readable without being louder than battle. Complete in under 1.2 seconds, no voice, no melody, no music bed, no long echo.",
    id: "under-attack",
    loop: false,
    role: "effect",
  },
  {
    cue: "breakthrough",
    direction:
      "One cultivation breakthrough: low gathering energy swells upward, stone dust lifts, bright spiritual resonance blooms, and a deep bronze chime resolves with controlled power. Triumphant single event, no voice, no music bed.",
    id: "breakthrough",
    loop: false,
    role: "effect",
  },
  {
    cue: "victory",
    direction:
      "Short victorious dark-fantasy stinger: ascending plucked strings, bright bronze bells, and one grounded drum resolve. Hard-won relief at a volcanic gate, instrumental, no vocals, ends cleanly.",
    id: "victory",
    loop: false,
    role: "effect",
  },
  {
    cue: "defeat",
    direction:
      "Short defeat stinger: low bowed strings sink beneath a cracked bronze bell and a final distant stone impact. Spare, dark, instrumental, no vocals, ends cleanly.",
    id: "defeat",
    loop: false,
    role: "effect",
  },
] as const satisfies readonly AshenGateAudioSpec[];

/** Stable ids accepted by the Descent audio runtime. */
export type AshenGateAudioId = (typeof ASHEN_GATE_AUDIO)[number]["id"];

/**
 * Builds the exact tagged request persisted in an audio asset manifest.
 * @param spec - Clip identity and sound direction
 * @returns Prompt shared by generation and runtime lookup
 */
export function ashenGateAudioPrompt(spec: AshenGateAudioSpec): string {
  return `${ASHEN_GATE_AUDIO_TAG}:${spec.id}]\n${spec.direction}`;
}

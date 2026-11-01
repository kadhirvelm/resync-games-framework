import type { CultivatorFields } from "@towers-of-coreborn/api";
import { CHARACTER_SPRITE_FACING } from "src/dungeon/dungeonSlotGenerator";

/**
 * Who the cultivator is, written for the art agents. The cultivator is the
 * player's own character, not a Coreborn creature.
 * @param cultivator - Name, title, and appearance
 * @returns Identity lines shared by the portrait and sprite prompts
 */
function cultivatorIdentity(cultivator: CultivatorFields): string {
  return [
    "The player's own cultivator in Towers of Coreborn: a person who climbs the towers, draws on qi, and binds Coreborn to fight beside them. They are a cultivator, not a Coreborn creature.",
    `Name: ${cultivator.name}`,
    `Title: ${cultivator.title}`,
    `Appearance: ${cultivator.appearance}`,
  ].join("\n");
}

/**
 * Prompt for the card-character agent. Its four levels become the
 * cultivator's four cultivation realms.
 * @param cultivator - Name, title, and appearance
 * @returns The portrait request
 */
export function cultivatorPortraitPrompt(cultivator: CultivatorFields): string {
  return `${cultivatorIdentity(cultivator)}

Paint the four levels as four cultivation realms of this same person: a newly awakened initiate first, each realm stronger and more refined, and the last at the summit of their path. Keep their face, build, and the appearance above at every realm.`;
}

/**
 * Prompt for the sprite-sheet agent, facing right like every party member.
 * @param cultivator - Name, title, and appearance
 * @returns The sprite request
 */
export function cultivatorSpritePrompt(cultivator: CultivatorFields): string {
  return `Character:
${cultivatorIdentity(cultivator)}

Sprite request:
${CHARACTER_SPRITE_FACING}
A battle sprite of ${cultivator.name} as described above. They attack with a qi technique and defend behind a shimmer of qi.`;
}

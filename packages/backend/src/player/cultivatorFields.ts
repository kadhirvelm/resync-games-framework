import { BadRequestException } from "@nestjs/common";
import {
  CULTIVATOR_APPEARANCE_MAX_LENGTH,
  CULTIVATOR_NAME_MAX_LENGTH,
  CULTIVATOR_TITLE_MAX_LENGTH,
  type CultivatorFields,
} from "@resync-game-framework/api";

/** Title given to a cultivator whose player leaves it blank. */
export const DEFAULT_CULTIVATOR_TITLE = "Walker of the Jade Path";

/**
 * Trims a one-line field and folds runs of whitespace into one space.
 * @param value - Raw value from the request body
 * @returns The cleaned text, or an empty string when it is not text
 */
function cleanLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/**
 * @param value - Cleaned text
 * @param maxLength - Longest allowed length
 * @param label - Field name for the error
 * @returns The same text
 * @throws BadRequestException when the text is too long
 */
function withinLength(value: string, maxLength: number, label: string): string {
  if (value.length > maxLength) {
    throw new BadRequestException(
      `${label} must be ${maxLength} characters or fewer.`,
    );
  }
  return value;
}

/**
 * @param value - Raw name
 * @returns The cleaned name
 * @throws BadRequestException when it is blank or too long
 */
function readName(value: unknown): string {
  const name = cleanLine(value);
  if (name === "") {
    throw new BadRequestException("Give your cultivator a name.");
  }
  return withinLength(name, CULTIVATOR_NAME_MAX_LENGTH, "Name");
}

/**
 * @param value - Raw title
 * @returns The cleaned title, or the default title when blank
 * @throws BadRequestException when it is too long
 */
function readTitle(value: unknown): string {
  const title = cleanLine(value);
  if (title === "") {
    return DEFAULT_CULTIVATOR_TITLE;
  }
  return withinLength(title, CULTIVATOR_TITLE_MAX_LENGTH, "Title");
}

/**
 * @param value - Raw appearance; line breaks are kept
 * @returns The trimmed appearance, which may be empty
 * @throws BadRequestException when it is too long
 */
function readAppearance(value: unknown): string {
  const appearance = typeof value === "string" ? value.trim() : "";
  return withinLength(
    appearance,
    CULTIVATOR_APPEARANCE_MAX_LENGTH,
    "Appearance",
  );
}

/**
 * Checks every field of a new cultivator.
 * @param payload - Request body
 * @returns Cleaned name, title, and appearance
 * @throws BadRequestException when a field is missing or too long
 */
export function readCultivatorFields(
  payload: Partial<CultivatorFields> | null | undefined,
): CultivatorFields {
  return {
    appearance: readAppearance(payload?.appearance),
    name: readName(payload?.name),
    title: readTitle(payload?.title),
  };
}

/**
 * Checks only the fields an update sends. Missing fields stay unchanged.
 * @param payload - Request body
 * @returns The cleaned fields that were sent
 * @throws BadRequestException when a sent field is invalid
 */
export function readCultivatorChanges(
  payload: Partial<CultivatorFields> | null | undefined,
): Partial<CultivatorFields> {
  const changes: Partial<CultivatorFields> = {};
  if (payload?.name !== undefined) {
    changes.name = readName(payload.name);
  }
  if (payload?.title !== undefined) {
    changes.title = readTitle(payload.title);
  }
  if (payload?.appearance !== undefined) {
    changes.appearance = readAppearance(payload.appearance);
  }
  return changes;
}

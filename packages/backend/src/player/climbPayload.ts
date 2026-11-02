import { BadRequestException } from "@nestjs/common";
import type { SaveClimbPayload } from "@resync-game-framework/api";
import { requireUuid } from "./uuid";

/** Longest tower id or title stored with a climb. */
const CLIMB_TEXT_MAX_LENGTH = 200;

/** A saved climb ready to write, with its snapshot as a JSON object. */
export interface CheckedClimb extends Omit<SaveClimbPayload, "snapshot"> {
  snapshot: Record<string, unknown>;
}

/**
 * @param value - Raw number
 * @param label - Field name for the error
 * @returns The number when it is a whole number from 0
 * @throws BadRequestException otherwise
 */
function requireCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${label} must be a whole number from 0.`);
  }
  return value;
}

/**
 * @param value - Raw text
 * @param label - Field name for the error
 * @returns The trimmed text
 * @throws BadRequestException when it is blank or too long
 */
function requireText(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "" || text.length > CLIMB_TEXT_MAX_LENGTH) {
    throw new BadRequestException(
      `${label} must be 1 to ${CLIMB_TEXT_MAX_LENGTH} characters.`,
    );
  }
  return text;
}

/**
 * Checks a saved climb before it is written. The snapshot is only checked
 * to be an object; the game owns its shape.
 * @param payload - Request body
 * @returns The checked climb
 * @throws BadRequestException when a field is missing or malformed
 */
export function readSaveClimbPayload(
  payload: SaveClimbPayload | null | undefined,
): CheckedClimb {
  const snapshot = payload?.snapshot;
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    Array.isArray(snapshot)
  ) {
    throw new BadRequestException("A climb snapshot must be an object.");
  }
  const floorCount = requireCount(payload?.floorCount, "Floor count");
  const floorIndex = requireCount(payload?.floorIndex, "Floor");
  if (floorCount === 0 || floorIndex >= floorCount) {
    throw new BadRequestException("Floor must be inside the tower.");
  }
  return {
    ascension: requireCount(payload?.ascension, "Ascension"),
    cultivatorId: requireUuid(payload?.cultivatorId, "Cultivator id"),
    floorCount,
    floorIndex,
    id: requireUuid(payload?.id, "Climb id"),
    snapshot: snapshot as Record<string, unknown>,
    towerId: requireText(payload?.towerId, "Tower id"),
    towerTitle: requireText(payload?.towerTitle, "Tower title"),
  };
}

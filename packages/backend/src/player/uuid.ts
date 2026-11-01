import { BadRequestException } from "@nestjs/common";

/** `crypto.randomUUID()` values. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param value - Anything
 * @returns Whether it is a version 4 UUID
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * @param value - Id from the request body
 * @param label - Field name for the error
 * @returns The trimmed id
 * @throws BadRequestException when it is not a UUID
 */
export function requireUuid(value: unknown, label: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!isUuid(trimmed)) {
    throw new BadRequestException(`${label} must be a UUID.`);
  }
  return trimmed;
}

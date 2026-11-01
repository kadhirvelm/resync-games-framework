import { findTemplate } from "../logic/run";
import type {
  CorebornTemplate,
  RunState,
  TowerContent,
} from "../logic/towerTypes";

/**
 * @param run - Current run
 * @returns Copies of each Coreborn template in the party
 */
export function ownedTemplateCounts(run: RunState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const member of run.party) {
    if (member.kind === "coreborn") {
      counts.set(member.templateId, (counts.get(member.templateId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * @param content - Tower content
 * @param templateIds - Offered template ids
 * @returns The templates that still exist, in offer order
 */
export function offeredTemplates(
  content: TowerContent,
  templateIds: string[],
): CorebornTemplate[] {
  return templateIds
    .map((id) => findTemplate(content, id))
    .filter((template): template is CorebornTemplate => template !== undefined);
}

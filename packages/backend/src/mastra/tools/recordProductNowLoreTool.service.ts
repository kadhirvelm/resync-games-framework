import { createTool } from "@mastra/core/tools";
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AgentTool } from "@towers-of-coreborn/api";
import { ProductNowLoreService } from "src/product-now-lore/product-now-lore.service";
import { readProductNowSessionForTool } from "src/product-now-mcp/productNowSessionContext";
import { z } from "zod";
import { throwIfAborted } from "../agents/generationCancelled";

/** Game an agent writes to when it does not name one. */
const DEFAULT_LORE_GAME_ID = "towers-of-coreborn";

/** Card and dungeon agents ground themselves in this document, so agents never append to it. */
const CANON_LORE_DOCUMENT_NAME = "lore";

const recordLoreInputSchema = z.object({
  documentName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      "Lore document to append to, such as 'Bestiary' or 'Floor Chronicles'. Created when missing. Never the canon 'Lore' document.",
    ),
  entry: z
    .string()
    .trim()
    .min(1)
    .max(20_000)
    .describe("The lore entry, kept word for word."),
  gameId: z
    .string()
    .optional()
    .describe(
      `Game whose lore folder to write to. Defaults to ${DEFAULT_LORE_GAME_ID}.`,
    ),
  heading: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("Optional short heading above the entry."),
});

const recordLoreOutputSchema = z.object({
  created: z.boolean(),
  documentId: z.string(),
  url: z.string().optional(),
});

/**
 * Shared registry tool that appends one entry to a game's ProductNow lore.
 * The session comes from the run's request context, never from the model.
 */
@Injectable()
export class RecordProductNowLoreToolService {
  public constructor(private readonly loreService: ProductNowLoreService) {}

  /**
   * Tool definition registered for {@link AgentTool.RecordProductNowLore}.
   * @returns The Mastra tool agents call to store lore
   */
  public createTool() {
    return createTool({
      description:
        "Append one lore entry to a named document in the game's ProductNow lore folder. Creates the document when it does not exist. ProductNow applies the write in the background.",
      execute: async (input, context) => {
        throwIfAborted(context?.abortSignal);
        if (input.documentName.toLowerCase() === CANON_LORE_DOCUMENT_NAME) {
          throw new BadRequestException(
            "Agents cannot append to the canon Lore document; pick another document name.",
          );
        }
        const sessionId = readProductNowSessionForTool(context?.requestContext);
        if (sessionId === undefined) {
          throw new UnauthorizedException(
            "Connect ProductNow before recording lore",
          );
        }
        return this.loreService.recordEntry(
          sessionId,
          input.gameId ?? DEFAULT_LORE_GAME_ID,
          input,
          context?.abortSignal,
        );
      },
      id: AgentTool.RecordProductNowLore,
      inputSchema: recordLoreInputSchema,
      outputSchema: recordLoreOutputSchema,
    });
  }
}

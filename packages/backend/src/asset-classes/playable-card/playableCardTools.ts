import { createTool } from "@mastra/core/tools";
import {
  PLAYABLE_CARD_CHAIN_KINDS,
  PLAYABLE_CARD_KINDS,
  type PlayableCardLoreSource,
} from "@resync-game-framework/api";
import { throwIfAborted } from "src/mastra/agents/generationCancelled";
import type { ProductNowWorkspace } from "src/product-now-lore/productNowWorkspace";
import { ProductNowMcpService } from "src/product-now-mcp/product-now-mcp.service";
import { z } from "zod";
import { type CardProgression, strongerCardError } from "./cardProgression";
import { parseLoreSearchResult } from "./parseLoreSearchResult";
import {
  type PlayableCardDraft,
  validatePlayableCardDraft,
} from "./validatePlayableCardDraft";

/** Tool the writer must call against the ProductNow Lore document. */
export const SEARCH_LORE_TOOL_ID = "search-lore";

/** Tool the writer calls once the card is grounded in Lore passages. */
export const SUBMIT_PLAYABLE_CARD_TOOL_ID = "submit-playable-card";

/**
 * Lore passages and the accepted card for one generation.
 * The research tools write into this object while the agent runs.
 */
export interface PlayableCardResearchState {
  draft?: PlayableCardDraft;
  /** Why the most recent submission was rejected, if one was */
  lastRejection?: string;
  loreSources: PlayableCardLoreSource[];
}

const searchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "A specific Lore question, such as a floor, a Coreborn bond, the Trials, the Warden Compact, the Sundering, or the Verity.",
    ),
});

/** Empty string means the effect is not a combo. The other values match the API. */
const EFFECT_CHAIN_VALUES = ["", ...PLAYABLE_CARD_CHAIN_KINDS] as const;

/**
 * One effect the card generator may submit.
 * `kind` is the shared `PlayableCardKind` union, so a generated card stays
 * inside the API rules instead of inventing a new effect.
 */
export const playableCardEffectSchema = z.object({
  amount: z
    .number()
    .describe("Attack or defend 4-16, draw 1-2, aether 1-3, combo 6-20."),
  chainsFrom: z
    .enum(EFFECT_CHAIN_VALUES)
    .describe(
      "For combo, the earlier card kind: attack, defend, draw, or aether. Empty string otherwise.",
    ),
  kind: z
    .enum(PLAYABLE_CARD_KINDS)
    .describe("One toolkit kind: attack, defend, draw, aether, or combo."),
  text: z
    .string()
    .describe("Rules text the player reads. 8 to 160 characters."),
});

const submitInputSchema = z.object({
  aetherCost: z
    .number()
    .describe("Aether spent to play the card, from 1 to 4."),
  description: z
    .string()
    .describe(
      "Flavor text: one or two short sentences, 20 to 240 characters. A vague, mysterious hint of what this card is in the Tower's lore.",
    ),
  effects: z
    .array(playableCardEffectSchema)
    .describe("One or two effects. Each kind may appear once."),
  name: z.string().describe("Card name, 2 to 48 characters."),
  scene: z
    .string()
    .describe(
      "What to paint, 16 to 800 characters. Subject and setting only. No letters or card frame.",
    ),
});

const searchOutputSchema = z.object({
  message: z.string(),
});

const submitOutputSchema = z.object({
  accepted: z.boolean(),
  message: z.string(),
});

/**
 * Lore search and card submission for one card-generator run.
 * These close over the browser's ProductNow session, so they are built per query
 * and passed beside the shared generate-image tool.
 * @param params - Session, configured ProductNow workspace, the state the tools fill in, and the signal that stops the run
 * @returns Mastra tools keyed by the id the model calls
 */
export function createPlayableCardResearchTools(params: {
  productNow: ProductNowMcpService;
  progression?: CardProgression;
  sessionId: string;
  signal: AbortSignal;
  state: PlayableCardResearchState;
  workspace: ProductNowWorkspace;
}) {
  return {
    [SEARCH_LORE_TOOL_ID]: createTool({
      description:
        "Search inside the ProductNow Lore document for the Reach. Returns only passages from that document. Call this with a specific place, person, order, or event before writing the card. If it returns no passages, call it again with a narrower query.",
      execute: async (input: z.infer<typeof searchInputSchema>) =>
        searchLore(input, params),
      id: SEARCH_LORE_TOOL_ID,
      inputSchema: searchInputSchema,
      outputSchema: searchOutputSchema,
    }),
    [SUBMIT_PLAYABLE_CARD_TOOL_ID]: createTool({
      description:
        "Submit the finished card after search-lore has returned passages. Description is one or two short, vague sentences that hint at the card's place in the Tower's lore. Effects stay inside the combat toolkit.",
      execute: async (input: z.infer<typeof submitInputSchema>) =>
        submitCard(input, params),
      id: SUBMIT_PLAYABLE_CARD_TOOL_ID,
      inputSchema: submitInputSchema,
      outputSchema: submitOutputSchema,
    }),
  };
}

/**
 * Searches ProductNow and keeps only Lore-document passages.
 * @param input - The model's search query
 * @param params - Session, configured workspace, collected passages, and the abort signal
 * @returns Text the model should read next
 */
async function searchLore(
  input: z.infer<typeof searchInputSchema>,
  params: {
    productNow: ProductNowMcpService;
    sessionId: string;
    signal: AbortSignal;
    state: PlayableCardResearchState;
    workspace: ProductNowWorkspace;
  },
): Promise<{ message: string }> {
  throwIfAborted(params.signal);
  const query = input.query.trim();
  if (query.length < 2 || query.length > 400) {
    return { message: "Pass a query of 2 to 400 characters." };
  }

  const raw = await params.productNow.callTool(
    params.sessionId,
    "search",
    {
      ...(params.workspace.gamesFolderId === undefined
        ? {}
        : { folderId: params.workspace.gamesFolderId }),
      query,
      resultType: "documents",
      searchScope: "workspace",
    },
    params.signal,
  );
  throwIfAborted(params.signal);
  const hits = parseLoreSearchResult(raw, params.workspace.loreDocumentId);
  for (const hit of hits) {
    const alreadyKept = params.state.loreSources.some(
      (source) => source.excerpt === hit.excerpt,
    );
    if (!alreadyKept) {
      params.state.loreSources.push(hit);
    }
  }
  return { message: formatLoreHits(hits) };
}

/**
 * Accepts a card only after at least one Lore passage has been retrieved.
 * @param input - The model's card draft
 * @param params - Collected passages and where to store an accepted draft
 * @returns Whether the card was accepted, and a message the model can correct from
 */
function submitCard(
  input: z.infer<typeof submitInputSchema>,
  params: {
    progression?: CardProgression;
    signal: AbortSignal;
    state: PlayableCardResearchState;
  },
): { accepted: boolean; message: string } {
  throwIfAborted(params.signal);
  if (params.state.loreSources.length === 0) {
    return rejectCard(
      params.state,
      "Search the Lore document and use a returned passage before submitting.",
    );
  }

  const validated = validatePlayableCardDraft(input);
  if ("error" in validated) {
    return rejectCard(params.state, validated.error);
  }
  if (params.progression !== undefined) {
    const progressionError = strongerCardError(
      validated.draft,
      params.progression,
    );
    if (progressionError !== undefined) {
      return rejectCard(params.state, progressionError);
    }
  }

  params.state.draft = validated.draft;
  params.state.lastRejection = undefined;
  return { accepted: true, message: "Card accepted." };
}

/**
 * Records why a submission failed so a run that never recovers can report it.
 * @param state - Research state for this generation
 * @param message - Correction the model should apply
 * @returns The rejection returned to the model
 */
function rejectCard(
  state: PlayableCardResearchState,
  message: string,
): { accepted: boolean; message: string } {
  state.lastRejection = message;
  return { accepted: false, message };
}

/**
 * @param hits - Lore passages from one search
 * @returns Text returned to the model
 */
function formatLoreHits(hits: PlayableCardLoreSource[]): string {
  if (hits.length === 0) {
    return "No passages in the Lore document matched. Search again with a specific Reach subject: a floor, the Trials, a Coreborn, the Warden Compact, the Sundering, or the Verity.";
  }

  const lines = hits.map((hit, index) => `${index + 1}. ${hit.excerpt}`);
  return ["Lore document passages:", ...lines].join("\n");
}

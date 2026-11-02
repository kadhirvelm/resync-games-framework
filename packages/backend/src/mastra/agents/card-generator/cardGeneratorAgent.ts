import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import type {
  PlayableCardEffect,
  PlayableCardLoreSource,
} from "@resync-game-framework/api";
import { AgentTool } from "@resync-game-framework/api";
import sharp from "sharp";
import {
  type CardProgression,
  renderCardProgressionPrompt,
} from "src/asset-classes/playable-card/cardProgression";
import { renderPlayableCardInstructions } from "src/asset-classes/playable-card/playableCardInstructions";
import {
  PLAYABLE_CARD_AGENT_MAX_STEPS,
  PLAYABLE_CARD_IMAGE_FILE_NAME,
  PLAYABLE_CARD_MANIFEST_FILE_NAME,
} from "src/asset-classes/playable-card/playableCardSpec";
import { PLAYABLE_CARD_STORAGE } from "src/asset-classes/playable-card/playableCardStorage";
import {
  createPlayableCardResearchTools,
  type PlayableCardResearchState,
  SEARCH_LORE_TOOL_ID,
  SUBMIT_PLAYABLE_CARD_TOOL_ID,
} from "src/asset-classes/playable-card/playableCardTools";
import { readPlayableCardImage } from "src/asset-classes/playable-card/readPlayableCardImage";
import type { PlayableCardDraft } from "src/asset-classes/playable-card/validatePlayableCardDraft";
import { encodeGeneratedImageAsWebp } from "src/asset-classes/shared/encodeGeneratedImageAsWebp";
import { writeAssetDirectoryAtomically } from "src/asset-classes/shared/writeAssetDirectoryAtomically";
import {
  type ResyncGameFrameworkAgentChatResults,
  ResyncGameFrameworkAgentService,
} from "src/mastra/shared/resyncGameFrameworkAgent.service";
import {
  collectImageFilePaths,
  deleteImageFiles,
  type GeneratedImage,
} from "src/mastra/tools/generateImageTool.service";
import { ProductNowMcpService } from "src/product-now-mcp/product-now-mcp.service";
import { runWithProductNowSession } from "src/product-now-mcp/productNowSessionContext";
import { GenerationAbortCoordinator } from "../generationAbort.coordinator";
import { throwIfAborted } from "../generationCancelled";
import type { QueryableAgent } from "../queryableAgent";

const MIN_IMAGE_EDGE_PX = 64;

/**
 * Registered catalog tools this agent calls.
 * Lore search and card submission are built per query because they close over
 * the browser's ProductNow session.
 */
export enum CardGeneratorAgentTool {
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  ConsultProductNow = AgentTool.ConsultProductNow,
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  GenerateImage = AgentTool.GenerateImage,
}

/**
 * Input for one card-generator query.
 */
export interface CardGeneratorInput {
  /** Client id used to stop this run */
  generationId: string;
  /**
   * Set for levels 2 through 4 of a character line. Locks the cost and
   * effect kinds, and requires higher amounts.
   */
  progression?: CardProgression;
  /** What the player asked the card to be about */
  prompt: string;
  /** Browser session that holds the ProductNow OAuth tokens */
  sessionId: string;
}

/**
 * Result of one card-generator query.
 */
export interface CardGeneratorResult {
  /** Aether cost of the saved card */
  aetherCost: number;
  /** Folder name of the saved card */
  cardId: string;
  /** Effects of the saved card, in card order */
  effects: PlayableCardEffect[];
}

/**
 * Card-generator agent. Call {@link CardGeneratorAgent.query} with a prompt
 * and the browser's ProductNow session. It gives the Mastra agent
 * `consult-productnow`, Lore search, card submission, and `generate-image`.
 * `consult-productnow` reads the Lore document before the card is written
 * or painted. The instructions carry the combat rules and the watercolor
 * prompt the image tool must receive.
 *
 * @example
 * ```typescript
 * const result = await cardGeneratorAgent.query({
 *   generationId,
 *   prompt: "a card about the first Coreborn bond",
 *   sessionId,
 * });
 * result.cardId;
 * ```
 */
@Injectable()
export class CardGeneratorAgent
  implements QueryableAgent<CardGeneratorInput, CardGeneratorResult>
{
  public constructor(
    private readonly agents: ResyncGameFrameworkAgentService,
    private readonly productNowMcpService: ProductNowMcpService,
    private readonly generationAbort: GenerationAbortCoordinator,
  ) {}

  /**
   * Stops an in-flight card generation on whichever process is running it.
   * @param generationId - Id passed to {@link CardGeneratorAgent.query}
   * @returns Whether the stop was recorded
   */
  public abort(generationId: string): Promise<boolean> {
    return this.generationAbort.stop(generationId);
  }

  /**
   * Searches Lore, writes the card, paints it, and stores the set.
   * @param input - User prompt, ProductNow session, and the id that can stop it
   * @returns The saved card id
   * @throws GenerationCancelledException when the run is stopped
   * @throws InternalServerErrorException when research or painting fails
   */
  public async query(input: CardGeneratorInput): Promise<CardGeneratorResult> {
    return this.generationAbort.run(input.generationId, async (signal) => {
      const state: PlayableCardResearchState = { loreSources: [] };
      let imagePaths: string[] = [];
      try {
        const result = await runWithProductNowSession(input.sessionId, () =>
          this.agents.runAssetClassAgentChat({
            abortSignal: signal,
            agentId: "card-generator-agent",
            catalogTools: CardGeneratorAgentTool,
            instructions: renderPlayableCardInstructions(),
            maxSteps: PLAYABLE_CARD_AGENT_MAX_STEPS,
            ownedTools: createPlayableCardResearchTools({
              productNow: this.productNowMcpService,
              progression: input.progression,
              sessionId: input.sessionId,
              signal,
              state,
            }),
            prompt: renderCardRequest(input.prompt, input.progression),
          }),
        );
        imagePaths = result.toolResults.flatMap((call) =>
          collectImageFilePaths(call.result),
        );
        throwIfAborted(signal);
        const painted = readPaintedCard(result, state);
        const cardId = await this.storeCard({
          cardId: input.generationId,
          draft: painted.draft,
          image: painted.image,
          loreSources: state.loreSources,
          prompt: input.prompt,
          signal,
        });
        return {
          aetherCost: painted.draft.aetherCost,
          cardId,
          effects: painted.draft.effects,
        };
      } finally {
        await deleteImageFiles(imagePaths);
      }
    });
  }

  /**
   * Copies the portrait into a card directory and writes the manifest.
   * The directory is removed when saving fails.
   * @param params - Accepted card, Lore passages, and the painted file
   * @returns Saved card id
   */
  private async storeCard(params: {
    cardId: string;
    draft: PlayableCardDraft;
    image: GeneratedImage;
    loreSources: PlayableCardLoreSource[];
    prompt: string;
    signal: AbortSignal;
  }): Promise<string> {
    throwIfAborted(params.signal);
    const cardId = params.cardId;
    const directory = PLAYABLE_CARD_STORAGE.filePath(cardId);

    await writeAssetDirectoryAtomically(directory, async (pending) => {
      await persistIllustration(params.image.filePath, pending);
      throwIfAborted(params.signal);
      await writeManifest({
        cardId,
        directory: pending,
        draft: params.draft,
        loreSources: params.loreSources,
        prompt: params.prompt,
      });
    });
    return cardId;
  }
}

/**
 * Requires a Lore-backed draft and one successful generate-image call.
 * A tool error wins over a later success.
 * @param result - Text, tool results, and tool errors from the agent run
 * @param state - Draft and passages the research tools recorded
 * @returns The accepted card and the portrait file
 * @throws InternalServerErrorException when research or painting did not finish
 */
function readPaintedCard(
  result: ResyncGameFrameworkAgentChatResults,
  state: PlayableCardResearchState,
): { draft: PlayableCardDraft; image: GeneratedImage } {
  const failedTool = result.toolErrors.find(
    (error) =>
      error.toolName === AgentTool.ConsultProductNow ||
      error.toolName === AgentTool.GenerateImage ||
      error.toolName === SEARCH_LORE_TOOL_ID ||
      error.toolName === SUBMIT_PLAYABLE_CARD_TOOL_ID,
  );
  if (failedTool !== undefined) {
    throw new InternalServerErrorException(
      `Playable card generation failed: ${failedTool.errorMessage}`,
    );
  }

  const loreCall = result.toolResults.find(
    (call) => call.toolName === AgentTool.ConsultProductNow,
  );
  if (loreCall === undefined) {
    throw new InternalServerErrorException(
      "Playable card generation failed: the agent finished without consulting ProductNow.",
    );
  }

  if (state.draft === undefined || state.loreSources.length === 0) {
    throw new InternalServerErrorException(
      `Playable card generation did not submit a Lore-backed card.${describeMissingCard(result, state)}`,
    );
  }

  const imageCall = result.toolResults.find(
    (call) => call.toolName === AgentTool.GenerateImage,
  );
  if (imageCall === undefined) {
    throw new InternalServerErrorException(
      "Playable card generation failed: the agent finished without calling generate-image.",
    );
  }

  return {
    draft: state.draft,
    image: readPlayableCardImage(imageCall.result),
  };
}

/**
 * Explains why a run ended without an accepted card.
 * @param result - Tool calls and closing text from the agent run
 * @param state - Passages and rejections the research tools recorded
 * @returns A suffix naming the last rejection, missing passages, or the agent's text
 */
function describeMissingCard(
  result: ResyncGameFrameworkAgentChatResults,
  state: PlayableCardResearchState,
): string {
  const submissions = result.toolResults.filter(
    (call) => call.toolName === SUBMIT_PLAYABLE_CARD_TOOL_ID,
  ).length;
  const details = [
    `${submissions} submission(s), ${state.loreSources.length} Lore passage(s).`,
  ];
  if (state.lastRejection !== undefined) {
    details.push(`Last rejection: ${state.lastRejection}`);
  }
  const text = result.text.trim();
  if (text !== "") {
    details.push(`Agent said: "${text.slice(0, 300)}"`);
  }
  return ` ${details.join(" ")}`;
}

/**
 * Re-encodes a model image as WebP into the card directory.
 * @param generatedPath - Temp path returned by the generate-image tool
 * @param directory - Card directory
 */
async function persistIllustration(
  generatedPath: string,
  directory: string,
): Promise<void> {
  const metadata = await sharp(generatedPath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < MIN_IMAGE_EDGE_PX || height < MIN_IMAGE_EDGE_PX) {
    throw new InternalServerErrorException(
      `Generated card image was ${width}x${height}, below ${MIN_IMAGE_EDGE_PX}px.`,
    );
  }

  const webp = await encodeGeneratedImageAsWebp(generatedPath);
  await writeFile(join(directory, PLAYABLE_CARD_IMAGE_FILE_NAME), webp);
}

/**
 * @param params - Card text, Lore passages, and destination
 */
async function writeManifest(params: {
  cardId: string;
  directory: string;
  draft: PlayableCardDraft;
  loreSources: PlayableCardLoreSource[];
  prompt: string;
}): Promise<void> {
  const firstEffect = params.draft.effects[0];
  if (firstEffect === undefined) {
    throw new InternalServerErrorException(
      "Playable card generation accepted a card with no effects.",
    );
  }

  const manifest = {
    aetherCost: params.draft.aetherCost,
    cardId: params.cardId,
    createdAt: new Date().toISOString(),
    description: params.draft.description,
    effects: params.draft.effects,
    imageFileName: PLAYABLE_CARD_IMAGE_FILE_NAME,
    kind: firstEffect.kind,
    loreSources: params.loreSources,
    name: params.draft.name,
    prompt: params.prompt,
  };

  await writeFile(
    join(params.directory, PLAYABLE_CARD_MANIFEST_FILE_NAME),
    JSON.stringify(manifest, null, 2),
  );
}

/**
 * @param prompt - The caller's card request
 * @param progression - Locked line for a later level, when this card continues one
 * @returns The user prompt sent to the card-generator agent
 */
function renderCardRequest(
  prompt: string,
  progression: CardProgression | undefined,
): string {
  const request = `Create one playable card from this request:\n${prompt}`;
  if (progression === undefined) {
    return request;
  }
  return `${request}\n\n${renderCardProgressionPrompt(progression)}`;
}

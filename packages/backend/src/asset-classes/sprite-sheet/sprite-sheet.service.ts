import { Injectable, InternalServerErrorException } from "@nestjs/common";
import type { SpriteSheetServiceApi } from "@towers-of-coreborn/api";
import { ConfigurationService } from "src/configuration/configuration.service";
import { SpriteSheetAgent } from "src/mastra/agents/sprite-sheet/spriteSheetAgent";
import { requireGenerationId } from "../shared/requireGenerationId";
import { requireGenerationPrompt } from "../shared/requireGenerationPrompt";
import { readSpriteSheet, readSpriteSheets } from "./readSpriteSheets";
import { SPRITE_SHEET_STORAGE } from "./spriteSheetStorage";

/** Generates and lists animated character sprite sheets. */
@Injectable()
export class SpriteSheetService {
  public constructor(
    private readonly agent: SpriteSheetAgent,
    private readonly configurationService: ConfigurationService,
  ) {}

  /**
   * Stops an in-flight sprite-sheet generation.
   * @param payload - Client generation id
   * @returns Whether the stop was recorded
   */
  public async cancel(
    payload: SpriteSheetServiceApi["cancel"]["payload"],
  ): Promise<SpriteSheetServiceApi["cancel"]["response"]> {
    const generationId = requireGenerationId(payload.generationId);
    return { stopped: await this.agent.abort(generationId) };
  }

  /**
   * @param payload - Natural-language character idea and the id that can stop it
   * @returns Newly stored sprite sheet, split into animations
   */
  public async generate(
    payload: SpriteSheetServiceApi["generate"]["payload"],
  ): Promise<SpriteSheetServiceApi["generate"]["response"]> {
    const prompt = requireGenerationPrompt(
      payload.prompt,
      "Describe the character to animate.",
    );
    const generationId = requireGenerationId(payload.generationId);
    const { id } = await this.agent.query({ generationId, prompt });
    const asset = await readSpriteSheet(
      SPRITE_SHEET_STORAGE.rootPath(),
      id,
      this.getPublicBaseUrl(),
    );
    if (asset === undefined) {
      throw new InternalServerErrorException(
        `Sprite sheet ${id} was generated but could not be read back.`,
      );
    }
    return asset;
  }

  /**
   * @returns Stored sprite sheets, newest first
   */
  public async list(): Promise<SpriteSheetServiceApi["list"]["response"]> {
    return {
      spriteSheets: await readSpriteSheets(
        SPRITE_SHEET_STORAGE.rootPath(),
        this.getPublicBaseUrl(),
      ),
    };
  }

  /** @returns Absolute URL of the sprite-sheet static folder */
  private getPublicBaseUrl(): string {
    return SPRITE_SHEET_STORAGE.publicUrl(
      this.configurationService.get("BACKEND_API_URL"),
    );
  }
}

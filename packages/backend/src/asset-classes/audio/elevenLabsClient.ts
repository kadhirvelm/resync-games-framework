import { Injectable } from "@nestjs/common";
import { ConfigurationService } from "src/configuration/configuration.service";
import {
  type ElevenLabsAudio,
  type ElevenLabsRequest,
  requestElevenLabsAudio,
} from "./elevenLabs";

/**
 * Server-side ElevenLabs client.
 * The API key stays in backend configuration and is never sent to the browser.
 */
@Injectable()
export class ElevenLabsClient {
  public constructor(
    private readonly configurationService: ConfigurationService,
  ) {}

  /**
   * @returns Whether a key is configured
   */
  public configured(): boolean {
    return this.configurationService.get("ELEVENLABS_API_KEY").trim() !== "";
  }

  /**
   * Renders one clip.
   * @param request - Role, cue, and sound-design prompt
   * @param signal - Cancels the provider call
   * @returns The mp3 bytes
   */
  public generate(
    request: ElevenLabsRequest,
    signal?: AbortSignal,
  ): Promise<ElevenLabsAudio> {
    return requestElevenLabsAudio(
      this.configurationService.get("ELEVENLABS_API_KEY"),
      request,
      fetch,
      signal,
    );
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import type { AgentAssetGenerationRequest } from "@resync-game-framework/api";
import { AgentAssetGenerationService } from "./agentAssetGeneration.service";

/** Non-blocking asset generation routes intended for coding agents. */
@Controller("agent/assets/generations")
export class AgentAssetGenerationController {
  public constructor(private readonly service: AgentAssetGenerationService) {}

  /**
   * Queues one generation and returns immediately.
   * @param request - Asset class, prompt, optional id, and class-specific options
   * @returns Accepted job id and its polling URL
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  public enqueue(@Body() request: AgentAssetGenerationRequest) {
    return this.service.enqueue(request);
  }

  /**
   * Polls one generation through completion or failure.
   * @param jobId - Job id returned by the POST route
   * @returns Current state and terminal result or error
   */
  @Get(":jobId")
  public status(@Param("jobId") jobId: string) {
    return this.service.status(jobId);
  }
}

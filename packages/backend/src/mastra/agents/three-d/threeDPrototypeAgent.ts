import { randomUUID } from "node:crypto";
import { createTool } from "@mastra/core/tools";
import { Injectable } from "@nestjs/common";
import type { ThreeDPrototype } from "@towers-of-coreborn/api";
import { ThreeDPrototypeStore } from "src/asset-classes/three-d/threeDPrototypeStore";
import { TowersOfCorebornAgentService } from "src/mastra/shared/towersOfCorebornAgent.service";
import { z } from "zod";
import { GenerationAbortCoordinator } from "../generationAbort.coordinator";

/** Small owned package draft; placement and slot ownership are server assigned. */
const schema = z.object({
  characterPrompt: z.string().min(1).max(2000),
  environmentPrompt: z.string().min(1).max(2000),
  name: z.string().min(1).max(80),
  objective: z.string().min(1).max(400),
  props: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        prompt: z.string().min(1).max(1500),
      }),
    )
    .length(3),
});
/** Creates one playable package brief, leaving model creation explicit in the workshop. */
@Injectable()
export class ThreeDPrototypeAgent {
  public constructor(
    private readonly agents: TowersOfCorebornAgentService,
    private readonly store: ThreeDPrototypeStore,
    private readonly aborts: GenerationAbortCoordinator,
  ) {}
  /** @returns A saved package with one arena, a player and three interactable props. */
  public async query(
    name: string,
    prompt: string,
    demo = false,
    generationId: string = randomUUID(),
  ): Promise<ThreeDPrototype> {
    return this.aborts.run(generationId, async (signal) => {
      const tool = createTool({
        description:
          "Record a coherent small 3D game prototype. The gameplay is activate three beacons then return to the origin portal.",
        execute: async (input) => input,
        id: "record-3d-prototype",
        inputSchema: schema,
      });
      const { toolOutput: plan } = demo
        ? {
            toolOutput: {
              characterPrompt: "A jade wanderer",
              environmentPrompt: "An open jade garden arena",
              name: "Aether Garden",
              objective:
                "Activate the three aether beacons, then return to the origin portal.",
              props: ["West Beacon", "East Beacon", "Moon Beacon"].map(
                (name) => ({ name, prompt: `A glowing jade ${name}` }),
              ),
            },
          }
        : await this.agents.runGenerationCoordinator({
            abortSignal: signal,
            agentId: "three-d-prototype-coordinator",
            instructions:
              "Design an inviting small game world from the user's brief. Record exactly one open 18m arena, one humanoid player character, and three visually distinct interactable beacons. Their art prompts must share a palette and setting. The objective must describe activating these three props then returning to the origin portal. Do not generate models. Call record-3d-prototype.",
            outputLabel: "3D prototype plan",
            prompt,
            readToolOutput: (value) => schema.parse(value),
            tool,
            toolId: "record-3d-prototype",
          });
      const characterId = randomUUID();
      signal.throwIfAborted();
      return this.store.save({
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        name: name || plan.name,
        objective: plan.objective,
        prompt,
        slots: [
          {
            id: randomUUID(),
            kind: "environment",
            name: "Arena",
            position: [0, 0, 0],
            prompt: plan.environmentPrompt,
          },
          {
            id: characterId,
            kind: "character",
            name: "Player",
            position: [0, 0, 0],
            prompt: plan.characterPrompt,
          },
          ...plan.props.map((prop, index) => ({
            id: randomUUID(),
            kind: "prop" as const,
            name: prop.name,
            ownerSlotId: characterId,
            position: [
              [-5, 0, 3],
              [5, 0, 3],
              [0, 0, -5],
            ][index] as [number, number, number],
            prompt: prop.prompt,
          })),
        ],
      });
    });
  }
}

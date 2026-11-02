import { Module } from "@nestjs/common";
import { StaticImageToolService } from "src/asset-classes/static-image/staticImageTool.service";
import { MastraCoreModule } from "../../mastraCore.module";
import { GenerationAbortModule } from "../generationAbort.module";
import { StaticImageAgent } from "./staticImageAgent";

/** Wires the reusable standalone-image agent and its persistence service. */
@Module({
  exports: [StaticImageAgent],
  imports: [GenerationAbortModule, MastraCoreModule],
  providers: [StaticImageAgent, StaticImageToolService],
})
export class StaticImageAgentModule {}

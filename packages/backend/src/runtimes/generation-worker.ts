import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import dotenv from "dotenv";
import { GenerationWorkerModule } from "src/generation-queue/generationWorker.module";

if (process.env.NODE_ENV === "development") {
  dotenv.config({ path: ".env.development" });
}

/** Starts the headless BullMQ asset worker and enables graceful shutdown. */
async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(
    GenerationWorkerModule,
  );
  application.enableShutdownHooks();
  new Logger("GenerationWorker").log("Headless asset worker started");
}

void bootstrap();
